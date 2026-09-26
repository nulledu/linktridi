// Intervalos automáticos da produção.
//
// Duas pontas leem esta mesma config:
//   1. O TABLET de atividades (via /api/device/pull): na hora do intervalo pausa
//      a atividade de quem está na lista, toca a sirene, e no fim toca de novo e
//      só volta quando a pessoa toca na tela.
//   2. O PONTO: lança a saída e a volta do intervalo pra essas pessoas (batida
//      normal — os 10 min descontam da jornada, decisão do dono em 24/09/26).
//
// A config mora em `ponto_intervalos_config` (supabase/ponto_intervalos_auto.sql).
// Sem a tabela, vale o PADRÃO abaixo — a regra já existe desde 14/09 e não
// pode esperar o SQL pra começar a contar; só a chave fica sem salvar.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "./supabase/server";
import { reclassificarDia } from "./ponto";

export type JanelaIntervalo = { rotulo: string; inicio: string; fim: string; pessoas: string[] };
export type ConfigIntervalos = { ativo: boolean; desde: string; janelas: JanelaIntervalo[] };

// ponto_pessoas.id de quem estava na lista pedida (24/09/26).
const P = {
  matheus: "a020052d-4fb8-439f-a05e-37c0410c181c",   // Matheus Dias
  leo: "29c1b106-28d1-499a-99cf-dceb131e01b6",       // Léo Silva (Leonardo)
  henrique: "2f0f371b-8be6-45de-ab6d-fa78c2fb8f5c",  // Henrique Campos
  felipe: "3702872e-a3ae-40ca-98a1-983c12cba7ba",
  davi: "61ffbb54-e80e-4376-a244-df7827aa5c9e",
  luiz: "8417fb17-7686-4dbc-a24d-28c371d4c0c7",      // Luiz Santos
  bruno: "2e79e506-02a1-4fcd-b938-5f65b679f0b3",
  mikael: "c2ea9eba-a35c-42ca-ae4d-fd7b133b799a",
  joao: "749e1eb1-115e-4143-be0e-e0b11bb423a7",      // João Vitor
};
export const CONFIG_PADRAO: ConfigIntervalos = {
  ativo: true,
  desde: "2026-09-14",
  janelas: [
    { rotulo: "Manhã", inicio: "09:30", fim: "09:40", pessoas: [P.matheus, P.leo, P.henrique, P.felipe, P.davi, P.luiz, P.bruno, P.mikael, P.joao] },
    { rotulo: "Tarde", inicio: "15:30", fim: "15:40", pessoas: [P.felipe, P.bruno, P.davi, P.leo, P.matheus] },
  ],
};

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
export function janelasValidas(v: unknown): JanelaIntervalo[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((j) => {
    const o = j as Partial<JanelaIntervalo>;
    if (!o || !HORA.test(String(o.inicio)) || !HORA.test(String(o.fim)) || String(o.fim) <= String(o.inicio)) return [];
    const pessoas = Array.isArray(o.pessoas) ? [...new Set(o.pessoas.filter((x): x is string => typeof x === "string"))] : [];
    return [{ rotulo: String(o.rotulo || "Intervalo").slice(0, 40), inicio: String(o.inicio), fim: String(o.fim), pessoas }];
  });
}

function tabelaAusente(msg: string) { return /ponto_intervalos_config|does not exist|schema cache/i.test(msg); }

export async function lerIntervalos(db: SupabaseClient = createSupabaseAdminClient()): Promise<ConfigIntervalos & { salvavel: boolean }> {
  const { data, error } = await db.from("ponto_intervalos_config").select("ativo,desde,janelas").eq("id", true).maybeSingle();
  if (error) {
    if (tabelaAusente(error.message)) return { ...CONFIG_PADRAO, salvavel: false };
    throw new Error(error.message);
  }
  if (!data) return { ...CONFIG_PADRAO, salvavel: true };
  return { ativo: !!data.ativo, desde: String(data.desde), janelas: janelasValidas(data.janelas), salvavel: true };
}

export async function salvarIntervalos(cfg: ConfigIntervalos, por: string | null): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("ponto_intervalos_config").upsert({
    id: true, ativo: cfg.ativo, desde: cfg.desde, janelas: janelasValidas(cfg.janelas),
    atualizado_em: new Date().toISOString(), atualizado_por: por,
  }, { onConflict: "id" });
  if (error) throw new Error(tabelaAusente(error.message) ? "rode supabase/ponto_intervalos_auto.sql" : error.message);
}

