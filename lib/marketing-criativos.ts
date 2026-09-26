// ── Marketing · Biblioteca de Criativos ──────────────────────────────────────
// Cadastro dos criativos produzidos pelo time com numeração por (ano, mês),
// variação opcional, produto e histórico de alterações. Tolerante: sem a
// tabela (SQL ainda não rodado) devolve vazio / no-op em vez de estourar a tela,
// e sem as colunas `ano`/`variacao` (marketing_criativos_ano_variacao.sql)
// continua lendo com as colunas antigas.
//
// A numeração é a razão de existir do módulo: NUNCA duplicar. Quem garante é a
// UNIQUE (ano, prefixo, numero, variacao) no banco.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { codigoNoNome, formatarCodigo } from "@/lib/marketing-desempenho";
import {
  PRODUTOS, anoAtualSP, nomeAutomatico, nomeDoCriativo, normalizarPrefixo, normalizarTag, normalizarVariacao, tagDoProduto,
  type Criativo, type CriativoEvento, type CriativoStatus, type CriativoTipo, type ProdutoCriativo,
} from "@/lib/marketing-criativos-const";

// Constantes/tipos vivem em `marketing-criativos-const.ts` (sem next/headers,
// pra tela client poder importar) e são RE-EXPORTADOS aqui: quem já importa
// deste módulo no servidor continua funcionando.
export * from "@/lib/marketing-criativos-const";

// Colunas nomeadas — `select("*")` é proibido em rota de leitura (ver CLAUDE.md).
const COLS_ANTIGAS = "id,prefixo,numero,codigo,nome,editor_id,editor_nome,produto,plataforma,tipo,campanha,status,observacoes,meta_ad_id,video_url,data_criacao,criador_nome,created_at,updated_at";
const COLS = `${COLS_ANTIGAS},ano,variacao`;

type Row = Record<string, unknown>;
type ErroDb = { message?: string; code?: string } | null;

function deRow(r: Row): Criativo {
  const prefixo = (r.prefixo as string) ?? "";
  const numero = Number(r.numero ?? 0);
  const dataCriacao = String(r.data_criacao ?? "").slice(0, 10);
  return {
    id: r.id as string,
    prefixo, numero,
    ano: Number(r.ano) || Number(dataCriacao.slice(0, 4)) || anoAtualSP(),
    variacao: (r.variacao as string) ?? "",
    codigo: (r.codigo as string) || `${prefixo}-${String(numero).padStart(3, "0")}`,
    nome: (r.nome as string) ?? "",
    editorId: (r.editor_id as string) ?? null,
    editorNome: (r.editor_nome as string) ?? null,
    produto: (r.produto as string) ?? null,
    plataforma: (r.plataforma as string) ?? null,
    tipo: ((r.tipo as CriativoTipo) ?? "pago"),
    campanha: (r.campanha as string) ?? null,
    status: ((r.status as CriativoStatus) ?? "producao"),
    observacoes: (r.observacoes as string) ?? null,
    metaAdId: (r.meta_ad_id as string) ?? null,
    videoUrl: (r.video_url as string) ?? null,
    dataCriacao,
    criadorNome: (r.criador_nome as string) ?? null,
    createdAt: (r.created_at as string) ?? "",
    updatedAt: (r.updated_at as string) ?? "",
  };
}

// Tabela ausente (SQL pendente) → trata como "vazio", não como erro.
function semTabela(e: ErroDb): boolean {
  return !!e && (e.code === "42P01" || /does not exist|schema cache/i.test(e.message || "")) && !colunaAusente(e);
}
// Coluna ausente (ano/variacao antes do SQL novo) → lê com as colunas antigas.
function colunaAusente(e: ErroDb): boolean {
  return !!e && (e.code === "42703" || /column .* does not exist/i.test(e.message || ""));
}

// Lembra por 1 min que as colunas novas não existem, pra não pagar duas idas em
// toda leitura. Depois de 1 min tenta de novo: o SQL pode ter rodado.
let semColunasAte = 0;
async function comCols<T>(fn: (cols: string) => PromiseLike<{ data: T | null; error: ErroDb }>): Promise<{ data: T | null; error: ErroDb }> {
  if (Date.now() > semColunasAte) {
    const r = await fn(COLS);
    if (!colunaAusente(r.error)) return r;
    semColunasAte = Date.now() + 60_000;
  }
  return fn(COLS_ANTIGAS);
}

