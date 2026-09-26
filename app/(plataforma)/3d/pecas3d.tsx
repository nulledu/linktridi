"use client";

// ── 3D · peças compartilhadas da operação ────────────────────────────────────
// O card de programação e o vocabulário de status são UM só, usados pelo
// kanban, pela programação do dia, pela fila da máquina e pela visão geral —
// mudar aqui muda em todo lugar (regra do devkit).

import type { ReactNode } from "react";
import { Icon } from "../Icon";
import { BotaoIcone } from "../ui/controles";
import {
  COR_STATUS, ROTULO_STATUS, visualizavel,
  type Programacao3D, type StatusProgramacao,
} from "@/lib/impressao3d-const";

export type Pessoa = { id: string; nome: string };

/** Ações rápidas que fazem sentido a partir de cada status. */
export function proximasAcoes(s: StatusProgramacao): { status: StatusProgramacao; icone: string; titulo: string }[] {
  switch (s) {
    case "a_fazer": return [{ status: "programado", icone: "calendar-event", titulo: "Marcar como programado" }];
    case "programado": return [{ status: "imprimindo", icone: "player-play", titulo: "Iniciar impressão" }];
    case "imprimindo": return [
      { status: "pausado", icone: "player-pause", titulo: "Pausar" },
      { status: "concluido", icone: "check", titulo: "Concluir" },
    ];
    case "pausado": return [
      { status: "imprimindo", icone: "player-play", titulo: "Retomar" },
      { status: "concluido", icone: "check", titulo: "Concluir" },
    ];
    default: return [];
  }
}

export function BolinhaStatus({ status }: { status: StatusProgramacao }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: COR_STATUS[status], fontWeight: 600 }}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: COR_STATUS[status], flex: "none" }} />
      {ROTULO_STATUS[status]}
    </span>
  );
}

export function horaCurta(p: Pick<Programacao3D, "hora">): string {
  return p.hora || "—";
}

export function dataCurta(iso: string | null): string {
  if (!iso) return "sem dia";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

/** O card da programação — as informações que importam, e só elas. */
export function CardProgramacao({
  p, onAbrir, onStatus, rodape, arrastavel, aoPegar, aoLargar, compacto,
}: {
  p: Programacao3D;
  onAbrir?: (p: Programacao3D) => void;
  /** Ações rápidas de status (play/pause/concluir). Sem ele, o card é só leitura. */
  onStatus?: (p: Programacao3D, s: StatusProgramacao) => void;
  /** Linha extra embaixo (ex.: posição na fila). */
  rodape?: ReactNode;
  arrastavel?: boolean;
  aoPegar?: () => void;
  aoLargar?: () => void;
  compacto?: boolean;
}) {
  const acoes = onStatus ? proximasAcoes(p.status) : [];
  return (
    <article
      draggable={arrastavel || undefined}
      onDragStart={arrastavel ? (e) => { e.dataTransfer.effectAllowed = "move"; aoPegar?.(); } : undefined}
      onDragEnd={arrastavel ? aoLargar : undefined}
      className="mc-card"
      style={{ padding: compacto ? "10px 12px" : 14, display: "grid", gap: 8, cursor: arrastavel ? "grab" : undefined }}
    >
      <button
        type="button"
        onClick={onAbrir ? () => onAbrir(p) : undefined}
        style={{ all: "unset", cursor: onAbrir ? "pointer" : "default", display: "grid", gap: 6, minWidth: 0 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Icon name={visualizavel(p.arquivoFormato) ? "box" : "file-description"} size={15} color="var(--graf-1)" />
          <span style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {p.arquivoNome || "arquivo removido"}
          </span>
          {p.prioridade === "alta" && (
            <span title="Prioridade alta" style={{ color: "var(--perigo)", display: "inline-flex", flex: "none" }}>
              <Icon name="flame" size={14} />
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span>{p.quantidade}×</span>
          {p.maquinaNome && <span>· {p.maquinaNome}</span>}
          {(p.data || p.hora) && <span>· {dataCurta(p.data)}{p.hora ? ` ${p.hora}` : ""}</span>}
          {p.responsavelNome && <span>· {p.responsavelNome.split(" ")[0]}</span>}
        </div>
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <BolinhaStatus status={p.status} />
        <span style={{ flex: 1 }} />
        {acoes.map((a) => (
          <BotaoIcone key={a.status} icone={a.icone} titulo={a.titulo} tamanho="sm"
            onClick={() => onStatus!(p, a.status)} />
        ))}
      </div>
      {rodape}
    </article>
  );
}
