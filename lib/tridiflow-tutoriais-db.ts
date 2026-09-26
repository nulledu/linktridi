// Central de Tutoriais — leitura e escrita no banco.
//
// A central é uma linha de `tridiflow_bots` (tipo page, template
// central_tutoriais), mas daqui ninguém passa pela API genérica dos projetos:
//  • ela exige `tridiflow:projetos`, e quem cuida dos tutoriais tem só
//    `tridiflow:tutoriais` — abria o editor e não gravava nada;
//  • ela grava o documento INTEIRO que o cliente mandou, e duas abas se
//    sobrescreviam.
// Aqui cada mudança é uma operação aplicada sobre o que está no banco AGORA,
// com compare-and-swap no `updated_at`: se alguém gravou entre a leitura e a
// escrita, relê e aplica de novo por cima da versão nova.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { cached, invalidate } from "@/lib/cache";
import { atualizarBot, CaminhoEmUso, criarBot, despublicarBot, DominioTravado, DOMINIO_PADRAO, EMBED_DOMINIO, publicarBot, removerBot } from "@/lib/tridiflow-db";
import { CENTRAL_TUTORIAIS_VAZIA, decidirDominioDaCentral, DOMINIO_DOS_TUTORIAIS, normalizarCentralTutoriais, type CentralTutoriaisDoc } from "@/lib/tridiflow-tutoriais";
import { aplicarOperacao, ehLinhaDeCentral, ErroCentral, montarGravacao, type OperacaoCentral } from "@/lib/tridiflow-tutoriais-operacoes";
import type { PaginaDoc } from "@/lib/tridiflow-pagina";

export { CaminhoEmUso, ErroCentral };

/** O id não é de uma central (ou não existe). Vira 404. */
export class CentralNaoEncontrada extends Error { constructor() { super("central_nao_encontrada"); } }

export type StatusCentral = "rascunho" | "publicado";
export interface CentralResumo {
  id: string; nome: string; slug: string; status: StatusCentral; host: string;
  atualizadoEm: string; publicadoEm: string | null;
  tutoriais: number; publicados: number; categorias: number;
  /** Capa do primeiro tutorial que tiver uma — o rosto do cartão da central. */
  capa: string;
}
export interface CentralCompleta {
  id: string; nome: string; slug: string; status: StatusCentral; dominioId: string | null; host: string;
  atualizadoEm: string; publicadoEm: string | null; doc: CentralTutoriaisDoc;
}

type Linha = {
  id: string; nome: string; slug: string; tipo: string | null; status: string; dominio_id: string | null;
  updated_at: string; published_at: string | null; pagina: unknown; published?: unknown;
  tridiflow_dominios?: { host: string } | { host: string }[] | null;
};

const COLS_LEITURA = `id,nome,slug,tipo,status,dominio_id,updated_at,published_at,pagina,${EMBED_DOMINIO}`;
// A escrita precisa do snapshot publicado (pra regravar só a `pagina` dele) e
// devolve a central pronta — sem uma terceira ida ao banco.
const COLS_ESCRITA = `${COLS_LEITURA},published`;
const TENTATIVAS = 3;

const hostDe = (l: Linha) => {
  const d = Array.isArray(l.tridiflow_dominios) ? l.tridiflow_dominios[0] : l.tridiflow_dominios;
  return d?.host || DOMINIO_PADRAO;
};
const docDe = (pagina: unknown) => normalizarCentralTutoriais((pagina as PaginaDoc | null)?.config?.centralTutoriais);
const statusDe = (s: string): StatusCentral => (s === "publicado" ? "publicado" : "rascunho");

function completa(l: Linha, doc = docDe(l.pagina)): CentralCompleta {
  return {
    id: l.id, nome: l.nome, slug: l.slug, status: statusDe(l.status), dominioId: l.dominio_id, host: hostDe(l),
    atualizadoEm: l.updated_at, publicadoEm: l.published_at, doc,
  };
}

export async function listarCentrais(): Promise<CentralResumo[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("tridiflow_bots").select(COLS_LEITURA)
    .eq("tipo", "page").eq("pagina->config->>template", "central_tutoriais")
    .order("updated_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Linha[]).filter(ehLinhaDeCentral).map((l) => {
    const doc = docDe(l.pagina);
    return {
      id: l.id, nome: l.nome, slug: l.slug, status: statusDe(l.status), host: hostDe(l),
      atualizadoEm: l.updated_at, publicadoEm: l.published_at,
      tutoriais: doc.tutoriais.length, publicados: doc.tutoriais.filter((t) => t.status === "publicado").length,
      categorias: doc.categorias.length, capa: doc.tutoriais.find((t) => t.capaUrl)?.capaUrl ?? "",
    };
  });
}

export async function lerCentral(id: string): Promise<CentralCompleta | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("tridiflow_bots").select(COLS_LEITURA).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  const l = data as unknown as Linha | null;
  return l && ehLinhaDeCentral(l) ? completa(l) : null;
}

/** Só a conferência "é uma central?" — o template sai por caminho JSON, sem
 *  arrastar o documento inteiro pra responder sim ou não. */
async function garantirCentral(id: string): Promise<void> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("tridiflow_bots").select("id,tipo,template:pagina->config->>template").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  const l = data as { tipo: string | null; template: string | null } | null;
  if (!l || l.tipo !== "page" || l.template !== "central_tutoriais") throw new CentralNaoEncontrada();
}

