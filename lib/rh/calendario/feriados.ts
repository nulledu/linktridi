// ── Feriados (servidor): fonte externa, cache, manual, fusão ─────────────────
// Brasil → São Paulo → Cerqueira César. Três degraus, e o app funciona com
// qualquer um deles faltando:
//
//   1. `feriadosBase(ano)` — calculado em código. Nunca falta.
//   2. `rh_calendario_feriados` — o que a fonte externa trouxe (`api`) e o
//      que o RH cadastrou (`manual`). Falta enquanto o SQL não rodar.
//   3. `ponto_feriados` — o que o Ponto já mantém. Entra para o RH não ter de
//      cadastrar o mesmo dia duas vezes.
//
// A fonte externa (BrasilAPI) cobre só o NACIONAL: estadual e municipal vêm
// do piso e do manual. Trocar de fonte é implementar `FonteDeFeriados` — a
// tela e a fusão não sabem de onde veio.
//
// Ritmo: a sincronização roda no máximo uma vez por 30 dias por ano, e a
// decisão de rodar fica em cache de processo por 1h. Abrir o calendário não
// chama a rede; a primeira abertura de um ano novo chama, com prazo curto, e
// se falhar o piso continua valendo. Sem `setInterval`, sem poll.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cached, invalidate } from "@/lib/cache";
import { listFeriados } from "@/lib/ponto";
import { feriadosBase } from "./feriados-base";
import { esferaInferida, fundirFeriados } from "./fundir-feriados";
import { ehDiaISO } from "./datas";
import type { Esfera, FeriadoRh, SyncFeriados } from "./tipos";

// ── A fonte externa ──────────────────────────────────────────────────────────

export interface FeriadoExterno { dia: string; nome: string; esfera: Esfera }

export interface FonteDeFeriados {
  nome: string;
  buscar(ano: number, signal: AbortSignal): Promise<FeriadoExterno[]>;
}