export interface FiltroCriativos {
  busca?: string;               // código, nome, produto, editor ou campanha
  editorId?: string;
  editor?: string;              // nome (quando o editor não é um profile)
  prefixo?: string;             // SET, OUT… (mês do criativo)
  produto?: string;             // Carimbo, Chancela…
  plataforma?: string;
  tipo?: CriativoTipo;
  status?: CriativoStatus;
  de?: string; ate?: string;    // data_criacao
  limite?: number;
}

const LIMITE_PADRAO = 200;
const LIMITE_MAX = 500;

/** Lista criativos com filtros. SEMPRE limitado (ver CLAUDE.md · dados). */
export async function listCriativos(f: FiltroCriativos = {}): Promise<Criativo[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await comCols<Row[]>((cols) => {
    let q = db.from("marketing_criativos").select(cols);
    if (f.editorId) q = q.eq("editor_id", f.editorId);
    if (f.editor) q = q.eq("editor_nome", f.editor);
    if (f.prefixo) q = q.eq("prefixo", normalizarPrefixo(f.prefixo));
    if (f.produto) q = q.ilike("produto", f.produto);
    if (f.plataforma) q = q.eq("plataforma", f.plataforma);
    if (f.tipo) q = q.eq("tipo", f.tipo);
    if (f.status) q = q.eq("status", f.status);
    if (f.de) q = q.gte("data_criacao", f.de);
    if (f.ate) q = q.lte("data_criacao", f.ate);
    if (f.busca) {
      const t = f.busca.replace(/[%,()]/g, " ").trim();
      if (t) q = q.or(["codigo", "nome", "produto", "editor_nome", "campanha"].map((c) => `${c}.ilike.%${t}%`).join(","));
    }
    const limite = Math.min(Math.max(1, f.limite ?? LIMITE_PADRAO), LIMITE_MAX);
    return q.order("created_at", { ascending: false }).limit(limite) as unknown as PromiseLike<{ data: Row[] | null; error: ErroDb }>;
  });
  if (error) { if (semTabela(error)) return []; throw new Error(error.message); }
  return (data ?? []).map((r) => deRow(r));
}

export async function getCriativo(id: string): Promise<Criativo | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await comCols<Row>((cols) =>
    db.from("marketing_criativos").select(cols).eq("id", id).maybeSingle() as unknown as PromiseLike<{ data: Row | null; error: ErroDb }>);
  if (error) { if (semTabela(error)) return null; throw new Error(error.message); }
  return data ? deRow(data) : null;
}

/**
 * Criativos por CÓDIGO (JL-041, SET-001), numa consulta só — é a ponte do
 * Tridify: o nome do anúncio traz o código, o código traz o criativo e a peça.
 *
 * Desde o ano e a variação o MESMO código aparece em mais de um criativo (SET 01
 * de 2026 e de 2027, SET 01 e SET 01 V2). A lista sai do mais novo pro mais
 * antigo: quem monta o mapa por código fica com o primeiro, o mais recente.
 */
export async function criativosPorCodigo(codigos: string[]): Promise<Criativo[]> {
  // 300 = o mesmo teto da rota por-codigo; cortar em 200 aqui largava os
  // últimos códigos sem aviso.
  const lista = [...new Set(codigos.map((c) => c.trim().toUpperCase()).filter(Boolean))].slice(0, 300);
  if (!lista.length) return [];
  const db = createSupabaseAdminClient();
  const { data, error } = await comCols<Row[]>((cols) =>
    db.from("marketing_criativos").select(cols).in("codigo", lista)
      .order("created_at", { ascending: false }).limit(600) as unknown as PromiseLike<{ data: Row[] | null; error: ErroDb }>);
  if (error) { if (semTabela(error)) return []; throw new Error(error.message); }
  return (data ?? []).map(deRow);
}

/**
 * Os códigos que aparecem num nome de anúncio ("JL-041 depoimento 15s" →
 * ["JL-041"]). Mesma regra do desempenho (`codigoNoNome`): "JL 041" e "JL041"
 * também contam, porque é assim que o nome sai da mão de quem sobe o anúncio.
 */
export function extrairCodigos(nome: string): string[] {
  const c = codigoNoNome(nome || "");
  return c ? [formatarCodigo(c.prefixo, c.numero)] : [];
}

export async function historicoCriativo(id: string): Promise<CriativoEvento[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("marketing_criativos_hist")
    .select("id,acao,campo,detalhe,autor_nome,created_at")
    .eq("criativo_id", id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return [];
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id as string, acao: (r.acao as string) ?? "", campo: (r.campo as string) ?? null,
    detalhe: (r.detalhe as string) ?? null, autorNome: (r.autor_nome as string) ?? null,
    createdAt: (r.created_at as string) ?? "",
  }));
}

