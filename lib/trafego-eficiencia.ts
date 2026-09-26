// ── Eficiência do tráfego (conta PURA, sem servidor) ────────────────────────
// Mora aqui e não em `lib/trafego-vendas.ts` pelo mesmo motivo de
// `lib/marketing-const.ts`: aquele arquivo importa Supabase/ERP e portanto
// `next/headers`. Qualquer client component que precisasse SÓ desta conta
// arrastava o módulo de servidor inteiro pro bundle e o build quebrava com
// "You're importing a module that depends on next/headers".
//
// Regra: conta pura entra aqui; o que lê banco/rede fica no trafego-vendas, que
// re-exporta daqui — continua havendo UMA fonte só.
import { IMPOSTO_GASTO_PCT } from "@/lib/marketing-const";
import type { CustosConfig } from "@/lib/marketing-config";

// Toda a conta de dinheiro do painel mora aqui, longe de rede e de banco, pra
// poder ser travada por teste. As DUAS definições, ditadas pelo usuário:
//
//   ROAS  = faturamentoTrafego ÷ gastoComImposto
//   LUCRO = faturamentoTrafego − gastoComImposto
//
// Ou seja: só o que o anúncio trouxe contra só o que o anúncio custou, e o
// custo do anúncio é a fatura do Meta MAIS o imposto de importação (a fatura
// crua não é o que sai do caixa). O lucro NÃO desconta produto/imposto/
// gateway/custo fixo — esses continuam calculados em `custos` pra quem quiser
// mostrar, mas ficam fora da conta.
//
// Os outros ROAS existem porque medem coisas diferentes e são rotulados como
// tais na tela: MER é blended (a empresa inteira ÷ o anúncio), `roasMeta` é a
// receita que o pixel atribui e `roasReal` é a atribuída por tag_utm.
export function eficienciaTrafego(e: {
  faturamentoTrafego: number; pedidosTrafego: number;
  faturamentoEmpresa: number; faturamentoPago: number;
  gasto: number; metaRevenue: number; custos: CustosConfig;
}): {
  gastoComImposto: number; custos: number; lucro: number; cpa: number | null;
  margem: number | null; roas: number | null; roi: number | null; mer: number | null;
  roasMeta: number | null; roasReal: number | null; roasEquilibrio: number | null;
} {
  const c = e.custos;
  const gastoComImposto = e.gasto * (1 + IMPOSTO_GASTO_PCT / 100);
  // Custos da operação: seguem apurados (a aba Lucro & custos os mostra na
  // composição), mas NÃO entram no lucro — ver a definição no topo.
  const custos = e.faturamentoTrafego * (c.produtoPct + c.impostoPct + c.gatewayPct) / 100 + c.custoFixo * e.pedidosTrafego;
  const lucro = e.faturamentoTrafego - gastoComImposto;
  const porGasto = (n: number) => (gastoComImposto > 0 ? n / gastoComImposto : null);
  return {
    gastoComImposto, custos, lucro,
    cpa: e.pedidosTrafego > 0 ? gastoComImposto / e.pedidosTrafego : null,
    margem: e.faturamentoTrafego > 0 ? (lucro / e.faturamentoTrafego) * 100 : null,
    roas: porGasto(e.faturamentoTrafego),   // O ROAS. Os de baixo são outros recortes.
    roi: porGasto(lucro),
    mer: porGasto(e.faturamentoEmpresa),
    roasMeta: porGasto(e.metaRevenue),
    roasReal: porGasto(e.faturamentoPago),
    // ROAS mínimo pra empatar CONSIDERANDO os custos da operação (produto,
    // imposto, gateway, fixo) — é a única métrica aqui que os usa. Serve pra
    // responder "a partir de que ROAS a venda se paga de verdade?", que o
    // ROAS acima, por definição, não responde.
    roasEquilibrio: e.faturamentoTrafego - custos > 0 ? e.faturamentoTrafego / (e.faturamentoTrafego - custos) : null,
  };
}

