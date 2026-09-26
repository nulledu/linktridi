// TridiFlow — camada de dados (server). Tabelas: tridiflow_bots / _dominios /
// _sessoes (supabase/tridiflow.sql). Tolerante: sem as tabelas, erro legível.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cached, invalidate } from "@/lib/cache";
import { addLeadFunil } from "@/lib/comercial";
import { FLUXO_VAZIO, SETTINGS_PADRAO, THEME_PADRAO, pixelsPublicos, type BotSettings, type Fluxo, type PixelsConfig, type Theme } from "@/lib/tridiflow";
import { CHAVE_TAGS, QUIZ_PADRAO, type Quiz } from "@/lib/tridiflow-quiz";
import { LINKTRIDI_PADRAO, type LinkTridiDoc } from "@/lib/tridiflow-linktridi";
import { ehVariante, resumoAB, type ResumoAB } from "@/lib/tridiflow-ab";
import { PAGINA_VAZIA, normalizarPagina, type PaginaDoc } from "@/lib/tridiflow-pagina";
import { miniaturaDaPagina, type Miniatura } from "@/lib/tridiflow-pagina-miniatura";

const ausente = (msg: string | undefined) => !!msg && /relation .* does not exist|Could not find the table/i.test(msg);
// Coluna/tabela que ainda não existe (SQL pendente) é resposta ESTÁVEL — a
// próxima leitura diria o mesmo, então pode ficar em cache. Todo o resto
// (timeout, 5xx, conexão) é passageiro e precisa subir.
const COLUNA_AUSENTE = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);
export class TridiflowTabelaAusente extends Error { constructor() { super("tabela_ausente"); } }
function lancar(msg: string | undefined): never {
  if (ausente(msg)) throw new TridiflowTabelaAusente();
  throw new Error(msg || "erro");
}

/**
 * Leitura de série (sessões, eventos) em páginas de 1000.
 *
 * O PostgREST devolve no MÁXIMO 1000 linhas por resposta e NÃO avisa: pedir
 * `.limit(8000)` continua trazendo 1000 e o resto some em silêncio. Com o
 * TridiFlow em mil sessões por dia, "últimos 14 dias" virava "o último dia" —
 * um número menor que o real, sem erro nenhum na tela pra denunciar. É o mesmo
 * tropeço que o `paginado()` de lib/plataforma-vendas.ts já documenta.
 */
type PaginaSupabase = PromiseLike<{ data: unknown; error: { message?: string } | null }>;
async function paginado<T>(monta: (ini: number, fim: number) => PaginaSupabase, teto: number): Promise<{ linhas: T[]; erro: string | undefined }> {
  const linhas: T[] = [];
  for (let ini = 0; ini < teto; ini += 1000) {
    const { data, error } = await monta(ini, ini + 999);
    if (error) return { linhas, erro: error.message ?? "erro" };
    const lote = (data ?? []) as T[];
    linhas.push(...lote);
    if (lote.length < 1000) break;
  }
  return { linhas, erro: undefined };
}

// Tipo do projeto. 'flow' = fluxo conversacional (o de sempre); 'page' = landing
// page / VSL; 'quiz' = funil de etapas. Os três vivem na MESMA tabela porque
// disputam o mesmo caminho público (domínio + slug) — ver
// supabase/tridiflow-paginas.sql.
//
// QUIZ NÃO MORA NA COLUNA `tipo`. A constraint tridiflow_bots_tipo_chk só aceita
// 'flow' e 'page', então gravar 'quiz' quebraria o insert e exigiria uma
// migração manual. Em vez disso o quiz é um 'flow' cujo `settings.modo` é
// 'quiz', e o tipo é DERIVADO na leitura (ver `tipoDe`). Sai de graça: `settings`
// já vem em COLS_BASE, então derivar não custa uma query a mais — e todo quiz
// que já existe passa a aparecer como projeto de quiz sem nenhum UPDATE.
// O iframe segue a MESMA regra do quiz: 'flow' na coluna, `settings.modo`
// 'iframe' e o tipo derivado na leitura — nenhuma migração pra existir.
// O LinkTridi (bio link, ver lib/tridiflow-linktridi.ts) idem.
export type TipoProjeto = "flow" | "quiz" | "page" | "iframe" | "linktridi";

export interface BotResumo {
  id: string; nome: string; slug: string; dominioId: string | null; dominioHost: string | null;
  status: "rascunho" | "publicado"; pasta: string | null; updatedAt: string; publishedAt: string | null;
  tipo: TipoProjeto;
  arquivado: boolean;
  /** Só para PÁGINAS: de qual template ela nasceu (vsl/captura/venda/obrigado/
   *  branco). Fluxo não tem — fica undefined e nada muda pra ele. */
  templatePagina?: string;
  /** Só para PÁGINAS: silhueta pra listagem reconhecer a página de relance.
   *  Ver lib/tridiflow-pagina-miniatura.ts. */
  miniatura?: Miniatura;
  /** Quem mexeu por último. `nome` só vem preenchido na listagem (a busca do
   *  nome é feita em lote lá); sem a migração ou sem perfil, fica undefined. */
  responsavel?: { id: string; nome: string };
  capa?: { corHeader: string; corFundo: string; corBolhaUser: string };   // cores do tema (capa do card)
  stats?: { sessoes: number; concluidas: number; leads: number };
}
export interface BotCompleto extends BotResumo { fluxo: Fluxo; theme: Theme; settings: BotSettings; pagina: PaginaDoc }
export interface Dominio { id: string; host: string; verificado: boolean }

type BotRow = {
  id: string; nome: string; slug: string; dominio_id: string | null; status: string; pasta: string | null;
  fluxo: unknown; theme: unknown; settings: unknown; published: unknown; published_at: string | null;
  updated_at: string; tipo?: string | null; pagina?: unknown; arquivado?: boolean | null; atualizado_por?: string | null;
  tridiflow_dominios?: { host: string } | { host: string }[] | null;
};
const hostDe = (r: BotRow) => { const d = Array.isArray(r.tridiflow_dominios) ? r.tridiflow_dominios[0] : r.tridiflow_dominios; return d?.host ?? null; };

/** Tipo real do projeto, com o quiz saindo de `settings.modo` (ver TipoProjeto).
 *  Vale também quando a migração de páginas não rodou: sem a coluna `tipo`,
 *  `r.tipo` é undefined e a linha ainda assim é classificada certo. */
export function tipoDe(r: { tipo?: string | null; settings?: unknown }): TipoProjeto {
  if (r.tipo === "page") return "page";
  const modo = (r.settings as Partial<BotSettings> | null | undefined)?.modo;
  return modo === "quiz" ? "quiz" : modo === "iframe" ? "iframe" : modo === "linktridi" ? "linktridi" : "flow";
}

/** O projeto é um LinkTridi? — a pergunta que a API faz antes de deixar
 *  escrever (o bio link tem chave própria, `tridiflow:linktridi`).
 *  Lê SÓ `tipo,settings` da linha e guarda 30s: o editor salva por auto-save a
 *  cada 800 ms, e uma ida ao banco por tecla digitada é exatamente o tipo de
 *  ritmo que já derrubou o projeto duas vezes. */
export function ehLinkTridi(id: string): Promise<boolean> {
  return cached(`tf-lt:${id}`, 30_000, async () => {
    const db = createSupabaseAdminClient();
    const eLT = (d: unknown) => !!d && tipoDe(d as { tipo?: string | null; settings?: unknown }) === "linktridi";
    const { data, error } = await db.from("tridiflow_bots").select("tipo,settings").eq("id", id).maybeSingle();
    if (!error) return eLT(data);
    // Sem a coluna `tipo` (migração de páginas pendente) quem responde é o
    // `settings.modo` — o mesmo caminho do `tipoDe`. Resposta estável: cabe no
    // cache. Devolver `false` aqui abriria o portão do LinkTridi.
    if (COLUNA_AUSENTE.has(error.code)) {
      const magro = await db.from("tridiflow_bots").select("settings").eq("id", id).maybeSingle();
      if (magro.error) throw magro.error;
      return eLT(magro.data);
    }
    // Falha passageira LANÇA: cacheada por 30 s, ela vira "não é LinkTridi" e
    // deixa passar quem não tem a chave `tridiflow:linktridi` (quem chama trata
    // a falha como "pode ser" e exige a chave — ver `barraLT`).
    throw error;
  });
}

/** O projeto é uma das páginas que moram no Marketing · Geral (LinkTridi ou
 *  Central de Tutoriais)? É o que deixa quem tem a área `marketing` mexer
 *  nele pela API do TridiFlow sem ganhar o resto do TridiFlow. Mesmo desenho
 *  do `ehLinkTridi`: lê só o necessário, guarda 30 s, e falha LANÇA (quem
 *  chama trata como "não sei" e cai na chave antiga). */
export function paginaDoMarketing(id: string): Promise<"linktridi" | "tutoriais" | null> {
  return cached(`tf-mkt:${id}`, 30_000, async () => {
    if (await ehLinkTridi(id)) return "linktridi";
    const db = createSupabaseAdminClient();
    const { data, error } = await db.from("tridiflow_bots").select("template:pagina->config->>template").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data as { template?: string | null } | null)?.template === "central_tutoriais" ? "tutoriais" : null;
  });
}

function resumo(r: BotRow): BotResumo {
  const tipo = tipoDe(r);
  const ehPagina = tipo === "page";
  // O template fica dentro do doc da página; ler aqui evita mandar o doc
  // inteiro pra listagem só pra saber o tipo.
  const tplPagina = ehPagina
    ? ((r.pagina as PaginaDoc | null)?.config?.template ?? undefined)
    : undefined;
  return {
    id: r.id, nome: r.nome, slug: r.slug, dominioId: r.dominio_id, dominioHost: hostDe(r),
    status: (r.status as "rascunho" | "publicado") ?? "rascunho", pasta: r.pasta,
    updatedAt: r.updated_at, publishedAt: r.published_at, tipo,
    arquivado: r.arquivado === true, templatePagina: tplPagina,
    // A silhueta sai do MESMO doc que já veio na linha — nenhuma leitura a mais.
    miniatura: ehPagina ? miniaturaDaPagina(normalizarPagina(r.pagina)) : undefined,
    // Só o id aqui; o nome é resolvido em lote em listBots (uma query pra tudo).
    responsavel: r.atualizado_por ? { id: r.atualizado_por, nome: "" } : undefined,
  };
}
function completo(r: BotRow): BotCompleto {
  return {
    ...resumo(r),
    fluxo: (r.fluxo as Fluxo) ?? FLUXO_VAZIO,
    theme: { ...THEME_PADRAO, ...((r.theme as Partial<Theme>) ?? {}) },
    settings: { ...SETTINGS_PADRAO, ...((r.settings as Partial<BotSettings>) ?? {}) },
    pagina: normalizarPagina(r.pagina),
  };
}

