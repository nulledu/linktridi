// ── Tridify · Identidade e agrupamento de CRIATIVOS ──────────────────────────
// O `ad.id` da Meta NÃO é a identidade do criativo: o mesmo vídeo roda em várias
// campanhas/conjuntos e ganha um id novo a cada duplicação ("— Cópia"). Quem
// identifica o criativo pro time é o NOME.
//
// Regra: mesmo nome ⇒ mesmo criativo — com uma TRAVA. A equipe reaproveita os
// mesmos nomes a cada ano ("JN 01" de 2025 ≠ "JN 01" de 2026), então a chave é
// `nome normalizado @ SAFRA` (ano de created_time do anúncio). Sem created_time,
// cai no ano informado pelo chamador (o do período em tela).
//
// Sinal extra: se dentro do mesmo nome+safra aparecer mais de um vídeo/thumb
// distinto, o grupo é marcado com `conflito` — a tela avisa em vez de somar
// coisas diferentes em silêncio.
import type { AdRow, AdMetrics } from "@/lib/meta-ads";

// Sufixos que a Meta/o time acrescentam ao DUPLICAR — não mudam o criativo.
const SUFIXOS = /\s*[-–—]?\s*(c[óo]pia|copy|copia)\s*\d*\s*$/i;
const NUM_FINAL = /\s*\(\s*\d+\s*\)\s*$/;               // "nome (2)"

/** Nome comparável: sem acento, sem {TAG}, sem "— Cópia", caixa/espaço normalizados. */
export function normalizarNome(nome: string): string {
    let s = (nome || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/\{[^}]*\}/g, " ");                     // {MKT}, {CRB}, {TYPE}…
  s = s.replace(/[\u2013\u2014]/g, "-");                // travessões → hífen
  let antes: string;
  do { antes = s; s = s.replace(SUFIXOS, "").replace(NUM_FINAL, ""); } while (s !== antes);
  s = s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  return s || (nome || "").trim().toLowerCase();
}

/** Ano do anúncio (safra). `anoPadrao` entra quando a Meta não devolveu created_time. */
export function safraDe(a: Pick<AdRow, "criadoEm">, anoPadrao: number): number {
  if (a.criadoEm) {
    const t = new Date(a.criadoEm);
    const y = t.getUTCFullYear();
    if (Number.isFinite(y) && y > 2000) return y;
  }
  return anoPadrao;
}

/** Chave estável do criativo — é ela que carrega tags/editor no banco. */
export function chaveCriativo(a: AdRow, anoPadrao: number): string {
  return `${normalizarNome(a.name)}@${safraDe(a, anoPadrao)}`;
}

export interface GrupoCriativo extends AdMetrics {
  chave: string;
  nome: string;                 // nome de exibição (o mais frequente do grupo)
  safra: number;
  tipo: "video" | "imagem";
  thumb: string | null;
  permalink: string | null;
  videoId: string | null;
  ads: AdRow[];                 // anúncios que compõem o grupo
  anuncios: number;             // quantos ids
  campanhas: string[];          // campanhas distintas em que rodou
  contas: string[];
  conflito: boolean;            // mesmo nome+safra com criativos visualmente distintos
  categoria: string | null;
  tagsMeta: string[];           // tags {XXX} herdadas do nome da campanha
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);

