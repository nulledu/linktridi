import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { ChaveVisual, Interruptor } from "../controles";

function Controlado(props: { inicial?: boolean; rotulo?: string; pendente?: boolean }) {
  const [v, setV] = useState(props.inicial ?? false);
  return <Interruptor ligado={v} onChange={setV} rotulo={props.rotulo} titulo="Chave" pendente={props.pendente} />;
}

describe("Interruptor", () => {
  it("alterna e só ganha is-init depois do primeiro toque (nada quica ao montar)", () => {
    render(<Controlado />);
    const chave = screen.getByRole("switch", { name: "Chave" });
    expect(chave.getAttribute("aria-checked")).toBe("false");
    expect(chave.className).not.toContain("is-init");
    fireEvent.click(chave);
    expect(chave.getAttribute("aria-checked")).toBe("true");
    expect(chave.getAttribute("data-on")).toBe("true");
    expect(chave.className).toContain("is-init");
  });

  it("tocar no rótulo também alterna — a linha inteira é o alvo", () => {
    render(<Controlado rotulo="Produto ativo" />);
    fireEvent.click(screen.getByText("Produto ativo"));
    expect(screen.getByRole("switch", { name: "Produto ativo" }).getAttribute("aria-checked")).toBe("true");
  });

  it("pendente ignora cliques enquanto aplica", () => {
    const onChange = vi.fn();
    render(<Interruptor ligado={false} onChange={onChange} titulo="Campanha" pendente />);
    fireEvent.click(screen.getByRole("switch", { name: "Campanha" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("pararPropagacao não deixa o clique abrir a linha da tabela", () => {
    const linha = vi.fn();
    const onChange = vi.fn();
    render(<div onClick={linha}><Interruptor ligado onChange={onChange} titulo="Campanha" pararPropagacao /></div>);
    fireEvent.click(screen.getByRole("switch", { name: "Campanha" }));
    expect(onChange).toHaveBeenCalledWith(false);
    expect(linha).not.toHaveBeenCalled();
  });

  it("ChaveVisual (cartão inteiro como interruptor) só quica depois da primeira mudança", () => {
    function Cartao() {
      const [v, setV] = useState(false);
      return (
        <button type="button" role="switch" aria-checked={v} className="ui-chave-dono" onClick={() => setV(!v)}>
          <ChaveVisual ligado={v} /> Trabalha sábado
        </button>
      );
    }
    const { container } = render(<Cartao />);
    const desenho = container.querySelector(".ui-chave")!;
    expect(desenho.getAttribute("aria-hidden")).toBe("true");
    expect(desenho.className).not.toContain("is-init");
    fireEvent.click(screen.getByRole("switch", { name: /Trabalha sábado/ }));
    expect(desenho.getAttribute("data-on")).toBe("true");
    expect(desenho.className).toContain("is-init");
  });

  it("indefinido não se anuncia como ligado", () => {
    render(<Interruptor ligado onChange={() => {}} titulo="Status" indefinido />);
    const chave = screen.getByRole("switch", { name: "Status" });
    expect(chave.getAttribute("aria-checked")).toBe("false");
    expect(chave.getAttribute("data-indef")).toBe("1");
  });
});