/** Embed do domínio do projeto, SEMPRE com o nome da chave estrangeira.
 *
 *  `tridiflow_dominios(host)` cru funcionou enquanto havia UM caminho entre as
 *  duas tabelas (`tridiflow_bots.dominio_id`). Rodar
 *  `supabase/tridiflow-dominio-raiz.sql` criou o segundo
 *  (`tridiflow_dominios.bot_id`, "o que abre na raiz deste endereço") e o
 *  PostgREST passou a reprovar a consulta INTEIRA com `PGRST201` (HTTP 300,
 *  "more than one relationship was found") — sem linha nenhuma, não sem o
 *  domínio. Em 17/09/2026 isso derrubou TODO funil publicado de uma vez: o
 *  `/api/f/bot` virava 404 e o gedux respondia "Este link não está disponível".
 *
 *  O nome explícito trava o caminho em `bots.dominio_id → dominios.id`, que é o
 *  sentido que interessa aqui ("qual endereço é deste projeto"), e continua
 *  devolvendo a chave `tridiflow_dominios` no resultado — nada muda pra quem lê.
 *  Vale pra qualquer embed novo entre as duas: relação nova não pode voltar a
 *  desligar os funis. Trava: `lib/__tests__/tridiflow-embed-dominio.test.ts`. */
export const EMBED_DOMINIO = "tridiflow_dominios!tridiflow_bots_dominio_id_fkey(host)";

// `tipo` e `pagina` só existem depois de rodar supabase/tridiflow-paginas.sql.
// Sem a migração, o select falharia inteiro e derrubaria o TridiFlow — por isso
// COLS é resolvido uma vez e cai pro conjunto antigo se as colunas não existirem.
const COLS_BASE = `id,nome,slug,dominio_id,status,pasta,fluxo,theme,settings,published,published_at,updated_at,${EMBED_DOMINIO}`;
const COLS_NOVO = `${COLS_BASE},tipo,pagina,arquivado,atualizado_por`;
let colsCache: string | null = null;

async function cols(db: ReturnType<typeof createSupabaseAdminClient>): Promise<string> {
  if (colsCache) return colsCache;
  const { error } = await db.from("tridiflow_bots").select("tipo").limit(1);
  colsCache = error ? COLS_BASE : COLS_NOVO;
  return colsCache;
}
/** Página ainda não migrada? Chame antes de gravar `pagina`/`tipo`. */
export async function paginasDisponiveis(): Promise<boolean> {
  return (await cols(createSupabaseAdminClient())) === COLS_NOVO;
}

/** Domínio que o projeto usa quando nenhum foi cadastrado. Mesmo valor que a
 *  listagem mostra no card — se divergir, o link do card e o link que o Tridify
 *  compara com o anúncio deixam de bater.
 *
 *  É o gedux (VPS dos chats), NUNCA o endereço do Gaius: funil no ar não pode
 *  depender da Vercel (cada visita era uma invocação) e o `next.config.ts`
 *  manda todo `/f/` aberto em *.vercel.app pro gedux. Trava:
 *  lib/__tests__/funil-mora-no-gedux.test.ts. */
export const DOMINIO_PADRAO = "gedux.com.br";

/** Endereço público do projeto: página mora em /p, todo o resto em /f. */
export function linkPublico(p: { tipo: TipoProjeto; slug: string; host?: string | null }): string {
  return `https://${p.host || DOMINIO_PADRAO}/${p.tipo === "page" ? "p" : "f"}/${p.slug}`;
}

export interface IdentidadeBot { id: string; nome: string; slug: string; tipo: TipoProjeto; host: string | null; url: string }

/** Nome/endereço de projetos por id. Existe pra quem só precisa rotular uma
 *  lista (números de venda, anúncio → funil) sem pagar o `listBots`, que traz
 *  fluxo, tema e o doc inteiro da página de cada projeto. */
export async function identidadeDosBots(ids: string[]): Promise<Map<string, IdentidadeBot>> {
  const saida = new Map<string, IdentidadeBot>();
  const alvo = [...new Set(ids.filter(Boolean))].slice(0, 300);
  if (!alvo.length) return saida;
  try {
    const db = createSupabaseAdminClient();
    const base = `id,nome,slug,settings,${EMBED_DOMINIO}`;
    const temTipo = colsCache ? colsCache === COLS_NOVO : !(await db.from("tridiflow_bots").select("tipo").limit(1)).error;
    const { data, error } = await db.from("tridiflow_bots")
      .select(temTipo ? `${base},tipo` : base).in("id", alvo).limit(300);
    if (error) return saida;
    type R = { id: string; nome: string | null; slug: string | null; tipo?: string | null; settings?: unknown; tridiflow_dominios?: { host: string }[] | { host: string } | null };
    for (const r of (data ?? []) as unknown as R[]) {
      const d = Array.isArray(r.tridiflow_dominios) ? r.tridiflow_dominios[0] : r.tridiflow_dominios;
      const tipo = tipoDe(r);
      const slug = r.slug ?? "";
      saida.set(r.id, { id: r.id, nome: r.nome || "Projeto", slug, tipo, host: d?.host ?? null, url: linkPublico({ tipo, slug, host: d?.host ?? null }) });
    }
  } catch { /* sem tabela: a tela mostra o id e segue */ }
  return saida;
}

export async function listBots(tipo?: TipoProjeto): Promise<BotResumo[]> {
  const db = createSupabaseAdminClient();
  let q = db.from("tridiflow_bots").select(await cols(db)).order("updated_at", { ascending: false });
  // O banco só sabe separar página de não-página: a coluna `tipo` não conhece
  // 'quiz' (ver TipoProjeto). Então quiz e fluxo pedem a MESMA fatia ao banco e
  // se separam aqui embaixo, sobre a lista que já veio — `settings` está no
  // select, então não há requisição a mais.
  if (tipo && colsCache === COLS_NOVO) q = q.eq("tipo", tipo === "page" ? "page" : "flow");
  const { data, error } = await q;
  if (error) lancar(error.message);
  let bots = ((data ?? []) as unknown as BotRow[]).map((r) => {
    const t = { ...THEME_PADRAO, ...((r.theme as Partial<Theme>) ?? {}) };
    const b = resumo(r);
    b.capa = { corHeader: t.corHeader, corFundo: t.corFundo, corBolhaUser: t.corBolhaUser };
    b.stats = { sessoes: 0, concluidas: 0, leads: 0 };
    return b;
  });
  // Separa quiz de fluxo ANTES das contagens: filtrar depois faria o banco
  // contar sessões de projeto que seria descartado na linha seguinte.
  if (tipo) bots = bots.filter((b) => b.tipo === tipo);
  // Nome de quem mexeu por último: UMA query pra todos os ids distintos. Se a
  // busca falhar (ou o perfil tiver sumido), o campo some e a listagem não
  // mostra responsável — nunca um id cru na tela.
  const ids = [...new Set(bots.map((b) => b.responsavel?.id).filter(Boolean) as string[])];
  if (ids.length) {
    try {
      const { data: perfis } = await db.from("profiles").select("id,name,username").in("id", ids);
      const nomes = new Map(((perfis ?? []) as { id: string; name: string | null; username: string }[])
        .map((p) => [p.id, p.name || p.username]));
      for (const b of bots) {
        const nome = b.responsavel && nomes.get(b.responsavel.id);
        b.responsavel = nome ? { id: b.responsavel!.id, nome } : undefined;
      }
    } catch { for (const b of bots) b.responsavel = undefined; }
  }
  // Stats por bot: CONTAGEM EXATA no banco (head:true = só o total, sem trazer
  // linha nenhuma). Antes isto lia as 5.000 sessões mais recentes de TODOS os
  // bots e contava na mão — passando disso, os cards começavam a mostrar um
  // número menor que o real (e bot antigo ia pra zero). O número do card é
  // "quantos starts esse bot teve", então tem que ser o total de verdade.
  // Cada contagem falha SOZINHA (0), nunca derruba as outras: o filtro de leads
  // é sobre jsonb e é o mais frágil — se ele der erro, "starts" continua certo.
  const contar = async (q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> => {
    try { const { count, error } = await q; return error ? 0 : (count ?? 0); } catch { return 0; }
  };
  try {
    await Promise.all(bots.map(async (b) => {
      const tab = () => db.from("tridiflow_sessoes").select("id", { count: "exact", head: true }).eq("bot_id", b.id);
      const [sessoes, concluidas, leads] = await Promise.all([
        contar(tab()),
        contar(tab().not("concluida_em", "is", null)),
        contar(tab().neq("respostas", "{}")),
      ]);
      b.stats = { sessoes, concluidas, leads };
    }));
  } catch { /* sem stats neste load */ }
  return bots;
}

export async function getBot(id: string): Promise<BotCompleto | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("tridiflow_bots").select(await cols(db)).eq("id", id).maybeSingle();
  if (error) lancar(error.message);
  return data ? completo(data as unknown as BotRow) : null;
}

// Slug único global (simples e previsível; conflito real é raro).
async function slugLivre(db: ReturnType<typeof createSupabaseAdminClient>, base: string): Promise<string> {
  const raiz = (base || "bot").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "bot";
  for (let i = 0; i < 50; i++) {
    const s = i === 0 ? raiz : `${raiz}-${i + 1}`;
    const { data } = await db.from("tridiflow_bots").select("id").eq("slug", s).limit(1);
    if (!data?.length) return s;
  }
  return `${raiz}-${Date.now().toString(36)}`;
}

export async function criarBot(nome: string, deFluxo?: Fluxo, opts?: { tipo?: TipoProjeto; pagina?: PaginaDoc; quiz?: Quiz; linktridi?: LinkTridiDoc; autor?: string | null }): Promise<BotCompleto> {
  const db = createSupabaseAdminClient();
  const slug = await slugLivre(db, nome);
  const tipo: TipoProjeto = opts?.tipo === "page" || opts?.tipo === "quiz" || opts?.tipo === "iframe" || opts?.tipo === "linktridi" ? opts.tipo : "flow";
  // Quiz, iframe e LinkTridi nascem como 'flow' na coluna (a constraint não
  // aceita outra coisa) e se declaram pelo `settings.modo` — o par que `tipoDe` lê.
  const settings: BotSettings = tipo === "quiz"
    ? { ...SETTINGS_PADRAO, modo: "quiz", quiz: opts?.quiz ?? QUIZ_PADRAO() }
    : tipo === "iframe"
      ? { ...SETTINGS_PADRAO, modo: "iframe" }
      : tipo === "linktridi"
        ? { ...SETTINGS_PADRAO, modo: "linktridi", linktridi: opts?.linktridi ?? LINKTRIDI_PADRAO() }
        : SETTINGS_PADRAO;
  const PADRAO_NOME: Record<TipoProjeto, string> = { page: "Nova página", quiz: "Novo quiz", iframe: "Novo iframe", linktridi: "Meu LinkTridi", flow: "Novo bot" };
  const novo = colsCache === COLS_NOVO || (await paginasDisponiveis());
  const { data, error } = await db.from("tridiflow_bots")
    .insert({
      nome: nome.trim() || PADRAO_NOME[tipo],
      slug, fluxo: deFluxo ?? FLUXO_VAZIO, theme: THEME_PADRAO, settings,
      // Só manda as colunas novas quando elas existem (tolerante à migração pendente).
      ...(novo ? { tipo: tipo === "page" ? "page" : "flow", pagina: opts?.pagina ?? PAGINA_VAZIA, atualizado_por: opts?.autor ?? null } : {}),
    })
    .select(await cols(db)).single();
  if (error) lancar(error.message);
  return completo(data as unknown as BotRow);
}