/** Junta os anúncios em grupos por `chaveCriativo`, somando as métricas. */
export function agruparCriativos(ads: AdRow[], anoPadrao: number): GrupoCriativo[] {
  const mapa = new Map<string, AdRow[]>();
  for (const a of ads) {
    const k = chaveCriativo(a, anoPadrao);
    const arr = mapa.get(k);
    if (arr) arr.push(a); else mapa.set(k, [a]);
  }

  const grupos: GrupoCriativo[] = [];
  for (const [chave, itens] of mapa) {
    // Somas cruas. `reach` é DEDUPLICADO pela Meta — somar superestima; mantemos
    // a soma só pra frequência não explodir, e a tela não exibe alcance no grupo.
    let spend = 0, impressions = 0, reach = 0, clicks = 0, purchases = 0, revenue = 0, leads = 0;
    let lpv = 0, addCart = 0, checkout = 0;
    for (const a of itens) {
      spend += a.spend; impressions += a.impressions; reach += a.reach; clicks += a.clicks;
      purchases += a.purchases; revenue += a.revenue; leads += a.leads;
      lpv += a.lpv ?? 0; addCart += a.addCart ?? 0; checkout += a.checkout ?? 0;
    }
    // Nome de exibição: o mais frequente (desempata pelo maior gasto).
    const freq = new Map<string, { n: number; spend: number }>();
    for (const a of itens) {
      const e = freq.get(a.name) || { n: 0, spend: 0 };
      e.n++; e.spend += a.spend; freq.set(a.name, e);
    }
    const nome = [...freq.entries()].sort((x, y) => y[1].n - x[1].n || y[1].spend - x[1].spend)[0][0];
    // Representante visual: o anúncio de maior gasto que tenha thumb.
    const porGasto = [...itens].sort((a, b) => b.spend - a.spend);
    const rep = porGasto.find((a) => a.thumb) || porGasto[0];
    const videoIds = new Set(itens.map((a) => a.videoId).filter(Boolean) as string[]);
    // Conflito = criativos DIFERENTES sob o mesmo nome+safra. Vídeo: ids distintos.
    // Imagem: thumbs de origem distinta (compara o caminho, sem a query assinada).
    const thumbsBase = new Set(itens.map((a) => baseDaThumb(a.thumb)).filter(Boolean) as string[]);
    const conflito = videoIds.size > 1 || (videoIds.size === 0 && thumbsBase.size > 1);

    grupos.push({
      chave,
      nome,
      safra: safraDe(rep, anoPadrao),
      tipo: itens.some((a) => a.tipo === "video") ? "video" : "imagem",
      thumb: rep?.thumb ?? null,
      permalink: porGasto.find((a) => a.permalink)?.permalink ?? null,
      videoId: rep?.videoId ?? null,
      ads: porGasto,
      anuncios: itens.length,
      campanhas: [...new Set(itens.map((a) => a.campaign).filter(Boolean))],
      contas: [...new Set(itens.map((a) => a.account).filter(Boolean))],
      conflito,
      categoria: itens.find((a) => a.categoria)?.categoria ?? null,
      tagsMeta: [...new Set(itens.flatMap((a) => a.tags || []))],
      // ── métricas derivadas (recalculadas do agregado, nunca médias de médias)
      spend, impressions, reach, clicks, purchases, revenue, leads,
      frequency: reach > 0 ? impressions / reach : 0,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: div(spend, clicks) ?? 0,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
      roas: div(revenue, spend),
      cpa: div(spend, purchases),
      cpl: div(spend, leads),
      lpv, addCart, checkout,
    });
  }
  return grupos;
}

/** Caminho da thumb sem query assinada — serve pra comparar origem entre anúncios. */
export function baseDaThumb(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.pathname || null;
  } catch {
    return url.split("?")[0] || null;
  }
}

// ── Marcas do usuário (tags + editor) ───────────────────────────────────────
// Guardadas por CHAVE do grupo, não por ad.id — é o que faz a marcação
// sobreviver à troca de anúncio (duplicar campanha não perde a tag).
export interface MarcaCriativo { chave: string; editor: string | null; tags: string[] }

const EDITORES_POR_CODIGO: Record<string, string> = {
  B: "Beatriz",
  G: "Gustavo",
  L: "Leticia",
};

function codigosDe(textos: string[]): string[] {
  return textos.flatMap((texto) => [...texto.matchAll(/\{\s*([^}]+?)\s*\}/g)].map((match) => match[1].toUpperCase()));
}

/** Marcações herdadas da convenção usada nos nomes do criativo/campanha. */
export function inferirMarcaCriativo(g: GrupoCriativo): MarcaCriativo {
  const codigos = codigosDe([g.nome, ...g.ads.map((ad) => ad.name), ...g.campanhas]);
  const editor = codigos.map((codigo) => EDITORES_POR_CODIGO[codigo]).find(Boolean) ?? null;
  return { chave: g.chave, editor, tags: codigos.includes("CH") ? ["Chancela"] : [] };
}

/** O que foi escolhido manualmente prevalece; tags automáticas continuam visíveis. */
export function resolverMarcaCriativo(g: GrupoCriativo, manual?: MarcaCriativo): MarcaCriativo {
  const inferida = inferirMarcaCriativo(g);
  const tags = [...inferida.tags, ...(manual?.tags ?? [])]
    .filter((tag, index, all) => all.findIndex((item) => item.localeCompare(tag, "pt-BR", { sensitivity: "base" }) === 0) === index);
  return { chave: g.chave, editor: manual?.editor || inferida.editor, tags };
}

/** Texto pesquisável de um grupo: nome, campanhas, tags e editor. */
export function textoBusca(g: GrupoCriativo, m?: MarcaCriativo): string {
  return [g.nome, ...g.campanhas, ...g.tagsMeta, ...(m?.tags || []), m?.editor || "", g.categoria || ""]
    .join(" ")
    .toLowerCase();
}
