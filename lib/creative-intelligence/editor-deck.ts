import { METRIC_DEFINITIONS } from "./metrics";
import type { CreativeIntelligencePayload, CreativeMetricKey } from "./types";

// ── Apresentação do criativo: o conteúdo, sem a tela ────────────────────────
// Quem edita o vídeo precisa de quatro respostas: o público parou, continuou,
// clicou? Onde ele saiu? O que isso sugere para a edição? O que testar agora?
// Desde 12/09/2026 o slide Engajamento junta o resultado da peça (compras, CTR,
// CPC, CPM, ROAS) e a reação do público (curtidas, comentários,
// compartilhamentos) — pedido do dono. Investimento, faturamento e CPA seguem
// fora: a apresentação é sobre a peça, não sobre o caixa.
//
// Função pura de propósito: a tela, o modo "Apresentar" e o PDF montam os
// mesmos slides a partir do MESMO retrato, então os três nunca discordam.

export type EditorSlideId = "capa" | "sinais" | "retencao" | "engajamento" | "leitura" | "testes";

export type SignalVerdict = "acima" | "abaixo" | "media" | "sem-base";

export interface EditorSignal {
  key: Extract<CreativeMetricKey, "hookRate" | "holdRate" | "ctr">;
  /** Nome técnico, como o editor fala ("Hook Rate"). */
  label: string;
  /** O que o número quer dizer ("Pararam para assistir nos primeiros segundos"). */
  explanation: string;
  value: number | null;
  median: number | null;
  verdict: SignalVerdict;
  comparison: string;
}

export type EngagementGroup = "resultado" | "publico";

export interface EngagementItem {
  key: Extract<CreativeMetricKey, "purchases" | "ctr" | "cpc" | "cpm" | "roas" | "reactions" | "comments" | "shares">;
  group: EngagementGroup;
  value: number | null;
  /** Taxa: comparação com a mediana ("+12% vs. média"). Reação: "4,2 a cada mil impressões". */
  note: string | null;
  /** Cor da comparação já na direção da métrica: CPC abaixo da média é BOM. */
  tone: "bom" | "ruim" | null;
}

export interface RetentionStep {
  key: CreativeMetricKey;
  label: string;
  /** Como o trecho aparece no meio de uma frase ("entre 25% do vídeo e a metade"). */
  trecho: string;
  /** Idem, depois de "antes de chegar" ("antes de chegar à metade"). */
  chegada: string;
  value: number;
  /** Parcela de quem passou dos 3 segundos, de 0 a 100. */
  share: number;
}

export interface RetentionDrop {
  from: RetentionStep;
  to: RetentionStep;
  /** Pontos perdidos no trecho: de cada 100 que passaram dos 3 s, quantos saem ali. */
  lost: number;
}

export interface EditorReading {
  title: string;
  description: string;
  /** A métrica que sustenta a leitura — mostrar a prova é o que faz o editor confiar nela. */
  evidence: { key: CreativeMetricKey; value: number; median: number } | null;
}

export interface EditorTest {
  text: string;
  reason: string | null;
}

export interface EditorDeck {
  slides: EditorSlideId[];
  signals: EditorSignal[];
  retention: RetentionStep[];
  biggestDrop: RetentionDrop | null;
  engagement: EngagementItem[];
  /** Curtidas/comentários/compartilhamentos ainda sem coleta no período (SQL novo ou dia antigo). */
  engagementPending: boolean;
  reading: EditorReading;
  tests: EditorTest[];
  periodLabel: string;
  sampleSize: number;
}

const SIGNALS: Array<{ key: EditorSignal["key"]; explanation: string }> = [
  { key: "hookRate", explanation: "Pararam para assistir nos primeiros segundos" },
  { key: "holdRate", explanation: "Continuaram assistindo depois da abertura" },
  { key: "ctr", explanation: "Clicaram para saber mais" },
];

// Ordem pedida pelo dono. Taxa compara com a mediana; contagem de reação vira
// "a cada mil impressões" — comparar curtida absoluta com a mediana premiaria
// só quem gastou mais. Compras fica com o número puro.
const ENGAGEMENT: Array<{ key: EngagementItem["key"]; group: EngagementGroup; kind: "taxa" | "contagem" }> = [
  { key: "purchases", group: "resultado", kind: "contagem" },
  { key: "ctr", group: "resultado", kind: "taxa" },
  { key: "cpc", group: "resultado", kind: "taxa" },
  { key: "cpm", group: "resultado", kind: "taxa" },
  { key: "roas", group: "resultado", kind: "taxa" },
  { key: "reactions", group: "publico", kind: "contagem" },
  { key: "comments", group: "publico", kind: "contagem" },
  { key: "shares", group: "publico", kind: "contagem" },
];