/** Endereço já usado por OUTRO projeto (fluxo ou página) no mesmo domínio? */
export async function caminhoOcupado(slug: string, dominioId: string | null, exceto?: string): Promise<boolean> {
  const db = createSupabaseAdminClient();
  let q = db.from("tridiflow_bots").select("id").eq("slug", slug).limit(2);
  q = dominioId ? q.eq("dominio_id", dominioId) : q.is("dominio_id", null);
  const { data } = await q;
  return (data ?? []).some((r: { id: string }) => r.id !== exceto);
}

export class CaminhoEmUso extends Error { constructor() { super("caminho_em_uso"); } }

/** O gatilho `tutoriais_dominio_travado` recusou mover a central de tutoriais
 *  de domínio (supabase/tutoriais_dominio_travado.sql). Aqui só vira mensagem:
 *  sem isto, quem chamasse a API genérica levaria um erro cru de Postgres. */
export class DominioTravado extends Error {
  constructor() { super("O endereço do site de tutoriais é fixo — o QR impresso e os links já divulgados apontam pra lá. A trava está no banco (supabase/tutoriais_dominio_travado.sql)."); }
}

export async function atualizarBot(id: string, patch: { nome?: string; slug?: string; dominioId?: string | null; pasta?: string | null; fluxo?: Fluxo; theme?: Theme; settings?: BotSettings; pagina?: PaginaDoc; arquivado?: boolean; autor?: string | null }): Promise<void> {
  const db = createSupabaseAdminClient();
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.nome !== undefined) upd.nome = patch.nome.trim();
  if (patch.slug !== undefined) upd.slug = patch.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (patch.dominioId !== undefined) upd.dominio_id = patch.dominioId;
  if (patch.pasta !== undefined) upd.pasta = patch.pasta;
  if (patch.fluxo !== undefined) upd.fluxo = patch.fluxo;
  if (patch.theme !== undefined) upd.theme = patch.theme;
  if (patch.settings !== undefined) upd.settings = patch.settings;
  if (patch.pagina !== undefined && (await paginasDisponiveis())) upd.pagina = patch.pagina;
  if (patch.arquivado !== undefined && (await paginasDisponiveis())) upd.arquivado = patch.arquivado;
  if (patch.autor !== undefined && (await paginasDisponiveis())) upd.atualizado_por = patch.autor;
  const { error } = await db.from("tridiflow_bots").update(upd).eq("id", id);
  // 23505 = unique_violation do índice de caminho. Sem tratar, o auto-save
  // mostraria um erro cru de Postgres; aqui vira mensagem que a tela entende.
  if (error) {
    if ((error as { code?: string }).code === "23505" || /duplicate key|caminho_uk/i.test(error.message)) throw new CaminhoEmUso();
    if (/dominio_travado/i.test(error.message)) throw new DominioTravado();
    lancar(error.message);
  }
  // O player lê a CONFIG do rascunho (pixels valem sem republicar).
  invalidarPublicados();
}

// Publicar = congelar o rascunho atual em `published`.
// Páginas entram no MESMO snapshot (chave `pagina`) — snapshots antigos de
// fluxo simplesmente não têm a chave, então nada quebra.
export async function publicarBot(id: string, autor?: string | null): Promise<void> {
  const db = createSupabaseAdminClient();
  const bot = await getBot(id);
  if (!bot) throw new Error("bot_nao_encontrado");
  // Publicar só faz sentido se o endereço estiver livre — o índice do banco
  // barraria de qualquer jeito, mas aqui o erro sai legível.
  if (await caminhoOcupado(bot.slug, bot.dominioId, id)) throw new CaminhoEmUso();
  const novo = await paginasDisponiveis();
  const { error } = await db.from("tridiflow_bots").update({
    status: "publicado",
    published: { fluxo: bot.fluxo, theme: bot.theme, settings: bot.settings, ...(novo ? { pagina: bot.pagina } : {}) },
    published_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...(novo ? { publicado_por: autor ?? null } : {}),
  }).eq("id", id);
  if (error) lancar(error.message);
  invalidarPublicados();
}

export async function despublicarBot(id: string): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("tridiflow_bots").update({ status: "rascunho", updated_at: new Date().toISOString() }).eq("id", id);
  if (error) lancar(error.message);
  invalidarPublicados();
}

export async function duplicarBot(id: string): Promise<BotCompleto | null> {
  const bot = await getBot(id);
  if (!bot) return null;
  const novo = await criarBot(`${bot.nome} (cópia)`, bot.fluxo, { tipo: bot.tipo, pagina: bot.pagina });
  await atualizarBot(novo.id, { theme: bot.theme, settings: bot.settings });
  return getBot(novo.id);
}

export async function removerBot(id: string): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("tridiflow_bots").delete().eq("id", id);
  if (error) lancar(error.message);
  invalidarPublicados();
}

// ── Domínios ─────────────────────────────────────────────────────────────────
export async function listDominios(): Promise<Dominio[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("tridiflow_dominios").select("id,host,verificado").order("host");
  if (error) { if (ausente(error.message)) return []; lancar(error.message); }
  return ((data ?? []) as { id: string; host: string; verificado: boolean }[]);
}
export async function addDominio(host: string): Promise<void> {
  const db = createSupabaseAdminClient();
  const limpo = host.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const { error } = await db.from("tridiflow_dominios").upsert({ host: limpo }, { onConflict: "host" });
  if (error) lancar(error.message);
}
export async function removeDominio(id: string): Promise<void> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("tridiflow_dominios").delete().eq("id", id);
  if (error) lancar(error.message);
}

// ── Player público ───────────────────────────────────────────────────────────
// Resolve o bot publicado por (host, slug). Host desconhecido/padrão → só slug.
export interface BotPublicado { id: string; nome: string; fluxo: Fluxo; theme: Theme; settings: BotSettings }
// Projeto publicado muda quando alguém publica — não a cada visita. Cada
// visita da bio do Instagram pagava uma ida ao Supabase (250–700 ms) só pra
// ler o mesmo snapshot, e a página ainda pedia DUAS vezes (corpo + metadata).
// 30 s de memória viram milhares de visitas numa leitura só; quem publica
// nesta instância limpa na hora (`invalidarPublicados`), nas outras vale o
// prazo. Pixel editado sem republicar também espera no máximo esses 30 s.
/** Hosts que existem em `tridiflow_dominios` — os endereços COM DONO.
 *
 *  Lista minúscula (unidades, não milhares) e que muda uma vez por mês, então
 *  5 min de cache. Sem o cache, isolar por domínio custaria uma ida ao banco em
 *  CADA visita de anúncio — o tipo de gasto que já pausou o projeto duas vezes.
 *
 *  Tabela ausente (migração pendente) devolve conjunto VAZIO de propósito: aí
 *  ninguém é "endereço com dono" e tudo volta ao comportamento antigo. Falhar
 *  para o lado aberto é a escolha certa aqui — o outro lado derrubaria toda
 *  landing no ar por causa de uma migração atrasada. */
async function hostsCadastrados(): Promise<Set<string>> {
  return cached("tf-dominios:hosts", 300_000, async () => {
    try {
      const db = createSupabaseAdminClient();
      const { data, error } = await db.from("tridiflow_dominios").select("host").limit(200);
      if (error) return new Set<string>();
      const linhas = (data ?? []) as unknown as { host: string | null }[];
      return new Set(linhas.map((d) => String(d.host ?? "").toLowerCase()).filter(Boolean));
    } catch { return new Set<string>(); }
  });
}

/** O que abre na RAIZ (`/`) de um domínio próprio.
 *
 *  Um endereço que só serve tutorial, currículo e LinkTridi não tem vitrine pra
 *  mostrar em `/`. Sem resposta, a raiz caía no 404 do Gaius — com a marca do
 *  ERP na cara de quem nunca ouviu falar dele, num domínio que deveria parecer
 *  um site próprio.
 *
 *  Escolha explícita primeiro: `tridiflow_dominios.bot_id`, o irmão do
 *  `loja_id` que já existia pra "este domínio é uma vitrine". Sem escolha, se
 *  houver UMA publicação marcada pro domínio, é ela — o caso de todo domínio no
 *  começo, e é o que faz isto funcionar sem depender do SQL ter rodado. Duas ou
 *  mais sem escolha feita devolve null de propósito: adivinhar qual é a
 *  "principal" trocaria um 404 por uma página errada, que é pior. */
export function raizDoDominio(host: string | null): Promise<string | null> {
  const h = (host ?? "").toLowerCase();
  if (!h) return Promise.resolve(null);
  return cached(`tf-raiz:${h}`, 300_000, () => lerRaizDoDominio(h));
}

async function lerRaizDoDominio(h: string): Promise<string | null> {
  try {
    const db = createSupabaseAdminClient();
    // `bot_id` pode não existir ainda (SQL pendente). O PostgREST reprova a
    // consulta INTEIRA por uma coluna ausente, então o erro cai num select
    // magro em vez de derrubar a raiz do domínio.
    let dominioId = "";
    let botId = "";
    const comEscolha = await db.from("tridiflow_dominios").select("id,bot_id").eq("host", h).limit(1);
    if (comEscolha.error) {
      const magro = await db.from("tridiflow_dominios").select("id").eq("host", h).limit(1);
      if (magro.error) return null;
      dominioId = String((magro.data?.[0] as { id?: string } | undefined)?.id ?? "");
    } else {
      const linha = comEscolha.data?.[0] as { id?: string; bot_id?: string | null } | undefined;
      dominioId = String(linha?.id ?? "");
      botId = String(linha?.bot_id ?? "");
    }
    if (!dominioId) return null;

    const base = db.from("tridiflow_bots").select("slug,tipo").eq("status", "publicado");
    const { data, error } = botId ? await base.eq("id", botId).limit(1) : await base.eq("dominio_id", dominioId).limit(2);
    if (error) return null;
    const linhas = (data ?? []) as unknown as { slug: string | null; tipo: string | null }[];
    if (linhas.length !== 1) return null;   // 0 = nada publicado aqui; 2+ = escolha ambígua
    const { slug, tipo } = linhas[0];
    return slug ? `/${tipo === "page" ? "p" : "f"}/${slug}` : null;
  } catch { return null; }
}

