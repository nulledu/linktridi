"use client";

// Lista vertical reordenável por PONTEIRO — um só caminho pro mouse e pro dedo.
// O drag nativo do HTML5 (o `useArrasto` que isto substituiu) não existe no
// toque: no celular a alça era `desk-only` e sobravam só as setas.
//
// Como funciona: no `pointerdown` a linha vira "arrastando" (transição
// desligada, sombra por CSS); no `pointermove` ela anda por `translateY` do
// delta; quando passa do MEIO da linha vizinha as duas trocam de lugar na
// ordem e a origem do arrasto é recolocada pelo tanto que a linha andou de
// layout — assim ela continua debaixo do cursor. No `pointerup` ela desliza
// pro lugar com `cubic-bezier(0.16,1,0.3,1)`.
//
// A ordem só sai daqui pro dono da lista QUANDO SOLTA. Durante o arrasto ela
// é local: quem persiste (a Central de Tutoriais grava e mostra toast) não
// pode gravar uma vez por linha cruzada.
import { useCallback, useEffect, useRef, useState, type PointerEvent as EventoPonteiro } from "react";

const GLIDE = "transform 350ms cubic-bezier(0.16, 1, 0.3, 1)";

/** Reordena a lista original pela ordem de ids que o arrasto produziu.
 *  Quem carrega `ordem` recebe a posição nova — é por ela que a central
 *  pública ordena, e sem reatribuir a lista voltaria sozinha ao abrir. */
export function porIds<T extends { id: string }>(itens: T[], ids: string[]): T[] {
  const mapa = new Map(itens.map((i) => [i.id, i]));
  const saida = ids.map((id) => mapa.get(id)).filter(Boolean) as T[];
  // Quem não estava na ordem (item novo em corrida com o arrasto) fica no fim.
  for (const i of itens) if (!ids.includes(i.id)) saida.push(i);
  return saida.map((item, i) => ("ordem" in item ? { ...item, ordem: i } : item));
}

export function useReordenavel(ids: string[], onReordenar: (ids: string[]) => void) {
  const els = useRef(new Map<string, HTMLElement>());
  const ordemRef = useRef<string[] | null>(null);
  const arrastoRef = useRef<{ id: string; startY: number; dy: number } | null>(null);
  const [ordem, setOrdem] = useState<string[] | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const onReordenarRef = useRef(onReordenar);
  onReordenarRef.current = onReordenar;

  const aplicar = useCallback((nova: string[]) => { ordemRef.current = nova; setOrdem(nova); }, []);

  const limpar = useCallback((el: HTMLElement, comGlide: boolean) => {
    const semMovimento = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const solta = () => { el.style.transition = ""; el.style.transform = ""; el.style.zIndex = ""; el.style.position = ""; };
    if (!comGlide || semMovimento) return solta();
    el.style.transition = GLIDE;
    el.style.transform = "none";
    const fim = () => { el.removeEventListener("transitionend", fim); solta(); };
    el.addEventListener("transitionend", fim);
    window.setTimeout(fim, 500); // rede: transição congelada não dispara o evento
  }, []);

  const encerrar = useCallback(() => {
    const a = arrastoRef.current;
    if (!a) return;
    arrastoRef.current = null;
    const el = els.current.get(a.id);
    if (el) limpar(el, true);
    setArrastando(null);
    const nova = ordemRef.current;
    ordemRef.current = null;
    setOrdem(null);
    if (nova && nova.join("|") !== ids.join("|")) onReordenarRef.current(nova);
  }, [ids, limpar]);

  // Soltar fora da janela (ou um Esc) não pode deixar a linha grudada no cursor.
  useEffect(() => {
    const cancelar = () => encerrar();
    window.addEventListener("pointercancel", cancelar);
    window.addEventListener("blur", cancelar);
    return () => { window.removeEventListener("pointercancel", cancelar); window.removeEventListener("blur", cancelar); };
  }, [encerrar]);

  const mover = useCallback((clientY: number) => {
    const a = arrastoRef.current;
    const lista = ordemRef.current;
    if (!a || !lista) return;
    const el = els.current.get(a.id);
    if (!el) return;
    a.dy = clientY - a.startY;

    const i = lista.indexOf(a.id);
    const paraCima = a.dy < 0;
    const vizinhoId = lista[paraCima ? i - 1 : i + 1];
    const viz = vizinhoId ? els.current.get(vizinhoId) : null;
    if (viz) {
      const caixa = el.getBoundingClientRect();
      const topoDeLayout = caixa.top - a.dy; // o rect vem com o transform aplicado
      const r = viz.getBoundingClientRect();
      const meio = r.top + r.height / 2;
      const cruzou = paraCima ? topoDeLayout + a.dy < meio : topoDeLayout + caixa.height + a.dy > meio;
      if (cruzou) {
        const nova = lista.slice();
        nova[i] = vizinhoId;
        nova[paraCima ? i - 1 : i + 1] = a.id;
        // Novo topo de layout = onde o vizinho estava; recoloca a origem pelo
        // tanto que a linha pulou, senão ela some de baixo do cursor.
        const salto = r.top - topoDeLayout;
        a.startY += salto;
        a.dy -= salto;
        aplicar(nova);
      }
    }
    el.style.transform = `translateY(${a.dy}px)`;
  }, [aplicar]);

  return {
    /** Id da linha em arrasto agora — pra tela marcar (`data-arrastando`). */
    arrastando,
    /** Ordena a lista pela ordem viva do arrasto. */
    ordenar: <T extends { id: string }>(itens: T[]): T[] => (ordem ? porIds(itens, ordem) : itens),
    /** `ref` da LINHA inteira — é ela que anda. */
    linha: (id: string) => (el: HTMLElement | null) => { if (el) els.current.set(id, el); else els.current.delete(id); },
    /** Props da ALÇA (o grip). Só ela inicia o arrasto. */
    puxador: (id: string) => ({
      onPointerDown: (e: EventoPonteiro) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        const el = els.current.get(id);
        if (!el) return;
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        arrastoRef.current = { id, startY: e.clientY, dy: 0 };
        aplicar(ids.slice());
        setArrastando(id);
        el.style.transition = "none";
        el.style.position = "relative";
        el.style.zIndex = "2";
      },
      onPointerMove: (e: EventoPonteiro) => { if (arrastoRef.current) mover(e.clientY); },
      onPointerUp: () => encerrar(),
      onPointerCancel: () => encerrar(),
      onLostPointerCapture: () => encerrar(),
    }),
  };
}