const RETENTION: Array<{ key: CreativeMetricKey; label: string; trecho: string; chegada: string }> = [
  { key: "videoViews3s", label: "3 segundos", trecho: "os 3 segundos", chegada: "aos 3 segundos" },
  { key: "videoViews25", label: "25% do vídeo", trecho: "25% do vídeo", chegada: "a 25% do vídeo" },
  { key: "videoViews50", label: "Metade do vídeo", trecho: "a metade", chegada: "à metade" },
  { key: "videoViews75", label: "75% do vídeo", trecho: "75% do vídeo", chegada: "a 75% do vídeo" },
  { key: "videoViews100", label: "Vídeo completo", trecho: "o fim", chegada: "ao fim" },
];

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function median(payload: CreativeIntelligencePayload, key: CreativeMetricKey): number | null {
  return payload.benchmark.medians[key] ?? null;
}

function buildSignal(payload: CreativeIntelligencePayload, key: EditorSignal["key"], explanation: string): EditorSignal {
  const label = METRIC_DEFINITIONS[key].label;
  const value = payload.current.metrics[key];
  const base = median(payload, key);
  if (value == null || base == null || base === 0) {
    return { key, label, explanation, value, median: base, verdict: "sem-base", comparison: "Sem comparação disponível" };
  }
  const difference = Math.round(((value - base) / Math.abs(base)) * 100);
  if (Math.abs(difference) < 2) return { key, label, explanation, value, median: base, verdict: "media", comparison: "Na média dos outros criativos" };
  return {
    key, label, explanation, value, median: base,
    verdict: difference > 0 ? "acima" : "abaixo",
    comparison: `${Math.abs(difference)}% ${difference > 0 ? "acima" : "abaixo"} da média`,
  };
}

function buildEngagementItem(payload: CreativeIntelligencePayload, spec: (typeof ENGAGEMENT)[number]): EngagementItem {
  const { key, group } = spec;
  const value = payload.current.metrics[key];
  if (value == null) return { key, group, value, note: null, tone: null };
  if (spec.kind === "contagem") {
    const impressions = payload.current.metrics.impressions;
    if (group !== "publico" || !impressions) return { key, group, value, note: null, tone: null };
    const porMil = (value / impressions) * 1_000;
    return { key, group, value, note: `${porMil.toLocaleString("pt-BR", { maximumFractionDigits: porMil < 10 ? 1 : 0 })} a cada mil impressões`, tone: null };
  }
  const base = median(payload, key);
  if (base == null || base === 0) return { key, group, value, note: null, tone: null };
  const difference = Math.round(((value - base) / Math.abs(base)) * 100);
  if (Math.abs(difference) < 2) return { key, group, value, note: "na média", tone: null };
  const melhor = (difference > 0) === (METRIC_DEFINITIONS[key].direction !== "lower");
  return { key, group, value, note: `${difference > 0 ? "+" : "−"}${Math.abs(difference)}% vs. média`, tone: melhor ? "bom" : "ruim" };
}

function buildRetention(payload: CreativeIntelligencePayload): RetentionStep[] {
  const base = payload.current.metrics.videoViews3s;
  if (base == null || base <= 0) return [];
  return RETENTION.flatMap((step) => {
    const value = payload.current.metrics[step.key];
    if (value == null) return [];
    return [{ ...step, value, share: Math.max(0, Math.min(100, (value / base) * 100)) }];
  });
}

/** O trecho que mais perde gente, em pontos da audiência que passou dos 3 s. */
export function biggestDrop(retention: RetentionStep[]): RetentionDrop | null {
  let worst: RetentionDrop | null = null;
  for (let index = 1; index < retention.length; index += 1) {
    const lost = retention[index - 1].share - retention[index].share;
    if (lost > 0 && (!worst || lost > worst.lost)) worst = { from: retention[index - 1], to: retention[index], lost };
  }
  return worst && Math.round(worst.lost) >= 1 ? { ...worst, lost: Math.round(worst.lost) } : null;
}

