"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { eggDoMomento, eggMarco, marcoAlcancado, primeiraVez, type Egg } from "@/lib/gaius-eggs";

// ── Sussurro ─────────────────────────────────────────────────────────────────
// A única forma que os detalhes silenciosos do GAIUS têm de aparecer: um bloco
// pequeno, sem botão, sem ação, que some sozinho em ~3,6s. Não é modal, não é
// página, não interrompe nada — `pointer-events: none` garante que nem sequer
// atrapalha um clique no que está atrás.
//
// Duas formas: `Sussurro` (preso a um elemento — o pai precisa ser `relative`)
// e `SussurroHost` + `sussurrar()` (flutuante, montado uma vez no Shell).

/**
 * Quanto tempo o sussurro fica.
 *
 * Dois tempos, porque são duas situações diferentes:
 *
 * - AMBIENTE (`VIDA`): a frase aparece sozinha — a virada da meia-noite, um
 *   marco alcançado. Ninguém pediu, então ela passa e vai embora.
 * - PEDIDO (`VIDA_PEDIDA`): a pessoa CLICOU nas coordenadas pra ver. Quem pediu
 *   merece tempo de terminar de ler.
 *
 * O número não é chute. O sussurro tem três linhas — rótulo, uma frase em
 * LATIM e a tradução. O latim é o caro: são palavras que a pessoa não
 * reconhece, então ela lê devagar e depois procura a tradução embaixo pra
 * conferir. Medindo o texto do Svalbard: ~0,5s pra notar que apareceu, ~3,3s no
 * latim, ~2,2s na tradução, com o rótulo passado de olho. Perto de 6 segundos
 * de leitura de verdade.
 */
const VIDA = 6000;
const VIDA_PEDIDA = 9000;

/**
 * A animação `@sussurro` (globals.css) tem o DESAPARECIMENTO embutido: ela
 * termina em `opacity: 0`. Então a duração dela tem que ser a vida inteira — e
 * é por isso que ela é derivada daqui, e não escrita à mão no CSS.
 *
 * O defeito que isso conserta: o keyframe rodava em `.5s` enquanto o componente
 * só era removido aos 3600ms. Como os marcos internos são 22% (entra) e 78%
 * (começa a sumir), a janela LEGÍVEL era de 280ms — e depois `fill-mode: both`
 * prendia em opacity 0 por mais 3,1 segundos, com um elemento invisível parado
 * na tela. Medido no navegador: opacidade já era 0 aos 564ms.
 *
 * Os dois números tinham que concordar e não concordavam. Agora só existe um.
 */
const animacao = (vida: number) => `sussurro ${vida}ms cubic-bezier(.2,.9,.3,1) both`;

/** Miolo visual — compartilhado pelas duas formas. */
function Corpo({ egg, vida = VIDA }: { egg: Egg; vida?: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        pointerEvents: "none",
        // O sussurro pode nascer dentro de um canto monoespaçado e `nowrap`
        // (o rodapé do login): zera a tipografia herdada antes de desenhar.
        fontFamily: "var(--font)",
        letterSpacing: "normal",
        textTransform: "none",
        whiteSpace: "normal",
        width: "max-content",
        maxWidth: "min(300px, calc(100vw - 32px))",
        padding: "11px 14px 12px",
        borderRadius: 14,
        border: "1px solid color-mix(in srgb, var(--text) 12%, transparent)",
        background: "color-mix(in srgb, var(--bg) 82%, transparent)",
        backdropFilter: "blur(18px) saturate(160%)",
        WebkitBackdropFilter: "blur(18px) saturate(160%)",
        boxShadow: "0 12px 40px rgba(0,0,0,.20)",
        textAlign: "center",
        animation: animacao(vida),
      }}
    >
      <div
        style={{
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          fontSize: 9.5,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "color-mix(in srgb, var(--text) 42%, transparent)",
          marginBottom: 7,
        }}
      >
        {egg.titulo}
      </div>
      <div style={{ fontSize: 14, fontWeight: 500, fontStyle: "italic", letterSpacing: "-0.01em", color: "var(--text)", lineHeight: 1.35 }}>
        {egg.frase}
      </div>
      <div style={{ fontSize: 11.5, color: "color-mix(in srgb, var(--text) 52%, transparent)", marginTop: 4, lineHeight: 1.35 }}>
        {egg.nota}
      </div>
    </div>
  );
}

