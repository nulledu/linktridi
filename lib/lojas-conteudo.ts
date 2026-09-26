// ── Páginas e menus da loja — o domínio ──────────────────────────────────────
// Tipos e regras. Nada aqui importa banco, e é DELIBERADO: as telas de Páginas
// e de Navegação são componentes de cliente, e um `import` de valor vindo de um
// módulo que fala com o Supabase arrasta o servidor inteiro pro pacote do
// navegador. O projeto tem um teste que quebra exatamente nisso — e foi ele que
// pegou este arquivo na primeira versão, quando domínio e banco moravam juntos.
//
// Quem fala com o banco é `lib/lojas-conteudo-db.ts`.

import { slugDe } from "@/lib/lojas";
import type { BlocoPagina } from "./lojas-blocos";

// ── Tipos ────────────────────────────────────────────────────────────────────

export type StatusPagina = "rascunho" | "publicada";

export const ROTULO_PAGINA: Record<StatusPagina, { txt: string; cor: string }> = {
  publicada: { txt: "Publicada", cor: "var(--ok)" },
  rascunho: { txt: "Rascunho", cor: "var(--neutro)" },
};

export interface Pagina {
  id: string;
  lojaId: string;
  titulo: string;
  handle: string;
  /** O HTML antigo. Continua sendo mostrado quando a página não tem blocos. */
  conteudo: string;
  /** A página montada em blocos. Vazia = a página é o HTML de `conteudo`. */
  blocos: BlocoPagina[];
  status: StatusPagina;
  atualizadoEm: string;
}

export interface ItemDeMenu {
  titulo: string;
  /** Caminho relativo à loja (`/c/carimbos`, `/p/sobre-nos`) ou URL inteira. */
  destino: string;
}

export interface Menu {
  id: string;
  lojaId: string;
  chave: string;
  titulo: string;
  itens: ItemDeMenu[];
}

/** Os dois menus que toda loja tem. Nascem sozinhos na primeira visita. */
export const MENUS_PADRAO: { chave: string; titulo: string }[] = [
  { chave: "principal", titulo: "Menu principal" },
  { chave: "rodape", titulo: "Menu do rodapé" },
];

// ── Domínio (puro, testável) ─────────────────────────────────────────────────

/**
 * O endereço da página, a partir do título.
 *
 * Sai do `slugDe` do módulo pra não existirem duas regras de endereço no mesmo
 * sistema. O que muda aqui é só a rede de segurança: título que vira slug vazio
 * (só emoji, só pontuação) recebe um nome em vez de gerar `/p/` — endereço vazio
 * casaria com a listagem de páginas e a página comeria a própria lista.
 */
export function handleDaPagina(titulo: string, existentes: string[] = []): string {
  const raiz = slugDe(titulo) || "pagina";
  if (!existentes.includes(raiz)) return raiz;
  for (let i = 2; i < 200; i++) {
    const tentativa = `${raiz}-${i}`;
    if (!existentes.includes(tentativa)) return tentativa;
  }
  return `${raiz}-${existentes.length + 1}`;
}

/** Endereços que a vitrine já usa. Uma página com um destes some atrás da rota. */
const RESERVADOS = ["c", "p", "busca", "carrinho"];

export function validarPagina(titulo: string, handle: string): string | null {
  if (!titulo.trim()) return "Dê um título à página.";
  if (titulo.trim().length > 120) return "Título muito longo.";
  if (!handle.trim()) return "O endereço não pode ficar vazio.";
  if (!/^[a-z0-9-]+$/.test(handle)) return "O endereço aceita só letras minúsculas, números e hífen.";
  if (RESERVADOS.includes(handle)) return `"${handle}" é um endereço que a loja já usa.`;
  return null;
}

/**
 * Onde um item de menu leva, dentro da loja.
 *
 * Aceita o caminho relativo (`/c/carimbos`) e a URL inteira. O relativo é o
 * formato guardado: guardar a URL absoluta amarraria o menu ao endereço de
 * hoje, e o dia em que a loja ganha domínio próprio todo item apontaria pro
 * endereço velho.
 */
export function destinoDoItem(destino: string, base: string): string {
  const d = (destino || "").trim();
  if (!d) return base || "/";
  if (/^(https?:)?\/\//.test(d) || /^(mailto|tel):/.test(d)) return d;
  return `${base}${d.startsWith("/") ? d : `/${d}`}`;
}
