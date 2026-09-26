// ── Marketing · Stories — lado servidor ──────────────────────────────────────
// Tabela `marketing_stories` (supabase/marketing_stories.sql). Os bytes da
// mídia moram no Backblaze B2, área `stories/`; aqui trafega só o endereço.
//
// Duas leituras, com dois compromissos diferentes:
//  • O QUADRO do mês lê o banco na hora, a janela do mês e nada mais. Quem
//    acabou de registrar um story num computador tem de vê-lo no do colega.
//  • O ÍNDICE (todos os stories, colunas leves) alimenta o histórico, a busca
//    e o "já postamos isso?". Fica em memória por 90 s e é remendado a cada
//    gravação feita aqui — sem isso, cada campo preenchido no cadastro (o aviso
//    de parecido roda enquanto se digita) baixaria a tabela inteira de novo.
//    É exatamente o padrão que estourou o egress do Supabase (ver CLAUDE.md).
//
// Tolerante à tabela ausente: enquanto o SQL não roda o quadro aparece vazio
// com o aviso, e gravar responde `sql_pendente`.

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { apagarPrivado, existePrivado } from "@/lib/armazenamento/privado";
import { chaveDaUrl, tetoDoEnvio } from "@/lib/armazenamento/referencia";
import { listProdutos } from "@/lib/marketing-criativos";
import { janelaDeDias, janelaUTC } from "./calendario";
import { ordenar, porTipo, resumir, type LinhaTipo, type Resumo } from "./metricas";
import { casaBusca, mesmoFormato, normalizar, parecidos, type ConteudoStory, type Parecido } from "./semelhanca";
import {
  rotuloDoTipo,
  type CamposStory, type MidiaStory, type NovoStory, type ParecidoStory, type PatchStory, type StatusStory,
  type Story, type TipoStory,
} from "./tipos";

const TABELA = "marketing_stories";
// Colunas nomeadas — `select("*")` é proibido em rota de leitura (CLAUDE.md).
const COLS =
  "id,publicado_em,status,midia_url,midia_tipo,capa_url,largura,altura,duracao,hash_visual,produto_id,tipo," +
  "campanha,tema,cta,link_url,cliques,vendas,observacoes,criador_nome,created_at,updated_at";
// O índice leva o que a busca, a repetição e o card precisam — não o link, as
// medidas nem os carimbos de auditoria (esses vêm na página de resultado).
const COLS_INDICE =
  "id,publicado_em,status,midia_url,midia_tipo,capa_url,hash_visual,produto_id,tipo,campanha,tema,cta,observacoes,cliques,vendas";

const db = () => createSupabaseAdminClient();

/** A tabela ainda não existe — a rota responde `sql_pendente`. */
export class SqlPendente extends Error {
  constructor() { super("sql_pendente"); }
}
/** Recusa com frase pronta pra tela (arquivo que não chegou, fora do teto…). */
export class ErroDeStory extends Error {
  constructor(msg: string, public status = 422) { super(msg); }
}

function semTabela(e: { message?: string; code?: string } | null | undefined): boolean {
  return !!e && (e.code === "42P01" || /does not exist|schema cache/i.test(e.message || ""));
}

type Row = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? null : String(v));
const num = (v: unknown) => (v == null ? null : Number(v));

function deRow(r: Row): Story {
  return {
    id: String(r.id),
    publicadoEm: new Date(String(r.publicado_em)).toISOString(),
    status: ((r.status as StatusStory) ?? "publicado"),
    midiaUrl: txt(r.midia_url),
    midiaTipo: (r.midia_tipo as MidiaStory) ?? null,
    capaUrl: txt(r.capa_url),
    largura: num(r.largura),
    altura: num(r.altura),
    duracao: num(r.duracao),
    hashVisual: txt(r.hash_visual),
    produtoId: txt(r.produto_id),
    tipo: (r.tipo as TipoStory) ?? null,
    campanha: txt(r.campanha),
    tema: txt(r.tema),
    cta: txt(r.cta),
    linkUrl: txt(r.link_url),
    cliques: Number(r.cliques ?? 0),
    vendas: Number(r.vendas ?? 0),
    observacoes: txt(r.observacoes),
    criadorNome: txt(r.criador_nome),
    createdAt: txt(r.created_at) ?? "",
    updatedAt: txt(r.updated_at) ?? "",
  };
}

const COLUNA: Record<keyof CamposStory, string> = {
  publicadoEm: "publicado_em", status: "status", midiaUrl: "midia_url", midiaTipo: "midia_tipo", capaUrl: "capa_url",
  largura: "largura", altura: "altura", duracao: "duracao", hashVisual: "hash_visual", produtoId: "produto_id",
  tipo: "tipo", campanha: "campanha", tema: "tema", cta: "cta", linkUrl: "link_url", cliques: "cliques",
  vendas: "vendas", observacoes: "observacoes",
};

