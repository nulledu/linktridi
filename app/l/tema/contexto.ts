// ── O que uma seção recebe pra se desenhar ───────────────────────────────────
// No Shopify a seção lê variáveis globais do Liquid (`shop`, `collections`,
// `product`). Aqui isso vira um objeto explícito, passado de cima pra baixo:
// nenhuma seção busca dado por conta própria.
//
// Não é preciosismo. A prévia do editor renderiza as MESMAS seções com um
// catálogo já carregado; se cada seção fosse buscar o que precisa, a prévia
// dispararia uma consulta por seção a cada tecla digitada no painel.

import type { Loja, Produto } from "@/lib/lojas";
import type { Colecao } from "@/lib/vitrine/colecoes";
import type { BlocoPagina } from "@/lib/lojas-blocos";
import type { SecaoSalva, Tema, Template } from "@/lib/vitrine/tipos";

export interface Contexto {
  loja: Loja;
  tema: Tema;
  template: Template;
  /** Catálogo publicado inteiro. As seções filtram a partir dele. */
  produtos: Produto[];
  colecoes: Colecao[];
  /** Raiz dos links da loja — `/l/<slug>`, ou `/` em domínio próprio. */
  base: string;

  // Dados do template da vez. Cada um só vem no template a que pertence.
  produto?: Produto;
  colecao?: Colecao | null;
  termo?: string;
  /**
   * A página institucional aberta, no template `pagina`.
   *
   * `blocos` vazio = a página é o HTML de `conteudo`, como nasceu. Toda página
   * criada antes do construtor continua abrindo por esse caminho.
   */
  pagina?: { titulo: string; conteudo: string; blocos: BlocoPagina[] } | null;
  /** Menus cadastrados. Vazio = a vitrine cai nas categorias, como antes. */
  menuPrincipal?: { titulo: string; destino: string }[];
  menuRodape?: { titulo: string; destino: string }[];

  /**
   * Renderizando dentro do editor.
   *
   * Muda duas coisas: link não navega (senão a prévia sai da tela que a pessoa
   * está editando) e cada seção ganha o atributo de âncora que o painel usa pra
   * rolar até ela e destacá-la.
   */
  editor?: boolean;
}

export interface PropsSecao {
  id: string;
  secao: SecaoSalva;
  ctx: Contexto;
}

/** Atalho tipado pra ler ajuste de seção ou bloco. */
export const txt = (a: Record<string, unknown>, k: string, padrao = ""): string => {
  const v = a[k];
  return v === undefined || v === null ? padrao : String(v);
};
export const num = (a: Record<string, unknown>, k: string, padrao = 0): number => {
  const v = Number(a[k]);
  return Number.isFinite(v) ? v : padrao;
};
export const bool = (a: Record<string, unknown>, k: string): boolean => a[k] === true;

/**
 * Resolve um link do tema.
 *
 * O `settings_data.json` do Shopify guarda link como `shopify://collections/x`
 * e `shopify://products/y`. Traduzir isso é o que faz o modelo importado
 * apontar pra lugar nenhum ou pra lugar certo — e é a diferença entre "a cópia
 * abre" e "a cópia funciona".
 */
export function resolverLink(valor: string, base: string): string {
  const v = (valor || "").trim();
  if (!v) return "";
  const m = v.match(/^shopify:\/\/(collections|products|pages)\/(.+)$/);
  if (m) {
    const [, tipo, handle] = m;
    if (tipo === "collections") return handle === "all" ? `${base}/c` : `${base}/c/${handle}`;
    if (tipo === "products") return `${base}/${handle}`;
    return `${base}/p/${handle}`;
  }
  if (/^(https?:)?\/\//.test(v) || /^(mailto|tel):/.test(v)) return v;
  if (v.startsWith("/collections/")) return `${base}/c/${v.slice(13)}`;
  if (v.startsWith("/products/")) return `${base}/${v.slice(10)}`;
  if (v.startsWith("/")) return `${base}${v}`;
  return v;
}