export interface Autor { id: string | null; nome: string | null }

export async function registrarEvento(criativoId: string, autor: Autor, acao: string, campo?: string | null, detalhe?: string | null) {
  const db = createSupabaseAdminClient();
  await db.from("marketing_criativos_hist").insert({
    criativo_id: criativoId, acao, campo: campo ?? null, detalhe: detalhe ?? null,
    autor_id: autor.id, autor_nome: autor.nome,
  });
}

export interface NovoCriativo {
  prefixo: string;
  numero: number;
  ano: number;
  variacao?: string | null;
  editorId?: string | null;
  editorNome?: string | null;
  produto: string;
  tag: string;
  observacoes?: string | null;
}

/**
 * Cria o criativo com o número ESCOLHIDO (a tela já traz o próximo livre).
 * Número ocupado não pula pro seguinte em silêncio — o nome do anúncio na Meta
 * passaria a apontar pra outro criativo. Recusa com `numero_ocupado`.
 */
export async function criarCriativo(autor: Autor, dados: NovoCriativo): Promise<Criativo | null> {
  const db = createSupabaseAdminClient();
  const prefixo = normalizarPrefixo(dados.prefixo);
  if (!prefixo) throw new Error("prefixo_invalido");
  const variacao = normalizarVariacao(dados.variacao);

  const { data, error } = await db.from("marketing_criativos").insert({
    prefixo, numero: dados.numero, ano: dados.ano, variacao,
    nome: nomeDoCriativo(prefixo, dados.numero, variacao, dados.tag, dados.editorNome).slice(0, 160),
    editor_id: dados.editorId || null,
    editor_nome: dados.editorNome?.trim() || null,
    produto: dados.produto,
    tipo: "pago",
    status: "producao",
    observacoes: dados.observacoes?.trim() || null,
    data_criacao: new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10),
    criador_id: autor.id, criador_nome: autor.nome,
  }).select(COLS).single();

  if (error) {
    if (colunaAusente(error)) throw new Error("sql_pendente");
    if (semTabela(error)) return null;
    if (error.code === "23505") throw new Error("numero_ocupado");
    throw new Error(error.message);
  }
  const c = deRow(data as Row);
  void registrarEvento(c.id, autor, "criou", null, c.nome);
  void garantirPrefixo(prefixo);
  return c;
}

/** Próximo número livre do mês no ano (`max+1`), ou null sem a tabela. */
export async function proximoNumero(prefixo: string, ano: number = anoAtualSP()): Promise<number | null> {
  const db = createSupabaseAdminClient();
  const consulta = (comAno: boolean) => {
    let q = db.from("marketing_criativos").select("numero").eq("prefixo", normalizarPrefixo(prefixo));
    if (comAno) q = q.eq("ano", ano);
    return q.order("numero", { ascending: false }).limit(1);
  };
  let { data, error } = await consulta(true);
  if (colunaAusente(error)) ({ data, error } = await consulta(false));
  if (error) { if (semTabela(error)) return null; throw new Error(error.message); }
  return (Number(data?.[0]?.numero ?? 0) || 0) + 1;
}

async function garantirPrefixo(prefixo: string) {
  const db = createSupabaseAdminClient();
  await db.from("marketing_criativos_prefixos").upsert({ prefixo }, { onConflict: "prefixo" });
}

export interface PatchCriativo {
  nome?: string; editorId?: string | null; editorNome?: string | null;
  produto?: string | null; variacao?: string | null;
  plataforma?: string | null; tipo?: CriativoTipo;
  campanha?: string | null; status?: CriativoStatus; observacoes?: string | null;
  metaAdId?: string | null; videoUrl?: string | null;
  dataCriacao?: string | null;
}

const CAMPO_LABEL: Record<string, string> = {
  nome: "Nome", editor_nome: "Editor", produto: "Produto", variacao: "Variação", plataforma: "Plataforma",
  tipo: "Tipo", campanha: "Campanha", status: "Status", observacoes: "Observações",
  meta_ad_id: "ID do anúncio na Meta", video_url: "Link do vídeo",
  data_criacao: "Data de criação",
};

