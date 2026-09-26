// ── Módulo Vendas — separa por canal: Comercial, Tráfego pago, Orgânico,
// Marketplace. Alimenta o Analytics (abas "Faturamento" e "Setores").
//
// A CLASSIFICAÇÃO NÃO MORA AQUI. Ela mora no Tridify (`snapshotVendas`, em
// lib/trafego-vendas.ts), e este módulo só recorta o que a tela mostra.
//
// Antes este arquivo tinha a própria classificação, e o resultado (medido em
// 01–07/ago/26 contra o ERP) era um faturamento de R$ 85.305 onde o Tridify
// media R$ 57.112 — 49% a mais. Quatro causas, todas por reimplementar o que
// já estava resolvido:
//
//  1. A Vega (plataforma 8) contava DUAS vezes: uma como "tráfego pago" (é o
//     que a config diz) e outra em "Outros", porque o balde de Outros excluía
//     só as plataformas 6/3/5 escritas no código. R$ 16.322,74 e 57 pedidos
//     em dobro.
//  2. Do mapa de origens (`fontes`) só se lia "trafego" e "organico". As
//     plataformas que o usuário classificou como COMERCIAL (WhatsApp, Carrinho
//     Ab, PIX) apareciam como "Outros", e a loja Yampi classificada como
//     MARKETPLACE desaparecia de todos os totais — marketplace era a
//     plataforma 3, fixa no código.
//  3. A Yampi entrava por `preco_yampi` (o que o cliente fechou no checkout) e
//     a diferença até `preco_total` — o upsell que a vendedora fez depois,
//     R$ 7,9 mil em sete dias — não ia pra ninguém.
//  4. Somava-se o livro das vendedoras (vendas_planilha) INTEIRO por cima da
//     receita cheia das plataformas. Dessas 212 linhas de agosto, 146 têm
//     `obs = Yampi`: é o mesmo dinheiro, contado outra vez.
//
// Regra desta tela, daqui pra frente: canal novo se configura na tela de
// Fontes do Tridify; aqui não se escreve `if (plataforma === …)`.

import { resolvePeriod, type Range } from "@/lib/period";
import { getMetaPeriodSpend } from "@/lib/meta";
import { getMarketingConfig, type ContaTipo, type ComercialFonte, type FonteTipo } from "@/lib/marketing-config";
import { snapshotVendas } from "@/lib/trafego-vendas";
import { buildVendedorasSnapshot } from "@/lib/vendedoras";
import { vendasGeral } from "@/lib/comercial-pedidos";
import { agregarConta } from "@/lib/marketing-const";

export interface DayPoint { day: string; value: number }
export interface RankRow { id: string; nome: string; foto: string | null; value: number; count: number }
export interface ChannelTotals { revenue: number; count: number; ticket: number }
/** Uma origem de venda (loja da Yampi ou plataforma do ERP) no período. */
export interface PlatformRow { id: string; nome: string; cor: string; revenue: number; count: number; tipo: FonteTipo }
export interface MktConta {
  id: string; nome: string; tipo: ContaTipo | null;
  gasto: number; gastoReal: number;
  vendasValor: number; vendasPedidos: number; cpa: number | null; lucro: number; roas: number | null;
}
export interface MktGrupo {
  tipo: ContaTipo; contas: number; gasto: number; gastoReal: number;
  vendasValor: number; vendasPedidos: number;
  cpa: number | null; lucro: number; roas: number | null;
}

/**
 * O mesmo recorte do período ANTERIOR — só as manchetes.
 *
 * Só as manchetes de propósito: o snapshot inteiro do anterior traria ranking,
 * séries e origens que ninguém compara linha a linha, e dobraria o tamanho da
 * resposta pra nada. Quem precisa da série do anterior é o gráfico, e ele já a
 * recebe pela rota da Operação.
 */
export interface VendasAnterior {
  revenue: number;
  count: number;
  comercial: number;
  paid: number;
  organic: number;
  marketplace: number;
  spend: number | null;
  roas: number | null;
}

