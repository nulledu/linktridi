"use client";

// ── 3D · Programação do dia ──────────────────────────────────────────────────
// O dia das impressoras, hora a hora: navega por dia (setas + calendário +
// "Hoje") e lista as impressões na ordem do horário planejado, com o que não
// tem horário no fim. Cancelada não aparece (é assunto do Histórico).

import { useMemo, useState } from "react";
import { GlassDate } from "../GlassPicker";
import { Momento } from "../ui/Momento";
import { Botao, BotaoIcone } from "../ui/controles";
import { hojeSP, somaDias } from "@/lib/atividades-visao";
import type { Programacao3D, StatusProgramacao } from "@/lib/impressao3d-const";
import { CardProgramacao } from "./pecas3d";

export function ProgramacaoDia3D({ programacoes, onAbrir, onStatus }: {
  programacoes: Programacao3D[];
  onAbrir: (p: Programacao3D) => void;
  onStatus: (p: Programacao3D, s: StatusProgramacao) => void;
}) {
  const hoje = hojeSP();
  const [dia, setDia] = useState(hoje);

  const doDia = useMemo(
    () => programacoes
      .filter((p) => p.data === dia && p.status !== "cancelado")
      .sort((a, b) => (a.hora || "99").localeCompare(b.hora || "99")),
    [programacoes, dia],
  );
  const semDia = useMemo(
    () => programacoes.filter((p) => !p.data && (p.status === "a_fazer" || p.status === "programado")),
    [programacoes],
  );

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div role="group" aria-label="Dia" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <BotaoIcone icone="chevron-left" titulo="Dia anterior" onClick={() => setDia((d) => somaDias(d, -1))} />
        <GlassDate value={dia} onChange={(v) => v && setDia(v.slice(0, 10))} clearable={false} style={{ width: 148 }} />
        <BotaoIcone icone="chevron-right" titulo="Próximo dia" onClick={() => setDia((d) => somaDias(d, 1))} />
        <Botao tamanho="sm" onClick={() => setDia(hoje)} disabled={dia === hoje}>Hoje</Botao>
      </div>

      {doDia.length === 0 ? (
        <Momento compacto icone="calendar" titulo={dia === hoje ? "Nada programado pra hoje" : "Nada programado neste dia"}
          texto={'Use "Programar impressão" pra encaixar uma peça neste dia.'} />
      ) : (
        <div style={{ display: "grid", gap: 10, maxWidth: 720 }}>
          {doDia.map((p) => (
            <div key={p.id} style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 10, alignItems: "start" }}>
              <span className="mt-num" style={{
                fontSize: 13, fontWeight: 600, color: p.hora ? "var(--text)" : "var(--text-dim)",
                fontVariantNumeric: "tabular-nums", paddingTop: 14, textAlign: "right",
              }}>
                {p.hora || "—"}
              </span>
              <CardProgramacao p={p} onAbrir={onAbrir} onStatus={onStatus} />
            </div>
          ))}
        </div>
      )}

      {semDia.length > 0 && (
        <section style={{ maxWidth: 720 }}>
          <h2 style={{ fontSize: 14, marginBottom: 10, color: "var(--text-dim)" }}>Sem dia marcado</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {semDia.map((p) => <CardProgramacao key={p.id} p={p} compacto onAbrir={onAbrir} onStatus={onStatus} />)}
          </div>
        </section>
      )}
    </div>
  );
}
