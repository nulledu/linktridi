"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Barra de rolagem horizontal PRESA no rodapé da tela, com polegar próprio.
 *
 * O problema que ela resolve: uma tabela larga e alta (a folha, com 21
 * pessoas) rola de lado por dentro, mas a barra nativa fica no FIM do bloco —
 * a três telas de distância — e é um fio de 10px que quase não se vê. Quem usa
 * mouse não tem rolagem horizontal e conclui que "não dá pra rolar dentro da
 * tabela".
 *
 * Por que um polegar DESENHADO e não a barra nativa: a nativa aparece só no
 * fim do conteúdo e, no macOS, some por completo até alguém tocar no trackpad.
 * Uma barra que só existe depois que a pessoa descobre o gesto não ensina o
 * gesto. Aqui ela fica sempre visível enquanto houver o que rolar, e a largura
 * do polegar já diz QUANTO falta ver.
 *
 * Some sozinha quando o bloco cabe na largura. No celular fica acima da barra
 * de navegação e da área segura (`--tabbar-h`, `--safe-b`).
 */
export interface ControleRolagem { atualizar: () => void }

export function RolagemPresa({ alvo, controle, rotulo = "Rolar a tabela de lado" }: {
  alvo: RefObject<HTMLElement | null>;
  /**
   * Por onde o BLOCO avisa que rolou. O listener interno de `scroll` fica no
   * elemento capturado quando o efeito montou; se o bloco for recriado numa
   * repintura, aquele elemento morre e o polegar congela — foi o que
   * aconteceu. Com o pai chamando `controle.current.atualizar()` no próprio
   * `onScroll`, a sincronia não depende de o nó ser o mesmo de antes.
   */
  controle?: RefObject<ControleRolagem | null>;
  rotulo?: string;
}) {
  const trilho = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState({ visivel: false, fracao: 1, pos: 0 });
  const arrasto = useRef<{ x: number; scroll: number } | null>(null);

  /** Lê o alvo e reflete no polegar: largura = quanto cabe, posição = onde está. */
  const medir = useCallback(() => {
    const el = alvo.current;
    if (!el) return;
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra <= 1) { setEstado({ visivel: false, fracao: 1, pos: 0 }); return; }
    setEstado({
      visivel: true,
      fracao: Math.min(1, el.clientWidth / el.scrollWidth),
      pos: el.scrollLeft / sobra,
    });
  }, [alvo]);

  // O pai chama isto no `onScroll` do bloco — é a sincronia que não depende
  // de o nó continuar sendo o mesmo.
  useEffect(() => {
    if (controle) controle.current = { atualizar: medir };
    return () => { if (controle) controle.current = null; };
  }, [controle, medir]);

  useEffect(() => {
    const el = alvo.current;
    if (!el) return;
    // Uma medição no próximo quadro além da imediata: no primeiro paint a
    // fonte ainda não assentou e a tabela mede menos do que vai medir.
    medir();
    const quadro = requestAnimationFrame(medir);
    el.addEventListener("scroll", medir, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(el);
    // A largura do CONTEÚDO muda sem o bloco mudar (coluna que entra ou sai).
    const filho = el.firstElementChild;
    if (filho && ro) ro.observe(filho);
    window.addEventListener("resize", medir);
    return () => {
      cancelAnimationFrame(quadro);
      el.removeEventListener("scroll", medir);
      ro?.disconnect();
      window.removeEventListener("resize", medir);
    };
  }, [alvo, medir]);

  /** Move o alvo para a posição relativa `p` (0 a 1) do trilho. */
  const irPara = useCallback((p: number) => {
    const el = alvo.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, Math.min(1, p)) * (el.scrollWidth - el.clientWidth);
  }, [alvo]);

  function pegar(e: React.PointerEvent) {
    const el = alvo.current;
    const tr = trilho.current;
    if (!el || !tr) return;
    const caixa = tr.getBoundingClientRect();
    const largura = caixa.width * estado.fracao;
    const esquerda = caixa.left + estado.pos * (caixa.width - largura);
    // Clicar FORA do polegar salta para lá; clicar nele começa o arrasto. Sem
    // o salto, metade dos cliques na barra não fazia nada.
    if (e.clientX < esquerda || e.clientX > esquerda + largura) {
      const alvoP = (e.clientX - caixa.left - largura / 2) / Math.max(1, caixa.width - largura);
      irPara(alvoP);
    }
    arrasto.current = { x: e.clientX, scroll: el.scrollLeft };
    tr.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function mover(e: React.PointerEvent) {
    const el = alvo.current;
    const tr = trilho.current;
    if (!arrasto.current || !el || !tr) return;
    const caixa = tr.getBoundingClientRect();
    const util = Math.max(1, caixa.width * (1 - estado.fracao));
    const sobra = el.scrollWidth - el.clientWidth;
    el.scrollLeft = arrasto.current.scroll + ((e.clientX - arrasto.current.x) / util) * sobra;
  }
  function soltar() { arrasto.current = null; }

  return (
    <div
      ref={trilho}
      className="rolagem-presa"
      role="scrollbar"
      aria-label={rotulo}
      aria-orientation="horizontal"
      aria-hidden={!estado.visivel}
      onPointerDown={pegar}
      onPointerMove={mover}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      style={{
        position: "sticky",
        bottom: "calc(var(--tabbar-h, 0px) + var(--safe-b, 0px))",
        zIndex: 3,
        // A caixa toda é alvo de clique — o polegar sozinho (7px) seria fino
        // demais para o dedo. Ela OCUPA as suas 18px em vez de flutuar sobre a
        // tabela: por cima, tapava a última linha justo quando alguém rola até
        // o fim para conferi-la.
        height: estado.visivel ? 18 : 0,
        opacity: estado.visivel ? 1 : 0,
        pointerEvents: estado.visivel ? "auto" : "none",
        display: "grid",
        alignContent: "center",
        padding: "0 6px",
        cursor: arrasto.current ? "grabbing" : "grab",
        touchAction: "none",
        background: "linear-gradient(to top, var(--card, var(--surface)) 60%, transparent)",
      }}
    >
      <div style={{ position: "relative", height: 7, borderRadius: 999, background: "color-mix(in srgb, var(--text) 8%, transparent)" }}>
        <div
          style={{
            position: "absolute", top: 0, bottom: 0, borderRadius: 999,
            width: `${Math.max(8, estado.fracao * 100)}%`,
            left: `${estado.pos * (100 - Math.max(8, estado.fracao * 100))}%`,
            background: "color-mix(in srgb, var(--text) 34%, transparent)",
          }}
        />
      </div>
    </div>
  );
}