/** O que desce pro tablet: janelas com os PROFILE ids (o tablet conhece a pessoa pelo login). */
export async function intervalosDoTablet(db: SupabaseClient): Promise<{ rotulo: string; inicio: string; fim: string; pessoas: string[] }[]> {
  const cfg = await lerIntervalos(db);
  if (!cfg.ativo) return [];
  const ids = [...new Set(cfg.janelas.flatMap((j) => j.pessoas))];
  if (!ids.length) return [];
  const { data } = await db.from("ponto_pessoas").select("id,colaborador_id").in("id", ids).limit(500);
  const perfil = new Map(((data ?? []) as { id: string; colaborador_id: string | null }[]).map((r) => [r.id, r.colaborador_id]));
  return cfg.janelas.map((j) => ({ ...j, pessoas: j.pessoas.map((p) => perfil.get(p)).filter((x): x is string => !!x) }));
}

// ── Lançamento no ponto ──────────────────────────────────────────────────────

const spParaUtc = (dia: string, hhmm: string) => {
  const [y, m, d] = dia.split("-").map(Number);
  const [H, M] = hhmm.split(":").map(Number);
  return Date.UTC(y, m - 1, d, H, M) + 3 * 3600e3;
};
export const hojeSp = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
function diasEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(de + "T12:00:00Z"); t <= Date.parse(ate + "T12:00:00Z"); t += 86400e3) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/**
 * Decide, pura, se a pessoa ganha as batidas do intervalo neste dia.
 * - estava DENTRO na hora que o intervalo começou (nº ímpar de batidas antes);
 * - ninguém bateu nada perto do intervalo (bateu na mão = respeita a batida real);
 * - o intervalo já acabou: ou tem batida depois do fim, ou é hoje e já passou.
 */
export function precisaLancar(batidasMs: number[], iniMs: number, fimMs: number, agoraMs: number): boolean {
  if (agoraMs < fimMs) return false;
  const folga = 5 * 60e3;
  if (batidasMs.some((t) => t >= iniMs - folga && t <= fimMs + folga)) return false;
  const antes = batidasMs.filter((t) => t < iniMs).length;
  if (antes % 2 !== 1) return false;
  const depois = batidasMs.some((t) => t > fimMs);
  const mesmoDia = agoraMs - fimMs < 20 * 3600e3;
  return depois || mesmoDia;
}

/** Lança os intervalos de [de, ate] (dias SP). Idempotente. */
export async function lancarIntervalos(opts: { de?: string; ate?: string } = {}): Promise<{ lancados: number }> {
  const db = createSupabaseAdminClient();
  const cfg = await lerIntervalos(db);
  if (!cfg.ativo || !cfg.janelas.length) return { lancados: 0 };
  const ate = opts.ate ?? hojeSp();
  const de = [opts.de ?? cfg.desde, cfg.desde].sort().at(-1)!;
  if (de > ate) return { lancados: 0 };
  const dias = diasEntre(de, ate);
  const pessoas = [...new Set(cfg.janelas.flatMap((j) => j.pessoas))];
  const agora = Date.now();
  let lancados = 0;

  for (const pessoaId of pessoas) {
    const { data } = await db.from("ponto_registros").select("batido_em")
      .eq("pessoa_id", pessoaId)
      .gte("batido_em", new Date(spParaUtc(de, "00:00")).toISOString())
      .lt("batido_em", new Date(spParaUtc(ate, "00:00") + 86400e3).toISOString())
      .order("batido_em", { ascending: true }).limit(1000);
    const todas = ((data ?? []) as { batido_em: string }[]).map((r) => Date.parse(r.batido_em));
    for (const dia of dias) {
      const i0 = spParaUtc(dia, "00:00");
      const doDia = todas.filter((t) => t >= i0 && t < i0 + 86400e3);
      const linhas: Record<string, unknown>[] = [];
      for (const j of cfg.janelas) {
        if (!j.pessoas.includes(pessoaId)) continue;
        const ini = spParaUtc(dia, j.inicio), fim = spParaUtc(dia, j.fim);
        if (!precisaLancar(doDia, ini, fim, agora)) continue;
        for (const [ponta, t] of [["ini", ini], ["fim", fim]] as const) {
          linhas.push({
            pessoa_id: pessoaId, tipo: ponta === "ini" ? "intervalo_inicio" : "retorno",
            batido_em: new Date(t).toISOString(), origem: "manual",
            client_id: `intervalo-auto:${pessoaId}:${dia}:${j.inicio}:${ponta}`,
          });
        }
        doDia.push(ini, fim);
      }
      if (!linhas.length) continue;
      const { error } = await db.from("ponto_registros").insert(linhas);
      if (error) {
        if (/duplicate|unique/i.test(error.message)) continue;   // outra execução chegou antes
        throw new Error(error.message);
      }
      lancados += linhas.length;
      await reclassificarDia(pessoaId, new Date(i0 + 12 * 3600e3).toISOString());
    }
  }
  return { lancados };
}
