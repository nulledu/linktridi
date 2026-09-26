// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ListaDeTelas } from "../ListaDeTelas";
import type { Slide } from "@/lib/painel-layout";

const slide = (id: string, nome: string, tipos: string[], extra: Partial<Slide> = {}): Slide => ({
  id,
  nome,
  duracaoMs: null,
  ativo: true,
  widgets: tipos.map((tipo, i) => ({ id: `${id}-${i}`, tipo, x: 0, y: 0, w: 12, h: 8, opcoes: {} })) as Slide["widgets"],
  ...extra,
});

describe("ListaDeTelas", () => {
  it("descreve o que a tela MOSTRA, não quantos blocos ela tem", () => {
    render(
      <ListaDeTelas
        slides={[slide("s1", "Ranking", ["texto", "podio", "lidera", "ranking", "equipe"])]}
        intervaloPadraoMs={20000}
        onChange={() => {}}
      />,
    );
    // "5 blocos" não diz nada a quem está escolhendo o que vai na parede.
    expect(screen.getByText(/Pódio dos vendedores/)).toBeTruthy();
    expect(screen.queryByText(/5 blocos/)).toBeNull();
  });

  it("reconhece a doca pelos blocos de expedição", () => {
    render(
      <ListaDeTelas
        slides={[slide("s1", "Expedição", ["texto", "kpi", "expedicao"])]}
        intervaloPadraoMs={20000}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/A doca/)).toBeTruthy();
  });

  it("tela montada à mão não ganha nome inventado — diz o tamanho", () => {
    render(
      <ListaDeTelas
        slides={[slide("s1", "Minha tela", ["texto", "relogio"])]}
        intervaloPadraoMs={20000}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText("2 blocos")).toBeTruthy();
  });

  it("desligar uma tela devolve o slide com ativo=false", () => {
    const onChange = vi.fn();
    render(
      <ListaDeTelas slides={[slide("s1", "Ranking", ["podio"])]} intervaloPadraoMs={20000} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0].ativo).toBe(false);
  });

  /*
   * O tempo fora da faixa vira `null` (usa o geral) em vez de ser gravado.
   * A TV ignora valor fora de 3–120s e cai no padrão: guardar 999 aqui seria
   * mentira gravada — o editor mostraria 999 e a parede usaria 20.
   */
  it("tempo fora da faixa não é gravado", () => {
    const onChange = vi.fn();
    render(
      <ListaDeTelas slides={[slide("s1", "Ranking", ["podio"])]} intervaloPadraoMs={20000} onChange={onChange} />,
    );
    const campo = screen.getByRole("spinbutton");
    fireEvent.change(campo, { target: { value: "999" } });
    expect(onChange.mock.calls[0][0][0].duracaoMs).toBeNull();

    onChange.mockClear();
    fireEvent.change(campo, { target: { value: "45" } });
    expect(onChange.mock.calls[0][0][0].duracaoMs).toBe(45000);
  });

  it("mostra o tempo geral quando a tela não pediu um próprio", () => {
    render(
      <ListaDeTelas slides={[slide("s1", "Ranking", ["podio"])]} intervaloPadraoMs={20000} onChange={() => {}} />,
    );
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("20");
  });

  it("subir/descer troca a ordem, e as pontas não movem além do fim", () => {
    const onChange = vi.fn();
    const slides = [slide("a", "A", ["podio"]), slide("b", "B", ["batalha"])];
    render(<ListaDeTelas slides={slides} intervaloPadraoMs={20000} onChange={onChange} />);

    const descer = screen.getAllByTitle("Descer na ordem");
    fireEvent.click(descer[0]);
    expect(onChange.mock.calls[0][0].map((s: Slide) => s.id)).toEqual(["b", "a"]);

    // A última não desce, a primeira não sobe: os botões das pontas ficam
    // desabilitados em vez de não fazer nada silenciosamente.
    expect((descer[1] as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByTitle("Subir na ordem")[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it("avisa quando NENHUMA tela está no ar — senão só se descobre na TV", () => {
    render(
      <ListaDeTelas
        slides={[slide("s1", "Ranking", ["podio"], { ativo: false })]}
        intervaloPadraoMs={20000}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/Nenhuma tela no ar/)).toBeTruthy();
  });

  it("conta quantas estão no ar quando há alguma", () => {
    render(
      <ListaDeTelas
        slides={[slide("a", "A", ["podio"]), slide("b", "B", ["batalha"], { ativo: false })]}
        intervaloPadraoMs={20000}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(/1 tela no ar/)).toBeTruthy();
  });
});
