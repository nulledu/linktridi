// Operações da Central de Tutoriais.
//
// Cada mudança do editor é UMA operação — salvar este tutorial, excluir
// aquela categoria, esta ordem — aplicada sobre o documento ATUAL. O cliente
// aplica na hora (a tela responde sem esperar a rede) e o servidor aplica de
// novo sobre o que está no banco, que é o que vale.
//
// Antes o editor mandava a central INTEIRA a cada clique: duas abas abertas,
// ou duas pessoas, se sobrescreviam — o último a salvar apagava o tutorial que
// o outro tinha acabado de escrever, sem erro nenhum na tela.
//
// Puro (sem banco, sem DOM): roda no navegador e no servidor.
import {
  ehCentralTutoriais, handleDoTutorial, normalizarCentralTutoriais, normalizarTutorial,
  type CentralTutoriaisDoc, type Tutorial, type TutorialCategoria,
} from "@/lib/tridiflow-tutoriais";
import type { PaginaDoc } from "@/lib/tridiflow-pagina";
import { limparConteudoDoTutorial } from "@/lib/tridiflow-tutoriais-html";

/** Erro de quem edita (título vazio, endereço repetido). A rota devolve 400
 *  com esta mensagem — ela é escrita pra aparecer na tela como está. */
export class ErroCentral extends Error {
  constructor(mensagem: string) { super(mensagem); this.name = "ErroCentral"; }
}

/** O que a operação de configurações pode tocar. Lista FECHADA: sem ela, um
 *  corpo com `tutoriais: []` passaria pela porta das configurações e apagaria
 *  a central inteira. */
export const CAMPOS_CONFIG = [
  "titulo", "subtitulo", "sobrelinha", "mostrarTitulo", "catalogoLoja", "catalogoRotulo",
  "todosImagemUrl", "todosRotulo", "whatsapp", "atalhos",
] as const;
export type CamposConfig = Partial<Pick<CentralTutoriaisDoc, (typeof CAMPOS_CONFIG)[number]>>;

export type OperacaoCentral =
  | { op: "salvarTutorial"; tutorial: Tutorial }
  | { op: "excluirTutorial"; id: string }
  | { op: "ordenarTutoriais"; ids: string[] }
  | { op: "salvarCategoria"; categoria: TutorialCategoria }
  | { op: "excluirCategoria"; id: string }
  | { op: "ordenarCategorias"; ids: string[] }
  | { op: "salvarConfig"; campos: CamposConfig };