export async function operarNaCentral(id: string, op: OperacaoCentral, autor: string | null): Promise<CentralCompleta> {
  const db = createSupabaseAdminClient();
  for (let i = 0; i < TENTATIVAS; i++) {
    const { data, error } = await db.from("tridiflow_bots").select(COLS_ESCRITA).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    const l = data as unknown as Linha | null;
    if (!l || !ehLinhaDeCentral(l)) throw new CentralNaoEncontrada();
    // ErroCentral (título vazio, endereço repetido) sobe daqui sem gravar nada.
    const doc = aplicarOperacao(docDe(l.pagina), op);
    const agora = new Date().toISOString();
    const upd = montarGravacao({ status: l.status, pagina: l.pagina, published: l.published }, doc, autor, agora);
    const { data: gravadas, error: e2 } = await db.from("tridiflow_bots").update(upd)
      .eq("id", id).eq("updated_at", l.updated_at).select("id");
    if (e2) throw new Error(e2.message);
    if (gravadas?.length) {
      invalidate("bot-pub:");
      return completa({ ...l, updated_at: agora, published_at: l.status === "publicado" ? agora : l.published_at }, doc);
    }
    // Ninguém gravado: outra aba escreveu entre a leitura e a escrita. Relê.
  }
  throw new ErroCentral("A central mudou em outra aba ao mesmo tempo. Tente de novo.");
}

/** O id do domínio travado (`DOMINIO_DOS_TUTORIAIS`), ou null se ele ainda não
 *  foi cadastrado. Em cache: é uma linha que praticamente não muda, e a
 *  identidade é salva a cada configuração — não vale uma ida ao banco por vez. */
function idDoDominioTravado(): Promise<string | null> {
  return cached("tutoriais-dominio-travado", 600_000, async () => {
    const db = createSupabaseAdminClient();
    const { data, error } = await db.from("tridiflow_dominios").select("id").eq("host", DOMINIO_DOS_TUTORIAIS).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { id: string } | null)?.id ?? null;
  });
}

export async function mudarIdentidade(
  id: string, ident: { nome?: string; slug?: string; dominioId?: string | null }, autor: string | null,
): Promise<CentralCompleta> {
  await garantirCentral(id);
  const nome = ident.nome === undefined ? undefined : String(ident.nome).trim().slice(0, 120);
  const slug = ident.slug === undefined ? undefined : String(ident.slug).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
  if (nome !== undefined && !nome) throw new ErroCentral("Dê um nome à central.");
  if (slug !== undefined && !slug) throw new ErroCentral("O endereço não pode ficar vazio.");
  // O domínio não vem da tela: vem da trava. Salvar a identidade também
  // CONSERTA a coluna, então central criada antes desta trava entra no lugar
  // certo no primeiro salvamento.
  const decisao = decidirDominioDaCentral(ident.dominioId, await idDoDominioTravado());
  if ("recusar" in decisao) throw new ErroCentral(decisao.recusar);
  await atualizarBot(id, { nome, slug, dominioId: decisao.escrever, autor });   // CaminhoEmUso sobe
  const c = await lerCentral(id);
  if (!c) throw new CentralNaoEncontrada();
  return c;
}

export async function colocarNoAr(id: string, autor: string | null): Promise<CentralCompleta> {
  await garantirCentral(id);
  await publicarBot(id, autor);
  const c = await lerCentral(id);
  if (!c) throw new CentralNaoEncontrada();
  return c;
}

export async function tirarDoAr(id: string): Promise<CentralCompleta> {
  await garantirCentral(id);
  await despublicarBot(id);
  const c = await lerCentral(id);
  if (!c) throw new CentralNaoEncontrada();
  return c;
}

export async function criarCentral(nome: string, autor: string | null): Promise<{ id: string }> {
  const pagina: PaginaDoc = {
    versao: 1, secoes: [],
    config: { template: "central_tutoriais", centralTutoriais: { ...CENTRAL_TUTORIAIS_VAZIA, atalhos: [], categorias: [], tutoriais: [] } },
  };
  const bot = await criarBot(nome.trim().slice(0, 120) || "Central de Tutoriais", undefined, { tipo: "page", pagina, autor });
  // Central nasce JÁ no domínio travado — senão ela nasceria no DOMINIO_PADRAO
  // e o primeiro link divulgado seria o errado.
  const travado = await idDoDominioTravado();
  if (travado) await atualizarBot(bot.id, { dominioId: travado, autor });
  return { id: bot.id };
}

export async function excluirCentral(id: string): Promise<void> {
  await garantirCentral(id);
  await removerBot(id);
}

/** Erro → resposta. As rotas só escolhem o que devolver. */
export function respostaDoErro(e: unknown): { status: number; corpo: Record<string, unknown> } {
  if (e instanceof ErroCentral) return { status: 400, corpo: { error: e.message } };
  if (e instanceof CentralNaoEncontrada) return { status: 404, corpo: { error: "Central não encontrada." } };
  if (e instanceof CaminhoEmUso) return { status: 409, corpo: { error: "Esse endereço já é de outro projeto neste domínio.", campo: "slug" } };
  if (e instanceof DominioTravado) return { status: 409, corpo: { error: e.message, campo: "dominio" } };
  return { status: 500, corpo: { error: "Não deu pra salvar agora. Tente de novo em instantes." } };
}
