// Retrato de prova da aba Faturamento do Analytics.
//
// Mesmo motivo do `producao-sample`: a tela vive atrás de login e busca o ERP,
// então sem isto ninguém consegue OLHAR pra ela — e foi remanejando essa aba às
// cegas que eu desbalanceei o JSX duas vezes seguidas.
//
// Os números têm a forma do real e, principalmente, RESPEITAM A DEFINIÇÃO:
// geral = operação própria (comercial + tráfego + orgânico) + marketplace, com
// cada venda contada uma vez. X1 e "sem classificação" ficam fora do total de
// propósito — é exatamente essa a regra que a tela existe pra deixar visível.

import type { VendasSnapshot, DayPoint } from "@/lib/vendas";
import type { CategoriaVenda } from "@/lib/produtos-vendidos";

const DIAS = 21;

/** Série determinística (sem Math.random: dois retratos diferentes esconderiam
 *  regressão de layout) com fim de semana afundado. */
function serie(base: number, semente: number): DayPoint[] {
  return Array.from({ length: DIAS }, (_, i) => {
    const d = new Date(2026, 7, i + 1);
    const fds = d.getDay() === 0 || d.getDay() === 6;
    const ruido = ((i * 29 + semente * 17) % 13) - 6;
    return { day: d.toISOString().slice(0, 10), value: Math.max(0, Math.round((base + ruido * 40) * (fds ? 0.3 : 1))) };
  });
}

const somar = (s: DayPoint[]) => s.reduce((a, p) => a + p.value, 0);

const serieComercial = serie(1650, 1);
const serieTrafego = serie(980, 2);
const serieMarketplace = serie(420, 3);

const comercialR = somar(serieComercial);
const trafegoR = somar(serieTrafego);
const organicoR = 8420;
const marketplaceR = somar(serieMarketplace);
const propria = comercialR + trafegoR + organicoR;

const t = (revenue: number, count: number) => ({ revenue, count, ticket: count > 0 ? Math.round(revenue / count) : 0 });

