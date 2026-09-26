"use client";

// ── TI · leitura no cliente ──────────────────────────────────────────────────
// UMA busca ao montar + recarregar sob demanda (depois de salvar). Sem poll:
// roadmap não muda sozinho a cada segundo, e tick também custa invocação.
import { useCallback, useEffect, useState } from "react";
import type { TiProjeto, TiRoadmap } from "@/lib/ti-regras";

export type Estado<T> = { estado: "carregando" } | { estado: "erro" } | { estado: "ok"; dado: T };

export interface RespostaRoadmaps { roadmaps: TiRoadmap[]; projetos: TiProjeto[] }

export function useRoadmaps(): Estado<RespostaRoadmaps> & { recarregar: () => void } {
  const [r, setR] = useState<Estado<RespostaRoadmaps>>({ estado: "carregando" });
  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/ti/roadmaps", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setR({ estado: "ok", dado: await res.json() });
    } catch { setR({ estado: "erro" }); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  return { ...(r as Estado<RespostaRoadmaps>), recarregar: () => void carregar() } as Estado<RespostaRoadmaps> & { recarregar: () => void };
}

export const dataBR = (iso: string | null | undefined): string =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";