/**
 * Preso a um elemento da página (o pai precisa ter `position: relative`).
 * `onFim` é chamado quando o tempo acaba — quem chamou volta ao estado normal.
 */
export function Sussurro({ egg, onFim, vida = VIDA_PEDIDA, ...pos }: {
  egg: Egg;
  onFim: () => void;
  /** Padrão: o tempo de quem PEDIU (clicou). Ver VIDA_PEDIDA. */
  vida?: number;
  bottom?: number | string;
  top?: number | string;
  left?: number | string;
  right?: number | string;
  transform?: string;
}) {
  useEffect(() => {
    const t = setTimeout(onFim, vida);
    return () => clearTimeout(t);
  }, [egg, onFim, vida]);
  return (
    <div style={{ position: "absolute", zIndex: 20, pointerEvents: "none", ...pos }}>
      <Corpo egg={egg} vida={vida} />
    </div>
  );
}

/**
 * Marco redondo (1.000, 5.000, 10.000…) num total que a tela JÁ carregou — não
 * busca nada, não conta nada, não guarda nada no banco. Sussurra uma única vez
 * por marco, por navegador, e nunca mais. Não renderiza nada por si só.
 */
export function MarcoSilencioso({ total, oQue }: { total: number; oQue: string }) {
  useEffect(() => {
    const n = marcoAlcancado(total);
    if (!n) return;
    if (!primeiraVez(`marco.${oQue}.${n}`)) return;
    const t = setTimeout(() => sussurrar(eggMarco(n, oQue)), 1200);
    return () => clearTimeout(t);
  }, [total, oQue]);
  return null;
}

// ── Forma flutuante (plataforma) ─────────────────────────────────────────────

let _emitir: ((e: Egg) => void) | null = null;

/** Mostra um sussurro de qualquer lugar do client. Sem host montado, não faz nada. */
export function sussurrar(egg: Egg) { _emitir?.(egg); }

/** Host único — vive no Shell. Só um sussurro por vez; o novo substitui o velho. */
export function SussurroHost() {
  const [egg, setEgg] = useState<Egg | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => { setPronto(true); }, []);

  useEffect(() => {
    _emitir = (e) => setEgg(e);
    return () => { _emitir = null; };
  }, []);

  // A frase do MOMENTO (virada da meia-noite, aniversário do sistema) só
  // disparava na tela de login — e ninguém está na tela de login à meia-noite.
  // Quem vira o dia trabalhando está aqui dentro, e era justamente essa pessoa
  // que a frase não alcançava.
  //
  // `primeiraVez` garante uma aparição por ocasião: sem isso, trocar de página
  // dentro da janela das 00:00–00:04 remontaria o host e repetiria a frase — e
  // repetir é o que transforma um detalhe em incômodo.
  //
  // Nenhuma requisição, nenhum `setInterval`: só é avaliado na montagem.
  useEffect(() => {
    const e = eggDoMomento();
    if (!e) return;                                   // o caso quase sempre
    if (!primeiraVez(`momento.${e.titulo}`)) return;
    const t = setTimeout(() => sussurrar(e), 2400);   // deixa a tela assentar
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!egg) return;
    const t = setTimeout(() => setEgg(null), VIDA);
    return () => clearTimeout(t);
  }, [egg]);

  if (!pronto || !egg) return null;
  return createPortal(
    <div className="sussurro-host"><Corpo egg={egg} /></div>,
    document.body,
  );
}