// A LINHA do card de ROAS, na MESMA base da manchete (ROAS = tráfego do ERP ÷
// gasto com imposto). O que existe por dia é o checkout do ERP (serieDia) e o
// gasto do armazém do Meta — que é sabidamente incompleto e não tem o imposto.
// Então o gasto diário entra só como PROPORÇÃO: reescalado por um fator único
// pra que a soma dos dias feche com o gasto+imposto do período. Agregada, a
// série devolve exatamente o número da manchete; dia a dia, preserva o desenho.
// Sem isso o card mostrava 0,88× na manchete com a curva do PIXEL em 1,45× —
// duas definições de ROAS no mesmo retângulo.
export function serieRoasReal(
  serieMeta: { day: string; spend: number }[],
  serieDia: { d: string; trafego: number }[],
  gastoComImposto: number,
): (number | null)[] {
  return serieDiariaContraGasto(serieMeta, serieDia, (p) => p.trafego, gastoComImposto, (fat, gasto) => fat / gasto);
}

/**
 * Valor do ERP, dia a dia, no EIXO DE DIAS do Meta.
 *
 * As duas séries vêm de fontes diferentes (o painel desenha pelo eixo do Meta,
 * o dinheiro real vem do ERP) e podem ter dias que a outra não tem. Casar por
 * data em vez de por índice é o que impede a linha de andar um dia — o defeito
 * clássico de sparkline de dashboard, que ninguém percebe porque a curva
 * continua "parecendo certa".
 */
export function serieDoERP<P extends { d: string }>(
  serieMeta: { day: string }[],
  serieDia: P[],
  campo: (p: P) => number,
): (number | null)[] {
  const porDia = new Map(serieDia.map((p) => [p.d, campo(p)]));
  return serieMeta.map((p) => porDia.get(p.day) ?? null);
}

/**
 * Razão diária entre um valor do ERP e o GASTO daquele dia — a forma de todo
 * ROAS/MER/margem/lucro por dia.
 *
 * O gasto do dia sai da série do Meta REESCALADA: a fatura crua do Meta não é
 * o que sai do caixa (falta o imposto de importação), e o total com imposto é
 * o único número confiável. Reescalar o dia pela proporção do total mantém o
 * formato da curva e faz a soma bater com o KPI do topo — sem isso, a linha
 * conta uma história e a manchete conta outra.
 *
 * Dia sem gasto vira `null` (buraco na linha, não zero): razão de gasto zero
 * não existe, e o 0 desenhava um penhasco falso. Dia COM gasto e sem venda é
 * zero de verdade — o anúncio custou e não trouxe.
 *
 * E a diferença entre esses dois zeros é a razão do primeiro `if`: "vendeu
 * zero" e "não tenho a série de vendas desta janela" caem no mesmo `?? 0` e
 * saem como uma linha reta no chão — um gráfico afirmando que a operação não
 * faturou nada. Sem NENHUM dia em comum entre as duas séries não há o que
 * desenhar, e a resposta honesta é linha nenhuma.
 */
export function serieDiariaContraGasto<P extends { d: string }>(
  serieMeta: { day: string; spend: number }[],
  serieDia: P[],
  campo: (p: P) => number,
  gastoComImposto: number,
  conta: (valor: number, gastoDoDia: number) => number,
): (number | null)[] {
  const somaSpend = serieMeta.reduce((s, p) => s + (p.spend > 0 ? p.spend : 0), 0);
  if (somaSpend <= 0 || gastoComImposto <= 0) return serieMeta.map(() => null);
  const porDia = new Map(serieDia.map((p) => [p.d, campo(p)]));
  if (!serieMeta.some((p) => porDia.has(p.day))) return serieMeta.map(() => null);
  const fator = gastoComImposto / somaSpend;
  return serieMeta.map((p) => (p.spend > 0 ? conta(porDia.get(p.day) ?? 0, p.spend * fator) : null));
}
