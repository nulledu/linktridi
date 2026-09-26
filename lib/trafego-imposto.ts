// ── "Com imposto" × "sem imposto" na Tridify ────────────────────────────────
// O custo real do anúncio é a fatura do Meta + imposto de importação
// (gastoComImposto em marketing-const). O snapshot de vendas já nasce COM
// imposto; o panorama do Meta (`AdsOverview`) e a análise de criativo nascem
// com a fatura CRUA. Esta chave põe as duas bases na mesma régua, a escolhida
// pela pessoa no topo da Tridify: com imposto (padrão) ou sem.
//
// A conversão é por NOME de campo, andando o objeto inteiro — assim campanha,
// conjunto, anúncio, série, tag, funil, mediana do benchmark e histórico do
// criativo entram sem cada tela lembrar. Custo (gasto, CPA, CPM, CPC, CPL)
// multiplica pelo fator; ROAS divide. Taxas (CTR, hook) e contagens não mudam,
// e o score do criativo também não: ele é relativo aos pares, que escalam juntos.
// Yampi fica fora: os widgets dela têm rota própria e não passam por aqui.

import { IMPOSTO_GASTO_PCT } from "./marketing-const";
import type { VendasSnapshot } from "./trafego-vendas";

const CUSTO = new Set(["spend", "prevSpend", "cpa", "cpm", "cpc", "cpl", "costPerInitiateCheckout"]);
const RETORNO = new Set(["roas"]);

/** Multiplicador do imposto: o que o snapshot usou, senão a constante. */
export function fatorImposto(v?: Pick<VendasSnapshot, "gasto" | "gastoComImposto"> | null): number {
  if (v && v.gasto > 0 && v.gastoComImposto > 0) return v.gastoComImposto / v.gasto;
  return 1 + IMPOSTO_GASTO_PCT / 100;
}

function andar(x: unknown, f: number): unknown {
  if (Array.isArray(x)) return x.map((i) => andar(i, f));
  if (!x || typeof x !== "object") return x;
  const o = x as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  // Insight do criativo guarda o valor ao lado do NOME da métrica.
  const metrica = typeof o.metric === "string" ? o.metric : null;
  for (const [k, val] of Object.entries(o)) {
    if (typeof val === "number") {
      if (CUSTO.has(k)) out[k] = val * f;
      else if (RETORNO.has(k)) out[k] = val / f;
      else if (metrica && (k === "currentValue" || k === "benchmarkValue")) out[k] = CUSTO.has(metrica) ? val * f : RETORNO.has(metrica) ? val / f : val;
      else out[k] = val;
    } else out[k] = andar(val, f);
  }
  return out;
}

/** Aplica o imposto em todo custo/ROAS da estrutura (panorama, payload de criativo…). */
export function comImposto<T>(x: T, fator: number): T {
  if (!Number.isFinite(fator) || fator === 1) return x;
  return andar(x, fator) as T;
}

/** O snapshot (que nasce COM imposto) medido contra a fatura crua. */
export function snapshotSemImposto(v: VendasSnapshot): VendasSnapshot {
  const g = v.gasto;
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  const lucro = v.faturamentoTrafego - g;
  return {
    ...v,
    gastoComImposto: g,
    roas: div(v.faturamentoTrafego, g),
    lucro,
    margem: div(lucro, v.faturamentoTrafego),
    roi: div(lucro, g),
    mer: div(v.faturamentoEmpresa, g),
    cpaTrafego: div(g, v.pedidosTrafego),
    roasMeta: div(v.metaRevenue, g),
  };
}