/** Atualiza e registra no histórico só o que de fato mudou. */
export async function atualizarCriativo(id: string, patch: PatchCriativo, autor: Autor): Promise<Criativo | null> {
  const antes = await getCriativo(id);
  if (!antes) return null;

  const set: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.nome !== undefined) set.nome = (patch.nome || "").trim().slice(0, 160);
  if (patch.editorId !== undefined) set.editor_id = patch.editorId || null;
  if (patch.editorNome !== undefined) set.editor_nome = patch.editorNome?.trim() || null;
  if (patch.produto !== undefined) set.produto = patch.produto?.trim() || null;
  if (patch.variacao !== undefined) set.variacao = normalizarVariacao(patch.variacao);
  if (patch.plataforma !== undefined) set.plataforma = patch.plataforma || null;
  if (patch.tipo !== undefined) set.tipo = patch.tipo === "organico" ? "organico" : "pago";
  if (patch.campanha !== undefined) set.campanha = patch.campanha?.trim() || null;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.observacoes !== undefined) set.observacoes = patch.observacoes?.trim() || null;
  if (patch.metaAdId !== undefined) set.meta_ad_id = patch.metaAdId?.trim() || null;
  if (patch.videoUrl !== undefined) set.video_url = patch.videoUrl?.trim() || null;
  if (patch.dataCriacao !== undefined && patch.dataCriacao) set.data_criacao = patch.dataCriacao;

  // Nome automático acompanha variação, produto e editor. Só reescreve quem JÁ
  // nasceu automático — nome escrito à mão (JL-041 "Depoimento…") fica.
  if ((patch.produto !== undefined || patch.editorNome !== undefined || patch.variacao !== undefined) && nomeAutomatico(antes)) {
    const produto = patch.produto !== undefined ? patch.produto : antes.produto;
    set.nome = nomeDoCriativo(antes.prefixo, antes.numero,
      patch.variacao !== undefined ? patch.variacao : antes.variacao,
      tagDoProduto(produto, await listProdutos()),
      patch.editorNome !== undefined ? patch.editorNome : antes.editorNome).slice(0, 160);
  }

  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("marketing_criativos").update(set).eq("id", id).select(COLS).single();
  if (error) {
    if (colunaAusente(error)) throw new Error("sql_pendente");
    if (semTabela(error)) return null;
    if (error.code === "23505") throw new Error("numero_ocupado");
    throw new Error(error.message);
  }
  const depois = deRow(data as Row);

  // Histórico: uma linha por campo alterado (ano/prefixo/numero são imutáveis).
  const pares: [string, unknown, unknown][] = [
    ["nome", antes.nome, depois.nome],
    ["editor_nome", antes.editorNome, depois.editorNome],
    ["produto", antes.produto, depois.produto],
    ["variacao", antes.variacao, depois.variacao],
    ["plataforma", antes.plataforma, depois.plataforma],
    ["tipo", antes.tipo, depois.tipo],
    ["campanha", antes.campanha, depois.campanha],
    ["status", antes.status, depois.status],
    ["observacoes", antes.observacoes, depois.observacoes],
    ["meta_ad_id", antes.metaAdId, depois.metaAdId],
    ["video_url", antes.videoUrl, depois.videoUrl],
    ["data_criacao", antes.dataCriacao, depois.dataCriacao],
  ];
  for (const [campo, a, b] of pares) {
    if (a === b) continue;
    const rotulo = CAMPO_LABEL[campo] ?? campo;
    const detalhe = campo === "observacoes"
      ? String(b ?? "").slice(0, 200)
      : `${a || "—"} → ${b || "—"}`;
    void registrarEvento(id, autor, campo === "observacoes" ? "observacao" : campo === "status" ? "status" : "editou", rotulo, detalhe);
  }
  return depois;
}

export async function listPrefixos(): Promise<{ prefixo: string; descricao: string | null }[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("marketing_criativos_prefixos")
    .select("prefixo,descricao")
    .order("prefixo")
    .limit(100);
  if (error) return [];
  return ((data ?? []) as Row[]).map((r) => ({ prefixo: r.prefixo as string, descricao: (r.descricao as string) ?? null }));
}

// ── Produtos ─────────────────────────────────────────────────────────────────

/** Produtos da biblioteca. Sem a tabela (SQL pendente), os de fábrica. */
export async function listProdutos(): Promise<ProdutoCriativo[]> {
  const db = createSupabaseAdminClient();
  // O `id` vai junto porque o story (Marketing · Stories) aponta pro produto
  // pela chave, não pelo nome — renomear o produto não pode soltar os stories.
  const { data, error } = await db.from("marketing_criativos_produtos").select("id,nome,tag").order("created_at").limit(100);
  if (error || !data?.length) return PRODUTOS;
  return (data as Row[]).map((r) => ({ id: String(r.id), nome: String(r.nome), tag: String(r.tag) }));
}