export interface VendasSnapshot {
  updatedAt: string;
  periodLabel: string;
  /** Presente só quando a rota é chamada com `?comparar=1`. */
  anterior?: VendasAnterior;
  /**
   * Faturamento da EMPRESA = operação própria + MARKETPLACE (Shopee, Mercado
   * Livre, TikTok Shop). Desde 01/09/2026 é o MESMO `faturamentoEmpresa` do
   * Tridify e da TV — pedido do dono: um número só nas três telas. O que o
   * Tridify ainda separa é a operação própria, contra a qual julga o anúncio.
   *
   * Cada venda continua contada UMA vez: os quatro canais vêm dos baldes
   * exclusivos de `snapshotVendas`. Origem sem classificação segue fora (não
   * se sabe o que ela é) e o X1 também (já está no canal de origem).
   */
  geral: ChannelTotals;
  comercial: {
    total: ChannelTotals;                 // o que entra no `geral`, conforme `fonte`
    fonte: ComercialFonte;                // de onde o total saiu (config do Tridify)
    planilha: ChannelTotals;              // livro das vendedoras (vendas_planilha)
    upsell: ChannelTotals;                // fatia de checkout vendida a mais na conversa
    ranking: RankRow[];                   // por vendedora — sempre o livro da planilha
    series: DayPoint[];
    topProdutos: { nome: string; qtd: number; valor: number }[];
  };
  marketing: {
    paid: ChannelTotals; organic: ChannelTotals;
    /**
     * Marketing X1 (venda do comercial com fonte Facebook). NÃO é um canal a
     * somar: o pedido já está no balde da plataforma dele. Serve pra medir
     * quanto do comercial veio de anúncio — é o recorte que entra no
     * `faturamentoTrafego` do ROAS, não no faturamento da empresa.
     */
    x1: ChannelTotals; x1Ranking: RankRow[];
    /**
     * OS NÚMEROS DO TRIDIFY, lidos do mesmo snapshot — esta tela não os refaz.
     * Até 12/09/2026 ela refazia: abria com uma "receita do marketing" (tráfego
     * + orgânico) que o Tridify não tem, dividia o CPA pela fatura crua e pelas
     * compras da Meta (R$ 120 onde o Tridify dá R$ 164) e fixava o imposto em
     * 1,1383 no código. Cada campo abaixo é um cartão do Tridify:
     *
     *   faturamentoTrafego → "Faturamento do tráfego" (tráfego pago + X1)
     *   spend              → "Investimento" (fatura crua do Meta)
     *   spendReal          → "Gasto + imposto"
     *   roas               → "ROAS" (faturamento do tráfego ÷ gasto + imposto)
     *   lucro / margem     → "Lucro" (faturamento do tráfego − gasto + imposto)
     *   cpa                → gasto + imposto ÷ pedidos do tráfego
     */
    faturamentoTrafego: ChannelTotals;
    spend: number | null; spendReal: number | null; roas: number | null; cpa: number | null;
    lucro: number; margem: number | null;
    /** CPA pela régua da Meta: fatura ÷ compras atribuídas (o cartão "CPA" do panorama). */
    cpaMeta: number | null;
    spendPrev: number | null;      // gasto do período anterior (Δ)
    /**
     * O que a META credita aos anúncios no período — a janela de atribuição
     * dela, NÃO o caixa. Fica ao lado de `paid` (o que a loja registrou como
     * venda de tráfego) porque as duas medem coisas diferentes e a diferença
     * entre elas é a pergunta mais cara desta tela: sem os dois números lado a
     * lado, alguém soma um deles ao faturamento e conta a mesma venda 2×.
     *
     * Já existia no cálculo (é a base do `roas`), só não saía no snapshot; a
     * tela derivava `spend × roas`, que erra pelo arredondamento de 2 casas.
     */
    metaRevenue: number; metaPurchases: number;
    pctReceita: number | null;     // % do gasto sobre a receita atribuída (Meta)
    pctFaturamento: number | null; // % do gasto sobre a operação própria (sem marketplace)
    /**
     * Operação PRÓPRIA: tráfego + orgânico + comercial, SEM marketplace — é o
     * `operacaoPropriaValor` do Tridify. Fica separado do `geral` porque medir
     * o gasto de anúncio contra receita de marketplace (que o anúncio não
     * trouxe) é o erro que já inflou o ROAS aqui.
     */
    faturamentoComMkt: number;
    teto: number;                  // teto de gasto definido pelo admin
    grupos: MktGrupo[];            // totais por tipo (carimbo / chancela)
    contas: MktConta[];            // gasto por conta do Facebook
    series: DayPoint[];
  };
  /** DENTRO do `geral` (Shopee, Mercado Livre, TikTok Shop). Fora só no Tridify. */
  marketplace: { total: ChannelTotals; series: DayPoint[]; byPlatform: PlatformRow[] };
  /**
   * Origens que existem no período e estão marcadas como "ignorar" (ou nunca
   * foram classificadas). Ficam FORA de todo total, de propósito: aparecer aqui
   * é o convite pra classificá-las na tela de Fontes. Antes este balde era
   * "todas as plataformas menos três", e era onde a Vega entrava pela segunda vez.
   */
  outros: { total: ChannelTotals; byPlatform: PlatformRow[] };
  /** Cada origem do período com o tipo que a config deu — o "de onde veio" cru. */
  fontes: PlatformRow[];
}

