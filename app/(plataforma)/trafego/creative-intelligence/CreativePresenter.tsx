"use client";

import { useCallback, useEffect, useRef, type CSSProperties, type WheelEvent as ReactWheelEvent } from "react";
import type { EditorDeck } from "@/lib/creative-intelligence/editor-deck";
import type { CreativeIntelligencePayload } from "@/lib/creative-intelligence/types";
import { Icon } from "../../Icon";
import { Portal } from "../../Portal";
import { travarRolagem } from "../../ui/travaRolagem";
import { DeckNav, DeckSlides, useSwipe } from "./CreativeDeck";

const FOCAVEIS = "button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])";

/** Mantém o Tab dentro da apresentação: por trás dela está o modal inteiro. */
function prenderFoco(event: KeyboardEvent, root: HTMLElement) {
  const itens = [...root.querySelectorAll<HTMLElement>(FOCAVEIS)].filter((el) => !el.closest("[hidden]"));
  if (!itens.length) { event.preventDefault(); return; }
  const primeiro = itens[0];
  const ultimo = itens[itens.length - 1];
  const ativo = document.activeElement;
  if (event.shiftKey && (ativo === primeiro || ativo === root || !root.contains(ativo))) { event.preventDefault(); ultimo.focus(); }
  else if (!event.shiftKey && (ativo === ultimo || !root.contains(ativo))) { event.preventDefault(); primeiro.focus(); }
}

/**
 * Modo "Apresentar": o deck ocupando a tela, pra reunião com o editor ou a TV
 * da sala. Mesmos slides da aba (mesmo índice), só que no palco inteiro —
 * setas, espaço, PageUp/PageDown, Home/End, roda do mouse e arrastar no toque.
 */
export function CreativePresenter({ deck, payload, previewUrl, current, onGo, onClose }: {
  deck: EditorDeck;
  payload: CreativeIntelligencePayload;
  previewUrl?: string | null;
  current: number;
  onGo: (index: number) => void;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const total = deck.slides.length;
  const latest = useRef({ current, total, onGo, onClose });
  const wheelLock = useRef(0);
  const swipe = useSwipe(() => onGo(current - 1), () => onGo(current + 1));

  useEffect(() => { latest.current = { current, total, onGo, onClose }; });

  useEffect(() => travarRolagem(), []);

  // O <Portal> só desenha depois do próprio efeito de montagem: no efeito daqui
  // o nó ainda não existe. O foco entra quando o nó chega (ref de callback).
  const setRoot = useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    node?.focus();
  }, []);

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    return () => anterior?.focus?.();
  }, []);

  useEffect(() => {
    // Captura no window: o modal do criativo escuta ← → e Esc no window (fase
    // de bolha) pra trocar/fechar o criativo. Parando aqui, a tecla é SÓ da
    // apresentação — Esc sai do slide sem derrubar o modal de trás.
    const onKey = (event: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const { current: atual, total: n, onGo: ir, onClose: fechar } = latest.current;
      if (event.key === "Tab") { prenderFoco(event, root); event.stopImmediatePropagation(); return; }
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const emBotao = event.target instanceof Element && Boolean(event.target.closest("button"));
      let alvo: number;
      switch (event.key) {
        case "Escape": event.preventDefault(); event.stopImmediatePropagation(); fechar(); return;
        case "ArrowRight": case "ArrowDown": case "PageDown": alvo = atual + 1; break;
        case "ArrowLeft": case "ArrowUp": case "PageUp": alvo = atual - 1; break;
        case " ": case "Enter":
          if (emBotao) return; // espaço/Enter num botão é o clique dele
          alvo = event.shiftKey ? atual - 1 : atual + 1;
          break;
        case "Home": alvo = 0; break;
        case "End": alvo = n - 1; break;
        default: return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      ir(alvo);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const onWheel = (event: ReactWheelEvent) => {
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    if (Math.abs(delta) < 24) return;
    const agora = Date.now();
    // Um gesto de trackpad dispara dezenas de eventos: um slide por gesto.
    if (agora < wheelLock.current) return;
    wheelLock.current = agora + 650;
    onGo(current + (delta > 0 ? 1 : -1));
  };

  return (
    <Portal>
      <div
        ref={setRoot}
        className="tf-scope ci-presenter"
        role="dialog"
        aria-modal="true"
        aria-label={`Apresentação: ${payload.current.name}`}
        tabIndex={-1}
        onWheel={onWheel}
      >
        <div className="ci-presenter-area">
          <div className="ci-deck-stage" {...swipe}>
            <DeckSlides deck={deck} payload={payload} previewUrl={previewUrl} current={current} />
          </div>
        </div>
        <div className="ci-presenter-bar">
          <div className="ci-presenter-progress" aria-hidden="true"><i style={{ "--v": (current + 1) / total } as CSSProperties} /></div>
          <DeckNav deck={deck} current={current} onGo={onGo}>
            <button type="button" className="ci-deck-arrow" aria-label="Sair da apresentação" title="Sair (Esc)" onClick={onClose}>
              <Icon name="x" size={18} color="currentColor" />
            </button>
          </DeckNav>
          <span className="ci-presenter-hint" aria-hidden="true">← → navega · Esc sai</span>
        </div>
      </div>
    </Portal>
  );
}
