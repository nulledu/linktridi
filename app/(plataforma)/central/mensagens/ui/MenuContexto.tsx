"use client";

// Menu do botão direito: abre na POSIÇÃO do ponteiro, sem âncora. Genérico:
// recebe uma lista de itens e cuida de posição, teclado, foco e fechamento.
// O "⋯" (que TEM âncora) é o `MenuMais` lá embaixo, casca do `<Dropdown>` do
// sistema — a mesma lista de itens alimenta os dois.

import { Tecla } from "@/app/(plataforma)/ui/exibicao";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../Icon";
import { Dropdown, type PropsDoGatilho, type SecaoDropdown } from "../../../ui/Dropdown";

export interface ItemMenu {
  chave: string;
  label: string;
  icone?: string;
  atalho?: string;
  perigo?: boolean;
  separadorAntes?: boolean;
  aoEscolher: () => void;
}

export function MenuContexto({
  x, y, itens, aoFechar,
}: { x: number; y: number; itens: ItemMenu[]; aoFechar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [medido, setMedido] = useState(false);
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  // Reposiciona para dentro da janela DEPOIS de medir.
  //
  // `offsetWidth`/`offsetHeight` e NÃO `getBoundingClientRect()`: o menu entra
  // com uma animação que começa em `scale(.96)`, e o rect vem com o transform
  // aplicado — mede menor do que o menu realmente é. A conta de "cabe na tela?"
  // então sobrava alguns pixels e o menu nascia estourando a borda direita.
  // `offset*` ignora transform e devolve o tamanho de layout.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const largura = el.offsetWidth;
    const altura = el.offsetHeight;
    setPos({
      // Perto da borda direita o menu vira para a ESQUERDA da âncora, como faz
      // qualquer menu nativo — em vez de só encostar e cobrir o botão.
      x: x + largura + 8 > window.innerWidth
        ? Math.max(8, x - largura)
        : Math.max(8, x),
      y: y + altura + 8 > window.innerHeight
        ? Math.max(8, y - altura)
        : Math.max(8, y),
    });
    setMedido(true);
    // `montado` PRECISA estar aqui: enquanto ele é false o componente devolve
    // null, então na primeira passada o ref ainda é nulo e o efeito sai cedo.
    // Sem esta dependência ele nunca reexecutava e o menu ficava na posição
    // crua — era isso que o jogava para fora da tela, não a medida.
  }, [x, y, itens.length, montado]);

  useEffect(() => {
    const fechar = (e: Event) => {
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      aoFechar();
    };
    // `capture` para fechar antes que o clique vire ação em outro lugar.
    window.addEventListener("pointerdown", fechar, true);
    window.addEventListener("keydown", fechar);
    window.addEventListener("resize", fechar);
    window.addEventListener("scroll", fechar, true);
    return () => {
      window.removeEventListener("pointerdown", fechar, true);
      window.removeEventListener("keydown", fechar);
      window.removeEventListener("resize", fechar);
      window.removeEventListener("scroll", fechar, true);
    };
  }, [aoFechar]);

  if (!montado) return null;

  return createPortal(
    <div ref={ref} className="ch-menu" role="menu"
      // Fica invisível (mas medível) até a primeira medição: sem isto ele pisca
      // um quadro na posição crua, que é justamente a que estoura a tela.
      style={{ left: pos.x, top: pos.y, visibility: medido ? "visible" : "hidden" }}
      onPointerDown={(e) => e.stopPropagation()}>
      {itens.map((it) => (
        <div key={it.chave}>
          {it.separadorAntes && <div className="ch-menu__sep" />}
          <button
            type="button" role="menuitem"
            className={"ch-menu__item" + (it.perigo ? " ch-menu__item--perigo" : "")}
            onClick={() => { it.aoEscolher(); aoFechar(); }}
          >
            {it.icone && <Icon name={it.icone} size={16} color={it.perigo ? "var(--perigo)" : "var(--text-dim)"} />}
            {it.label}
            {it.atalho && <Tecla>{it.atalho}</Tecla>}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** `separadorAntes` abre uma seção nova; "⌘C" vira as teclas `["⌘", "C"]`. */
export function secoesDoMenu(itens: ItemMenu[]): SecaoDropdown[] {
  const secoes: SecaoDropdown[] = [];
  itens.forEach((it, i) => {
    if (i === 0 || it.separadorAntes) secoes.push({ itens: [] });
    secoes[secoes.length - 1].itens.push({
      id: it.chave, rotulo: it.label, icone: it.icone, perigo: it.perigo, onSelect: it.aoEscolher,
      atalho: it.atalho ? it.atalho.match(/[⌘⇧⌥⌃]|[^⌘⇧⌥⌃]+/g) ?? [it.atalho] : undefined,
    });
  });
  return secoes;
}

/**
 * O "⋯" ancorado: a lista é montada no instante em que abre (como no botão
 * direito) — montar em todo render custaria uma lista por bolha na tela.
 */
export function MenuMais({ titulo, montar, gatilho, onAbertoChange }: {
  titulo: string;
  montar: () => ItemMenu[];
  gatilho: (p: PropsDoGatilho) => ReactNode;
  onAbertoChange?: (v: boolean) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [secoes, setSecoes] = useState<SecaoDropdown[]>([]);
  return (
    <Dropdown titulo={titulo} secoes={secoes} alinhar="fim" largura={232} gatilho={gatilho}
      aberto={aberto}
      onAbertoChange={(v) => {
        if (v) setSecoes(secoesDoMenu(montar()));
        setAberto(v);
        onAbertoChange?.(v);
      }} />
  );
}

/** Barra rápida de reação — mesmo mecanismo de posicionamento, outro visual. */
export function ReagirRapido({
  x, y, emojis, aoEscolher, aoFechar,
}: { x: number; y: number; emojis: string[]; aoEscolher: (e: string) => void; aoFechar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [medido, setMedido] = useState(false);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  // Mesma armadilha do menu: a barra entra em `scale(.96)` e o rect mente.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const largura = el.offsetWidth, altura = el.offsetHeight;
    setPos({
      x: Math.max(8, Math.min(x - largura / 2, window.innerWidth - largura - 8)),
      y: y + altura + 8 > window.innerHeight ? Math.max(8, y - altura - 12) : y + 6,
    });
    setMedido(true);
  }, [x, y, montado]);

  useEffect(() => {
    const fechar = () => aoFechar();
    window.addEventListener("pointerdown", fechar, true);
    window.addEventListener("keydown", fechar);
    return () => {
      window.removeEventListener("pointerdown", fechar, true);
      window.removeEventListener("keydown", fechar);
    };
  }, [aoFechar]);

  if (!montado) return null;
  return createPortal(
    <div ref={ref} className="ch-reagir-rapido"
      style={{ left: pos.x, top: pos.y, visibility: medido ? "visible" : "hidden" }}
      onPointerDown={(e) => e.stopPropagation()}>
      {emojis.map((e) => (
        <button key={e} type="button" onClick={() => { aoEscolher(e); aoFechar(); }}>{e}</button>
      ))}
    </div>,
    document.body,
  );
}
