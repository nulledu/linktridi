// ── Tridify · Diagnósticos objetivos (oportunidades × riscos) ───────────────
// Regras determinísticas sobre os dados REAIS do overview — nada de frase
// genérica: todo item diz o que aconteceu, em qual entidade, qual métrica
// disparou e qual ação faz sentido. Puro de propósito (sem React): testável
// direto e reutilizável por widget, notificação ou relatório.
import type { AdsOverview, CampaignRow } from "@/lib/meta-ads";

export interface Diagnostico {
  id: string;
  entidade: string;            // campanha ou "Conta geral"
  fato: string;                // o que aconteceu, com o número que disparou
  metrica: string;             // qual métrica gerou (ROAS, CPA, frequência…)
  acao: string;                // ação recomendada, curta
  severidade: "boa" | "media" | "alta";
}

// Limiares explícitos — mexer aqui muda o comportamento em TODO lugar.
export const LIMIARES = {
  gastoMinimoRelevante: 80,    // abaixo disto a campanha ainda é ruído
  roasEscalar: 2,              // ROAS a partir do qual vale escalar
  roasCritico: 1,              // abaixo disto está pagando pra vender
  frequenciaSaturada: 3,       // acima disto o público está cansando
  cpaAltaPct: 30,              // alta de CPA vs anterior que vira risco
  cpaQuedaPct: 20,             // queda de CPA que vira oportunidade
};

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function diagnosticar(d: Pick<AdsOverview, "campanhas" | "kpis" | "kpisPrev">): { oportunidades: Diagnostico[]; riscos: Diagnostico[] } {
  const ops: Diagnostico[] = [];
  const riscos: Diagnostico[] = [];
  const L = LIMIARES;

  const relevantes = (d.campanhas ?? []).filter((c) => c.spend >= L.gastoMinimoRelevante);

  for (const c of relevantes) {
    // RISCO: gastou e não vendeu — o desperdício mais direto que existe.
    if (c.purchases === 0) {
      riscos.push({
        id: `sem-venda:${c.id}`, entidade: c.name, metrica: "Vendas",
        fato: `Gastou ${brl(c.spend)} no período sem gerar nenhuma venda.`,
        acao: "Rever oferta/criativo ou pausar.", severidade: "alta",
      });
      continue;   // sem venda já é o diagnóstico dominante desta campanha
    }
    // OPORTUNIDADE: ROAS forte com gasto relevante.
    if (c.roas != null && c.roas >= L.roasEscalar) {
      ops.push({
        id: `escalar:${c.id}`, entidade: c.name, metrica: "ROAS",
        fato: `ROAS de ${c.roas.toFixed(2)}× com ${brl(c.spend)} investidos.`,
        acao: "Escalar orçamento aos poucos (10–20% por vez).", severidade: "boa",
      });
    }
    // RISCO: pagando pra vender.
    else if (c.roas != null && c.roas < L.roasCritico) {
      riscos.push({
        id: `roas-baixo:${c.id}`, entidade: c.name, metrica: "ROAS",
        fato: `ROAS de ${c.roas.toFixed(2)}× — faturou menos do que gastou (${brl(c.spend)}).`,
        acao: "Rever público/oferta; se persistir, pausar.", severidade: "alta",
      });
    }
    // RISCO: saturação de público.
    if ((c.frequency ?? 0) > L.frequenciaSaturada) {
      riscos.push({
        id: `freq:${c.id}`, entidade: c.name, metrica: "Frequência",
        fato: `Frequência de ${c.frequency.toFixed(1)} — o mesmo público está vendo demais.`,
        acao: "Renovar criativo ou ampliar o público.", severidade: "media",
      });
    }
  }

  // Conta geral: CPA vs período anterior (só com base de comparação real).
  const cpa = d.kpis?.cpa ?? null;
  const cpaPrev = d.kpisPrev?.cpa ?? null;
  if (cpa != null && cpaPrev != null && cpaPrev > 0) {
    const varPct = ((cpa - cpaPrev) / cpaPrev) * 100;
    if (varPct >= LIMIARES.cpaAltaPct) {
      riscos.push({
        id: "cpa-geral-alta", entidade: "Conta geral", metrica: "CPA",
        fato: `CPA subiu ${varPct.toFixed(0)}% vs o período anterior (${brl(cpaPrev)} → ${brl(cpa)}).`,
        acao: "Identificar qual campanha puxou a alta no ranking.", severidade: "alta",
      });
    } else if (varPct <= -LIMIARES.cpaQuedaPct) {
      ops.push({
        id: "cpa-geral-queda", entidade: "Conta geral", metrica: "CPA",
        fato: `CPA caiu ${Math.abs(varPct).toFixed(0)}% vs o período anterior (${brl(cpaPrev)} → ${brl(cpa)}).`,
        acao: "Bom momento pra testar aumento de orçamento.", severidade: "boa",
      });
    }
  }

  // Ordena: severidade alta primeiro nos riscos; nas oportunidades, maior gasto
  // primeiro (mais dinheiro em jogo = mais relevante).
  const peso = { alta: 0, media: 1, boa: 2 } as const;
  riscos.sort((a, b) => peso[a.severidade] - peso[b.severidade]);
  return { oportunidades: ops, riscos };
}

// Melhor e pior campanha do período (resumo executivo). Exige gasto relevante:
// "melhor" com R$ 5 investidos é sorte, não sinal.
export function extremos(campanhas: CampaignRow[]): { melhor: CampaignRow | null; pior: CampaignRow | null } {
  const rel = (campanhas ?? []).filter((c) => c.spend >= LIMIARES.gastoMinimoRelevante && c.roas != null);
  if (rel.length < 2) return { melhor: rel[0] ?? null, pior: null };
  const porRoas = [...rel].sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0));
  return { melhor: porRoas[0], pior: porRoas[porRoas.length - 1] };
}
