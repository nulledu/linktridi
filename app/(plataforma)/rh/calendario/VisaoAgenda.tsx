"use client";

// A visão de agenda: o ano como lista cronológica, agrupada por mês. É a
// leitura "o que vem aí" sem grade — por isso ela COMEÇA no mês atual e os
// meses que já passaram ficam no fim, sob um divisor. Nada de
// `scrollIntoView`: rolar a página sozinho ao trocar de visão parecia defeito
// (a tela "pulava pra baixo"), e a ordem resolve o mesmo problema sem mover.

import { Cartao, TituloCartao, Vazio } from "../../financeiro/ui";
import { MESES_LONGOS, capitalizar } from "@/lib/rh/calendario/datas";
import type { Acontecimento } from "@/lib/rh/calendario/tipos";
import { ListaDeAcontecimentos } from "./pecas";

export function VisaoAgenda({ ano, hoje, lista, aoAbrir }: {
  ano: number;
  hoje: string;
  lista: Acontecimento[];
  aoAbrir: (a: Acontecimento) => void;
}) {
  const porMes = new Map<number, Acontecimento[]>();
  for (const a of lista) {
    const m = Number(a.dia.slice(5, 7));
    porMes.set(m, [...(porMes.get(m) ?? []), a]);
  }
  const ordenados = [...porMes.keys()].sort((a, b) => a - b);
  const mesDeHoje = hoje.slice(0, 4) === String(ano) ? Number(hoje.slice(5, 7)) : null;
  const futuros = mesDeHoje ? ordenados.filter((m) => m >= mesDeHoje) : ordenados;
  const passados = mesDeHoje ? ordenados.filter((m) => m < mesDeHoje) : [];
  const meses = [...futuros, ...passados];

  if (!meses.length) {
    return (
      <Cartao estatico>
        <Vazio icone="calendar-off" titulo="Nenhum evento neste período" detalhe="Nada marcado com os filtros atuais neste ano." />
      </Cartao>
    );
  }

  return (
    <div key={ano} style={{ display: "grid", gap: 14, animation: "pageIn var(--duration-quick, 150ms) var(--ease-out, ease-out) both" }}>
      {meses.map((m, i) => (
        <Cartao key={m} padding={16} style={i === futuros.length && passados.length ? { marginTop: 10 } : undefined}>
          {i === futuros.length && passados.length > 0 && (
            <p style={{ margin: "-4px 0 12px", fontSize: 11, fontWeight: 800, letterSpacing: ".12em", color: "var(--text-dim)" }}>JÁ PASSOU</p>
          )}
          <section>
            <TituloCartao icone="calendar" direita={<span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>{porMes.get(m)!.length}</span>}>
              {capitalizar(MESES_LONGOS[m - 1])}
            </TituloCartao>
            <ListaDeAcontecimentos lista={porMes.get(m)!} hoje={hoje} aoAbrir={aoAbrir} />
          </section>
        </Cartao>
      ))}
    </div>
  );
}
