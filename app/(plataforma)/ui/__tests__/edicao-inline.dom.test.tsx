import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NumeroInline, TextoInline } from "../EdicaoInline";

/**
 * Edição no lugar ("Cliques: 120 → toca → 147 → Enter"). O que este arquivo
 * trava, porque cada item é um jeito de a fila de salvamento receber lixo:
 *  1. Enter salva UMA vez — o blur que vem junto quando o campo some não
 *     manda o mesmo pedido de novo;
 *  2. Esc desiste e não salva nada (nem pelo blur);
 *  3. valor igual, vazio ou que não é número inteiro não chama `onSalvar`;
 *  4. sem permissão é texto, não botão.
 */

describe("NumeroInline", () => {
  it("toca, digita e Enter: salva o número uma vez só", () => {
    const onSalvar = vi.fn();
    render(<NumeroInline valor={120} rotulo="Cliques" onSalvar={onSalvar} />);
    fireEvent.click(screen.getByRole("button", { name: /Cliques: 120/ }));
    const campo = screen.getByRole("textbox", { name: "Cliques" }) as HTMLInputElement;
    expect(campo.value).toBe("120");
    fireEvent.change(campo, { target: { value: "147" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    fireEvent.blur(campo);
    expect(onSalvar).toHaveBeenCalledTimes(1);
    expect(onSalvar).toHaveBeenCalledWith(147);
  });

  it("aceita o ponto de milhar que a tela mostra", () => {
    const onSalvar = vi.fn();
    render(<NumeroInline valor={120} rotulo="Cliques" onSalvar={onSalvar} />);
    fireEvent.click(screen.getByRole("button"));
    const campo = screen.getByRole("textbox");
    fireEvent.change(campo, { target: { value: "1.240" } });
    fireEvent.blur(campo);
    expect(onSalvar).toHaveBeenCalledWith(1240);
  });

  it("Esc desiste: nada salvo, nem pelo blur de quando o campo some", () => {
    const onSalvar = vi.fn();
    render(<NumeroInline valor={120} rotulo="Cliques" onSalvar={onSalvar} />);
    fireEvent.click(screen.getByRole("button"));
    const campo = screen.getByRole("textbox");
    fireEvent.change(campo, { target: { value: "999" } });
    fireEvent.keyDown(campo, { key: "Escape" });
    fireEvent.blur(campo);
    expect(onSalvar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Cliques: 120/ })).toBeTruthy();
  });

  it("valor igual, vazio, negativo ou quebrado não vira pedido", () => {
    const onSalvar = vi.fn();
    render(<NumeroInline valor={120} rotulo="Vendas" onSalvar={onSalvar} />);
    for (const t of ["120", "", "-3", "2,5", "doze"]) {
      fireEvent.click(screen.getByRole("button"));
      const campo = screen.getByRole("textbox");
      fireEvent.change(campo, { target: { value: t } });
      fireEvent.keyDown(campo, { key: "Enter" });
    }
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it("sem permissão é só o número, sem botão", () => {
    render(<NumeroInline valor={42} rotulo="Vendas" onSalvar={() => {}} desativado />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("42")).toBeTruthy();
  });
});

describe("TextoInline", () => {
  it("apagar o texto salva null, não string vazia", () => {
    const onSalvar = vi.fn();
    render(<TextoInline valor="Black Friday" rotulo="Campanha" onSalvar={onSalvar} />);
    fireEvent.click(screen.getByRole("button", { name: /Campanha: Black Friday/ }));
    const campo = screen.getByRole("textbox", { name: "Campanha" });
    fireEvent.change(campo, { target: { value: "   " } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(onSalvar).toHaveBeenCalledWith(null);
  });

  it("observação: Enter quebra linha, Ctrl+Enter salva", () => {
    const onSalvar = vi.fn();
    render(<TextoInline valor={null} rotulo="Observações" multilinha onSalvar={onSalvar} />);
    fireEvent.click(screen.getByRole("button", { name: /Observações: vazio/ }));
    const campo = screen.getByRole("textbox", { name: "Observações" });
    fireEvent.change(campo, { target: { value: "linha 1\nlinha 2" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(onSalvar).not.toHaveBeenCalled();
    fireEvent.keyDown(campo, { key: "Enter", ctrlKey: true });
    expect(onSalvar).toHaveBeenCalledWith("linha 1\nlinha 2");
  });
});