const totals = (revenue: number, count: number): ChannelTotals => ({ revenue: Math.round(revenue), count, ticket: count > 0 ? Math.round(revenue / count) : 0 });

/**
 * Faturamento da EMPRESA = o `faturamentoEmpresa` do Tridify, que desde
 * 01/09/2026 já traz o marketplace por dentro (operação própria + marketplace).
 *
 * Função pura e exportada de propósito: é A definição do número que abre a
 * tela. Ela NÃO soma o marketplace de novo — somar aqui o que o snapshot já
 * somou é exatamente a venda contada duas vezes que "por que o Analytics e o
 * Tridify mostram números diferentes?" já custou um retrabalho inteiro.
 *
 * O que fica fora: origem marcada "ignorar" (não se sabe o que é) e o X1 (é um
 * recorte do comercial, já contado no canal de origem).
 */
export function faturamentoDaEmpresa(t: { faturamentoEmpresa: number; pedidosEmpresa: number }): ChannelTotals {
  return totals(t.faturamentoEmpresa, t.pedidosEmpresa);
}

// Cor por tipo de origem — a mesma linguagem de cor das abas do Analytics.
const COR_TIPO: Record<FonteTipo, string> = {
  trafego: "var(--roxo)", comercial: "var(--primary-texto)", organico: "var(--ok)",
  marketplace: "var(--perigo)", ignorar: "var(--neutro)",
};