/** Qual das publicações com este slug responde NESTE endereço.
 *
 *  Antes daqui havia um último recurso — `?? rows[0]` — que entregava a página
 *  pelo slug quando nada casava. Ele existia pra prévia e dev não quebrarem,
 *  mas fazia todo endereço servir TODA publicação: o site público do espelho
 *  respondia por projeto publicado no gedux, e escolher o domínio na publicação
 *  virava enfeite (decidia o link divulgado, não a porta).
 *
 *  A regra agora depende de o host ter dono:
 *
 *  · **Host cadastrado** → só o que foi marcado pra ele. A exceção é o
 *    `DOMINIO_PADRAO`: projeto que não escolheu domínio é publicado LÁ por
 *    `linkPublico()`, então o gedux responde por ele — se não respondesse,
 *    todo funil antigo (sem domínio) sumiria de uma vez.
 *  · **Host sem dono** (o Gaius, um preview `*.vercel.app`, localhost) → nada
 *    a isolar, mantém o recurso antigo. É o que deixa a prévia do editor e o
 *    `npm run dev` continuarem abrindo qualquer projeto. */
async function publicacaoDoHost<T>(rows: T[], host: string | null, hostDe: (r: T) => string): Promise<T | null> {
  const h = (host ?? "").toLowerCase();
  const casa = rows.find((r) => hostDe(r) !== "" && hostDe(r) === h);
  if (casa) return casa;
  const semDominio = rows.find((r) => hostDe(r) === "") ?? null;
  if ((await hostsCadastrados()).has(h)) return h === DOMINIO_PADRAO ? semDominio : null;
  return semDominio ?? rows[0] ?? null;
}

export function getBotPublicado(host: string | null, slug: string): Promise<BotPublicado | null> {
  return cached(`bot-pub:${(host || "").toLowerCase()}:${slug}`, 30_000, () => lerBotPublicado(host, slug));
}
const invalidarPublicados = () => invalidate("bot-pub:");

async function lerBotPublicado(host: string | null, slug: string): Promise<BotPublicado | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("tridiflow_bots")
    .select(`id,nome,slug,status,published,settings,${EMBED_DOMINIO}`)
    .eq("slug", slug).eq("status", "publicado").limit(10);
  if (error) { if (ausente(error.message)) return null; lancar(error.message); }
  type Row = { id: string; nome: string; published: unknown; settings: unknown; tridiflow_dominios: { host: string } | { host: string }[] | null };
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return null;
  const h = (host || "").toLowerCase();
  const hostRow = (r: Row) => { const d = Array.isArray(r.tridiflow_dominios) ? r.tridiflow_dominios[0] : r.tridiflow_dominios; return (d?.host ?? "").toLowerCase(); };
  // Prioriza o bot cujo domínio casa com o host; endereço com dono não serve o
  // que não foi marcado pra ele (ver `publicacaoDoHost`).
  const r = await publicacaoDoHost(rows, h, hostRow);
  if (!r) return null;
  const pub = r.published as { fluxo?: Fluxo; theme?: Theme; settings?: BotSettings } | null;
  if (!pub?.fluxo) return null;
  // CONFIG (pixels, webhook, conversões, gaiaLeads) vem do DRAFT, não do snapshot
  // publicado: é config que a pessoa "cola uma vez" e espera valer NA HORA, sem
  // republicar. Antes lia só do `published`, então pixel editado após publicar
  // NUNCA disparava no bot ao vivo (o bug "nada funciona"). O CONTEÚDO (fluxo/
  // tema) continua vindo do publicado — a versão estável no ar.
  const draft = r.settings as BotSettings | null;
  const settings: BotSettings = { ...SETTINGS_PADRAO, ...(draft ?? pub.settings ?? {}) };
  // SEGURANÇA: o player é público — os segredos server-side (token da CAPI)
  // nunca saem daqui; só os IDs públicos dos pixels.
  settings.pixels = pixelsPublicos(settings.pixels);
  return { id: r.id, nome: r.nome, fluxo: pub.fluxo, theme: { ...THEME_PADRAO, ...(pub.theme ?? {}) }, settings };
}

// ── Página publicada ─────────────────────────────────────────────────────────
// Mesma regra do bot: desempate por host, conteúdo do snapshot, config do
// rascunho (pixels editados valem sem republicar), segredos removidos.
export interface PaginaPublicada { id: string; nome: string; pagina: PaginaDoc; settings: BotSettings }

export async function getPaginaPublicada(host: string | null, slug: string): Promise<PaginaPublicada | null> {
  const db = createSupabaseAdminClient();
  if (!(await paginasDisponiveis())) return null;   // migração pendente → 404 limpo
  const { data, error } = await db.from("tridiflow_bots")
    .select(`id,nome,slug,status,tipo,published,settings,${EMBED_DOMINIO}`)
    .eq("slug", slug).eq("status", "publicado").eq("tipo", "page").limit(10);
  if (error) { if (ausente(error.message)) return null; lancar(error.message); }
  type Row = { id: string; nome: string; published: unknown; settings: unknown; tridiflow_dominios: { host: string } | { host: string }[] | null };
  const rows = (data ?? []) as unknown as Row[];
  if (rows.length === 0) return null;
  const h = (host || "").toLowerCase();
  const hostRow = (r: Row) => { const d = Array.isArray(r.tridiflow_dominios) ? r.tridiflow_dominios[0] : r.tridiflow_dominios; return (d?.host ?? "").toLowerCase(); };
  const r = await publicacaoDoHost(rows, h, hostRow);
  if (!r) return null;
  const pub = r.published as { pagina?: unknown } | null;
  if (!pub?.pagina) return null;
  const draft = r.settings as BotSettings | null;
  const settings: BotSettings = { ...SETTINGS_PADRAO, ...(draft ?? {}) };
  settings.pixels = pixelsPublicos(settings.pixels);   // segredos NUNCA vão pro browser
  return { id: r.id, nome: r.nome, pagina: normalizarPagina(pub.pagina), settings };
}

// Config COMPLETA de pixels do bot publicado (inclui segredos) — só uso server
// (rota /api/f/evento → Meta CAPI). Nunca mandar isto pro client.
export async function getPixelsServer(botId: string): Promise<PixelsConfig | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("tridiflow_bots").select("published,settings").eq("id", botId).maybeSingle();
  if (error || !data) return null;
  // Draft primeiro: token/dataset novos valem sem republicar (mesma regra do player).
  const draft = (data as { settings: BotSettings | null }).settings;
  const pub = (data as { published: { settings?: BotSettings } | null }).published;
  return draft?.pixels ?? pub?.settings?.pixels ?? null;
}

// Destino GLOBAL dos leads. Enquanto a distribuição está centralizada, TODO lead
// do TridiFlow (fluxo E página) também vai pra esta URL, valha o que valer no
// projeto — é o "por enquanto manda tudo pra cá". Trocar ou desligar (string
// vazia) é por env, sem tocar em código nem republicar bot.
// A porta é a MESMA que o Typebot já usa: `/leads_typebot`, com `type: typebot`
// no cabeçalho. Ir direto na `/webhook-rede-social-novo` funciona, mas entra
// por baixo — sem passar pelo `type`, que é o que identifica a origem do lead
// lá dentro. Um caminho só pra todo mundo é mais fácil de manter que dois.
const WEBHOOK_GLOBAL = (process.env.TRIDIFLOW_WEBHOOK_GLOBAL
  ?? "https://irdptdvkldrghevmtmzc.supabase.co/functions/v1/leads_typebot").trim();
// A function exige `Authorization: Bearer <chave>`. O destino é o projeto
// LEGACY (irdptdvkldrghevmtmzc), cuja chave o app já carrega — então funciona
// sem env nova. A env só existe pra apontar o global pra outro lugar.
const WEBHOOK_GLOBAL_TOKEN = (process.env.TRIDIFLOW_WEBHOOK_GLOBAL_TOKEN
  || process.env.LEGACY_SERVICE_ROLE_KEY || "").trim();
