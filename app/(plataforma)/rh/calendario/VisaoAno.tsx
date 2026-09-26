"use client";

// A visão anual: doze cartões, um por mês, com um mini-calendário (pontos
// discretos nos dias que têm algo) e a contagem por tipo. Serve para
// planejar e ver o ano de relance — não para ler evento; clicar no mês abre
// a visão mensal.

import { Fila } from "../../ui/micro";
import { Cartao } from "../../financeiro/ui";
import { Icon } from "../../Icon";
import { MESES_LONGOS, capitalizar, gradeDoMes } from "@/lib/rh/calendario/datas";
import { LEGENDA, contarPorTipo, resumirContagem, type Acontecimento } from "@/lib/rh/calendario/tipos";

export function VisaoAno({ ano, hoje, porDia, aoAbrirMes }: {
  ano: number;
  hoje: string;
  porDia: Map<string, Acontecimento[]>;
  aoAbrirMes: (mes: number) => void;
}) {
  return (
    <Fila className="rhcal-ano" key={ano}>
      {MESES_LONGOS.map((nome, i) => {
        const mes = i + 1;
        const celulas = gradeDoMes(ano, mes);
        const doMes: Acontecimento[] = [];
        for (const c of celulas) if (c.doMes) doMes.push(...(porDia.get(c.dia) ?? []));
        const contagem = contarPorTipo(doMes);
        const linhas = resumirContagem(contagem, 3);
        const atual = hoje.slice(0, 7) === `${ano}-${String(mes).padStart(2, "0")}`;
        return (
          <button key={mes} type="button" className="rhcal-mes-btn" onClick={() => aoAbrirMes(mes)} aria-label={`Abrir ${nome} de ${ano}`}>
            <Cartao padding={14} style={{ height: "100%", display: "grid", gap: 10, alignContent: "start", boxShadow: atual ? "inset 0 0 0 2px color-mix(in srgb, var(--primary) 45%, transparent)" : undefined }}>
              <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <strong style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: "-.01em" }}>{capitalizar(nome)}</strong>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                  {doMes.length || "—"}
                </span>
              </header>

              <div className="rhcal-mini" aria-hidden>
                {["D", "S", "T", "Q", "Q", "S", "S"].map((d, j) => <span key={`h${j}`} style={{ fontWeight: 800, aspectRatio: "auto" }}>{d}</span>)}
                {celulas.map((c) => {
                  const lista = porDia.get(c.dia) ?? [];
                  const primeiro = lista[0];
                  return (
                    <span
                      key={c.dia}
                      data-fora={c.doMes ? undefined : "1"}
                      data-hoje={c.dia === hoje ? "1" : undefined}
                      data-tem={lista.length ? "1" : undefined}
                      style={primeiro ? ({ "--rhcal-cor": LEGENDA[primeiro.tipo].cor } as React.CSSProperties) : undefined}
                    >
                      {c.n}
                    </span>
                  );
                })}
              </div>

              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 3, minHeight: 18 * 3 }}>
                {linhas.length ? linhas.map((l) => (
                  <li key={l} style={{ fontSize: 12, color: "var(--text-dim)", display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name="circle-dot" size={10} color="var(--text-dim)" />{l}
                  </li>
                )) : (
                  <li style={{ fontSize: 12, color: "var(--text-dim)" }}>Nada marcado</li>
                )}
              </ul>
            </Cartao>
          </button>
        );
      })}
    </Fila>
  );
}
