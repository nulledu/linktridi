// ── Coleção é categoria ──────────────────────────────────────────────────────
// O tema fala em "collection" o tempo todo: a lista de coleções da home, a
// coleção em destaque, a página /collections/<handle>. O produto do projeto já
// tem `categorias: string[]`.
//
// Em vez de inventar uma tabela de coleções — com id, ordem, imagem, e um
// cadastro a mais pra manter — a coleção É a categoria, e o `handle` é a
// categoria normalizada. Sem SQL novo, e o lojista continua organizando o
// catálogo num lugar só.
//
// O que a categoria não tem (imagem, texto) mora no tema, no bloco da seção que
// mostra aquela coleção — que é onde o lojista já está mexendo quando escolhe.

import { slugDe, type Produto } from "@/lib/lojas";

export interface Colecao {
  handle: string;
  titulo: string;
  quantidade: number;
  /** Capa: a primeira foto do primeiro produto que tiver uma. */
  capa: string | null;
}

/** `todos-os-produtos` é a coleção implícita — existe sem ninguém criar. */
export const COLECAO_TUDO = "todos-os-produtos";

export const handleDaCategoria = (categoria: string): string => slugDe(categoria);

/**
 * As coleções da loja, deduzidas do catálogo. Ordenadas por nome porque a
 * ordem de aparição num `for` sobre produtos muda quando alguém cadastra um
 * produto — e coleção que troca de lugar sozinha na home é defeito.
 */
export function colecoesDaLoja(produtos: Produto[]): Colecao[] {
  const por = new Map<string, { titulo: string; itens: Produto[] }>();
  for (const p of produtos) {
    for (const c of p.categorias) {
      const h = handleDaCategoria(c);
      if (!h) continue;
      const atual = por.get(h) ?? { titulo: c, itens: [] };
      atual.itens.push(p);
      por.set(h, atual);
    }
  }
  const lista = [...por].map(([handle, v]) => ({
    handle,
    titulo: v.titulo,
    quantidade: v.itens.length,
    capa: v.itens.find((p) => p.imagens[0])?.imagens[0]?.url ?? null,
  }));
  lista.sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
  return lista;
}

/** Os produtos de uma coleção. Handle vazio ou desconhecido devolve o catálogo. */
export function produtosDaColecao(produtos: Produto[], handle: string): Produto[] {
  if (!handle || handle === COLECAO_TUDO) return produtos;
  return produtos.filter((p) => p.categorias.some((c) => handleDaCategoria(c) === handle));
}

export function colecaoPorHandle(produtos: Produto[], handle: string): Colecao | null {
  if (handle === COLECAO_TUDO) {
    return {
      handle: COLECAO_TUDO,
      titulo: "Todos os produtos",
      quantidade: produtos.length,
      capa: produtos.find((p) => p.imagens[0])?.imagens[0]?.url ?? null,
    };
  }
  return colecoesDaLoja(produtos).find((c) => c.handle === handle) ?? null;
}