// Cabeçalhos extras (fora o Bearer) — este destino não pede nenhum. Fica como
// env em JSON pra trocar sem deploy se a function passar a exigir algo.
const WEBHOOK_GLOBAL_HEADERS: Record<string, string> = (() => {
  try {
    const cru = JSON.parse(process.env.TRIDIFLOW_WEBHOOK_GLOBAL_HEADERS || "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(cru).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  } catch { return {}; }   // env malformada não pode derrubar o envio do lead
})();
// `origem` do lead na distribuição (o "de onde veio"). Configurável porque é
// rótulo de negócio, não contrato técnico.
const WEBHOOK_GLOBAL_ORIGEM = (process.env.TRIDIFLOW_WEBHOOK_GLOBAL_ORIGEM || "typebot").trim();

// A distribuição tem DUAS portas, e cada uma fala uma língua:
//
//  /leads_typebot            cabeçalhos `type` (bio_instagram|typebot) e
//                            `produto`; corpo { Phone, Name }. Ela só traduz e
//                            repassa pra porta de baixo.
//  /webhook-rede-social-novo Bearer; corpo { customer_name, customer_phone,
//                            origem, produto }.
//
// Mandar o payload plano do TridiFlow em qualquer uma das duas dá 400 — foi o
// "Invalid or missing 'type' header" que apareceu ao testar a URL antiga.
const ehPortaTypebot = (url: string) => /\/functions\/v1\/leads_typebot\/?$/.test(url.trim());
// A porta antiga só aceita estes três produtos; qualquer outra coisa ela
// descarta (produto = null), então não adianta inventar rótulo.
const PRODUTOS = ["Chancela + Carimbo", "Chancela", "Carimbo"] as const;

/** Produto do lead a partir do nome do funil ("Chancela Vega Pixel…" →
 *  "Chancela"). É o único sinal que existe hoje: não há campo de produto no
 *  bot, e o nome do funil já diz o que ele vende. */
export function produtoDoFunil(nome: string | null | undefined): string | null {
  const n = (nome ?? "").toLowerCase();
  const chancela = n.includes("chancela");
  const carimbo = n.includes("carimbo");
  if (chancela && carimbo) return "Chancela + Carimbo";
  if (chancela) return "Chancela";
  if (carimbo) return "Carimbo";
  return null;
}

/** Destino global em vigor (null = desligado) — usado pela tela de Webhooks pra
 *  não mentir dizendo "sem destino" quando todo lead está indo pra algum lugar. */
export function webhookGlobalLeads(): string | null { return WEBHOOK_GLOBAL || null; }

// ── Formato do destino global ────────────────────────────────────────────────
// A distribuição não aceita o payload plano do TridiFlow: o corpo é OUTRO,
// com quatro chaves próprias — customer_name, customer_phone, origem, produto
// (`customer_phone` é a única obrigatória; sem ela responde 400).
// As variáveis do funil têm nome livre (telefone, whatsapp, celular…), então o
// telefone é procurado por nome e, se não achar, pelo formato do valor.
const CHAVE_TELEFONE = /^(telefone|phone|whatsapp|whats|celular|cel|tel|fone|n[uú]mero)$/i;
const CHAVE_NOME     = /^(nome|name|primeiro[_-]?nome|nome[_-]?completo)$/i;
const CHAVE_EMAIL    = /^(e[-_]?mail)$/i;
const soDigitos = (v: string) => v.replace(/\D/g, "");

/** Acha o telefone entre as respostas do lead. `preferida` é a variável que a
 *  pessoa já mapeou em "Enviar pro Comercial" — quando existe, ela manda. */
export function acharTelefone(respostas: Record<string, string>, preferida?: string | null): string | null {
  if (preferida && respostas[preferida]) return respostas[preferida];
  for (const [k, v] of Object.entries(respostas)) if (CHAVE_TELEFONE.test(k) && v) return v;
  // Último recurso: valor com cara de telefone (10 a 13 dígitos, com DDD).
  for (const v of Object.values(respostas)) {
    const d = soDigitos(v || "");
    if (d.length >= 10 && d.length <= 13) return v;
  }
  return null;
}
function acharPor(respostas: Record<string, string>, re: RegExp): string | null {
  for (const [k, v] of Object.entries(respostas)) if (re.test(k) && v) return v;
  return null;
}

/** Corpo que cada destino recebe. Webhook do bot continua com o payload plano
 *  de sempre (contrato público, documentado na tela); cada porta da distribuição
 *  recebe o corpo DELA — só as chaves que ela lê, sem o resto junto. */
export function corpoDoDestino(url: string, plano: Record<string, unknown>, respostas: Record<string, string>, varTelefone?: string | null): Record<string, unknown> {
  const u = url.trim();
  const nome = acharPor(respostas, CHAVE_NOME);
  const telefone = acharTelefone(respostas, varTelefone);
  // Porta antiga: só Phone e Name. Ela mesma tira o +55 e põe "Cliente sem nome".
  if (ehPortaTypebot(u)) return { Phone: telefone ?? "", ...(nome ? { Name: nome } : {}) };
  if (u !== WEBHOOK_GLOBAL) return plano;
  return {
    customer_name: nome ?? "",
    customer_phone: telefone ?? "",
    origem: WEBHOOK_GLOBAL_ORIGEM,
    produto: produtoDoFunil(typeof plano.bot === "string" ? plano.bot : null),
  };
}

/** Cabeçalhos que só as portas da distribuição recebem (Bearer numa, `type` e
 *  `produto` na outra). O botão "Enviar teste" usa os mesmos — testar sem eles
 *  daria 400 e mentiria sobre o que acontece com o lead de verdade. */
export function cabecalhosDoDestino(url: string, ctx?: { produto?: string | null }): Record<string, string> {
  const u = url.trim();
  // Porta antiga: `type` decide o caminho lá dentro e `produto` só vale se for
  // um dos três aceitos — qualquer outro texto ela ignora (produto = null).
  if (ehPortaTypebot(u)) {
    const p = ctx?.produto;
    return {
      type: WEBHOOK_GLOBAL_ORIGEM === "bio_instagram" ? "bio_instagram" : "typebot",
      ...(p && (PRODUTOS as readonly string[]).includes(p) ? { produto: p } : {}),
    };
  }
  if (u !== WEBHOOK_GLOBAL) return {};                    // webhook de terceiro nunca vê a chave
  return {
    ...WEBHOOK_GLOBAL_HEADERS,
    ...(WEBHOOK_GLOBAL_TOKEN ? { Authorization: `Bearer ${WEBHOOK_GLOBAL_TOKEN}`, apikey: WEBHOOK_GLOBAL_TOKEN } : {}),
  };
}

// URL de destino dos leads (Sheets/n8n/Zapier/CRM) configurada no bot publicado.
export async function webhookDoBot(botId: string): Promise<string | null> {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("tridiflow_bots").select("published,settings").eq("id", botId).maybeSingle();
  if (!data) return null;
  const draft = (data as { settings: BotSettings | null }).settings;
  const pub = (data as { published: { settings?: BotSettings } | null }).published;
  return draft?.leadWebhook || pub?.settings?.leadWebhook || null;
}

// Payload de AMOSTRA (mesma forma do envio real) — usado no botão "Enviar teste".
// Com a URL, sai no formato exato daquele destino: testar o global com o corpo
// plano dava 400 e parecia que "o input não envia".
export function payloadExemploWebhook(url?: string): Record<string, unknown> {
  // Qualquer porta da distribuição: o teste vira lead de verdade na fila de um
  // vendedor — então ele se anuncia como teste e leva um número impossível,
  // não o (11) 91234-5678 de vitrine que alguém tentaria ligar.
  const distribuicao = !!url && (url.trim() === WEBHOOK_GLOBAL || ehPortaTypebot(url));
  const respostas: Record<string, string> = distribuicao
    ? { nome: "TESTE TridiFlow (ignorar)", email: "teste@tridiflow.local", telefone: "0000000000" }
    : { nome: "João da Silva", email: "joao@email.com", telefone: "(11) 91234-5678" };
  const plano: Record<string, unknown> = {
    evento: "teste",
    bot: "Teste TridiFlow",
    bot_id: "00000000-teste",
    sessao_id: "teste-" + Math.random().toString(36).slice(2, 10),
    quando: new Date().toISOString(),
    ...respostas,
    utm_source: "instagram",
    utm_medium: "cpc",
    utm_campaign: "promo-julho",
  };
  return url ? corpoDoDestino(url, plano, respostas, null) : plano;
}

// ── Diário de entrega ────────────────────────────────────────────────────────
// O envio do lead é best-effort de propósito (o visitante não pode ver erro de
// integração), então SEM registro "não chegou" e "nem foi enviado" são a mesma
// tela em branco. Uma linha por tentativa — inclusive a tentativa que não
// existiu, quando não havia destino. Ver supabase/tridiflow-entregas.sql.
export interface EntregaWebhook {
  id: number; botId: string | null; botNome: string; sessaoId: string | null;
  escopo: "global" | "bot" | "nenhum"; destino: string;
  ok: boolean; status: number | null; erro: string | null; resposta: string | null;
  ms: number | null; tentativas: number; criadoEm: string;
}
type EntregaNova = Omit<EntregaWebhook, "id" | "botNome" | "criadoEm">;

async function registrarEntrega(e: EntregaNova): Promise<void> {
  try {
    await createSupabaseAdminClient().from("tridiflow_entregas").insert({
      bot_id: e.botId, sessao_id: e.sessaoId, escopo: e.escopo,
      destino: e.destino.slice(0, 500), ok: e.ok, status: e.status,
      erro: e.erro?.slice(0, 300) ?? null, resposta: e.resposta?.slice(0, 300) ?? null,
      ms: e.ms, tentativas: e.tentativas,
    });
  } catch { /* tabela ausente ou banco fora: diário não pode derrubar o lead */ }
}

/** Últimas tentativas de entrega. Manual (botão Atualizar), com limite — não é
 *  poll. `null` = a tabela ainda não existe (SQL pendente), que a tela precisa
 *  distinguir de "nenhum envio ainda". */
export async function entregasRecentes(limite = 60, soFalhas = false): Promise<EntregaWebhook[] | null> {
  const db = createSupabaseAdminClient();
  let q = db.from("tridiflow_entregas")
    .select("id,bot_id,sessao_id,escopo,destino,ok,status,erro,resposta,ms,tentativas,criado_em")
    .order("criado_em", { ascending: false }).limit(Math.min(limite, 200));
  if (soFalhas) q = q.eq("ok", false);
  const { data, error } = await q;
  if (error) return ausente(error.message) ? null : [];
  type Row = { id: number; bot_id: string | null; sessao_id: string | null; escopo: string; destino: string; ok: boolean; status: number | null; erro: string | null; resposta: string | null; ms: number | null; tentativas: number; criado_em: string };
  const rows = (data ?? []) as Row[];
  const ids = [...new Set(rows.map((r) => r.bot_id).filter((x): x is string => !!x))];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data: bots } = await db.from("tridiflow_bots").select("id,nome").in("id", ids);
    for (const b of (bots ?? []) as { id: string; nome: string }[]) nomes.set(b.id, b.nome);
  }
  return rows.map((r) => ({
    id: r.id, botId: r.bot_id, botNome: (r.bot_id && nomes.get(r.bot_id)) || "—", sessaoId: r.sessao_id,
    escopo: (r.escopo === "global" || r.escopo === "nenhum" ? r.escopo : "bot"),
    destino: r.destino, ok: r.ok, status: r.status, erro: r.erro, resposta: r.resposta,
    ms: r.ms, tentativas: r.tentativas, criadoEm: r.criado_em,
  }));
}

/** Já mandamos o lead desta sessão? `null` = a coluna ainda não existe no banco
 *  (SQL pendente), que é diferente de "ainda não mandei". */
async function leadJaEnviado(sessaoId: string): Promise<string | null | undefined> {
  const { data, error } = await createSupabaseAdminClient()
    .from("tridiflow_sessoes").select("lead_enviado_em").eq("id", sessaoId).maybeSingle();
  if (error) return null;                                  // coluna/tabela ausente
  return (data as { lead_enviado_em: string | null } | null)?.lead_enviado_em ?? undefined;
}

