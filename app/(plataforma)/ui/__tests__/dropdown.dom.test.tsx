// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Dropdown } from "../Dropdown";

afterEach(cleanup);

function abrir(nome: string) {
  fireEvent.click(screen.getByRole("button", { name: nome }));
}

describe("Dropdown do sistema", () => {
  it("abre em portal no <body>, dispara a ação e fecha", () => {
    const novo = vi.fn();
    render(<div style={{ overflow: "hidden" }}><Dropdown titulo="Ações" itens={[
      { id: "novo", rotulo: "Novo", onSelect: novo },
      { id: "apagar", rotulo: "Apagar", perigo: true },
    ]} /></div>);
    abrir("Ações");
    const menu = screen.getByRole("menu", { name: "Ações" });
    expect(menu.closest(".gp-pop")?.parentElement).toBe(document.body);
    expect(screen.getByRole("menuitem", { name: "Apagar" }).className).toContain("gp-row--perigo");
    fireEvent.click(screen.getByRole("menuitem", { name: "Novo" }));
    expect(novo).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Ações" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("item desativado não dispara e as setas pulam por cima dele", () => {
    const b = vi.fn(); const c = vi.fn();
    render(<Dropdown titulo="Menu" itens={[
      { id: "a", rotulo: "A" },
      { id: "b", rotulo: "B", desativado: true, onSelect: b },
      { id: "c", rotulo: "C", onSelect: c },
    ]} />);
    abrir("Menu");
    fireEvent.click(screen.getByRole("menuitem", { name: "B" }));
    expect(b).not.toHaveBeenCalled();
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });   // A
    fireEvent.keyDown(menu, { key: "ArrowDown" });   // pula B → C
    fireEvent.keyDown(menu, { key: "Enter" });
    expect(c).toHaveBeenCalledOnce();
  });

  it("seleção múltipla marca com aria-checked e continua aberta", () => {
    function Prova() {
      const [sel, setSel] = useState<string[]>(["b"]);
      return <Dropdown titulo="Estilos" secoes={[{ selecao: "multipla", selecionados: sel, onSelecao: setSel, itens: [
        { id: "b", rotulo: "Negrito" }, { id: "i", rotulo: "Itálico" },
      ] }]} />;
    }
    render(<Prova />);
    abrir("Estilos");
    expect(screen.getByRole("menuitemcheckbox", { name: "Negrito" }).getAttribute("aria-checked")).toBe("true");
    act(() => { fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Itálico" })); });
    expect(screen.getByRole("menuitemcheckbox", { name: "Itálico" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("Escape fecha", () => {
    render(<Dropdown titulo="Menu" itens={[{ id: "a", rotulo: "A" }]} />);
    abrir("Menu");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("escolher um item não clica no cartão que contém o gatilho", () => {
    const cartao = vi.fn(); const acao = vi.fn();
    render(<div onClick={cartao}><Dropdown titulo="Menu" itens={[{ id: "a", rotulo: "A", onSelect: acao }]} /></div>);
    abrir("Menu");
    fireEvent.click(screen.getByRole("menuitem", { name: "A" }));
    expect(acao).toHaveBeenCalledOnce();
    expect(cartao).not.toHaveBeenCalled();
  });

  it("item com href vira link de verdade (nova aba preservada)", () => {
    render(<Dropdown titulo="Menu" itens={[{ id: "w", rotulo: "WhatsApp", href: "https://wa.me/1", novaAba: true }]} />);
    abrir("Menu");
    const link = screen.getByRole("menuitem", { name: "WhatsApp" });
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("href")).toBe("https://wa.me/1");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("Esc dentro do menu não vaza pro atalho da tela", () => {
    const daTela = vi.fn();
    window.addEventListener("keydown", daTela);
    render(<Dropdown titulo="Menu" itens={[{ id: "a", rotulo: "A" }]} />);
    abrir("Menu");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    window.removeEventListener("keydown", daTela);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(daTela).not.toHaveBeenCalled();
  });
});