function buildReading(payload: CreativeIntelligencePayload): EditorReading {
  const metrics = payload.current.metrics;
  const below = (key: CreativeMetricKey) => {
    const value = metrics[key];
    const base = median(payload, key);
    return value != null && base != null && value < base ? { key, value, median: base } : null;
  };
  const hook = below("hookRate");
  if (hook) return { title: "A abertura precisa ganhar força", description: "Teste uma imagem, frase ou movimento mais claro logo nos primeiros segundos.", evidence: hook };
  const hold = below("holdRate");
  if (hold) return { title: "O vídeo perde atenção depois da abertura", description: "Antecipe a principal mensagem e reduza trechos que demoram para avançar.", evidence: hold };
  const ctr = below("ctr");
  if (ctr) return { title: "O conteúdo prende, mas o chamado pode ficar mais claro", description: "Deixe o próximo passo mais visível e direto no fechamento do vídeo.", evidence: ctr };
  return { title: "A estrutura do vídeo está equilibrada", description: "Preserve o que funciona e teste uma mudança por vez para identificar o que melhora o resultado criativo.", evidence: null };
}

function buildTests(payload: CreativeIntelligencePayload): EditorTest[] {
  const metrics = payload.current.metrics;
  const medians = payload.benchmark.medians;
  const tests: EditorTest[] = [];
  if (metrics.hookRate != null && medians.hookRate != null && metrics.hookRate < medians.hookRate) tests.push({ text: "Criar uma nova abertura para os primeiros 3 segundos", reason: "Hook Rate abaixo da mediana" });
  if (metrics.holdRate != null && medians.holdRate != null && metrics.holdRate < medians.holdRate) tests.push({ text: "Encurtar o desenvolvimento e antecipar a demonstração", reason: "Hold Rate abaixo da mediana" });
  if (metrics.ctr != null && medians.ctr != null && metrics.ctr < medians.ctr) tests.push({ text: "Testar um chamado mais claro no encerramento", reason: "CTR abaixo da mediana" });
  if (metrics.videoViews3s && metrics.videoViews50 != null && metrics.videoViews50 / metrics.videoViews3s < .45) tests.push({ text: "Levar a mensagem principal para antes da metade do vídeo", reason: "Menos da metade chega ao meio do vídeo" });
  if (!tests.length) {
    tests.push(
      { text: "Manter a abertura e testar um ritmo de cortes diferente", reason: null },
      { text: "Criar uma versão mais curta", reason: null },
      { text: "Testar outra miniatura ou primeiro quadro", reason: null },
    );
  }
  return tests.slice(0, 3);
}

function dia(value: number): string {
  return value === 1 ? "1º" : String(value);
}

/** "6 a 19 de julho de 2026" — o ISO cru ("2026-07-06 a 2026-07-19") não é frase de apresentação. */
export function formatPeriodLabel(since: string, until: string): string {
  const parse = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    return year && month >= 1 && month <= 12 && day ? { year, month, day } : null;
  };
  const a = parse(since);
  const b = parse(until);
  if (!a || !b) return `${since} a ${until}`;
  const mes = (m: number) => MESES[m - 1];
  if (since === until) return `${dia(a.day)} de ${mes(a.month)} de ${a.year}`;
  if (a.year === b.year && a.month === b.month) return `${dia(a.day)} a ${dia(b.day)} de ${mes(b.month)} de ${b.year}`;
  if (a.year === b.year) return `${dia(a.day)} de ${mes(a.month)} a ${dia(b.day)} de ${mes(b.month)} de ${b.year}`;
  return `${dia(a.day)} de ${mes(a.month)} de ${a.year} a ${dia(b.day)} de ${mes(b.month)} de ${b.year}`;
}

export function buildEditorDeck(payload: CreativeIntelligencePayload): EditorDeck {
  const signals = SIGNALS.map((signal) => buildSignal(payload, signal.key, signal.explanation));
  const retention = buildRetention(payload);
  const engagement = ENGAGEMENT.map((spec) => buildEngagementItem(payload, spec));
  const slides: EditorSlideId[] = ["capa"];
  // Slide sem dado suficiente some, em vez de aparecer cheio de travessão.
  if (signals.some((signal) => signal.value != null)) slides.push("sinais");
  if (retention.length >= 2) slides.push("retencao");
  if (engagement.some((item) => item.value != null)) slides.push("engajamento");
  slides.push("leitura", "testes");
  return {
    slides,
    signals,
    retention,
    biggestDrop: biggestDrop(retention),
    engagement,
    engagementPending: engagement.filter((item) => item.group === "publico").every((item) => item.value == null),
    reading: buildReading(payload),
    tests: buildTests(payload),
    periodLabel: formatPeriodLabel(payload.period.since, payload.period.until),
    sampleSize: payload.benchmark.sampleSize,
  };
}