export const VENDAS_EXEMPLO: VendasSnapshot = {
  updatedAt: "2026-08-21T13:40:00.000Z",
  periodLabel: "este mês",
  geral: t(propria + marketplaceR, 512),
  comercial: {
    total: t(comercialR, 268),
    fonte: "planilha",
    planilha: t(comercialR, 268),
    upsell: t(3140, 22),
    ranking: [
      { id: "1", nome: "Paola", foto: null, value: 11420, count: 96 },
      { id: "2", nome: "Vitoria Tostes", foto: null, value: 9860, count: 84 },
      { id: "3", nome: "Mariana Rosetto", foto: null, value: 6310, count: 52 },
      { id: "4", nome: "Emanuelly", foto: null, value: 1980, count: 21 },
    ],
    series: serieComercial,
    topProdutos: [
      { nome: "Carimbo automático 38×14", qtd: 118, valor: 7420 },
      { nome: "Chancela mecânica", qtd: 74, valor: 5180 },
      { nome: "Carimbo de bolso 30×10", qtd: 61, valor: 3240 },
      { nome: "Refil de tinta preta", qtd: 143, valor: 1720 },
      { nome: "Almofada azul", qtd: 88, valor: 1140 },
    ],
  },
  marketing: {
    paid: t(trafegoR, 141),
    organic: t(organicoR, 58),
    // X1 é RECORTE do comercial, não canal: por isso ele não entra no `geral`.
    x1: t(4260, 34),
    x1Ranking: [
      { id: "5", nome: "Letícia Valentim", foto: null, value: 2980, count: 22 },
      { id: "6", nome: "Beatriz", foto: null, value: 1280, count: 12 },
    ],
    // Faturamento do tráfego = tráfego pago + X1, como no Tridify; ROAS, CPA e
    // lucro são contra o gasto com imposto (7.786), nunca contra a fatura crua.
    faturamentoTrafego: t(trafegoR + 4260, 175),
    spend: 6840, spendReal: 7786, roas: Math.round(((trafegoR + 4260) / 7786) * 100) / 100, cpa: 44.49, cpaMeta: 48.51, spendPrev: 6120,
    lucro: trafegoR + 4260 - 7786, margem: Math.round(((trafegoR + 4260 - 7786) / (trafegoR + 4260)) * 1000) / 10,
    // A Meta credita MAIS que o caixa registrou como tráfego (28.180 × 21.150):
    // é a janela de atribuição dela contando venda que a loja lançou noutro
    // canal. O retrato de prova nasce com a divergência de propósito — é
    // exatamente o bloco de reconciliação que a tela tem que saber desenhar.
    metaRevenue: 28180, metaPurchases: 141,
    pctReceita: 24.3, pctFaturamento: 12.8,
    faturamentoComMkt: propria,
    teto: 9000,
    grupos: [
      { tipo: "carimbo", contas: 3, gasto: 4980, gastoReal: 5669, vendasValor: 21400, vendasPedidos: 98, cpa: 57.85, lucro: 15731, roas: 3.77 },
      { tipo: "chancela", contas: 2, gasto: 1860, gastoReal: 2117, vendasValor: 6820, vendasPedidos: 43, cpa: 49.23, lucro: 4703, roas: 3.22 },
    ],
    contas: [
      { id: "act_1", nome: "Tridi · Carimbos", tipo: "carimbo", gasto: 3120, gastoReal: 3551, vendasValor: 14200, vendasPedidos: 62, cpa: 57.27, lucro: 10649, roas: 4 },
      { id: "act_2", nome: "Tridi · Chancelas", tipo: "chancela", gasto: 1860, gastoReal: 2117, vendasValor: 6820, vendasPedidos: 43, cpa: 49.23, lucro: 4703, roas: 3.22 },
      { id: "act_3", nome: "Tridi · Retargeting", tipo: "carimbo", gasto: 1860, gastoReal: 2117, vendasValor: 7200, vendasPedidos: 36, cpa: 58.81, lucro: 5083, roas: 3.4 },
    ],
    series: serieTrafego,
  },
  marketplace: {
    total: t(marketplaceR, 45),
    series: serieMarketplace,
    byPlatform: [
      { id: "shopee", nome: "Shopee", cor: "var(--perigo)", revenue: Math.round(marketplaceR * 0.52), count: 24, tipo: "marketplace" },
      { id: "ml", nome: "Mercado Livre", cor: "var(--perigo)", revenue: Math.round(marketplaceR * 0.33), count: 15, tipo: "marketplace" },
      { id: "tiktok", nome: "TikTok Shop", cor: "var(--perigo)", revenue: Math.round(marketplaceR * 0.15), count: 6, tipo: "marketplace" },
    ],
  },
  // Fora de todo total, de propósito: aparecer aqui é o convite pra classificar.
  outros: {
    total: t(1840, 9),
    byPlatform: [{ id: "vega", nome: "Vega", cor: "var(--neutro)", revenue: 1840, count: 9, tipo: "ignorar" }],
  },
  fontes: [
    { id: "carimbos-tridi", nome: "Carimbos Tridi", cor: "var(--roxo)", revenue: trafegoR, count: 141, tipo: "trafego" },
    { id: "yampi-org", nome: "Loja Yampi (orgânico)", cor: "var(--ok)", revenue: organicoR, count: 58, tipo: "organico" },
    { id: "shopee", nome: "Shopee", cor: "var(--perigo)", revenue: Math.round(marketplaceR * 0.52), count: 24, tipo: "marketplace" },
    { id: "ml", nome: "Mercado Livre", cor: "var(--perigo)", revenue: Math.round(marketplaceR * 0.33), count: 15, tipo: "marketplace" },
    { id: "vega", nome: "Vega", cor: "var(--neutro)", revenue: 1840, count: 9, tipo: "ignorar" },
  ],
};

// ── Aba Produtos ─────────────────────────────────────────────────────────────
// Mesma razão dos outros retratos: a tela busca o ERP e ninguém conseguia
// olhar pra ela. Categorias com quebra por subtipo, pra o card exercitar a
// rosca E o "ver mais".

const cat = (categoria: string, icon: string, cor: string, grupos: { nome: string; itens: [string, number][] }[]): CategoriaVenda => {
  const gs = grupos.map((g) => ({
    nome: g.nome,
    total: g.itens.reduce((a, [, n]) => a + n, 0),
    itens: g.itens.map(([nome, total]) => ({ nome, total })),
  }));
  return { categoria, icon, cor, total: gs.reduce((a, g) => a + g.total, 0), grupos: gs };
};

export const PRODUTOS_EXEMPLO = {
  periodLabel: "este mês",
  total: 1486,
  totalPrev: 1312,
  deltaPct: 13.3,
  brindes: 42,
  descartados: 18,
  serie: serieComercial,
  categorias: [
    cat("Carimbos", "tools", "var(--cat-1)", [
      { nome: "Automático", itens: [["38×14", 218], ["58×22", 141], ["47×18", 96]] },
      { nome: "De bolso", itens: [["30×10", 132], ["40×15", 74]] },
    ]),
    cat("Chancelas", "vector-bezier", "var(--cat-2)", [
      { nome: "", itens: [["Mecânica", 164], ["Digital", 88], ["Dupla", 41]] },
    ]),
    cat("Tintas", "printer", "var(--cat-7)", [
      { nome: "Papel", itens: [["Preta", 143], ["Azul", 96]] },
      { nome: "Plástico", itens: [["Preta", 61], ["Vermelha", 34]] },
      { nome: "Isopor", itens: [["Preta", 22]] },
    ]),
    cat("Almofadas", "box", "var(--cat-3)", [
      { nome: "", itens: [["Azul", 88], ["Preta", 47]] },
    ]),
  ],
};
