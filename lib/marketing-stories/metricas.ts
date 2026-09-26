// ── Marketing · Stories — números ────────────────────────────────────────────
// Ninguém calcula nada à mão: conversão, resumo, ranking e agrupamento saem
// daqui, iguais na tela, no servidor e no banco de provas.
//
// Três perguntas diferentes, três respostas diferentes — usar só vendas pra
// tudo esconderia que mais clique não é mais venda:
//   • o que VENDEU mais    → vendas
//   • o que LEVOU mais gente → cliques
//   • o que CONVERTEU melhor → vendas ÷ cliques, com amostra mínima
//
// Puro e testado em `lib/__tests__/stories-metricas.test.ts`.

import { partesSP, semanasDoMes, type Semana } from "./calendario";
import type { Story, TipoStory } from "./tipos";

/**
 * Amostra mínima pra disputar "melhor conversão". Sem ela, o story com 1
 * clique e 1 venda (100%) ganharia de um com 400 cliques e 40 vendas (10%) —
 * um acaso vencendo um resultado. 20 cliques é pouco o bastante pra quase
 * todo story da casa entrar e muito o bastante pra um clique perdido não
 * decidir o pódio.
 */
export const CLIQUES_MIN_CONVERSAO = 20;

/** vendas ÷ cliques × 100, com duas casas. `null` quando não houve clique. */
export function conversao(cliques: number, vendas: number): number | null {
  if (!(cliques > 0) || !(vendas >= 0)) return null;
  return Math.round((vendas / cliques) * 10_000) / 100;
}

/**
 * "14,5%", "5,06%", "—". Uma casa a partir de 10% e duas abaixo: é onde a
 * segunda casa ainda muda a leitura (5,06 × 5,6) e onde ela vira ruído (14,52).
 */
export function formatarConversao(c: number | null | undefined): string {
  if (c == null || !Number.isFinite(c)) return "—";
  return `${c.toLocaleString("pt-BR", { maximumFractionDigits: c >= 10 ? 1 : 2 })}%`;
}

/** "8.420" */
export function formatarInteiro(n: number): string {
  return Math.round(n || 0).toLocaleString("pt-BR");
}

// ── Resumo ───────────────────────────────────────────────────────────────────

type Numeros = Pick<Story, "cliques" | "vendas" | "status">;

export interface Resumo {
  /** Todos os stories do recorte, planejados inclusive. */
  stories: number;
  /** Os que foram ao ar — "Stories publicados" na tela. */
  publicados: number;
  cliques: number;
  vendas: number;
  conversao: number | null;
}

export function resumir(lista: readonly Numeros[]): Resumo {
  let cliques = 0;
  let vendas = 0;
  let publicados = 0;
  for (const s of lista) {
    cliques += s.cliques || 0;
    vendas += s.vendas || 0;
    if (s.status !== "planejado") publicados++;
  }
  return { stories: lista.length, publicados, cliques, vendas, conversao: conversao(cliques, vendas) };
}

// ── Ranking ──────────────────────────────────────────────────────────────────

type Comparavel = Pick<Story, "id" | "cliques" | "vendas" | "publicadoEm">;
export type Criterio = "vendas" | "cliques" | "conversao" | "data";

const conv = (s: Comparavel) => conversao(s.cliques, s.vendas) ?? -1;
// Empate vai pra quem chegou PRIMEIRO: foi ele que fez aquele número, o outro
// repetiu. E o id no fim deixa a ordem estável — sem isso dois stories
// empatados trocariam de lugar a cada carga e o pódio "piscaria".
const maisAntigo = (a: Comparavel, b: Comparavel) =>
  a.publicadoEm < b.publicadoEm ? -1 : a.publicadoEm > b.publicadoEm ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export function ordenar<T extends Comparavel>(lista: readonly T[], criterio: Criterio, min = CLIQUES_MIN_CONVERSAO): T[] {
  const c = [...lista];
  if (criterio === "data") return c.sort(maisAntigo);
  if (criterio === "vendas") {
    return c.sort((a, b) => b.vendas - a.vendas || conv(b) - conv(a) || b.cliques - a.cliques || maisAntigo(a, b));
  }
  if (criterio === "cliques") {
    return c.sort((a, b) => b.cliques - a.cliques || b.vendas - a.vendas || maisAntigo(a, b));
  }
  // Conversão: quem tem amostra vem antes; quem não tem fica no fim, pelos
  // cliques — está na lista, mas não disputa o topo com 1 clique.
  return c.sort((a, b) => {
    const qa = a.cliques >= min;
    const qb = b.cliques >= min;
    if (qa !== qb) return qa ? -1 : 1;
    if (!qa) return b.cliques - a.cliques || maisAntigo(a, b);
    return conv(b) - conv(a) || b.vendas - a.vendas || maisAntigo(a, b);
  });
}

