"use client";

// ── Bolinha de disponibilidade ───────────────────────────────────────────────
// Verde = na empresa e livre · amarelo = fazendo atividade · vermelho = não
// está na empresa (pedido do dono, 12/09/2026). Cor de ESTADO, então vem da
// paleta semântica — nunca da rampa do destaque. O rótulo vai no aria-label e
// no title: cor sozinha não chega a quem não distingue verde de vermelho.

import type { Disponibilidade } from "@/lib/atividades-visao";

export const COR_DISPONIBILIDADE: Record<Disponibilidade, string> = {
  disponivel: "var(--ok)", ocupado: "var(--atencao)", ausente: "var(--perigo)",
};
export const ROTULO_DISPONIBILIDADE: Record<Disponibilidade, string> = {
  disponivel: "Disponível", ocupado: "Ocupado", ausente: "Não está na empresa",
};

export function Bolinha({ estado, tamanho = 11 }: { estado: Disponibilidade; tamanho?: number }) {
  const cor = COR_DISPONIBILIDADE[estado];
  return (
    <span role="img" aria-label={ROTULO_DISPONIBILIDADE[estado]} title={ROTULO_DISPONIBILIDADE[estado]}
      style={{
        flex: "none", width: tamanho, height: tamanho, borderRadius: 999, background: cor,
        boxShadow: `0 0 0 3px color-mix(in srgb, ${cor} 22%, transparent)`,
      }} />
  );
}
