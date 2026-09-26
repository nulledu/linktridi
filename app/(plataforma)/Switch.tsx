"use client";

import { Interruptor } from "./ui/controles";

// Casca de compatibilidade: o visual e o movimento moram no `Interruptor` do kit.
export function Switch({ checked, onChange, label, color = "var(--ok)" }: {
  checked: boolean; onChange: (v: boolean) => void; label?: string; color?: string;
}) {
  return <Interruptor ligado={checked} onChange={onChange} rotulo={label} cor={color} />;
}
