// ── Biblioteca de Criativos · lado servidor ──────────────────────────────────
// Os ARQUIVOS de cada criativo (`marketing_criativos_arquivos`). Os bytes
// moram no Backblaze B2; aqui trafega só o endereço e o que a tela precisa pra
// listar. Ver `supabase/marketing_criativos_arquivos.sql`.
//
// Tolerante a tabela ausente, igual ao resto do módulo: enquanto o SQL não for
// rodado a biblioteca aparece vazia em vez de derrubar a tela do criativo.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { apagarPrivado, existePrivado } from "@/lib/armazenamento/privado";
import { chaveDaUrl, tetoDoEnvio } from "@/lib/armazenamento/referencia";
import { ehFormato, type ArquivoCriativo, type Formato, type TipoCriativo } from "./regras";

const TABELA = "marketing_criativos_arquivos";
// Colunas nomeadas — `select("*")` é proibido em rota de leitura (CLAUDE.md).
// `chave` fica de fora de propósito: só as funções que APAGAM a pedem.
const COLS = "id,criativo_id,url,nome,mime,tipo,tamanho,largura,altura,duracao,formato,principal,autor_nome,created_at";

const db = () => createSupabaseAdminClient();

/** Tabela ausente (SQL pendente) → "vazio", não erro. */
function semTabela(e: { message?: string; code?: string } | null): boolean {
  return !!e && (e.code === "42P01" || /does not exist|schema cache/i.test(e.message || ""));
}

type Row = Record<string, unknown>;
function deRow(r: Row): ArquivoCriativo {
  const f = r.formato;
  return {
    id: r.id as string,
    criativoId: r.criativo_id as string,
    url: (r.url as string) ?? "",
    nome: (r.nome as string) ?? "",
    mime: (r.mime as string) ?? "",
    tipo: ((r.tipo as TipoCriativo) === "video" ? "video" : "imagem"),
    tamanho: Number(r.tamanho ?? 0),
    largura: r.largura == null ? null : Number(r.largura),
    altura: r.altura == null ? null : Number(r.altura),
    duracao: r.duracao == null ? null : Number(r.duracao),
    formato: (ehFormato(f) ? f : "outro") as Formato,
    principal: !!r.principal,
    autorNome: (r.autor_nome as string) ?? null,
    createdAt: (r.created_at as string) ?? "",
  };
}

/** Os arquivos de UM criativo: capa primeiro, depois do mais novo pro mais velho. */
export async function arquivosDe(criativoId: string): Promise<ArquivoCriativo[]> {
  const { data, error } = await db()
    .from(TABELA)
    .select(COLS)
    .eq("criativo_id", criativoId)
    .order("principal", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) {
    if (semTabela(error)) return [];
    throw error;
  }
  return ((data ?? []) as Row[]).map(deRow);
}

/**
 * A CAPA de vários criativos de uma vez — é o que a lista usa pra mostrar
 * miniatura. Uma consulta só: N consultas numa lista de 200 criativos seria
 * exatamente o padrão que estourou a conta do Supabase (ver CLAUDE.md).
 */
export async function capasDe(criativoIds: string[]): Promise<Record<string, ArquivoCriativo>> {
  const ids = [...new Set(criativoIds.filter(Boolean))];
  if (!ids.length) return {};
  const { data, error } = await db()
    .from(TABELA)
    .select(COLS)
    .in("criativo_id", ids)
    .order("principal", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.min(ids.length * 4, 400));
  if (error) {
    if (semTabela(error)) return {};
    throw error;
  }
  const capas: Record<string, ArquivoCriativo> = {};
  // A ordem acima já põe a capa (ou a mais nova) primeiro: fica a primeira que
  // aparecer de cada criativo.
  for (const r of data ?? []) {
    const a = deRow(r as Row);
    if (!capas[a.criativoId]) capas[a.criativoId] = a;
  }
  return capas;
}

export interface NovoArquivo {
  criativoId: string;
  url: string;
  nome: string;
  mime: string;
  tipo: TipoCriativo;
  tamanho: number;
  largura?: number | null;
  altura?: number | null;
  duracao?: number | null;
  formato?: Formato;
  autorId?: string | null;
  autorNome?: string | null;
}

/**
 * Registra na biblioteca um arquivo que JÁ subiu pro B2.
 *
 * A `chave` é derivada da `url` aqui, não recebida do cliente: assim ninguém
 * registra uma linha apontando pra chave de outra área (e, mais tarde, apaga o
 * arquivo de outra pessoa pelo botão de excluir). `chaveDaUrl` só aceita o
 * formato nosso, então url torta vira erro antes de chegar ao banco.
 */