function paraRow(d: PatchStory): Row {
  const r: Row = {};
  for (const [k, v] of Object.entries(d)) {
    const c = COLUNA[k as keyof CamposStory];
    if (c && v !== undefined) r[c] = v;
  }
  return r;
}

/** A miniatura que representa o story numa lista: capa, ou a própria imagem. */
function miniatura(s: Pick<Story, "capaUrl" | "midiaUrl" | "midiaTipo">): string | null {
  return s.capaUrl ?? (s.midiaTipo === "imagem" ? s.midiaUrl : null);
}

function paraParecido(p: Parecido<Story>): ParecidoStory {
  const s = p.item;
  return {
    story: {
      id: s.id, publicadoEm: s.publicadoEm, status: s.status, capaUrl: s.capaUrl, midiaUrl: s.midiaUrl,
      midiaTipo: s.midiaTipo, tema: s.tema, tipo: s.tipo, produtoId: s.produtoId, cliques: s.cliques, vendas: s.vendas,
    },
    nota: p.nota,
    mesmaArte: p.mesmaArte,
  };
}

// ── Índice ───────────────────────────────────────────────────────────────────

interface Indice { lista: Story[]; pendente: boolean }
const TTL_INDICE = 90_000;
let memo: { at: number; p: Promise<Indice> } | null = null;

async function lerIndice(): Promise<Indice> {
  const lista: Story[] = [];
  // O PostgREST corta em 1000 linhas SEM avisar: página a página.
  for (let de = 0; de < 6000; de += 1000) {
    const { data, error } = await db().from(TABELA).select(COLS_INDICE)
      .order("publicado_em", { ascending: false }).range(de, de + 999);
    if (error) {
      if (semTabela(error)) return { lista: [], pendente: true };
      throw error;
    }
    lista.push(...((data ?? []) as Row[]).map(deRow));
    if (!data || data.length < 1000) break;
  }
  return { lista, pendente: false };
}

function indice(): Promise<Indice> {
  if (memo && Date.now() - memo.at < TTL_INDICE) return memo.p;
  const p = lerIndice();
  memo = { at: Date.now(), p };
  // Falha não fica guardada pelo TTL inteiro (ver lib/cache.ts).
  p.catch(() => { if (memo?.p === p) memo = null; });
  return p;
}

/** Remenda o índice em memória depois de uma gravação feita por esta instância. */
function noIndice(s: Story | null, saiu?: string) {
  if (!memo) return;
  const fora = s?.id ?? saiu;
  memo = {
    at: memo.at,
    p: memo.p.then((ix) => {
      const resto = ix.lista.filter((x) => x.id !== fora);
      return { ...ix, lista: s ? [s, ...resto] : resto };
    }),
  };
}

function marcarRepeticoes(stories: Story[], hist: Story[]) {
  for (const s of stories) {
    const p = parecidos(s, hist, { antes: true, limite: 1 })[0];
    s.repete = p
      ? { id: p.item.id, publicadoEm: p.item.publicadoEm, capaUrl: miniatura(p.item), mesmaArte: p.mesmaArte, nota: p.nota }
      : null;
  }
}

/** Campanhas já usadas, da mais recente pra mais antiga — viram sugestão no campo. */
function campanhasDe(hist: Story[]): string[] {
  const vistas = new Map<string, string>();
  for (const s of hist) {
    const c = s.campanha?.trim();
    if (c && !vistas.has(normalizar(c))) vistas.set(normalizar(c), c);
    if (vistas.size >= 60) break;
  }
  return [...vistas.values()];
}

