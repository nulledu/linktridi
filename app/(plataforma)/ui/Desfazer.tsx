"use client";

// ── Aviso "Desfazer" para ação destrutiva (Kinetics 071 · Undo Snackbar) ─────
// Nasce embaixo e SOBE com mola (`--ease-spring-up`, só na entrada: fechar é
// sair da frente, não quicar). A barra que esvazia É o relógio — 3 s de
// `scaleX(1) → scaleX(0)` com origem à esquerda. Quando a barra acaba, o aviso
// sai sozinho; se a pessoa clica em "Desfazer", ele sai na hora.
//
// Só para ação que JÁ tem caminho de volta — este componente não inventa
// desfazer nenhum, ele encurta o caminho de um que existe (apagar com reinserção,
// pagamento com DELETE em /pagar…).
//
// Duas formas de usar:
//   • imperativa, de qualquer lugar (o host mora no `ToastHost`):
//       desfazer({ titulo: "Item apagado", aoDesfazer: () => reinserir(item) })
//   • declarativa, quando quem chama já guarda o estado do que acabou de sair:
//       <DesfazerAviso titulo=… aoDesfazer=… aoSumir=… />

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../Icon";
import { menosMovimento, useAbrirFechar } from "./micro";

/** 3 s: tempo de ler "apaguei" e decidir. Quem precisa de mais passa `duracaoMs`. */
const PADRAO_MS = 3000;

export interface PedidoDesfazer {
  titulo: string;
  detalhe?: string;
  /** Devolve `false` quando o servidor recusou — quem chama já avisou o motivo. */
  aoDesfazer: () => Promise<boolean | void> | boolean | void;
  /** Ícone à esquerda. Padrão: lixeira (a ação comum aqui é apagar). */
  icone?: string;
  /** Cor do ícone: `perigo` (apagou) ou `ok` (registrou algo reversível). */
  tom?: "perigo" | "ok";
  duracaoMs?: number;
}

export function DesfazerAviso({
  titulo, detalhe, aoDesfazer, aoSumir, icone = "trash", tom = "perigo", duracaoMs = PADRAO_MS,
}: PedidoDesfazer & { aoSumir: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [desfazendo, setDesfazendo] = useState(false);
  const { montado, classe } = useAbrirFechar(aberto, "--duration-quick");
  const entrou = useRef(false);
  const sumir = useRef(aoSumir);
  sumir.current = aoSumir;

  useEffect(() => { setAberto(true); }, []);

  // Relógio de reserva. Com menos movimento a barra não anima (não há
  // `animationend`), e no navegador embutido as animações ficam congeladas no
  // primeiro quadro — sem isto o aviso ficaria de pé para sempre. Folga de 2×
  // porque parar o ponteiro em cima pausa a barra de propósito.
  useEffect(() => {
    const ms = menosMovimento() ? duracaoMs : duracaoMs * 2;
    const t = setTimeout(() => setAberto(false), ms);
    return () => clearTimeout(t);
  }, [duracaoMs]);

  useEffect(() => {
    if (montado) { entrou.current = true; return; }
    if (entrou.current) sumir.current();
  }, [montado]);

  if (!montado || typeof document === "undefined") return null;

  async function clicar() {
    setDesfazendo(true);
    try { await aoDesfazer(); } finally { setDesfazendo(false); setAberto(false); }
  }

  return createPortal(
    <div
      className={`ui-desfazer ${classe}`.trim()}
      data-tom={tom}
      role="status"
      aria-live="polite"
      style={{ ["--ui-desfazer-ms" as string]: `${duracaoMs}ms` }}
    >
      <span className="ui-desfazer-ico" aria-hidden>
        <Icon name={icone} size={16} />
      </span>
      <span className="ui-desfazer-txt">
        <strong>{titulo}</strong>
        {detalhe && <small>{detalhe}</small>}
      </span>
      <button type="button" className="ui-desfazer-btn" onClick={clicar} disabled={desfazendo}>
        <Icon name={desfazendo ? "loader" : "arrow-back-up"} size={15} className={desfazendo ? "spin" : undefined} />
        Desfazer
      </button>
      <span className="ui-desfazer-relogio" aria-hidden onAnimationEnd={() => setAberto(false)} />
    </div>,
    document.body,
  );
}

// ── Chamada imperativa ───────────────────────────────────────────────────────
// Um aviso por vez: apagar dois itens seguidos substitui o aviso (o anterior
// já passou do ponto de volta na cabeça de quem clicou duas vezes).

type Item = PedidoDesfazer & { id: number };
let _emit: ((p: Item) => void) | null = null;
let _n = 1;

export function desfazer(p: PedidoDesfazer) { _emit?.({ ...p, id: _n++ }); }

export function DesfazerHost() {
  const [item, setItem] = useState<Item | null>(null);
  useEffect(() => { _emit = setItem; return () => { _emit = null; }; }, []);
  const sumir = useCallback(() => setItem(null), []);
  if (!item) return null;
  return <DesfazerAviso key={item.id} {...item} aoSumir={sumir} />;
}
