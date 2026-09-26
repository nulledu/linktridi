"use client";

// ── Seção recolhível ─────────────────────────────────────────────────────────
// O jeito de descer um degrau SEM criar um nível de navegação. Aba obriga a
// pessoa a saber, antes de clicar, que a resposta mora lá; seção deixa o título
// visível na própria página e só o conteúdo fechado.
//
// Use pro que é da mesma tela mas se mexe de vez em quando (turnos, dispositivos,
// análise completa). O caminho comum fica aberto acima; isto é o degrau abaixo.

import { useState, type ReactNode } from "react";
import { Icon } from "../Icon";

export function Secao({ icone, titulo, resumo, inicialAberta = false, children }: {
  icone: string;
  titulo: string;
  /** Uma linha dizendo o que tem dentro — é o que evita abrir pra descobrir. */
  resumo: string;
  inicialAberta?: boolean;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(inicialAberta);
  // A sanfona anima a altura por `grid-template-rows: 0fr → 1fr`, e pra isso o
  // conteúdo precisa estar no DOM: sem ele não há altura de destino. Só que
  // montar tudo de cara acordaria de uma vez os quatro painéis do
  // ColaboradoresHub — cada um com a sua busca — numa tela onde ninguém abriu
  // nenhum. Então monta na PRIMEIRA abertura e não desmonta mais: quem nunca
  // abre não paga nada, e do segundo clique em diante fechar também anima.
  const [montado, setMontado] = useState(inicialAberta);

  return (
    <div className="t-acc" data-open={aberto ? "true" : "false"}
      style={{ borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface)", overflow: "hidden" }}>
      <button onClick={() => { setAberto((v) => !v); setMontado(true); }} aria-expanded={aberto} className="ponto-linha"
        style={{ width: "100%", minHeight: "var(--tap)", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", flexWrap: "wrap" }}>
        <Icon name={icone} size={16} color="var(--text-dim)" />
        <strong style={{ fontSize: 13.5, color: "var(--text)" }}>{titulo}</strong>
        {/* Piso de 140px: sem ele, a 320px o resumo dividia a linha com o título
            e virava uma coluna de uma letra por linha — com o piso ele desce. */}
        <span style={{ fontSize: 12, color: "var(--text-dim)", flex: "1 1 140px", minWidth: 0 }}>· {resumo}</span>
        {/* A MESMA seta muda de estado em vez de trocar de ícone: uma seta
            mudando é uma coisa só; duas setas diferentes são duas coisas. Quem
            vira é a receita, com `scaleY(-1)` — espelhar passa por uma linha
            reta no meio do caminho e funciona em todo navegador, enquanto
            interpolar o `d` do path só o Chromium sabe fazer. */}
        <span className="t-acc-chevron" style={{ display: "grid", placeItems: "center", flex: "none" }}>
          <Icon name="chevron-down" size={16} color="var(--text-dim)" />
        </span>
      </button>
      {/* `inert` fechado porque agora o conteúdo CONTINUA no DOM: sem isto o
          Tab entraria nos campos invisíveis do painel de TV e o leitor de tela
          leria uma seção que a pessoa fechou. */}
      <div className="t-acc-panel" inert={!aberto}>
        {/* `filter: none` no repouso ABERTO, e só nele. A receita deixa
            `blur(0)` parado aqui, e `blur(0)` ainda é filtro: qualquer filtro
            diferente de `none` faz do painel o bloco de contenção dos
            `position: fixed` de dentro — e tem um dentro, o modal de turno do
            `PontoTurnos`, que passaria a ancorar na seção em vez da tela (no
            celular a folha nasceria dentro do bloco em vez de presa embaixo).
            O desfoque cruzado não se perde: interpolar `blur(2px)` contra
            `none` usa o valor identidade do outro lado, que é exatamente o
            `blur(0)` da receita. */}
        <div className="t-acc-panel-inner" style={aberto ? { filter: "none" } : undefined}>
          {/* O padding fica AQUI DENTRO, e não no `-inner` nem no `-panel`: a
              trilha de `0fr` zera a altura, mas padding não encolhe — deixado
              em qualquer um dos dois ele viraria uma tira residual (com o fio
              do `borderTop` junto) e o bloco nunca fecharia de verdade. Quem
              recorta é o `overflow: hidden` do `-inner`. */}
          <div style={{ padding: "4px 16px 16px", borderTop: "1px solid var(--border)" }}>
            {montado && children}
          </div>
        </div>
      </div>
    </div>
  );
}