export async function registrarArquivo(
  n: NovoArquivo,
): Promise<{ ok: true; arquivo: ArquivoCriativo } | { ok: false; erro: string }> {
  const chave = chaveDaUrl(n.url);
  if (!chave || !chave.startsWith("criativos/")) return { ok: false, erro: "Endereço de arquivo inválido." };

  // O arquivo tem que EXISTIR no bucket antes de virar linha, e o tamanho que
  // vale é o que o B2 mediu — não o que o navegador disse. Sem esta conferida,
  // uma requisição forjada criaria uma peça que nunca abre (upload que falhou
  // no meio) e com o tamanho que quisesse. É uma ida a mais que paga por si.
  const real = await existePrivado(chave).catch(() => null);
  if (!real) return { ok: false, erro: "O arquivo não chegou ao armazenamento. Tente enviar de novo." };
  const teto = tetoDoEnvio("criativos", n.mime);
  if (teto <= 0 || real.tamanho > teto) {
    await apagarPrivado(chave).catch(() => {});
    return { ok: false, erro: "Arquivo fora dos limites da biblioteca." };
  }

  // A primeira peça do criativo vira a capa sozinha — ninguém deveria ter que
  // clicar em "definir como capa" quando só existe uma.
  const { count } = await db()
    .from(TABELA)
    .select("id", { count: "exact", head: true })
    .eq("criativo_id", n.criativoId);

  const { data, error } = await db()
    .from(TABELA)
    .insert({
      criativo_id: n.criativoId,
      url: n.url,
      chave,
      nome: n.nome.slice(0, 200),
      mime: n.mime,
      tipo: n.tipo,
      tamanho: real.tamanho,
      largura: n.largura ?? null,
      altura: n.altura ?? null,
      duracao: n.duracao ?? null,
      formato: n.formato ?? "outro",
      principal: !count,
      autor_id: n.autorId ?? null,
      autor_nome: n.autorNome ?? null,
    })
    .select(COLS)
    .maybeSingle();

  if (error || !data) {
    if (semTabela(error)) {
      return { ok: false, erro: "A biblioteca ainda não existe no banco. Rode supabase/marketing_criativos_arquivos.sql." };
    }
    // 23505 = a chave já foi registrada (clique duplo, retry da rede).
    if (error?.code === "23505") return { ok: false, erro: "Este arquivo já está na biblioteca." };
    return { ok: false, erro: error?.message ?? "Não foi possível registrar o arquivo." };
  }
  return { ok: true, arquivo: deRow(data as Row) };
}

/**
 * Tira o arquivo da biblioteca E do B2.
 *
 * A linha sai primeiro. Se o B2 falhar depois, sobra um objeto órfão — que não
 * aparece em tela nenhuma e ninguém alcança. Na ordem inversa sobraria uma
 * linha apontando pra arquivo que não existe, e aí a biblioteca mostra uma
 * peça que não abre. Mesma escolha do Financeiro.
 */
export async function apagarArquivo(id: string): Promise<{ ok: boolean; erro?: string }> {
  const { data } = await db().from(TABELA).select("id,chave,criativo_id,principal").eq("id", id).maybeSingle();
  if (!data) return { ok: false, erro: "Arquivo não encontrado." };
  const { chave, criativo_id: criativoId, principal } = data as { chave: string; criativo_id: string; principal: boolean };

  const { error } = await db().from(TABELA).delete().eq("id", id);
  if (error) return { ok: false, erro: error.message };
  try { await apagarPrivado(chave); } catch { /* órfão no bucket é chato, não grave */ }

  // Sem capa a lista fica com um buraco: promove a peça mais nova que sobrou.
  if (principal) {
    const { data: proxima } = await db()
      .from(TABELA).select("id").eq("criativo_id", criativoId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (proxima) await db().from(TABELA).update({ principal: true }).eq("id", (proxima as { id: string }).id);
  }
  return { ok: true };
}

/** Escolhe a capa do criativo. Só uma por vez — o índice único parcial exige. */
export async function definirCapa(id: string): Promise<{ ok: boolean; erro?: string }> {
  const { data } = await db().from(TABELA).select("id,criativo_id").eq("id", id).maybeSingle();
  if (!data) return { ok: false, erro: "Arquivo não encontrado." };
  const criativoId = (data as { criativo_id: string }).criativo_id;

  // Baixa a antiga ANTES de subir a nova: o índice único parcial recusaria
  // duas capas no mesmo criativo, e o erro sairia como 23505 sem explicação.
  const { error: erroLimpar } = await db()
    .from(TABELA).update({ principal: false }).eq("criativo_id", criativoId).eq("principal", true);
  if (erroLimpar) return { ok: false, erro: erroLimpar.message };

  const { error } = await db().from(TABELA).update({ principal: true }).eq("id", id);
  return error ? { ok: false, erro: error.message } : { ok: true };
}
