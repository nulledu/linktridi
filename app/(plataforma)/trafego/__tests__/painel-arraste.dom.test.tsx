import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PainelPersonalizavel } from "../PainelPersonalizavel";
import { sampleOverview, sampleVendas } from "@/lib/trafego-sample";
import { DEFAULT_PERIOD } from "../../PeriodPicker";

// ── Arraste do "Meu painel": rede magnética ──────────────────────────────────
//
// Duas mudanças de motor até aqui. O draggable nativo do HTML5 "funcionava mal"
// (fantasma do navegador, drop seco, toque inerte) e virou pointer events com
// prévia ao vivo. A prévia ao vivo, por sua vez, é o que deixava o painel
// "solto": a grade se refazia a cada milímetro e o alvo fugia do ponteiro.
// Agora a rede é FIXA — cada card tem uma casa (`--c`/`--r`) — e quem anda
// durante o arraste é só o card. Estas provas travam o CONTRATO do motor, não
// a animação (que é WAAPI, e o jsdom nem tem):
//
//  1. durante o arraste os vizinhos reagem à PRÉVIA (Layout Engine, lattice.ts)
//     e o placeholder mostra a casa futura — mas nada é salvo nem sai do DOM;
//  2. soltar persiste a nova posição no layout salvo;
//  3. Esc no meio do arraste não deixa nada salvo;
//  4. mover menos que o limiar de 6px NÃO vira arraste — o clique nos
//     controles do card (S/M/L, ocultar) continua funcionando;
//  5. soltar restaura o user-select/cursor do body;
//  6. as setas do teclado andam uma casa (o painel sem mouse).

const ui = () => (
  <PainelPersonalizavel d={sampleOverview()} userId="teste" period={DEFAULT_PERIOD} vendasPreview={sampleVendas()} />
);

const chaves = () => [...document.querySelectorAll<HTMLElement>("[data-wkey]")].map((e) => e.dataset.wkey);

// jsdom devolve rect zerado. A casa sob o ponteiro é medida a partir do
// retângulo da REDE (não mais da distância entre cards), então é ele que
// precisa existir: 4 colunas de 100px com 14px de gap.
const LARGURA = 4 * 100 + 3 * 14;
function posicionarRede() {
  const grade = document.querySelector<HTMLElement>(".tf-grid")!;
  grade.getBoundingClientRect = () => ({
    left: 0, right: LARGURA, top: 0, bottom: 1000, width: LARGURA, height: 1000,
    x: 0, y: 0, toJSON: () => ({}),
  }) as DOMRect;
}

const abrirEdicao = () => fireEvent.click(screen.getByText("Personalizar painel"));

// PointerEvent não existe no jsdom; MouseEvent com o type certo chega igual
// nos handlers do React e nos listeners de window.
const ponteiro = (tipo: string, alvo: EventTarget, x: number, y: number) =>
  act(() => { alvo.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })); });

beforeEach(() => { localStorage.clear(); });
afterEach(() => { document.body.style.userSelect = ""; document.body.style.cursor = ""; });

describe("Meu painel · rede magnética", () => {
  it("durante o arraste nada é salvo nem reordenado no DOM — o placeholder mostra a casa futura", () => {
    render(ui());
    abrirEdicao();
    posicionarRede();
    const antes = chaves();
    const primeiro = document.querySelector<HTMLElement>("[data-wkey]")!;

    ponteiro("pointerdown", primeiro, 20, 20);
    ponteiro("pointermove", window, 40, 40);   // passa do limiar de 6px
    ponteiro("pointermove", window, 250, 220); // terceira coluna, segunda fileira

    expect(chaves()).toEqual(antes);                              // ninguém reempacotou
    expect(document.querySelector(".tf-casa-alvo")).not.toBeNull(); // a casa acendeu
    expect(primeiro.style.transform).toContain("translate");       // o card segue o ponteiro

    ponteiro("pointerup", window, 250, 220);
    expect(document.querySelector(".tf-casa-alvo")).toBeNull();
  });

  it("soltar numa casa persiste a nova posição no layout salvo", () => {
    render(ui());
    abrirEdicao();
    posicionarRede();
    const antes = chaves();
    const primeiro = document.querySelector<HTMLElement>("[data-wkey]")!;
    const k = primeiro.dataset.wkey!;

    ponteiro("pointerdown", primeiro, 20, 20);
    ponteiro("pointermove", window, 40, 40);
    ponteiro("pointermove", window, 250, 220);
    ponteiro("pointerup", window, 250, 220);

    const depois = chaves();
    expect(depois).not.toEqual(antes);
    expect(depois[0]).not.toBe(k);
    const salvo = JSON.parse(localStorage.getItem("trafego.painel.teste")!);
    expect(salvo.order.slice(0, depois.length)).toEqual(depois);
  });

  it("Esc no meio do arraste cancela: ordem original de volta, nada salvo", () => {
    render(ui());
    abrirEdicao();
    posicionarRede();
    const antes = chaves();
    const primeiro = document.querySelector<HTMLElement>("[data-wkey]")!;

    ponteiro("pointerdown", primeiro, 20, 20);
    ponteiro("pointermove", window, 40, 40);
    ponteiro("pointermove", window, 250, 220);

    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(chaves()).toEqual(antes);
    expect(primeiro.style.transform).toBe("");
    expect(localStorage.getItem("trafego.painel.teste")).toBeNull();
  });

  it("mexer menos que o limiar não vira arraste — clique nos controles sobrevive", () => {
    render(ui());
    abrirEdicao();
    posicionarRede();
    const antes = chaves();
    const primeiro = document.querySelector<HTMLElement>("[data-wkey]")!;

    ponteiro("pointerdown", primeiro, 20, 20);
    ponteiro("pointermove", window, 22, 22);            // 3px — abaixo do limiar
    ponteiro("pointerup", window, 22, 22);
    expect(chaves()).toEqual(antes);
    expect(localStorage.getItem("trafego.painel.teste")).toBeNull();
  });

  it("soltar (ou cancelar) devolve o user-select do body", () => {
    render(ui());
    abrirEdicao();
    posicionarRede();
    const primeiro = document.querySelector<HTMLElement>("[data-wkey]")!;

    ponteiro("pointerdown", primeiro, 20, 20);
    ponteiro("pointermove", window, 200, 60);
    expect(document.body.style.userSelect).toBe("none");
    ponteiro("pointerup", window, 200, 60);
    expect(document.body.style.userSelect).toBe("");
  });

  it("as setas andam uma casa — e a volta desfaz", () => {
    render(ui());
    abrirEdicao();
    const antes = chaves();
    const primeiro = document.querySelector<HTMLElement>("[data-wkey]")!;
    const k = primeiro.dataset.wkey!;

    // O primeiro card é G (largura toda): pro lado não há casa, pra baixo há.
    fireEvent.keyDown(primeiro, { key: "ArrowDown" });
    const depois = chaves();
    expect(depois).not.toEqual(antes);
    expect(depois.indexOf(k)).toBeGreaterThan(0);

    fireEvent.keyDown(document.querySelector<HTMLElement>(`[data-wkey="${k}"]`)!, { key: "ArrowUp" });
    // A volta devolve o card à casa de origem; a sobra do fim pode ter sido
    // fechada no caminho (o motor não deixa buraco), então compara o começo.
    expect(chaves()[0]).toBe(k);
    expect(chaves().slice(0, 10)).toEqual(antes.slice(0, 10));
  });
});