// Envia o lead pros destinos. Dispara na conclusão do funil E — com
// `{ parcial: true }` — assim que o telefone é respondido, sem esperar a pessoa
// terminar. Quem abandona no meio é a maioria; o número dela vale igual.
// Best-effort com timeout curto + 1 retry (erro de rede ou 5xx do destino).
export async function enviarLeadWebhook(sessaoId: string, opts?: { parcial?: boolean }): Promise<void> {
  const db = createSupabaseAdminClient();
  // Uma sessão manda UM lead. Sem esta trava o envio parcial repetiria a cada
  // resposta seguinte do funil (o mesmo lead N vezes na fila do vendedor).
  const enviadoEm = await leadJaEnviado(sessaoId);
  if (enviadoEm) return;                                   // já foi
  if (enviadoEm === null && opts?.parcial) return;         // sem a trava no banco, parcial não roda
  const { data } = await db.from("tridiflow_sessoes").select("bot_id,respostas,utm,iniciada_em").eq("id", sessaoId).maybeSingle();
  if (!data) return;
  const s = data as { bot_id: string; respostas: Record<string, string>; utm: Record<string, string>; iniciada_em: string };
  const doBot = await webhookDoBot(s.bot_id);
  // Global primeiro, e sem duplicar quando o projeto aponta pro mesmo lugar.
  const destinos = [WEBHOOK_GLOBAL, doBot].filter((u): u is string => !!u)
    .filter((u, i, arr) => arr.indexOf(u) === i);
  if (destinos.length === 0) {
    // "Não enviei" também é resposta — sem esta linha o diário fica vazio e
    // parece que o lead nem existiu.
    await registrarEntrega({ botId: s.bot_id, sessaoId, escopo: "nenhum", destino: "-", ok: false,
      status: null, erro: "sem destino configurado", resposta: null, ms: null, tentativas: 0 });
    return;
  }
  const bot = await db.from("tridiflow_bots").select("nome,settings,published").eq("id", s.bot_id).maybeSingle();
  const linha = bot.data as { nome?: string; settings: BotSettings | null; published: { settings?: BotSettings } | null } | null;
  // A variável do telefone já mapeada em "Enviar pro Comercial" é a fonte mais
  // confiável — evita adivinhar entre as respostas quando a pessoa já disse.
  const varTelefone = (linha?.settings ?? linha?.published?.settings)?.gaiaLeads?.varTelefone ?? null;
  // Tags de segmentação do funil de quiz (`perfil_iniciante`, `alta_renda`…).
  // Elas viajam dentro de `respostas`, numa chave reservada — nada de coluna
  // nova, então nenhum SQL precisa ser rodado pra isso funcionar. Aqui viram
  // ARRAY: CRM lê `tags[]`, e a string separada por vírgula continua no corpo
  // pra quem já mapeou o campo plano.
  const tags = String(s.respostas?.[CHAVE_TAGS] ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const plano: Record<string, unknown> = {
    evento: "lead",
    bot: linha?.nome ?? "",
    bot_id: s.bot_id,
    sessao_id: sessaoId,
    quando: s.iniciada_em,
    // Aditivo: quem já consome o webhook do bot continua lendo tudo igual, e
    // quem quiser separar "abandonou no meio" tem como.
    ...(opts?.parcial ? { parcial: true } : {}),
    ...s.respostas, ...s.utm,
    ...(tags.length ? { tags } : {}),
  };
  // Marca ANTES de sair: duas respostas em sequência disparam dois PATCH quase
  // juntos, e marcar só no fim mandaria o mesmo lead duas vezes.
  await marcarLeadEnviado(sessaoId);
  // Um destino fora do ar não pode impedir o outro de receber.
  await Promise.all(destinos.map(async (url) => {
    const escopo = url === WEBHOOK_GLOBAL ? "global" as const : "bot" as const;
    const r = await entregarEm(url, JSON.stringify(corpoDoDestino(url, plano, s.respostas ?? {}, varTelefone)),
      { produto: produtoDoFunil(linha?.nome) });
    await registrarEntrega({ botId: s.bot_id, sessaoId, escopo, destino: url, ...r });
    // Log também: quem tem acesso à Vercel enxerga sem abrir a tela.
    if (!r.ok) console.error(`[tridiflow] lead ${sessaoId} NÃO entregue em ${escopo} ${url} — ${r.status ? `HTTP ${r.status}: ${r.resposta ?? ""}` : r.erro}`);
  }));
}

async function marcarLeadEnviado(sessaoId: string): Promise<void> {
  try {
    await createSupabaseAdminClient().from("tridiflow_sessoes")
      .update({ lead_enviado_em: new Date().toISOString() }).eq("id", sessaoId);
  } catch { /* coluna ausente: só a trava se perde, o envio segue */ }
}

// HTTP 2xx não quer dizer aceito. A function de distribuição responde
//   201 { "dado": "{\"sucesso\":false,\"motivo\":\"lead_duplicado\"}" }
// — o veredito real vem DENTRO de uma string JSON, dois níveis abaixo. Sem
// abrir isso, um lead recusado ficava marcado "Entregue" no diário, que é
// pior do que não ter diário nenhum.
const MOTIVOS: Record<string, string> = {
  lead_duplicado: "lead duplicado — o destino já tinha este contato",
  sem_responsavel: "nenhum responsável disponível pra receber o lead",
};
export function interpretarResposta(corpo: string | null): { aceito: boolean | null; motivo: string | null } {
  if (!corpo) return { aceito: null, motivo: null };
  let j: unknown;
  try { j = JSON.parse(corpo); } catch { return { aceito: null, motivo: null }; }
  const obj = (x: unknown) => (x && typeof x === "object" ? x as Record<string, unknown> : null);
  let o = obj(j);
  if (o && obj(o.data)) o = obj(o.data);                       // { statusCode, data: {...} }
  if (o && typeof o.dado === "string") {                       // { dado: "<json>" }
    try { o = obj(JSON.parse(o.dado)) ?? o; } catch { /* dado não era JSON */ }
  }
  if (!o) return { aceito: null, motivo: null };
  const bruto = typeof o.motivo === "string" ? o.motivo : typeof o.error === "string" ? o.error : null;
  const motivo = bruto ? (MOTIVOS[bruto] ?? bruto) : null;
  const suc = typeof o.sucesso === "boolean" ? o.sucesso : typeof o.success === "boolean" ? o.success : null;
  if (suc !== null) return { aceito: suc, motivo: suc ? null : motivo };
  if (bruto) return { aceito: false, motivo };                 // { error: "..." } é recusa
  return { aceito: null, motivo: null };
}

/** Uma entrega: POST + 1 retry (rede ou 5xx) e o resultado em forma de dado —
 *  status, corpo, latência. É o que vira linha do diário e mensagem de log. */
export async function entregarEm(url: string, body: string, ctx?: { produto?: string | null }): Promise<{ ok: boolean; status: number | null; erro: string | null; resposta: string | null; ms: number | null; tentativas: number }> {
  const t0 = Date.now();
  const enviar = () => fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", "X-TridiFlow-Event": "lead", "User-Agent": "TridiFlow-Webhook/1.0",
      ...cabecalhosDoDestino(url, ctx),
    },
    body, signal: AbortSignal.timeout(5000),
  });
  const corpo = async (r: Response) => { try { return (await r.text()).slice(0, 300) || null; } catch { return null; } };
  let tentativas = 0, erro: string | null = null;
  for (let i = 0; i < 2; i++) {
    tentativas++;
    try {
      const r = await enviar();
      // 4xx é recusa com opinião (payload/cabeçalho errado): repetir não muda
      // nada e ainda esconde o motivo atrás de mais uma tentativa.
      if (r.ok || r.status < 500) {
        const c = await corpo(r);
        const { aceito, motivo } = interpretarResposta(c);
        // Aceito no corpo manda mais que o 2xx do transporte.
        return { ok: r.ok && aceito !== false, status: r.status, erro: aceito === false ? (motivo ?? "destino não aceitou o lead") : null, resposta: c, ms: Date.now() - t0, tentativas };
      }
      erro = null;
      if (i === 1) return { ok: false, status: r.status, erro: null, resposta: await corpo(r), ms: Date.now() - t0, tentativas };
    } catch (e) {
      const n = (e as Error)?.name === "TimeoutError" ? "tempo esgotado (5s)" : (e as Error)?.message || "falha de rede";
      erro = n;
    }
  }
  return { ok: false, status: null, erro: erro ?? "falha de rede", resposta: null, ms: Date.now() - t0, tentativas };
}

// Integração interna (Gaia): ao concluir, insere o lead no Comercial
// (comercial_leads) — cai na aba Leads. Telefone/nome vêm das variáveis que o
// usuário mapeou em settings.gaiaLeads. Best-effort, dedupe por telefone/dia.
export async function enviarLeadInterno(sessaoId: string): Promise<void> {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("tridiflow_sessoes").select("bot_id,respostas").eq("id", sessaoId).maybeSingle();
  if (!data) return;
  const s = data as { bot_id: string; respostas: Record<string, string> | null };
  const bot = await db.from("tridiflow_bots").select("nome,published,settings").eq("id", s.bot_id).maybeSingle();
  if (!bot.data) return;
  const row = bot.data as { nome?: string; published: { settings?: BotSettings } | null; settings: BotSettings | null };
  // Draft primeiro: ligar "Enviar pro Comercial" vale sem republicar (config, não conteúdo).
  const settings = row.settings ?? row.published?.settings;
  const cfg = settings?.gaiaLeads;
  if (!cfg?.ativo || !cfg.varTelefone) return;
  const respostas = s.respostas ?? {};
  const telefone = respostas[cfg.varTelefone];
  if (!telefone) return;
  const nome = cfg.varNome ? respostas[cfg.varNome] : null;
  await addLeadFunil({ telefone, nome, fonte: row.nome || "TridiFlow", payload: respostas }).catch(() => {});
}

// ── Analytics (F5): sessões, conclusão, drop-off por etapa, leads ────────────
export interface SessaoLead { id: string; iniciadaEm: string; concluidaEm: string | null; ultimaEtapa: string | null; utm: Record<string, string>; respostas: Record<string, string> }
export interface BotAnalytics {
  sessoes: number; concluidas: number; taxa: number;
  porEtapa: { etapa: string; abandonos: number }[];    // onde os NÃO-concluídos pararam
  leads: SessaoLead[];                                  // sessões com alguma resposta
}
export async function analyticsBot(botId: string): Promise<BotAnalytics> {
  const db = createSupabaseAdminClient();
  type Row = { id: string; iniciada_em: string; concluida_em: string | null; ultima_etapa: string | null; utm: Record<string, string>; respostas: Record<string, string> };
  const { linhas: rows, erro } = await paginado<Row>(
    (i, f) => db.from("tridiflow_sessoes")
      .select("id,iniciada_em,concluida_em,ultima_etapa,utm,respostas")
      .eq("bot_id", botId).order("iniciada_em", { ascending: false }).range(i, f),
    4000,
  );
  if (erro) { if (ausente(erro)) return { sessoes: 0, concluidas: 0, taxa: 0, porEtapa: [], leads: [] }; lancar(erro); }
  const concluidas = rows.filter((r) => r.concluida_em).length;
  const drop = new Map<string, number>();
  for (const r of rows) if (!r.concluida_em && r.ultima_etapa) drop.set(r.ultima_etapa, (drop.get(r.ultima_etapa) ?? 0) + 1);
  return {
    sessoes: rows.length, concluidas,
    taxa: rows.length ? Math.round((concluidas / rows.length) * 100) : 0,
    porEtapa: [...drop.entries()].map(([etapa, abandonos]) => ({ etapa, abandonos })).sort((a, b) => b.abandonos - a.abandonos),
    leads: rows.filter((r) => Object.keys(r.respostas ?? {}).length > 0).map((r) => ({
      id: r.id, iniciadaEm: r.iniciada_em, concluidaEm: r.concluida_em, ultimaEtapa: r.ultima_etapa, utm: r.utm ?? {}, respostas: r.respostas ?? {},
    })),
  };
}

// ── Usuários do workspace (Configurações › Usuários/Times) ───────────────────
// Reusa os perfis/colaboradores do ERP. O acesso ao módulo é gerido em
// Administração → Perfis; aqui só listamos quem faz parte da equipe.
export interface UsuarioWs { id: string; nome: string; username: string; role: string; setor: string | null; fotoUrl: string | null }
export async function usuariosTridiflow(): Promise<UsuarioWs[]> {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("profiles").select("id,name,username,role,employees(setor,photo_url)").eq("active", true).order("name", { ascending: true });
  type R = { id: string; name: string | null; username: string; role: string; employees: { setor: string | null; photo_url: string | null }[] | { setor: string | null; photo_url: string | null } | null };
  return ((data ?? []) as R[]).map((r) => {
    const emp = Array.isArray(r.employees) ? r.employees[0] : r.employees;
    return { id: r.id, nome: r.name || r.username, username: r.username, role: r.role, setor: emp?.setor ?? null, fotoUrl: emp?.photo_url ?? null };
  });
}