/** https://brasilapi.com.br/docs#tag/Feriados-Nacionais — só nacionais. */
export const brasilApi: FonteDeFeriados = {
  nome: "brasilapi",
  async buscar(ano, signal) {
    const r = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`, { signal, cache: "no-store" });
    if (!r.ok) throw new Error(`BrasilAPI respondeu ${r.status}`);
    const lista = (await r.json()) as { date?: string; name?: string; type?: string }[];
    if (!Array.isArray(lista)) throw new Error("BrasilAPI devolveu um corpo inesperado");
    return lista
      .filter((f) => ehDiaISO(f.date) && typeof f.name === "string" && f.name.trim())
      .map((f) => ({ dia: f.date as string, nome: (f.name as string).trim(), esfera: "nacional" as const }));
  },
};

const PRAZO_MS = 6_000;
const REVALIDAR_MS = 30 * 24 * 60 * 60_000;

/** Erro de "tabela não existe" do PostgREST, e só ele. */
const tabelaAusente = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42P01" || /does not exist|schema cache/i.test(e.message ?? ""));

// ── Sincronização ────────────────────────────────────────────────────────────

/**
 * Busca na fonte e grava. Devolve o carimbo resultante. NUNCA lança: a falha
 * vira `ok: false` com o motivo, e os dados que já estavam continuam valendo.
 */
export async function sincronizarFeriados(ano: number, fonte: FonteDeFeriados = brasilApi): Promise<SyncFeriados> {
  const db = createSupabaseAdminClient();
  const agora = new Date().toISOString();
  const carimbar = async (ok: boolean, erro: string | null): Promise<SyncFeriados> => {
    const linha = { ano, fonte: fonte.nome, atualizado_em: ok ? agora : undefined, ok, erro };
    // Em falha, `atualizado_em` fica o que era: é a data do ÚLTIMO SUCESSO.
    await db.from("rh_calendario_sync").upsert(
      ok ? { ...linha, atualizado_em: agora, updated_at: agora } : { ano, fonte: fonte.nome, ok, erro, updated_at: agora },
      { onConflict: "ano" },
    );
    invalidate(`rh:calendario:feriados:${ano}`);
    return { ano, fonte: fonte.nome, atualizado_em: ok ? agora : null, ok, erro };
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PRAZO_MS);
  try {
    const lista = await fonte.buscar(ano, ctrl.signal);
    if (!lista.length) return await carimbar(false, "A fonte não devolveu nenhum feriado.");
    const linhas = lista.map((f) => ({ dia: f.dia, nome: f.nome, esfera: f.esfera, origem: "api" as const, ativo: true }));
    // Só substitui o que é da API: o manual fica.
    const apagar = await db.from("rh_calendario_feriados").delete().eq("origem", "api")
      .gte("dia", `${ano}-01-01`).lte("dia", `${ano}-12-31`);
    if (apagar.error) return await carimbar(false, apagar.error.message);
    const { error } = await db.from("rh_calendario_feriados").upsert(linhas, { onConflict: "dia,nome" });
    if (error) return await carimbar(false, error.message);
    return await carimbar(true, null);
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "A fonte externa demorou demais." : (e as Error)?.message ?? "Falha desconhecida";
    try { return await carimbar(false, msg); } catch {
      return { ano, fonte: fonte.nome, atualizado_em: null, ok: false, erro: msg };
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function carimboDoAno(ano: number): Promise<SyncFeriados | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_calendario_sync").select("ano,fonte,atualizado_em,ok,erro").eq("ano", ano).maybeSingle();
  if (error || !data) return null;
  return data as SyncFeriados;
}

/**
 * Garante que o ano foi sincronizado recentemente. Decisão em cache de 1h:
 * mil aberturas da tela viram uma leitura do carimbo por hora, e a rede só
 * é chamada quando o carimbo diz que passou do prazo (ou nunca rodou).
 */
export function garantirFeriados(ano: number): Promise<SyncFeriados | null> {
  return cached(`rh:calendario:sync:${ano}`, 60 * 60_000, async () => {
    const { data, error } = await createSupabaseAdminClient()
      .from("rh_calendario_sync").select("ano,fonte,atualizado_em,ok,erro,updated_at").eq("ano", ano).maybeSingle();
    if (error) return null;   // tabela ausente: sem sincronização, o piso vale
    const atual = data as (SyncFeriados & { updated_at: string }) | null;
    const idade = atual?.atualizado_em ? Date.now() - Date.parse(atual.atualizado_em) : Infinity;
    if (atual?.ok && idade < REVALIDAR_MS) return atual;
    // Falhou há pouco? Não martela a fonte a cada hora: espera um dia.
    const tentouHa = atual?.updated_at ? Date.now() - Date.parse(atual.updated_at) : Infinity;
    if (atual && !atual.ok && tentouHa < 24 * 60 * 60_000) return atual;
    return sincronizarFeriados(ano);
  });
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export interface FeriadosDoAno {
  lista: FeriadoRh[];
  /** `rh_calendario_feriados` ainda não existe. */
  pendente: boolean;
}

/** A tabela do módulo (api + manual), tolerante ao SQL não ter rodado. */
async function daTabela(ano: number): Promise<{ lista: FeriadoRh[]; pendente: boolean }> {
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_calendario_feriados")
    .select("id,dia,nome,esfera,origem,ativo")
    .gte("dia", `${ano}-01-01`).lte("dia", `${ano}-12-31`)
    .order("dia")
    .limit(400);
  if (error) return { lista: [], pendente: tabelaAusente(error) };
  const lista = ((data ?? []) as { id: string; dia: string; nome: string; esfera: Esfera; origem: "api" | "manual"; ativo: boolean }[])
    .filter((f) => f.ativo)
    .map((f) => ({ id: f.id, dia: f.dia, nome: f.nome, esfera: f.esfera, origem: f.origem }));
  return { lista, pendente: false };
}

/** O que o Ponto mantém, com a esfera inferida. */
async function doPonto(ano: number): Promise<FeriadoRh[]> {
  try {
    const lista = await listFeriados({ de: `${ano}-01-01`, ate: `${ano}-12-31` });
    return lista.map((f) => ({
      dia: f.dia, nome: f.descricao?.trim() || "Feriado", esfera: esferaInferida(f.dia, ano), origem: "ponto" as const,
    }));
  } catch { return []; }
}

/** Todos os feriados do ano, fundidos. Cache de 1h por ano (invalidado ao escrever). */
export function feriadosDoAno(ano: number): Promise<FeriadosDoAno> {
  return cached(`rh:calendario:feriados:${ano}`, 60 * 60_000, async () => {
    const [tabela, ponto] = await Promise.all([daTabela(ano), doPonto(ano)]);
    return { lista: fundirFeriados([feriadosBase(ano), ponto, tabela.lista]), pendente: tabela.pendente };
  });
}

// ── Escrita manual ───────────────────────────────────────────────────────────

export async function criarFeriadoManual(f: { dia: string; nome: string; esfera: Esfera; autor_nome: string | null }): Promise<{ id: string } | { erro: string }> {
  const { data, error } = await createSupabaseAdminClient()
    .from("rh_calendario_feriados")
    .upsert({ dia: f.dia, nome: f.nome, esfera: f.esfera, origem: "manual", ativo: true, autor_nome: f.autor_nome }, { onConflict: "dia,nome" })
    .select("id").maybeSingle();
  if (error) return { erro: error.message };
  invalidate(`rh:calendario:feriados:${f.dia.slice(0, 4)}`);
  return { id: (data as { id: string } | null)?.id ?? "" };
}

export async function apagarFeriadoManual(id: string): Promise<string | null> {
  const db = createSupabaseAdminClient();
  const { data: antes } = await db.from("rh_calendario_feriados").select("dia,origem").eq("id", id).maybeSingle();
  if (!antes) return "Feriado não encontrado.";
  if ((antes as { origem: string }).origem !== "manual") return "Só feriado cadastrado à mão pode ser apagado.";
  const { error } = await db.from("rh_calendario_feriados").delete().eq("id", id);
  if (error) return error.message;
  invalidate(`rh:calendario:feriados:${(antes as { dia: string }).dia.slice(0, 4)}`);
  return null;
}
