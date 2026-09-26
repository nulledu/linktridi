import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { useState } from "react";
import { BarraSalvar, useBarraSalvar } from "../BarraSalvar";

function Tela({ salvar }: { salvar: () => Promise<unknown> }) {
  const [texto, setTexto] = useState("a");
  const [salvo, setSalvo] = useState("a");
  const barra = useBarraSalvar({
    sujo: texto !== salvo,
    salvar: async () => { const r = await salvar(); if (r !== false) setSalvo(texto); return r; },
    desfazer: () => setTexto(salvo),
    salvoMs: 30,
  });
  return (
    <>
      <input aria-label="Nome" value={texto} onChange={(e) => setTexto(e.target.value)} />
      <BarraSalvar {...barra} />
    </>
  );
}

describe("BarraSalvar", () => {
  it("nasce escondida e aparece quando há algo pendente, com os dois botões", () => {
    render(<Tela salvar={async () => true} />);
    expect(document.querySelector(".ui-barra-salvar")).toBeNull();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "b" } });
    const barra = document.querySelector(".ui-barra-salvar")!;
    expect(barra.getAttribute("data-estado")).toBe("pendente");
    expect(barra.closest("body")).toBe(document.body); // portal: fora da coluna
    expect(screen.getByText("Alterações não salvas")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeTruthy();
  });

  it("salvar passa por salvando → salvo e some", async () => {
    let solta!: (v: boolean) => void;
    const salvar = vi.fn(() => new Promise<boolean>((r) => { solta = r; }));
    render(<Tela salvar={salvar} />);
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "b" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(document.querySelector(".ui-barra-salvar")!.getAttribute("data-estado")).toBe("salvando");
    // Clique duplo não dispara duas gravações (o botão já está escondido
    // enquanto salva — `hidden` só pra alcançá-lo no teste).
    fireEvent.click(screen.getByRole("button", { name: "Salvar", hidden: true }));
    expect(salvar).toHaveBeenCalledTimes(1);
    await act(async () => { solta(true); });
    expect(document.querySelector(".ui-barra-salvar")!.getAttribute("data-estado")).toBe("salvo");
    await waitFor(() => expect(document.querySelector(".ui-barra-salvar")).toBeNull(), { timeout: 1500 });
  });

  it("falha volta pra pendente — a pessoa não perde o que digitou", async () => {
    render(<Tela salvar={async () => false} />);
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "b" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Salvar" })); });
    expect(document.querySelector(".ui-barra-salvar")!.getAttribute("data-estado")).toBe("pendente");
  });

  it("desfazer volta pro salvo e a barra sai", async () => {
    render(<Tela salvar={async () => true} />);
    const campo = screen.getByLabelText("Nome") as HTMLInputElement;
    fireEvent.change(campo, { target: { value: "b" } });
    fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(campo.value).toBe("a");
    await waitFor(() => expect(document.querySelector(".ui-barra-salvar")).toBeNull());
  });
});