async function porIds(ids: string[]): Promise<Story[]> {
  if (!ids.length) return [];
  const { data, error } = await db().from(TABELA).select(COLS).in("id", ids).limit(ids.length);
  if (error) {
    if (semTabela(error)) return [];
    throw error;
  }
  const porId = new Map(((data ?? []) as Row[]).map((r) => [String(r.id), deRow(r)]));
  return ids.map((id) => porId.get(id)).filter((s): s is Story => !!s);
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export interface MesDeStories { stories: Story[]; campanhas: string[]; sqlPendente: boolean }

/** O quadro de um mês (`AAAA-MM`), direto do banco, com a marca de repetição. */
export async function listarMes(mes: string): Promise<MesDeStories> {
  const { de, ate } = janelaUTC(mes);
  const { data, error } = await db().from(TABELA).select(COLS)
    .gte("publicado_em", de).lt("publicado_em", ate)
    .order("publicado_em", { ascending: true })
    .limit(1000);
  if (error) {
    if (semTabela(error)) return { stories: [], campanhas: [], sqlPendente: true };
    throw error;
  }
  const stories = ((data ?? []) as Row[]).map(deRow);
  const hist = (await indice().catch(() => null))?.lista ?? [];
  marcarRepeticoes(stories, hist);
  return { stories, campanhas: campanhasDe(hist), sqlPendente: false };
}

export type OrdemBusca = "recentes" | "vendas" | "cliques" | "conversao";

export interface FiltroBusca {
  q?: string;
  /** Dias de Brasília, `AAAA-MM-DD`, os dois inclusive. */
  de?: string;
  ate?: string;
  produtoId?: string;
  tipo?: string;
  campanha?: string;
  ordem?: OrdemBusca;
  offset?: number;
  limite?: number;
}

export interface ResultadoBusca {
  stories: Story[];
  total: number;
  /** Sobre TODOS os que casaram, não só a página — "34 stories de carimbo". */
  resumo: Resumo;
  porTipo: LinhaTipo[];
  sqlPendente: boolean;
}

/**
 * O histórico. A busca roda no índice (em memória): sem acento, todas as
 * palavras em qualquer ordem, casando tema, campanha, CTA, observação, tipo e
 * NOME do produto — "carimbo" acha os stories do produto Carimbo mesmo que a
 * palavra não esteja escrita em lugar nenhum do story. `ilike` no banco não
 * faria nada disso, e o resumo por tipo sairia só da página.
 */
export async function buscar(f: FiltroBusca): Promise<ResultadoBusca> {
  const ix = await indice();
  const produtos = await listProdutos().catch(() => []);
  const nomeDe = new Map(produtos.filter((p) => p.id).map((p) => [p.id as string, p.nome]));
  const janela = f.de && f.ate ? janelaDeDias(f.de, f.ate) : null;
  const termo = (f.q ?? "").trim().slice(0, 80);
  const campanha = normalizar(f.campanha);

  const casam = ix.lista.filter((s) => {
    if (janela && (s.publicadoEm < janela.de || s.publicadoEm >= janela.ate)) return false;
    if (f.produtoId && s.produtoId !== f.produtoId) return false;
    if (f.tipo && s.tipo !== f.tipo) return false;
    if (campanha && normalizar(s.campanha) !== campanha) return false;
    if (termo) {
      const texto = [s.tema, s.campanha, s.cta, s.observacoes, rotuloDoTipo(s.tipo), s.produtoId ? nomeDe.get(s.produtoId) : null]
        .filter(Boolean).join(" ");
      if (!casaBusca(texto, termo)) return false;
    }
    return true;
  });

  const ordem = f.ordem ?? "recentes";
  const lista = ordem === "recentes"
    ? [...casam].sort((a, b) => (a.publicadoEm < b.publicadoEm ? 1 : a.publicadoEm > b.publicadoEm ? -1 : 0))
    : ordenar(casam, ordem);
  const offset = Math.max(0, Math.min(100_000, Math.floor(f.offset ?? 0)));
  const limite = Math.max(1, Math.min(240, Math.floor(f.limite ?? 60)));
  // O índice é leve; a página vai COMPLETA (link, medidas, autor) numa ida só.
  const pagina = await porIds(lista.slice(offset, offset + limite).map((s) => s.id));
  marcarRepeticoes(pagina, ix.lista);
  return { stories: pagina, total: lista.length, resumo: resumir(casam), porTipo: porTipo(casam), sqlPendente: ix.pendente };
}

/** Um story, completo, e os parecidos com ele (antes OU depois). */
export async function detalhe(id: string): Promise<{ story: Story; parecidos: ParecidoStory[] } | null> {
  const s = (await porIds([id]))[0];
  if (!s) return null;
  const hist = (await indice().catch(() => null))?.lista ?? [];
  marcarRepeticoes([s], hist);
  return { story: s, parecidos: parecidos(s, hist, { limite: 6 }).map(paraParecido) };
}

/** O aviso do cadastro: o que já foi usado parecido com o que está sendo digitado. */
export async function semelhantes(alvo: ConteudoStory & { excluirId?: string }): Promise<{
  parecidos: ParecidoStory[];
  mesmoFormato: { total: number; ultimo: string | null };
}> {
  const { lista } = await indice();
  const a = { ...alvo, id: alvo.excluirId };
  return { parecidos: parecidos(a, lista, { limite: 4 }).map(paraParecido), mesmoFormato: mesmoFormato(a, lista) };
}

// ── Escrita ──────────────────────────────────────────────────────────────────

/**
 * A mídia tem de EXISTIR no bucket antes de virar linha, e o tamanho que vale
 * é o que o B2 mediu — não o que o navegador disse. Sem esta conferida, uma
 * requisição forjada criaria um story que nunca abre. Mesma regra da
 * Biblioteca de Criativos (`lib/criativos/biblioteca.ts`).
 */
async function conferirMidia(d: PatchStory): Promise<void> {
  const pares: [string | null | undefined, string][] = [
    [d.midiaUrl, d.midiaTipo === "video" ? "video/mp4" : "image/jpeg"],
    [d.capaUrl, "image/webp"],
  ];
  for (const [url, mimeReserva] of pares) {
    if (!url) continue;
    const chave = chaveDaUrl(url);
    if (!chave || !chave.startsWith("stories/")) throw new ErroDeStory("Endereço de arquivo inválido.");
    const real = await existePrivado(chave).catch(() => null);
    if (!real) throw new ErroDeStory("O arquivo não chegou ao armazenamento. Envie de novo.");
    const teto = tetoDoEnvio("stories", real.mime || mimeReserva);
    if (teto <= 0 || real.tamanho > teto) {
      await apagarPrivado(chave).catch(() => {});
      throw new ErroDeStory("Arquivo fora dos limites de story.");
    }
  }
}

export async function criar(d: NovoStory, autor: { id: string | null; nome: string | null }): Promise<Story> {
  await conferirMidia(d);
  const { data, error } = await db().from(TABELA)
    .insert({ ...paraRow(d), status: d.status ?? "publicado", criador_id: autor.id, criador_nome: autor.nome })
    .select(COLS).single();
  if (error || !data) {
    if (semTabela(error)) throw new SqlPendente();
    throw new Error(error?.message ?? "story_error");
  }
  const s = deRow(data as Row);
  const hist = (await indice().catch(() => null))?.lista ?? [];
  marcarRepeticoes([s], hist);
  noIndice(s);
  return s;
}

/**
 * Edita. Um campo por pedido é o comum (a fila de salvamento manda o número
 * que a pessoa acabou de trocar). Trocar a mídia apaga a antiga do bucket —
 * DEPOIS de a linha apontar pra nova: na ordem inversa, uma falha no meio
 * deixaria o story sem imagem nenhuma.
 */
export async function atualizar(id: string, d: PatchStory): Promise<Story | null> {
  const row = paraRow(d);
  if (!Object.keys(row).length) return (await porIds([id]))[0] ?? null;

  let antigas: (string | null)[] = [];
  if ("midiaUrl" in d || "capaUrl" in d) {
    const { data } = await db().from(TABELA).select("midia_url,capa_url").eq("id", id).maybeSingle();
    const a = data as { midia_url: string | null; capa_url: string | null } | null;
    antigas = a ? [a.midia_url, a.capa_url] : [];
    await conferirMidia(d);
  }

  const { data, error } = await db().from(TABELA).update(row).eq("id", id).select(COLS).maybeSingle();
  if (error) {
    if (semTabela(error)) throw new SqlPendente();
    throw new Error(error.message);
  }
  if (!data) return null;
  const s = deRow(data as Row);
  for (const url of antigas) {
    if (!url || url === s.midiaUrl || url === s.capaUrl) continue;
    const chave = chaveDaUrl(url);
    if (chave) await apagarPrivado(chave).catch(() => {});
  }
  noIndice(s);
  return s;
}

/** Tira o story E a mídia dele do bucket. A linha sai primeiro (órfão no bucket é chato, não grave). */
export async function excluir(id: string): Promise<boolean> {
  const { data, error: erroLer } = await db().from(TABELA).select("id,midia_url,capa_url").eq("id", id).maybeSingle();
  if (erroLer) {
    if (semTabela(erroLer)) throw new SqlPendente();
    throw new Error(erroLer.message);
  }
  if (!data) return false;
  const { error } = await db().from(TABELA).delete().eq("id", id);
  if (error) throw new Error(error.message);
  const r = data as { midia_url: string | null; capa_url: string | null };
  for (const url of [r.midia_url, r.capa_url]) {
    const chave = chaveDaUrl(url);
    if (chave) await apagarPrivado(chave).catch(() => {});
  }
  noIndice(null, id);
  return true;
}

/**
 * Arquivo que subiu e não virou story (a pessoa trocou a imagem ou fechou o
 * cadastro). Só apaga se for da área `stories/` E nenhuma linha apontar pra
 * ele — ter o link de um arquivo de story não dá o direito de sumir com ele.
 */
export async function descartarOrfa(url: string): Promise<boolean> {
  const chave = chaveDaUrl(url);
  if (!chave || !chave.startsWith("stories/")) return false;
  const [m, c] = await Promise.all([
    db().from(TABELA).select("id", { count: "exact", head: true }).eq("midia_url", url),
    db().from(TABELA).select("id", { count: "exact", head: true }).eq("capa_url", url),
  ]);
  if ((m.error && !semTabela(m.error)) || (c.error && !semTabela(c.error))) return false;
  if ((m.count ?? 0) + (c.count ?? 0) > 0) return false;
  await apagarPrivado(chave).catch(() => {});
  return true;
}