const LIMITE_TUTORIAIS = 500;
const LIMITE_CATEGORIAS = 50;
const porOrdem = (a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem;
const proximaOrdem = (itens: { ordem: number }[]) => itens.reduce((m, x) => Math.max(m, x.ordem + 1), 0);

/** Aplica a ordem que o cliente viu. Quem ele NÃO conhecia (chegou por outra
 *  aba depois que esta carregou) vai pro fim em vez de sumir; id que já não
 *  existe é ignorado. A `ordem` é reatribuída pela posição. */
export function ordenarPorIds<T extends { id: string; ordem: number }>(itens: T[], ids: string[]): T[] {
  const pos = new Map(ids.map((id, i) => [id, i] as const));
  const conhecidos = itens.filter((x) => pos.has(x.id)).sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
  const resto = itens.filter((x) => !pos.has(x.id));
  return [...conhecidos, ...resto].map((x, ordem) => ({ ...x, ordem }));
}

export function aplicarOperacao(doc: CentralTutoriaisDoc, op: OperacaoCentral): CentralTutoriaisDoc {
  switch (op.op) {
    case "salvarTutorial": {
      // Texto rico entra no vocabulário fechado AQUI, na escrita — o que chega
      // colado do Word sai do banco já como parágrafo, negrito e lista.
      const t = limparConteudoDoTutorial(normalizarTutorial(op.tutorial));
      if (!t.titulo) throw new ErroCentral("Dê um título ao tutorial.");
      const existente = doc.tutoriais.find((x) => x.id === t.id);
      if (!existente && doc.tutoriais.length >= LIMITE_TUTORIAIS) throw new ErroCentral(`A central chegou ao limite de ${LIMITE_TUTORIAIS} tutoriais.`);
      const outros = doc.tutoriais.filter((x) => x.id !== t.id);
      const handle = t.handle || handleDoTutorial(t.titulo, outros.map((x) => x.handle));
      // Endereço repetido faria o link antigo abrir OUTRO guia — recusa em vez
      // de numerar sozinho, porque quem escolheu o endereço quer aquele.
      if (outros.some((x) => x.handle === handle)) throw new ErroCentral(`O endereço “${handle}” já é de outro tutorial. Troque em Detalhes › Endereço.`);
      const categoriaId = t.categoriaId && doc.categorias.some((c) => c.id === t.categoriaId) ? t.categoriaId : null;
      const salvo: Tutorial = { ...t, handle, categoriaId, ordem: existente ? existente.ordem : proximaOrdem(doc.tutoriais) };
      const tutoriais = existente ? doc.tutoriais.map((x) => (x.id === t.id ? salvo : x)) : [...doc.tutoriais, salvo];
      return { ...doc, tutoriais: [...tutoriais].sort(porOrdem) };
    }
    case "excluirTutorial":
      return { ...doc, tutoriais: doc.tutoriais.filter((t) => t.id !== op.id) };
    case "ordenarTutoriais":
      return { ...doc, tutoriais: ordenarPorIds(doc.tutoriais, op.ids) };
    case "salvarCategoria": {
      const nome = String(op.categoria?.nome ?? "").trim().slice(0, 80);
      if (!nome) throw new ErroCentral("Dê um nome à categoria.");
      const id = String(op.categoria.id ?? "").trim().slice(0, 80) || Math.random().toString(36).slice(2, 10);
      const existente = doc.categorias.find((c) => c.id === id);
      if (!existente && doc.categorias.length >= LIMITE_CATEGORIAS) throw new ErroCentral(`A central chegou ao limite de ${LIMITE_CATEGORIAS} categorias.`);
      const categoria: TutorialCategoria = {
        id, nome, imagemUrl: String(op.categoria.imagemUrl ?? "").trim().slice(0, 800),
        ativa: op.categoria.ativa !== false, ordem: existente ? existente.ordem : proximaOrdem(doc.categorias),
      };
      const categorias = existente ? doc.categorias.map((c) => (c.id === id ? categoria : c)) : [...doc.categorias, categoria];
      return { ...doc, categorias: [...categorias].sort(porOrdem) };
    }
    case "excluirCategoria":
      // Os tutoriais dela ficam "sem categoria" — antes a exclusão era barrada
      // até alguém abrir tutorial por tutorial pra trocar a categoria.
      return {
        ...doc,
        categorias: doc.categorias.filter((c) => c.id !== op.id),
        tutoriais: doc.tutoriais.map((t) => (t.categoriaId === op.id ? { ...t, categoriaId: null } : t)),
      };
    case "ordenarCategorias":
      return { ...doc, categorias: ordenarPorIds(doc.categorias, op.ids) };
    case "salvarConfig": {
      const campos = op.campos ?? {};
      const limpos = Object.fromEntries(CAMPOS_CONFIG.filter((k) => k in campos).map((k) => [k, campos[k]]));
      return normalizarCentralTutoriais({ ...doc, ...limpos });
    }
    default:
      throw new ErroCentral("Operação desconhecida.");
  }
}

// ── Do documento ao UPDATE ───────────────────────────────────────────────────

/** A linha é uma central? A chave de Tutoriais só abre esta porta: sem a
 *  conferência, a rota de tutoriais gravaria em qualquer projeto do TridiFlow
 *  (um LinkTridi, uma landing) de quem não tem permissão pra eles. */
export function ehLinhaDeCentral(l: { tipo?: string | null; pagina?: unknown } | null | undefined): boolean {
  return !!l && l.tipo === "page" && ehCentralTutoriais((l.pagina as PaginaDoc | null)?.config);
}

/** O que vai pro banco quando a central muda.
 *
 *  Salvar PUBLICA (decisão de 10/09/2026): com a central no ar, o snapshot que
 *  a página pública lê (`published.pagina`) é regravado junto, no mesmo UPDATE.
 *  O resto do snapshot (fluxo/tema/settings da publicação) fica como estava.
 *  Fora do ar, só o rascunho muda — e ele entra quando alguém puser no ar. */
export function montarGravacao(
  linha: { status: string; pagina: unknown; published: unknown },
  doc: CentralTutoriaisDoc, autor: string | null, agora: string,
): Record<string, unknown> {
  const atual = (linha.pagina && typeof linha.pagina === "object" ? linha.pagina : {}) as Partial<PaginaDoc>;
  const pagina: PaginaDoc = {
    versao: 1, secoes: Array.isArray(atual.secoes) ? atual.secoes : [],
    config: { ...(atual.config ?? {}), template: "central_tutoriais", centralTutoriais: doc },
  };
  const upd: Record<string, unknown> = { pagina, updated_at: agora, atualizado_por: autor };
  if (linha.status === "publicado") {
    const pub = (linha.published && typeof linha.published === "object" ? linha.published : {}) as Record<string, unknown>;
    upd.published = { ...pub, pagina };
    upd.published_at = agora;
    upd.publicado_por = autor;
  }
  return upd;
}

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 1_000) : []);
const objeto = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** O corpo que chega pela rede, conferido antes de tocar no documento. O
 *  conteúdo em si (tamanhos, esquemas de URL) é limpo pela normalização. */
export function lerOperacao(bruto: unknown): OperacaoCentral {
  const b = objeto(bruto);
  if (!b) throw new ErroCentral("Operação inválida.");
  switch (b.op) {
    case "salvarTutorial": { const t = objeto(b.tutorial); if (!t) break; return { op: "salvarTutorial", tutorial: t as unknown as Tutorial }; }
    case "excluirTutorial": case "excluirCategoria": if (typeof b.id !== "string" || !b.id) break; return { op: b.op, id: b.id };
    case "ordenarTutoriais": case "ordenarCategorias": return { op: b.op, ids: ids(b.ids) };
    case "salvarCategoria": { const c = objeto(b.categoria); if (!c) break; return { op: "salvarCategoria", categoria: c as unknown as TutorialCategoria }; }
    case "salvarConfig": { const c = objeto(b.campos); if (!c) break; return { op: "salvarConfig", campos: c as CamposConfig }; }
  }
  throw new ErroCentral("Operação inválida.");
}
