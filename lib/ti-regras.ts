// ── TI · regras e tipos PUROS ────────────────────────────────────────────────
// Este módulo não importa nada de servidor de propósito: é o que as telas de
// cliente podem puxar (tipos, rótulos, progresso, atraso) sem arrastar o
// Supabase pro navegador. As consultas moram em lib/ti.ts, que reexporta tudo
// daqui. Travas: lib/__tests__/ti-roadmaps.test.ts e
// cliente-nao-importa-servidor.test.ts.

export type RoadmapStatus = "planejamento" | "em_andamento" | "pausado" | "concluido";
export type EtapaStatus = "nao_iniciada" | "em_andamento" | "em_revisao" | "bloqueada" | "concluida";

export const STATUS_ROADMAP: Record<RoadmapStatus, string> = {
  planejamento: "Planejamento", em_andamento: "Em andamento", pausado: "Pausado", concluido: "Concluído",
};
export const STATUS_ETAPA: Record<EtapaStatus, string> = {
  nao_iniciada: "Não iniciada", em_andamento: "Em andamento", em_revisao: "Em revisão", bloqueada: "Bloqueada", concluida: "Concluída",
};

export interface TiProjeto { id: string; nome: string; descricao: string | null; status: string }
export interface TarefaVinculada { id: string; titulo: string; status: string; prazo: string | null; responsavelNome: string | null }
export interface TiEtapa {
  id: string; roadmapId: string; titulo: string; descricao: string | null;
  status: EtapaStatus; inicio: string | null; prazo: string | null; concluidaEm: string | null;
  responsavelId: string | null; responsavelNome: string | null;
  ordem: number; progressoManual: number | null; dependeDe: string | null; observacoes: string | null;
  tarefas: TarefaVinculada[];
  /** Derivados no servidor — a MESMA regra em toda tela. */
  progresso: number; atrasada: boolean;
}
export interface TiRoadmap {
  id: string; projetoId: string; projetoNome: string;
  titulo: string; descricao: string | null; status: RoadmapStatus;
  inicio: string | null; prazo: string | null;
  responsavelId: string | null; responsavelNome: string | null;
  progressoManual: number | null;
  etapas: TiEtapa[];
  progresso: number; atrasado: boolean;
  criadoEm: string; atualizadoEm: string;
}
export interface TiHistorico { id: string; acao: string; detalhe: string | null; autorNome: string | null; createdAt: string }

/** Hoje em São Paulo (YYYY-MM-DD) — comparar prazo em UTC vira "amanhã às 21h". */
export function hojeSP(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

/** Progresso da etapa: tarefas reais (concluídas/total) > manual > status. */
export function progressoDaEtapa(e: { status: EtapaStatus; progressoManual: number | null; tarefas: { status: string }[] }): number {
  if (e.status === "concluida") return 100;
  if (e.tarefas.length) {
    const feitas = e.tarefas.filter((t) => t.status === "concluida").length;
    return Math.round((feitas / e.tarefas.length) * 100);
  }
  if (e.progressoManual != null) return Math.max(0, Math.min(100, e.progressoManual));
  return 0;
}

/** Progresso do roadmap: média das etapas (regra única) > manual > 0. */
export function progressoDoRoadmap(r: { progressoManual: number | null }, etapas: { progresso: number }[]): number {
  if (etapas.length) return Math.round(etapas.reduce((s, e) => s + e.progresso, 0) / etapas.length);
  if (r.progressoManual != null) return Math.max(0, Math.min(100, r.progressoManual));
  return 0;
}

/** Atraso: passou do prazo sem estar concluída. `hoje` em YYYY-MM-DD (SP). */
export function estaAtrasada(item: { prazo: string | null; status: string }, hoje = hojeSP()): boolean {
  if (!item.prazo || item.status === "concluida" || item.status === "concluido") return false;
  return item.prazo.slice(0, 10) < hoje;
}
