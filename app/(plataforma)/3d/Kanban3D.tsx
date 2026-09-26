"use client";

// ── 3D · Kanban da produção ──────────────────────────────────────────────────
// A fazer → Programado → Imprimindo (+ Pausado) → Concluído. Soltar um card
// noutra coluna MUDA O STATUS da programação (a mesma rota do resto do app) —
// o kanban é uma vista, não um segundo estado.
//
// Drag é o DnD nativo do QuadroMaquinas da Produção: estado do arrasto em
// useRef (não re-renderiza a cada pixel) e a célula acesa por box-shadow —
// NUNCA transform, que quebra popover (regra da casa). No celular não há
// drag confiável: as colunas viram abas e o card anda pelas ações rápidas.

import { useMemo, useRef, useState } from "react";
import { Abas } from "../ui/Abas";
import { Momento } from "../ui/Momento";
import { useIsMobile } from "../ui/useMediaQuery";
import { hojeSP } from "@/lib/atividades-visao";
import {
  COR_STATUS, ROTULO_STATUS,
  type Programacao3D, type StatusProgramacao,
} from "@/lib/impressao3d-const";
import { CardProgramacao } from "./pecas3d";

const COLUNAS: StatusProgramacao[] = ["a_fazer", "programado", "imprimindo", "pausado", "concluido"];

export function Kanban3D({ programacoes, onAbrir, onStatus }: {
  programacoes: Programacao3D[];
  onAbrir: (p: Programacao3D) => void;
  onStatus: (p: Programacao3D, s: StatusProgramacao) => void;
}) {
  const celular = useIsMobile();
  const hoje = hojeSP();
  const [colunaCelular, setColunaCelular] = useState<StatusProgramacao>("programado");
  const [alvo, setAlvo] = useState<StatusProgramacao | null>(null);
  const arrastando = useRef<Programacao3D | null>(null);

  const porColuna = useMemo(() => {
    const m = new Map<StatusProgramacao, Programacao3D[]>(COLUNAS.map((c) => [c, []]));
    for (const p of programacoes) {
      if (p.status === "cancelado") continue;
      // Concluído mostra só o de HOJE: o resto é assunto do Histórico, e uma
      // coluna infinita esconderia o que acabou de sair da máquina.
      if (p.status === "concluido" && (p.concluidoEm || "").slice(0, 10) !== hoje) continue;
      m.get(p.status)?.push(p);
    }
    for (const [, l] of m) {
      l.sort((a, b) => `${a.data || "9999"}${a.hora || "99"}`.localeCompare(`${b.data || "9999"}${b.hora || "99"}`));
    }
    return m;
  }, [programacoes, hoje]);

  const soltar = (col: StatusProgramacao) => {
    const p = arrastando.current;
    arrastando.current = null;
    setAlvo(null);
    if (!p || p.status === col) return;
    onStatus(p, col);
  };

  const Coluna = ({ col }: { col: StatusProgramacao }) => {
    const itens = porColuna.get(col) ?? [];
    const aceso = alvo === col;
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); if (alvo !== col) setAlvo(col); }}
        onDragLeave={() => setAlvo((a) => (a === col ? null : a))}
        onDrop={(e) => { e.preventDefault(); soltar(col); }}
        style={{
          display: "grid", gap: 8, alignContent: "start", minHeight: 160,
          padding: 10, borderRadius: 14,
          border: `1px dashed ${aceso ? "var(--primary)" : "var(--border)"}`,
          boxShadow: aceso ? "0 0 0 2px var(--primary) inset" : undefined,
          background: "var(--surface-2, transparent)",
        }}
      >
        {!celular && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px" }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: COR_STATUS[col] }} />
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>{ROTULO_STATUS[col]}</span>
            <span className="mt-num" style={{ fontSize: 12, color: "var(--text-dim)" }}>{itens.length > 99 ? "99+" : itens.length}</span>
          </div>
        )}
        {itens.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "center", padding: "22px 6px" }}>
            {col === "concluido" ? "Nada concluído hoje." : "Vazio — arraste um card pra cá."}
          </p>
        ) : (
          itens.map((p) => (
            <CardProgramacao key={p.id} p={p} compacto
              onAbrir={onAbrir} onStatus={onStatus}
              arrastavel={!celular}
              aoPegar={() => { arrastando.current = p; }}
              aoLargar={() => { arrastando.current = null; setAlvo(null); }} />
          ))
        )}
      </div>
    );
  };

  if (programacoes.filter((p) => p.status !== "cancelado").length === 0) {
    return (
      <Momento compacto icone="layout-kanban" titulo="O quadro está vazio"
        texto={'Programe uma impressão e ela nasce em "A fazer" ou "Programado".'} />
    );
  }

  if (celular) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Abas
          ariaLabel="Coluna do kanban"
          itens={COLUNAS.map((c) => ({ valor: c, rotulo: `${ROTULO_STATUS[c]} (${(porColuna.get(c) ?? []).length})` }))}
          valor={colunaCelular}
          onMuda={setColunaCelular}
        />
        <Coluna col={colunaCelular} />
      </div>
    );
  }

  return (
    // Colunas lado a lado; quando não cabem, o QUADRO rola de lado — a página não.
    <div style={{ overflowX: "auto", paddingBottom: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${COLUNAS.length}, minmax(min(100%, 230px), 1fr))`, gap: 10, minWidth: COLUNAS.length * 240 }}>
        {COLUNAS.map((c) => <Coluna key={c} col={c} />)}
      </div>
    </div>
  );
}
