"use client";

// A visão mensal: a grade de sete colunas, domingo primeiro.
//
// Duas formas, decididas por CSS (`calendario.css`) e por uma prop:
//   computador — cada célula mostra até `MAX_NA_CELULA` itens e "+ N";
//   celular    — a célula mostra pontos coloridos, e a lista do dia escolhido
//                aparece embaixo da grade (é a ideia do `fullscreen-calendar`
//                de referência, sem encolher a grade do computador).
//
// `useIsMobile()` decide o conteúdo da célula (pontos × pílulas) porque isso
// é ESTRUTURA, não estilo; a altura e o padding continuam sendo CSS.

import { useEffect, useMemo, useRef } from "react";
import { useIsMobile } from "../../ui/useMediaQuery";
import { DIAS_SEMANA_CURTOS, diaDaSemana, gradeDoMes } from "@/lib/rh/calendario/datas";
import { LEGENDA, ehFeriado, type Acontecimento } from "@/lib/rh/calendario/tipos";
import { ItemDaCelula, ListaDeAcontecimentos } from "./pecas";
import { Cartao, TituloCartao } from "../../financeiro/ui";
import { diaComSemana } from "@/lib/rh/calendario/datas";

const MAX_NA_CELULA = 4;

export function VisaoMes({ ano, mes, hoje, porDia, escolhido, aoEscolher, aoAbrir }: {
  ano: number;
  mes: number;
  hoje: string;
  porDia: Map<string, Acontecimento[]>;
  /** O dia selecionado (`AAAA-MM-DD`) ou null. */
  escolhido: string | null;
  aoEscolher: (dia: string) => void;
  aoAbrir: (a: Acontecimento) => void;
}) {
  const celulas = useMemo(() => gradeDoMes(ano, mes), [ano, mes]);
  const celular = useIsMobile();
  const grade = useRef<HTMLDivElement>(null);

  // Teclado: setas andam pela grade. É o mínimo para a grade ser usável sem
  // mouse — 42 botões sem navegação por seta são 42 Tabs.
  useEffect(() => {
    const el = grade.current;
    if (!el) return;
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (!alvo.matches?.(".rhcal-celula")) return;
      const passo = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" ? 7 : e.key === "ArrowUp" ? -7 : 0;
      if (!passo) return;
      const todos = [...el.querySelectorAll<HTMLElement>(".rhcal-celula")];
      const i = todos.indexOf(alvo);
      const prox = todos[i + passo];
      if (prox) { e.preventDefault(); prox.focus(); }
    };
    el.addEventListener("keydown", tecla);
    return () => el.removeEventListener("keydown", tecla);
  }, []);

  const listaDoDia = escolhido ? porDia.get(escolhido) ?? [] : [];

  return (
    <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
      {/* `key` remonta a grade ao trocar de mês: é o que dispara o `pageIn`
          de novo. Termina em `transform: none` (globals.css) — sem bloco de
          contenção pros painéis que abrem daqui. */}
      <div
        key={`${ano}-${mes}`}
        ref={grade}
        className="rhcal-grade"
        role="grid"
        aria-label="Dias do mês"
        style={{ animation: "pageIn var(--duration-quick, 150ms) var(--ease-out, ease-out) both" }}
      >
        {DIAS_SEMANA_CURTOS.map((d) => <div key={d} className="rhcal-semana" role="columnheader">{d}</div>)}
        {celulas.map((c) => {
          const lista = porDia.get(c.dia) ?? [];
          const feriado = lista.find((a) => ehFeriado(a.tipo));
          const eHoje = c.dia === hoje;
          // O fundo do dia diz o que ele é: feriado tinge forte com a cor da
          // esfera; dia com evento leva um tom leve da cor do primeiro item.
          const tinta = feriado ?? lista[0];
          return (
            <button
              key={c.dia}
              type="button"
              role="gridcell"
              className="rhcal-celula"
              data-fora={c.doMes ? undefined : "1"}
              data-fds={[0, 6].includes(diaDaSemana(c.dia)) ? "1" : undefined}
              data-hoje={eHoje ? "1" : undefined}
              data-tem={feriado ? "feriado" : lista.length ? "evento" : undefined}
              style={tinta ? ({ "--rhcal-cor": LEGENDA[tinta.tipo].cor } as React.CSSProperties) : undefined}
              data-escolhido={escolhido === c.dia ? "1" : undefined}
              aria-pressed={escolhido === c.dia}
              aria-label={`${diaComSemana(c.dia)}${lista.length ? `, ${lista.length} ${lista.length === 1 ? "acontecimento" : "acontecimentos"}` : ""}`}
              onClick={() => aoEscolher(c.dia)}
              tabIndex={c.doMes ? 0 : -1}
            >
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                <span className="rhcal-num">{c.n}</span>
                {!celular && lista.length > 0 && (
                  <small style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{lista.length}</small>
                )}
              </span>

              {celular ? (
                lista.length > 0 && (
                  <span className="rhcal-pontos" aria-hidden>
                    {lista.slice(0, 6).map((a) => (
                      <span key={a.chave} className="rhcal-ponto" style={{ "--rhcal-cor": LEGENDA[a.tipo].cor } as React.CSSProperties} />
                    ))}
                  </span>
                )
              ) : (
                <>
                  {feriado && <ItemDaCelula a={feriado} />}
                  {lista.filter((a) => a !== feriado).slice(0, feriado ? MAX_NA_CELULA - 1 : MAX_NA_CELULA).map((a) => (
                    <ItemDaCelula key={a.chave} a={a} />
                  ))}
                  {lista.length > MAX_NA_CELULA && (
                    <span className="rhcal-mais">+ {lista.length - MAX_NA_CELULA} {lista.length - MAX_NA_CELULA === 1 ? "evento" : "eventos"}</span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* No celular a lista do dia mora aqui, sob a grade. No computador o dia
          escolhido abre em painel (o pai decide), então nada é desenhado. */}
      {celular && escolhido && (
        <Cartao padding={14}>
          <TituloCartao icone="calendar-event">{diaComSemana(escolhido)}</TituloCartao>
          <ListaDeAcontecimentos lista={listaDoDia} hoje={hoje} aoAbrir={aoAbrir} semData />
        </Cartao>
      )}
    </div>
  );
}