/** Cria produto. Nome e tag não se repetem (índices únicos no banco). */
export async function criarProduto(nome: string, tag: string, autor: Autor): Promise<ProdutoCriativo> {
  const n = (nome || "").replace(/\s+/g, " ").trim().slice(0, 40);
  const t = normalizarTag(tag);
  if (!n) throw new Error("nome_obrigatorio");
  if (!t) throw new Error("tag_obrigatoria");
  const lista = await listProdutos();
  if (lista.some((p) => p.nome.toLowerCase() === n.toLowerCase())) throw new Error("produto_existe");
  if (lista.some((p) => p.tag === t)) throw new Error("tag_existe");
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("marketing_criativos_produtos")
    .insert({ nome: n, tag: t, criador_nome: autor.nome }).select("id").maybeSingle();
  if (error) {
    if (error.code === "23505") throw new Error("produto_existe");
    if (error.code === "42P01" || /does not exist|schema cache/i.test(error.message || "")) throw new Error("sql_pendente");
    throw new Error(error.message);
  }
  // Com o id, o produto criado no meio do cadastro de um story já pode ser
  // escolhido nele — sem recarregar a lista.
  return { id: (data as { id?: string } | null)?.id, nome: n, tag: t };
}

// ── Estreia na Meta ──────────────────────────────────────────────────────────

/**
 * Primeiro dia em que um anúncio com o nome do criativo rodou (teve impressão),
 * por id do criativo. UMA chamada pra lista inteira (RPC `criativos_estreia`,
 * que agrupa no banco) — nunca uma consulta por card, e nunca baixar as linhas
 * diárias do armazém pra achar o mínimo aqui (PostgREST corta em 1000).
 * Sem a função (SQL pendente) devolve vazio: a tela só não mostra a data.
 */
export async function estreiasNaMeta(criativos: Pick<Criativo, "id" | "nome" | "ano" | "dataCriacao">[]): Promise<Record<string, string>> {
  const comNome = criativos.filter((c) => c.nome.trim().length >= 4).slice(0, 300);
  if (!comNome.length) return {};
  // Anúncio de um criativo não roda antes do ano dele: o piso corta o armazém.
  const desde = `${Math.min(...comNome.map((c) => c.ano || Number(c.dataCriacao.slice(0, 4)) || anoAtualSP()))}-01-01`;
  const db = createSupabaseAdminClient();
  const { data, error } = await db.rpc("criativos_estreia", { nomes: [...new Set(comNome.map((c) => c.nome.trim()))], desde });
  if (error || !Array.isArray(data)) return {};
  const porNome = new Map((data as { nome: string; primeira: string }[]).map((r) => [r.nome, String(r.primeira).slice(0, 10)]));
  const out: Record<string, string> = {};
  for (const c of comNome) { const d = porNome.get(c.nome.trim()); if (d) out[c.id] = d; }
  return out;
}

// ── Agregados do dashboard ───────────────────────────────────────────────────
// Só as colunas necessárias e uma janela fechada: o painel não arrasta a tabela
// inteira (observações, campanha e afins ficam de fora).

export interface LinhaProducao { dia: string; editor: string; tipo: string }

export async function producaoDesde(desde: string): Promise<LinhaProducao[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("marketing_criativos")
    .select("data_criacao,editor_nome,tipo")
    .gte("data_criacao", desde)
    .order("data_criacao", { ascending: true })
    .limit(5000);
  if (error) return [];
  return ((data ?? []) as Row[]).map((r) => ({
    dia: String(r.data_criacao ?? "").slice(0, 10),
    editor: (r.editor_nome as string) || "Sem editor",
    tipo: (r.tipo as string) || "pago",
  }));
}

export async function totalCriativos(): Promise<number> {
  const db = createSupabaseAdminClient();
  // Só o número: `head: true` faz o corpo voltar vazio (ver CLAUDE.md · dados).
  const { count, error } = await db.from("marketing_criativos").select("id", { count: "exact", head: true });
  if (error) return 0;
  return count ?? 0;
}

export async function ultimoCriativo(): Promise<Criativo | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await comCols<Row[]>((cols) =>
    db.from("marketing_criativos").select(cols).order("created_at", { ascending: false }).limit(1) as unknown as PromiseLike<{ data: Row[] | null; error: ErroDb }>);
  if (error) return null;
  return data?.[0] ? deRow(data[0]) : null;
}
