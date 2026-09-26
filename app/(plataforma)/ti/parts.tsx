"use client";

import { Selo } from "../ui/primitives";
import { STATUS_ROADMAP, STATUS_ETAPA, type RoadmapStatus, type EtapaStatus } from "@/lib/ti-regras";
import type { StatusDaEtapa } from "../ui/LinhaDoTempo";

const TOM_ROADMAP: Record<RoadmapStatus, "ok" | "atencao" | "info" | "neutro" | "destaque"> = {
  planejamento: "info", em_andamento: "destaque", pausado: "neutro", concluido: "ok",
};
const TOM_ETAPA: Record<EtapaStatus, "ok" | "atencao" | "info" | "neutro" | "destaque"> = {
  nao_iniciada: "neutro", em_andamento: "destaque", em_revisao: "info", bloqueada: "atencao", concluida: "ok",
};

export function SeloRoadmap({ status, atrasado }: { status: RoadmapStatus; atrasado?: boolean }) {
  if (atrasado && status !== "concluido") return <Selo tom="atencao">Atrasado</Selo>;
  return <Selo tom={TOM_ROADMAP[status] ?? "neutro"}>{STATUS_ROADMAP[status] ?? status}</Selo>;
}

export function SeloEtapa({ status, atrasada }: { status: EtapaStatus; atrasada?: boolean }) {
  if (atrasada && status !== "concluida") return <Selo tom="atencao">Atrasada</Selo>;
  return <Selo tom={TOM_ETAPA[status] ?? "neutro"}>{STATUS_ETAPA[status] ?? status}</Selo>;
}

/** Traduz o status + atraso da etapa pro vocabulário da LinhaDoTempo. */
export function statusDaLinha(e: { status: EtapaStatus; atrasada: boolean }): StatusDaEtapa {
  if (e.status === "concluida") return "concluida";
  if (e.atrasada) return "atrasada";
  if (e.status === "bloqueada") return "bloqueada";
  if (e.status === "em_andamento" || e.status === "em_revisao") return "ativa";
  return "pendente";
}
