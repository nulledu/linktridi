// ── Constantes de marketing SEM dependência de servidor ─────────────────────
// Existe separado de `lib/marketing-config.ts` de propósito: aquele importa
// `lib/supabase/server.ts`, que usa `next/headers` e só pode rodar em Server
// Component. Client components (PainelPersonalizavel, LucroView) precisavam só
// da constante e acabavam arrastando o módulo de servidor inteiro pro bundle —
// o build quebrava com "You're importing a module that depends on next/headers".
//
// Regra: valor puro entra aqui; qualquer coisa que leia banco/env fica no
// marketing-config. `marketing-config` re-exporta daqui, então continua havendo
// UMA fonte só.

// Imposto de IMPORTAÇÃO cobrado na fatura de anúncios do Meta (sobre o GASTO).
// NÃO confundir com custosConfig.impostoPct, que incide sobre a RECEITA. O custo
// real do anúncio é gasto × (1 + IMPOSTO_GASTO_PCT/100).
export const IMPOSTO_GASTO_PCT = 13.83;

/**
 * O que o anúncio REALMENTE custou: fatura do Meta + imposto de importação.
 *
 * É este o denominador de todo ROAS/CPA — a fatura crua não é o que sai do
 * caixa, e medir eficiência contra ela infla o retorno em ~14%. O painel de TV
 * dividia pela fatura crua e mostrava um ROAS diferente do que o Tridify
 * mostrava para o mesmo mês; dois números discordando na mesma empresa é pior
 * do que um número faltando.
 *
 * `impostoPct` vem da configuração ("Imposto do tráfego (%)" em Administração →
 * Painéis); sem valor, cai na constante.
 */
export function gastoComImposto(gasto: number, impostoPct: number = IMPOSTO_GASTO_PCT): number {
  const pct = Number.isFinite(impostoPct) ? impostoPct : IMPOSTO_GASTO_PCT;
  return gasto * (1 + pct / 100);
}

/** Uma conta (ou grupo de contas) de anúncio medida como o Tridify mede. */
export interface ContaAgregada {
  gasto: number;        // fatura crua do Meta
  custo: number;        // fatura + imposto de importação (o que sai do caixa)
  vendas: number;       // compras que a Meta atribui à conta
  receita: number;      // receita que a Meta atribui à conta
  lucro: number;        // receita − custo
  roas: number | null;  // receita ÷ custo
  cpa: number | null;   // custo ÷ vendas
}

/**
 * A conta POR CONTA de anúncio: a do widget "BMs e contas" do Tridify.
 *
 * Mora aqui, e não no widget, porque o Analytics mostra a mesma tabela. Até
 * 12/09/2026 cada tela tinha a sua: o Analytics dividia pela fatura crua (ROAS
 * ~14% melhor e CPA ~14% menor que o Tridify) e as duas discordavam na mesma
 * conta, no mesmo mês. Agrupar é somar gasto/vendas/receita e chamar de novo —
 * nunca somar ROAS.
 */
export function agregarConta(spend: number, purchases: number, revenue: number): ContaAgregada {
  const custo = gastoComImposto(spend);
  return {
    gasto: spend, custo, vendas: purchases, receita: revenue,
    lucro: revenue - custo,
    roas: custo > 0 ? revenue / custo : null,
    cpa: purchases > 0 ? custo / purchases : null,
  };
}