/** O que mais vendeu. `null` se ninguém vendeu. */
export function melhorPorVendas<T extends Comparavel>(lista: readonly T[]): T | null {
  const o = ordenar(lista, "vendas")[0];
  return o && o.vendas > 0 ? o : null;
}
/** O que mais levou gente ao link. `null` se ninguém teve clique. */
export function maisCliques<T extends Comparavel>(lista: readonly T[]): T | null {
  const o = ordenar(lista, "cliques")[0];
  return o && o.cliques > 0 ? o : null;
}
/** O que melhor converteu, entre os que têm amostra. */
export function melhorConversao<T extends Comparavel>(lista: readonly T[], min = CLIQUES_MIN_CONVERSAO): T | null {
  const o = ordenar(lista, "conversao", min)[0];
  return o && o.cliques >= min && o.vendas > 0 ? o : null;
}

/** 1ª, 2ª… posição do story no critério, só entre quem tem aquele número. */
export function posicaoNo<T extends Comparavel>(
  lista: readonly T[], id: string, criterio: Exclude<Criterio, "data">, min = CLIQUES_MIN_CONVERSAO,
): number | null {
  const elegiveis = lista.filter((s) =>
    criterio === "vendas" ? s.vendas > 0 : criterio === "cliques" ? s.cliques > 0 : s.cliques >= min && s.vendas > 0);
  const i = ordenar(elegiveis, criterio, min).findIndex((s) => s.id === id);
  return i < 0 ? null : i + 1;
}

// ── Agrupamentos ─────────────────────────────────────────────────────────────

export interface GrupoSemana<T> {
  semana: Semana;
  stories: T[];
  resumo: Resumo;
}

/** As semanas do mês, cada uma com os seus stories (em ordem de publicação). */
export function porSemana<T extends Comparavel & Numeros>(lista: readonly T[], mes: string): GrupoSemana<T>[] {
  const grupos = semanasDoMes(mes).map((semana) => ({ semana, stories: [] as T[], resumo: resumir([]) }));
  for (const s of lista) {
    const p = partesSP(s.publicadoEm);
    if (p.mes !== mes) continue;
    grupos.find((g) => p.dia >= g.semana.de && p.dia <= g.semana.ate)?.stories.push(s);
  }
  for (const g of grupos) {
    g.stories = ordenar(g.stories, "data");
    g.resumo = resumir(g.stories);
  }
  return grupos;
}

export interface LinhaTipo {
  tipo: TipoStory | null;
  stories: number;
  cliques: number;
  vendas: number;
  conversao: number | null;
}

/** Que tipo de conteúdo está funcionando: um bloco por tipo, do que mais vende pro que menos. */
export function porTipo(lista: readonly Pick<Story, "tipo" | "cliques" | "vendas">[]): LinhaTipo[] {
  const m = new Map<string, LinhaTipo>();
  for (const s of lista) {
    const k = s.tipo ?? "";
    const l = m.get(k) ?? { tipo: s.tipo ?? null, stories: 0, cliques: 0, vendas: 0, conversao: null };
    l.stories++;
    l.cliques += s.cliques || 0;
    l.vendas += s.vendas || 0;
    m.set(k, l);
  }
  const linhas = [...m.values()];
  for (const l of linhas) l.conversao = conversao(l.cliques, l.vendas);
  return linhas.sort((a, b) => b.vendas - a.vendas || b.stories - a.stories);
}

// ── Comparação ───────────────────────────────────────────────────────────────

function quantoMais(a: number, b: number): string {
  const r = a / b;
  return r >= 1.95
    ? `${r.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}× mais`
    : `${Math.round((r - 1) * 100)}% mais`;
}

/**
 * A comparação em uma frase. É a leitura que o time tirava do Miro olhando
 * dois prints lado a lado — e a que mais engana: o story que mais levou gente
 * ao link nem sempre é o que vendeu.
 */
export function leituraDaComparacao<T extends Comparavel>(lista: readonly T[], letra: (s: T) => string): string | null {
  if (lista.length < 2) return null;
  const v = melhorPorVendas(lista);
  const c = maisCliques(lista);
  if (!v && !c) return "Nenhum destes stories tem cliques ou vendas anotados ainda.";
  if (!v) return `${letra(c!)} levou mais gente ao link, mas nenhum deles vendeu ainda.`;
  if (!c || c.id === v.id) return `${letra(v)} ganhou nas duas pontas: mais cliques e mais vendas.`;
  const cliques = v.cliques > 0 ? `teve ${quantoMais(c.cliques, v.cliques)} cliques` : `teve ${formatarInteiro(c.cliques)} cliques`;
  const vendas = c.vendas > 0 ? `vendeu ${quantoMais(v.vendas, c.vendas)}` : `vendeu ${formatarInteiro(v.vendas)} e ${letra(c)} nenhuma`;
  return `${letra(c)} ${cliques}, mas ${letra(v)} ${vendas}. Mais clique não é mais venda.`;
}