// ── Analytics geral (tela Analytics): todos os bots agregados ────────────────
export interface AnalyticsGeral {
  sessoes: number; concluidas: number; leads: number; taxa: number;
  serie: { data: string; sessoes: number; leads: number }[];       // últimos 14 dias
  porBot: { botId: string; nome: string; sessoes: number; leads: number; taxa: number }[];
  utm: { source: string; sessoes: number; leads: number }[];
}
export async function analyticsGeral(dias = 14): Promise<AnalyticsGeral> {
  const db = createSupabaseAdminClient();
  const janela = Math.max(1, Math.min(90, dias));
  const desde = new Date(Date.now() - janela * 864e5).toISOString();
  // Só `utm_source`, nunca o `utm` inteiro: o jsonb carrega o `fbclid`, que
  // sozinho tem ~200 caracteres e respondia pela maior parte do peso da linha.
  // Com a paginação lendo a janela toda (e não as últimas 1000), levar o jsonb
  // junto multiplicaria por cinco um egress que já é o maior desta tela.
  type Row = { bot_id: string; iniciada_em: string; concluida_em: string | null; src: string | null; respostas: Record<string, string> | null };
  const { linhas: rows, erro } = await paginado<Row>(
    (i, f) => db.from("tridiflow_sessoes")
      .select("bot_id,iniciada_em,concluida_em,respostas,src:utm->>utm_source")
      .gte("iniciada_em", desde).order("iniciada_em", { ascending: false }).range(i, f),
    16000,
  );
  if (erro) { if (ausente(erro)) return { sessoes: 0, concluidas: 0, leads: 0, taxa: 0, serie: [], porBot: [], utm: [] }; lancar(erro); }
  const temLead = (r: Row) => !!r.respostas && Object.keys(r.respostas).length > 0;
  const concluidas = rows.filter((r) => r.concluida_em).length;
  const leads = rows.filter(temLead).length;

  const dia = (iso: string) => iso.slice(0, 10);
  const serieMap = new Map<string, { sessoes: number; leads: number }>();
  for (let i = janela - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); serieMap.set(d, { sessoes: 0, leads: 0 }); }
  for (const r of rows) { const k = dia(r.iniciada_em); const s = serieMap.get(k); if (s) { s.sessoes++; if (temLead(r)) s.leads++; } }

  const bots = new Map<string, { sessoes: number; leads: number; concl: number }>();
  for (const r of rows) { const b = bots.get(r.bot_id) ?? { sessoes: 0, leads: 0, concl: 0 }; b.sessoes++; if (temLead(r)) b.leads++; if (r.concluida_em) b.concl++; bots.set(r.bot_id, b); }
  const ids = [...bots.keys()];
  const nomes = new Map<string, string>();
  if (ids.length) { const { data: bs } = await db.from("tridiflow_bots").select("id,nome").in("id", ids); for (const b of (bs ?? []) as { id: string; nome: string }[]) nomes.set(b.id, b.nome); }

  const utmMap = new Map<string, { sessoes: number; leads: number }>();
  for (const r of rows) { const src = (r.src || "direto").toLowerCase(); const u = utmMap.get(src) ?? { sessoes: 0, leads: 0 }; u.sessoes++; if (temLead(r)) u.leads++; utmMap.set(src, u); }

  return {
    sessoes: rows.length, concluidas, leads, taxa: rows.length ? Math.round((concluidas / rows.length) * 100) : 0,
    serie: [...serieMap.entries()].map(([data, v]) => ({ data, ...v })),
    porBot: [...bots.entries()].map(([botId, v]) => ({ botId, nome: nomes.get(botId) ?? "Bot", sessoes: v.sessoes, leads: v.leads, taxa: v.sessoes ? Math.round((v.concl / v.sessoes) * 100) : 0 })).sort((a, b) => b.sessoes - a.sessoes),
    utm: [...utmMap.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.sessoes - a.sessoes).slice(0, 8),
  };
}

// ── Leads de TODOS os bots (tela Contatos) ───────────────────────────────────
export interface LeadGeral {
  id: string; botId: string; botNome: string; iniciadaEm: string; concluidaEm: string | null;
  ultimaEtapa: string | null; utm: Record<string, string>; respostas: Record<string, string>;
  /** Trabalho feito no lead. `null` em tudo quando a migração de CRM não rodou
   *  — a tela esconde os controles nesse caso (ver leadsCrmDisponivel). */
  estagio: string | null; nota: string | null; trabalhadoEm: string | null;
}
// As colunas de trabalho do lead (estágio, anotação) só existem depois de rodar
// supabase/tridiflow-leads-crm.sql. Sem a migração o select falharia INTEIRO e
// a tela de Contatos ficaria vazia — por isso o conjunto é resolvido uma vez e
// cai pro antigo quando as colunas não estão lá. Mesmo padrão do `cols()` das
// páginas, e pela mesma razão.
const COLS_LEAD_BASE = "id,bot_id,iniciada_em,concluida_em,ultima_etapa,utm,respostas";
const COLS_LEAD_CRM = `${COLS_LEAD_BASE},estagio,nota,trabalhado_em`;
let colsLeadCache: string | null = null;

async function colsLead(db: ReturnType<typeof createSupabaseAdminClient>): Promise<string> {
  if (colsLeadCache) return colsLeadCache;
  const { error } = await db.from("tridiflow_sessoes").select("estagio").limit(1);
  colsLeadCache = error ? COLS_LEAD_BASE : COLS_LEAD_CRM;
  return colsLeadCache;
}

/** A gestão de leads está ligada neste banco? A tela usa pra esconder os
 *  controles de estágio em vez de oferecer um botão que não grava nada. */
export async function leadsCrmDisponivel(): Promise<boolean> {
  try { return (await colsLead(createSupabaseAdminClient())) === COLS_LEAD_CRM; } catch { return false; }
}

export async function leadsGerais(limit = 800): Promise<LeadGeral[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("tridiflow_sessoes")
    .select(await colsLead(db))
    .order("iniciada_em", { ascending: false }).limit(limit);
  if (error) { if (ausente(error.message)) return []; lancar(error.message); }
  type Row = { id: string; bot_id: string; iniciada_em: string; concluida_em: string | null; ultima_etapa: string | null; utm: Record<string, string> | null; respostas: Record<string, string> | null; estagio?: string | null; nota?: string | null; trabalhado_em?: string | null };
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.respostas && Object.keys(r.respostas).length > 0);
  const ids = [...new Set(rows.map((r) => r.bot_id))];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data: bots } = await db.from("tridiflow_bots").select("id,nome").in("id", ids);
    for (const b of (bots ?? []) as { id: string; nome: string }[]) nomes.set(b.id, b.nome);
  }
  return rows.map((r) => ({
    id: r.id, botId: r.bot_id, botNome: nomes.get(r.bot_id) ?? "Bot",
    iniciadaEm: r.iniciada_em, concluidaEm: r.concluida_em, ultimaEtapa: r.ultima_etapa,
    utm: r.utm ?? {}, respostas: r.respostas ?? {},
    estagio: r.estagio ?? null, nota: r.nota ?? null, trabalhadoEm: r.trabalhado_em ?? null,
  }));
}

/** Grava o trabalho feito no lead (estágio, anotação).
 *
 *  Sem a migração, devolve `false` em vez de estourar: a tela mostra "rode o
 *  SQL" e o resto de Contatos continua funcionando. Nunca lança — uma anotação
 *  que falha não pode derrubar a listagem inteira. */
export async function atualizarLead(
  id: string,
  patch: { estagio?: string | null; nota?: string | null; autor?: string | null },
): Promise<boolean> {
  const db = createSupabaseAdminClient();
  if ((await colsLead(db)) !== COLS_LEAD_CRM) return false;
  const upd: Record<string, unknown> = { trabalhado_em: new Date().toISOString() };
  if (patch.estagio !== undefined) upd.estagio = patch.estagio;
  if (patch.nota !== undefined) upd.nota = patch.nota;
  if (patch.autor !== undefined) upd.trabalhado_por = patch.autor;
  const { error } = await db.from("tridiflow_sessoes").update(upd).eq("id", id);
  return !error;
}

// Resumo de integrações por bot (pixels conectados + webhook de lead) — usado
// nas telas Webhooks e Rastreamento & Pixels do workspace. Uma query só.
export interface BotIntegracoes { id: string; nome: string; meta: boolean; ga4: boolean; tiktok: boolean; pinterest: boolean; capi: boolean; leadWebhook: string | null }
export async function integracoesResumo(): Promise<BotIntegracoes[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("tridiflow_bots").select("id,nome,settings").order("updated_at", { ascending: false });
  if (error) { if (ausente(error.message)) return []; lancar(error.message); }
  return ((data ?? []) as { id: string; nome: string; settings: BotSettings | null }[]).map((r) => {
    const s = (r.settings ?? {}) as BotSettings; const p = s.pixels ?? {};
    return { id: r.id, nome: r.nome, meta: !!p.metaPixelId, ga4: !!p.ga4Id, tiktok: !!p.tiktokId, pinterest: !!p.pinterestId, capi: !!p.capiToken, leadWebhook: s.leadWebhook ?? null };
  });
}

// Atividade recente do workspace (derivada de bots + sessões/leads) — feed dos
// Logs de atividades. Não é auditoria por usuário; é o "o que aconteceu".
export interface AtividadeItem { ts: string; tipo: "editado" | "publicado" | "lead" | "concluido"; botNome: string }
export async function atividadeRecente(limite = 60): Promise<AtividadeItem[]> {
  const [bots, leads] = await Promise.all([listBots().catch(() => []), leadsGerais(150).catch(() => [])]);
  const itens: AtividadeItem[] = [];
  for (const b of bots) itens.push({ ts: b.updatedAt, tipo: b.status === "publicado" ? "publicado" : "editado", botNome: b.nome });
  for (const l of leads) {
    itens.push({ ts: l.iniciadaEm, tipo: "lead", botNome: l.botNome });
    if (l.concluidaEm) itens.push({ ts: l.concluidaEm, tipo: "concluido", botNome: l.botNome });
  }
  itens.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return itens.slice(0, limite);
}

// ── Verificação de domínio (F6): o DNS aponta pra Vercel? ────────────────────
// Estado do domínio. Duas etapas INDEPENDENTES, e é importante distinguir:
//  1. DNS: o host aponta pra Vercel?
//  2. Vercel: o domínio está cadastrado no projeto? (sem isso a Vercel não
//     reconhece o host — não roteia nem emite o certificado, mesmo com DNS ok)
// Antes só checávamos o DNS, então um domínio com DNS certo mas ausente do
// projeto ficava eternamente "aguardando DNS", que é a mensagem errada.
export type EstadoDominio = "sem_dns" | "dns_errado" | "falta_vercel" | "ativo";