export async function buildVendasSnapshot(range?: Range, now = new Date()): Promise<VendasSnapshot> {
  const r = range ?? resolvePeriod("mes", null, null, now);

  const [tri, vend, meta, mktCfg, comGeral] = await Promise.all([
    // A classificação de canal — uma origem, um balde, sem dupla contagem.
    snapshotVendas(r.fromDate, r.toDate),
    // O livro das vendedoras: ranking e itens do comercial.
    buildVendedorasSnapshot(r, now),
    // Contas do Facebook (o snapshot do Tridify só expõe o gasto somado).
    getMetaPeriodSpend(r.fromDate, r.toDate),
    getMarketingConfig(),
    // Só pelo ranking do X1; os VALORES do X1 vêm do Tridify.
    vendasGeral(r).catch(() => null),
  ]);

  // ── Séries diárias: todas recortadas da MESMA série do Tridify, alinhadas aos
  // dias do período (dia sem venda vira zero, senão o gráfico "pula" o dia).
  const doDia = new Map(tri.serieDia.map((x) => [x.d, x]));
  const serie = (campo: "trafego" | "organico" | "comercial" | "marketplace"): DayPoint[] =>
    r.days.map((day) => ({ day, value: Math.round(doDia.get(day)?.[campo] ?? 0) }));

  // ── Comercial ──
  const comRanking: RankRow[] = vend.vendedoras
    .map((v) => ({ id: v.id, nome: v.nome, foto: v.foto, value: v.liquido, count: v.vendas }))
    .sort((a, b) => b.value - a.value).slice(0, 12);

  // ── Origens do período, cada uma com o tipo que a config deu ──
  const fontes: PlatformRow[] = tri.fontesResumo.map((f) => ({
    id: f.chave, nome: f.label, tipo: f.tipo, cor: COR_TIPO[f.tipo], revenue: Math.round(f.valor), count: f.pedidos,
  }));
  const doTipo = (t: FonteTipo) => fontes.filter((f) => f.tipo === t);
  const semClass = fontes.filter((f) => f.tipo === "ignorar");

  // ── Marketing — a manchete é o Tridify, campo a campo (ver o tipo) ──
  // `meta` só entra pelo que o snapshot do Tridify não expõe: o gasto do
  // período anterior e as contas. Gasto, ROAS, CPA e lucro são os do Tridify,
  // arredondados só pra tela.
  const r2 = (n: number | null) => (n == null ? null : Math.round(n * 100) / 100);
  const temGasto = !!meta || tri.gasto > 0;
  const spend = temGasto ? Math.round(tri.gasto) : null;
  const spendPrev = meta ? meta.prev : null;
  const spendReal = temGasto ? Math.round(tri.gastoComImposto) : null;
  const metaRevenue = Math.round(tri.metaRevenue);        // receita atribuída pela Meta
  const metaPurchases = meta ? meta.totalPurchases : 0;
  const roas = r2(tri.roas);
  const cpa = r2(tri.cpaTrafego);
  const cpaMeta = spend && metaPurchases > 0 ? r2(spend / metaPurchases) : null;
  const pctReceita = spend && metaRevenue > 0 ? Math.round((spend / metaRevenue) * 1000) / 10 : null;
  // Operação própria (sem marketplace) — base do % de gasto do anúncio.
  const operacaoPropria = Math.round(tri.operacaoPropriaValor);
  const pctFaturamento = spend && operacaoPropria > 0 ? Math.round((spend / operacaoPropria) * 1000) / 10 : null;

  // Contas com gasto no período, classificadas (carimbo/chancela) pelo admin.
  // Vendas e receita são as que a Meta atribui à conta; ROAS, CPA e lucro saem
  // de `agregarConta` — a MESMA conta do widget "BMs e contas" do Tridify.
  const contas: MktConta[] = (meta?.accounts || []).map((a) => {
    const ag = agregarConta(a.spend, a.purchases, a.revenue);
    return {
      id: a.id, nome: a.name, tipo: mktCfg.contas[a.id] ?? null,
      gasto: a.spend, gastoReal: Math.round(ag.custo),
      vendasValor: a.revenue, vendasPedidos: a.purchases,
      cpa: r2(ag.cpa), lucro: Math.round(ag.lucro), roas: r2(ag.roas),
    };
  });

  // Totais por grupo: soma gasto/vendas/receita e mede de novo — nunca soma ROAS.
  const grupoBase = (tipo: ContaTipo): MktGrupo => {
    const gs = contas.filter((c) => c.tipo === tipo);
    const gasto = gs.reduce((s, c) => s + c.gasto, 0);
    const vendasValor = gs.reduce((s, c) => s + c.vendasValor, 0);
    const vendasPedidos = gs.reduce((s, c) => s + c.vendasPedidos, 0);
    const ag = agregarConta(gasto, vendasPedidos, vendasValor);
    return {
      tipo, contas: gs.length, gasto, gastoReal: Math.round(ag.custo), vendasValor, vendasPedidos,
      cpa: r2(ag.cpa), lucro: Math.round(ag.lucro), roas: r2(ag.roas),
    };
  };
  const grupos: MktGrupo[] = [grupoBase("carimbo"), grupoBase("chancela")];

  const x1Ranking: RankRow[] = (comGeral?.x1.perVendedor ?? [])
    .map((v) => ({ id: v.user_id || v.nome, nome: v.nome, foto: null, value: Math.round(v.faturamento), count: v.pedidos }))
    .sort((a, b) => b.value - a.value).slice(0, 12);

  return {
    updatedAt: now.toISOString(),
    periodLabel: r.label,
    geral: faturamentoDaEmpresa(tri),
    comercial: {
      total: totals(tri.comercialValor, tri.comercialPedidos),
      fonte: tri.comercialFonte,
      planilha: totals(vend.total.liquido, vend.total.vendas),
      upsell: totals(tri.comercialUpsellValor, tri.comercialUpsellN),
      ranking: comRanking,
      series: serie("comercial"),
      // Itens do livro do comercial (planilha) — a mesma base do ranking.
      topProdutos: vend.produtos.map((p) => ({ nome: p.nome, qtd: p.count, valor: p.valor })),
    },
    marketing: {
      paid: totals(tri.trafegoValor, tri.trafegoN),
      organic: totals(tri.organicoValor, tri.organicoN),
      x1: totals(tri.faturamentoX1, tri.pedidosX1), x1Ranking,
      faturamentoTrafego: totals(tri.faturamentoTrafego, tri.pedidosTrafego),
      spend, spendReal, roas, cpa, cpaMeta, spendPrev, metaRevenue, metaPurchases, pctReceita, pctFaturamento,
      lucro: Math.round(tri.lucro), margem: tri.margem == null ? null : Math.round(tri.margem * 10) / 10,
      faturamentoComMkt: operacaoPropria, teto: mktCfg.teto,
      grupos, contas, series: serie("trafego"),
    },
    marketplace: {
      total: totals(tri.marketplaceValor, tri.marketplaceN),
      series: serie("marketplace"),
      byPlatform: doTipo("marketplace"),
    },
    outros: {
      total: totals(semClass.reduce((s, f) => s + f.revenue, 0), semClass.reduce((s, f) => s + f.count, 0)),
      byPlatform: semClass,
    },
    fontes,
  };
}
