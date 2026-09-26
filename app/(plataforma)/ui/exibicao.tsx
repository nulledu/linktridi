"use client";
import "./kit-heroui.css";

import { Kbd, Label, Meter } from "@heroui/react";
import type { ReactNode } from "react";
import { Avatar } from "./Avatar";

// ── Data Display (HeroUI v3) ────────────────────────────────────────────────
//   • Tecla    — Kbd: atalho de teclado ("⌘K"). Some no toque (.desk-only),
//     porque celular não tem teclado pra apertar.
//   • Avatares — AvatarGroup: rostos sobrepostos + "+N", sobre o NOSSO Avatar
//     (foto que falha vira inicial, raio da escala).
//   • Medidor  — Meter: quanto de um teto foi usado (armazenamento, cota,
//     capacidade). Progresso de TAREFA continua `Progresso`; Meter é medida.

type Modificador = "command" | "shift" | "ctrl" | "option" | "alt" | "enter";

export function Tecla({ mods = [], children, sempre }: {
  mods?: Modificador[];
  children?: ReactNode;
  /** Não some no toque — pra tecla no meio de uma frase ("aperte Ctrl+Z"),
   *  que ficaria furada sem ela. */
  sempre?: boolean;
}) {
  return (
    <Kbd className={sempre ? "ui-tecla" : "ui-tecla desk-only"}>
      {mods.map((m) => <Kbd.Abbr key={m} keyValue={m} />)}
      {children != null && <Kbd.Content>{children}</Kbd.Content>}
    </Kbd>
  );
}

export function Avatares({ pessoas, max = 4, size = 32 }: {
  pessoas: { nome: string; url?: string | null }[];
  max?: number;
  size?: number;
}) {
  const vis = pessoas.slice(0, max);
  const resto = pessoas.length - vis.length;
  return (
    <div className="ui-avatares" style={{ ["--av" as string]: `${size}px` }} aria-label={pessoas.map((p) => p.nome).join(", ")} role="group">
      {vis.map((p, i) => (
        <span key={`${p.nome}-${i}`} className="ui-avatares__um" title={p.nome}>
          <Avatar nome={p.nome} url={p.url ?? null} size={size} formato="redondo" />
        </span>
      ))}
      {resto > 0 && <span className="ui-avatares__mais" aria-hidden>+{resto > 99 ? "99" : resto}</span>}
    </div>
  );
}

export type TomMedidor = "destaque" | "ok" | "atencao" | "perigo" | "neutro";
const COR: Record<TomMedidor, "accent" | "success" | "warning" | "danger" | "default"> = {
  destaque: "accent", ok: "success", atencao: "warning", perigo: "danger", neutro: "default",
};

export function Medidor({ valor, max = 100, rotulo, tom, tamanho = "md", formatar }: {
  valor: number;
  max?: number;
  rotulo: ReactNode;
  /** Sem tom, a cor sai do quanto encheu: até 75% destaque, 90% atenção, depois perigo. */
  tom?: TomMedidor;
  tamanho?: "sm" | "md" | "lg";
  formatar?: (valor: number, max: number) => string;
}) {
  const frac = max > 0 ? valor / max : 0;
  const t = tom ?? (frac >= 0.9 ? "perigo" : frac >= 0.75 ? "atencao" : "destaque");
  return (
    <Meter className="ui-medidor" value={valor} maxValue={max} color={COR[t]} size={tamanho}
      valueLabel={formatar ? formatar(valor, max) : undefined}>
      <Label>{rotulo}</Label>
      <Meter.Output />
      <Meter.Track>
        <Meter.Fill />
      </Meter.Track>
    </Meter>
  );
}