export async function verificarDominio(id: string): Promise<{ ok: boolean; estado: EstadoDominio; detalhe: string }> {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("tridiflow_dominios").select("id,host").eq("id", id).maybeSingle();
  if (!data) return { ok: false, estado: "sem_dns", detalhe: "Domínio não encontrado." };
  const host = (data as { host: string }).host;

  // ── Etapa 1: DNS ───────────────────────────────────────────────────────────
  const dns = await import("node:dns/promises");
  let dnsOk = false, detalhe = "";
  try {
    const cnames = await dns.resolveCname(host).catch(() => [] as string[]);
    if (cnames.some((c) => /vercel-dns\.com$/i.test(c))) { dnsOk = true; detalhe = `CNAME → ${cnames[0]}`; }
    if (!dnsOk) {
      const as = await dns.resolve4(host).catch(() => [] as string[]);
      if (as.includes("76.76.21.21")) { dnsOk = true; detalhe = "A → 76.76.21.21 (Vercel)"; }
      else if (as.length) detalhe = `A → ${as.join(", ")} — esse endereço não é da Vercel.`;
      else detalhe = "Nenhum registro DNS encontrado para esse endereço ainda.";
    }
  } catch (e) { detalhe = String((e as Error).message || e); }

  if (!dnsOk) {
    const estado: EstadoDominio = /não é da Vercel/.test(detalhe) ? "dns_errado" : "sem_dns";
    await db.from("tridiflow_dominios").update({ verificado: false }).eq("id", id);
    return { ok: false, estado, detalhe };
  }

  // ── Etapa 2: a Vercel realmente atende esse host? ──────────────────────────
  // Se o domínio não estiver no projeto, o handshake TLS falha (sem certificado)
  // ou volta 404 do edge. Qualquer resposta HTTP nossa = está servindo.
  let serve = false;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`https://${host}/`, { redirect: "manual", signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    serve = r.status < 500;
  } catch { serve = false; }

  await db.from("tridiflow_dominios").update({ verificado: serve }).eq("id", id);
  if (serve) return { ok: true, estado: "ativo", detalhe: `${detalhe} — respondendo com HTTPS.` };
  return {
    ok: false,
    estado: "falta_vercel",
    detalhe: `${detalhe} — o DNS está certo, mas a Vercel ainda não reconhece esse endereço. Falta adicionar o domínio no projeto da Vercel (Settings › Domains).`,
  };
}

// ── Eventos da página (métricas de VSL / CTA / oferta) ───────────────────────
// tridiflow_sessoes conta "começou/terminou" — serve pro chat. A página precisa
// de granularidade (25/50/75% do vídeo, oferta vista, clique no CTA), então usa
// tridiflow_eventos: append-only, uma linha por evento.
// Tolerante: sem a tabela, tudo vira no-op e a página continua no ar.
export const EVENTOS_PAGINA = [
  "page_view", "video_started", "video_25", "video_50", "video_75", "video_completed",
  "offer_viewed", "cta_clicked", "form_submitted",
] as const;
export type EventoPagina = (typeof EVENTOS_PAGINA)[number];

export interface EventoEntrada {
  evento: string;
  sessaoId?: string | null;
  visitante?: string | null;
  url?: string | null;
  utm?: Record<string, string>;
  dispositivo?: string | null;
  meta?: Record<string, unknown>;
}

export async function registrarEvento(botId: string, e: EventoEntrada): Promise<void> {
  if (!EVENTOS_PAGINA.includes(e.evento as EventoPagina)) return;   // allowlist
  const db = createSupabaseAdminClient();
  try {
    await db.from("tridiflow_eventos").insert({
      bot_id: botId,
      sessao_id: e.sessaoId ?? null,
      visitante: (e.visitante ?? "").slice(0, 80) || null,
      evento: e.evento,
      url: (e.url ?? "").slice(0, 500) || null,
      utm: e.utm ?? {},
      dispositivo: e.dispositivo ?? null,
      meta: e.meta ?? {},
    });
  } catch { /* tabela ausente ou banco fora: métrica não derruba a página */ }
}

export interface MetricasPagina {
  visualizacoes: number; visitantes: number;
  videoInicios: number; video25: number; video50: number; video75: number; videoFim: number;
  ofertaVista: number; cliques: number; formularios: number;
  conversao: number;                                   // formulários ÷ visualizações
  utm: { chave: string; valor: string; total: number }[];
  serie: { dia: string; visualizacoes: number; cliques: number }[];
  /** Placar do teste A/B. Sai sempre; com o teste desligado os dois braços
   *  ficam zerados e a tela não mostra o bloco. */
  ab: ResumoAB;
}

const ZERO_METRICAS: MetricasPagina = {
  visualizacoes: 0, visitantes: 0, videoInicios: 0, video25: 0, video50: 0, video75: 0,
  videoFim: 0, ofertaVista: 0, cliques: 0, formularios: 0, conversao: 0, utm: [], serie: [],
  ab: resumoAB([]),
};

export async function metricasPagina(botId: string, dias = 30): Promise<MetricasPagina> {
  const db = createSupabaseAdminClient();
  const janela = Math.max(1, Math.min(180, dias));
  const desde = new Date(Date.now() - janela * 864e5).toISOString();
  // `meta` entra no select por causa do teste A/B: a variante mora nela. Segue
  // com colunas nomeadas — nada de select("*").
  const { data, error } = await db.from("tridiflow_eventos")
    .select("evento,visitante,utm,meta,criado_em")
    .eq("bot_id", botId).gte("criado_em", desde)
    .order("criado_em", { ascending: false }).limit(20000);
  if (error) return { ...ZERO_METRICAS };
  type Row = { evento: string; visitante: string | null; utm: Record<string, string> | null; meta: Record<string, unknown> | null; criado_em: string };
  const rows = (data ?? []) as Row[];
  const conta = (e: string) => rows.filter((r) => r.evento === e).length;

  const visualizacoes = conta("page_view");
  const visitantes = new Set(rows.filter((r) => r.evento === "page_view" && r.visitante).map((r) => r.visitante)).size;
  const formularios = conta("form_submitted");

  // UTMs — só das visualizações (é onde a origem chega).
  const utmMap = new Map<string, number>();
  for (const r of rows) {
    if (r.evento !== "page_view" || !r.utm) continue;
    for (const chave of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
      const v = r.utm[chave];
      if (v) utmMap.set(`${chave}|${v}`, (utmMap.get(`${chave}|${v}`) ?? 0) + 1);
    }
  }

  const serieMap = new Map<string, { visualizacoes: number; cliques: number }>();
  for (let i = Math.min(janela, 30) - 1; i >= 0; i--) {
    serieMap.set(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10), { visualizacoes: 0, cliques: 0 });
  }
  for (const r of rows) {
    const s = serieMap.get(r.criado_em.slice(0, 10));
    if (!s) continue;
    if (r.evento === "page_view") s.visualizacoes++;
    if (r.evento === "cta_clicked") s.cliques++;
  }

  return {
    visualizacoes, visitantes,
    videoInicios: conta("video_started"), video25: conta("video_25"), video50: conta("video_50"),
    video75: conta("video_75"), videoFim: conta("video_completed"),
    ofertaVista: conta("offer_viewed"), cliques: conta("cta_clicked"), formularios,
    conversao: visualizacoes ? Math.round((formularios / visualizacoes) * 1000) / 10 : 0,
    utm: [...utmMap.entries()].map(([k, total]) => { const [chave, valor] = k.split("|"); return { chave, valor, total }; })
      .sort((a, b) => b.total - a.total).slice(0, 20),
    serie: [...serieMap.entries()].map(([dia, v]) => ({ dia, ...v })),
    // Só os eventos carimbados com variante entram no placar: os de antes do
    // teste começar não têm marca e ficam de fora dos dois braços.
    ab: resumoAB(rows.map((r) => ({
      evento: r.evento,
      visitante: r.visitante,
      variante: ehVariante(r.meta?.variante) ? r.meta.variante : null,
    }))),
  };
}

/** Números do card na listagem de páginas (visualizações / cliques / conversões). */
export async function statsPaginas(ids: string[]): Promise<Map<string, { visualizacoes: number; cliques: number; conversoes: number }>> {
  const mapa = new Map<string, { visualizacoes: number; cliques: number; conversoes: number }>();
  if (!ids.length) return mapa;
  const db = createSupabaseAdminClient();
  try {
    const { data, error } = await db.from("tridiflow_eventos")
      .select("bot_id,evento").in("bot_id", ids)
      .in("evento", ["page_view", "cta_clicked", "form_submitted"]).limit(50000);
    if (error) return mapa;
    for (const r of (data ?? []) as { bot_id: string; evento: string }[]) {
      const v = mapa.get(r.bot_id) ?? { visualizacoes: 0, cliques: 0, conversoes: 0 };
      if (r.evento === "page_view") v.visualizacoes++;
      else if (r.evento === "cta_clicked") v.cliques++;
      else v.conversoes++;
      mapa.set(r.bot_id, v);
    }
  } catch { /* sem tabela: cards mostram zero */ }
  return mapa;
}

// Sessão do player (lead). Cria no início; atualiza conforme responde.
export async function criarSessao(botId: string, utm: Record<string, string>): Promise<string | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("tridiflow_sessoes").insert({ bot_id: botId, utm }).select("id").single();
  if (error) return null;
  return (data as { id: string }).id;
}

/** Sessão RECENTE trazida de outra tela do mesmo funil (ver PARAM_SESSAO).
 *
 *  Existe pra consertar um vazamento: o formulário da página mandava a pessoa
 *  pro fluxo com um redirect seco, o player abria sessão nova, e o mesmo lead
 *  virava duas linhas — a segunda sem os UTMs do anúncio, que é justamente o
 *  que o Tridify usa pra atribuir a venda.
 *
 *  Janela de 6 h: um link com `tf_s` copiado e aberto dias depois não continua
 *  o atendimento de outra pessoa. E o id é um UUID v4 — não se adivinha. */
const ADOCAO_MS = 6 * 3600 * 1000;

export async function adotarSessao(sessaoId: string): Promise<string | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("tridiflow_sessoes")
    .select("id,iniciada_em").eq("id", sessaoId).maybeSingle();
  if (error || !data) return null;
  const linha = data as { id: string; iniciada_em: string };
  if (Date.now() - +new Date(linha.iniciada_em) > ADOCAO_MS) return null;
  return linha.id;
}
/** Grava UM campo em `respostas` sem apagar o resto (read-modify-write). Para
 *  ação do backoffice — nunca poll. Usado pela triagem de candidatos pra marcar
 *  o estágio (`estagio_rh`) sem coluna nova. Devolve false se a sessão sumiu. */
export async function definirCampoResposta(sessaoId: string, campo: string, valor: string): Promise<boolean> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("tridiflow_sessoes").select("respostas").eq("id", sessaoId).maybeSingle();
  if (error || !data) return false;
  const respostas = { ...(((data as { respostas?: Record<string, string> }).respostas) ?? {}), [campo]: valor };
  const { error: e2 } = await db.from("tridiflow_sessoes").update({ respostas }).eq("id", sessaoId);
  return !e2;
}

export async function atualizarSessao(id: string, patch: { respostas?: Record<string, string>; ultimaEtapa?: string; concluida?: boolean }): Promise<void> {
  const db = createSupabaseAdminClient();
  const upd: Record<string, unknown> = {};
  if (patch.respostas) upd.respostas = patch.respostas;
  if (patch.ultimaEtapa) upd.ultima_etapa = patch.ultimaEtapa;
  if (patch.concluida) upd.concluida_em = new Date().toISOString();
  if (Object.keys(upd).length) await db.from("tridiflow_sessoes").update(upd).eq("id", id);
}
