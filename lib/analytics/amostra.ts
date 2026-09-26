// ── Retrato de prova do Analytics › Operação ───────────────────────────────
//
// Números plausíveis de uma semana da casa, pro banco de provas `/dev-analytics`
// olhar a tela sem credencial do ERP. Ele existe porque o Analytics vive atrás
// de login, e foi mexendo às cegas que o JSX do Faturamento quebrou duas vezes.
//
// Os insights NÃO são escritos à mão: saem do `gerarInsights` de verdade. Uma
// segunda cópia das frases divergiria do motor na primeira regra nova, e o
// banco de provas passaria a mostrar uma tela que não existe.

import { gerarInsights } from "./insights";
import type { AnalyticsOperacao, Comparacao, EtapaFluxo, ParadoEtapa, SerieAnalitica } from "./tipos";

const cmp = (atual: number, anterior: number): Comparacao => ({
  atual, anterior, deltaPct: anterior > 0 ? Math.round(((atual - anterior) / anterior) * 1000) / 10 : null,
});

const DIAS = ["2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"];

function serie(nome: string, atual: number[], anterior: number[]): SerieAnalitica {
  return {
    nome,
    pontos: DIAS.map((day, i) => ({ day, atual: atual[i], anterior: anterior[i] ?? null })),
    total: atual.reduce((s, v) => s + v, 0),
    totalAnterior: anterior.reduce((s, v) => s + v, 0),
    media: Math.round(atual.reduce((s, v) => s + v, 0) / atual.length),
  };
}

const fluxo: EtapaFluxo[] = [
  { key: "pedidos", nome: "Pedidos", icon: "shopping-bag", total: 1492, deltaPct: 8.4, parados: 0, etapas: [1] },
  { key: "vetores", nome: "Vetores", icon: "vector-bezier", total: 823, deltaPct: 5.1, parados: 12, etapas: [2] },
  { key: "contornos", nome: "Contornos", icon: "scissors", total: 611, deltaPct: -14.2, parados: 184, etapas: [3] },
  { key: "aprovacao", nome: "Aprovação", icon: "send", total: 487, deltaPct: 6.3, parados: 92, etapas: [4, 5] },
  { key: "programacao", nome: "Programação", icon: "calendar-event", total: 329, deltaPct: 4.0, parados: 47, etapas: [7, 16] },
  { key: "producao", nome: "Produção", icon: "tools", total: 271, deltaPct: -7.1, parados: 31, etapas: [9] },
  { key: "fabricados", nome: "Fabricados", icon: "settings", total: 418, deltaPct: -4.2, parados: 18, etapas: [10] },
  { key: "enviados", nome: "Enviados", icon: "truck-loading", total: 539, deltaPct: 3.1, parados: 0, etapas: [11] },
];

const parados: ParadoEtapa[] = [
  { id: 3, nome: "Contornos", parados: 184, diasMedio: 2.4, deltaPct: -14.2, nivel: "alta" },
  { id: 5, nome: "Aguardando cliente", parados: 92, diasMedio: 1.2, deltaPct: 6.3, nivel: "media" },
  { id: 7, nome: "Liberado p/ máquina", parados: 47, diasMedio: 0.8, deltaPct: 4.0, nivel: "baixa" },
  { id: 9, nome: "Em produção", parados: 31, diasMedio: 0.5, deltaPct: -7.1, nivel: "baixa" },
  { id: 10, nome: "Separação", parados: 18, diasMedio: 0.3, deltaPct: -4.2, nivel: "baixa" },
];

const resumo: AnalyticsOperacao["resumo"] = {
  pedidos: cmp(1492, 1376),
  produzidos: cmp(418, 436),
  enviados: cmp(539, 523),
  tempoMedioDias: cmp(2.8, 3.2),
  atrasados: 315,
  slaPct: cmp(72, 66.7),
  slaMetaDias: 5,
};

const series = {
  fabricados: serie("Fabricado", [58, 71, 44, 62, 69, 73, 41], [61, 66, 58, 64, 70, 68, 49]),
  enviados: serie("Enviado", [74, 80, 62, 79, 85, 111, 48], [70, 77, 66, 75, 82, 96, 57]),
};

export const OPERACAO_EXEMPLO: AnalyticsOperacao = {
  updatedAt: "2026-09-22T13:42:00.000Z",
  periodLabel: "Últimos 7 dias",
  periodoAnteriorLabel: "09/09 – 15/09",
  resumo, fluxo, parados, series,
  insights: gerarInsights({ resumo, fluxo, parados, series }),
};
