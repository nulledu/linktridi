import { METRIC_DEFINITIONS } from "./metrics";
import type { CreativeBenchmark, CreativeInsight, CreativeInsightsResult, CreativeMetricKey, CreativeMetrics } from "./types";

function difference(current: number, benchmark: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(benchmark) || benchmark === 0) return 0;
  return ((current - benchmark) / Math.abs(benchmark)) * 100;
}

function relativeState(metrics: CreativeMetrics, benchmark: CreativeBenchmark, key: CreativeMetricKey): number | null {
  const current = metrics[key];
  const median = benchmark.medians[key];
  if (current == null || median == null) return null;
  const delta = difference(current, median);
  return METRIC_DEFINITIONS[key].direction === "lower" ? -delta : delta;
}

export function buildCreativeInsights(metrics: CreativeMetrics, benchmark: CreativeBenchmark): CreativeInsightsResult {
  const keys: CreativeMetricKey[] = ["hookRate", "holdRate", "ctr", "cpm", "clickToInitiateCheckoutRate", "initiateCheckoutToPurchaseRate", "roas"];
  const insights: CreativeInsight[] = [];
  for (const key of keys) {
    const current = metrics[key];
    const median = benchmark.medians[key];
    if (current == null || median == null) continue;
    const rawDifference = difference(current, median);
    const favorable = METRIC_DEFINITIONS[key].direction === "lower" ? -rawDifference : rawDifference;
    insights.push({
      type: favorable >= 10 ? "strength" : favorable <= -10 ? "risk" : "neutral",
      severity: favorable >= 10 ? "positive" : favorable <= -10 ? "warning" : "info",
      metric: key,
      currentValue: current,
      benchmarkValue: median,
      difference: rawDifference,
      title: favorable >= 10 ? "Acima da mediana" : favorable <= -10 ? "Abaixo da mediana" : "Próximo da mediana",
      description: `${METRIC_DEFINITIONS[key].label} está ${Math.abs(rawDifference).toFixed(0)}% ${rawDifference >= 0 ? "acima" : "abaixo"} da mediana interna.`,
    });
  }

  const hook = relativeState(metrics, benchmark, "hookRate");
  const ctr = relativeState(metrics, benchmark, "ctr");
  const intent = relativeState(metrics, benchmark, "clickToInitiateCheckoutRate");
  const conversion = relativeState(metrics, benchmark, "initiateCheckoutToPurchaseRate");
  const cpm = relativeState(metrics, benchmark, "cpm");

  let diagnosis = {
    title: "Possível diagnóstico",
    description: "Os dados disponíveis estão próximos da mediana interna; vale testar uma variável por vez e acompanhar o mesmo período.",
    rule: "sem_gargalo_dominante",
  };
  let suggestedTests = ["Testar uma nova abertura", "Testar um CTA diferente"];

  if ((hook ?? -Infinity) >= 10 && (ctr ?? -Infinity) >= 10 && (intent ?? Infinity) <= -10) {
    diagnosis = {
      title: "Possível diagnóstico · depois do clique",
      description: "Os dados sugerem que o criativo chama atenção e gera cliques, mas pode haver perda de intenção entre o clique e o checkout.",
      rule: "hook_ctr_altos_intencao_baixa",
    };
    suggestedTests = ["Manter o hook e testar uma nova oferta", "Testar um CTA mais alinhado à página", "Revisar a continuidade entre anúncio e destino"];
  } else if ((hook ?? -Infinity) >= 10 && (ctr ?? -Infinity) >= 10 && (intent ?? -Infinity) >= -5 && (conversion ?? Infinity) <= -10) {
    diagnosis = {
      title: "Possível diagnóstico · após o checkout",
      description: "Os dados sugerem que a intenção é gerada, mas a maior oportunidade pode estar entre o início do checkout e a compra.",
      rule: "intencao_alta_conversao_baixa",
    };
    suggestedTests = ["Manter o hook e testar a oferta", "Testar prova social próxima ao CTA", "Revisar fricções no checkout"];
  } else if ((hook ?? Infinity) <= -10 && (conversion ?? -Infinity) >= 10) {
    diagnosis = {
      title: "Possível diagnóstico · abertura",
      description: "A conversão posterior é saudável, mas o início do criativo pode não interromper o scroll o suficiente.",
      rule: "hook_baixo_conversao_alta",
    };
    suggestedTests = ["Testar uma abertura diferente", "Testar uma thumbnail mais direta", "Criar uma versão com hook mais curto"];
  } else if ((cpm ?? -Infinity) <= -10 && (ctr ?? -Infinity) >= 10) {
    diagnosis = {
      title: "Possível diagnóstico · entrega",
      description: "O interesse no criativo está saudável, enquanto o custo de entrega está acima da mediana; audiência ou leilão podem estar influenciando.",
      rule: "cpm_alto_ctr_bom",
    };
    suggestedTests = ["Manter o criativo e testar outra audiência", "Testar posicionamentos", "Comparar a entrega em outro conjunto"];
  } else if ((ctr ?? Infinity) <= -10 && (hook ?? Infinity) <= -10 && Math.abs(cpm ?? 0) < 10) {
    diagnosis = {
      title: "Possível diagnóstico · início do criativo",
      description: "Hook e CTR abaixo da mediana, com CPM estável, sugerem oportunidade na abertura e na promessa do criativo.",
      rule: "hook_ctr_baixos_cpm_normal",
    };
    suggestedTests = ["Testar uma abertura diferente", "Testar uma thumbnail mais clara", "Testar um argumento mais direto"];
  }

  return { insights, diagnosis, suggestedTests };
}
