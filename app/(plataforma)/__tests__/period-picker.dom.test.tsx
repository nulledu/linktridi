import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { PeriodPicker, DEFAULT_PERIOD, type PeriodState } from "../PeriodPicker";

// ── O calendário de "Datas" não pode morar dentro da fileira de filtro ───────
// Ele morava, e a fileira o matava por dois caminhos independentes:
//
//   • `.filtro-faixa > *:active { transform: scale(.97) }` (a resposta de toque).
//     Transform ≠ `none` cria CONTEXTO DE EMPILHAMENTO: o `z-index` do painel
//     passava a valer só dentro do invólucro de 82×30 e a folha ia PARA TRÁS dos
//     cards no instante do mousedown. Medido no navegador: mousedown no
//     BUTTON "15", mouseup no `.tf-panel` do ROAS, click num ancestral comum —
//     o `onClick` do dia NUNCA rodava.
//   • `mask-image` na fileira (o esmaecido de "tem mais pra ver") faz dela o
//     BLOCO DE CONTENÇÃO do `position: fixed`: no celular a folha nascia
//     recortada dentro da fileira de 44px em vez de presa embaixo da tela.
//
// A correção não é guardar propriedade por propriedade de ancestral — é não ter
// ancestral. O painel vai pro <body> por portal. jsdom não tem layout, então o
// que se verifica aqui é a ESTRUTURA (painel fora da fileira) e o COMPORTAMENTO
// que o portal quase quebra: clicar dentro do painel não pode fechá-lo, porque o
// "tocou fora" deixou de poder olhar só a caixa do botão.

function Palco() {
  const [p, setP] = useState<PeriodState>(DEFAULT_PERIOD);
  return (
    <>
      <PeriodPicker value={p} onChange={setP} />
      <output data-testid="estado">{p.key}:{p.from}:{p.to}</output>
    </>
  );
}

const abrir = () => fireEvent.click(screen.getByText("Datas"));
// A grade é o RangeCalendar do HeroUI: o dia é o `[role=button]` dentro da
// célula, rotulado por extenso ("sexta-feira, 10 de…"); pega pelo texto, fora
// dos dias do mês vizinho.
const dia = (n: string) => screen.getAllByText(n).find((el) =>
  el.closest("[role=gridcell]") && el.getAttribute("data-outside-month") !== "true")!;

describe("PeriodPicker · calendário de faixa", () => {
  it("o painel nasce fora da fileira de filtro", () => {
    const { container } = render(<Palco />);
    abrir();

    const painel = document.querySelector(".gp-pop");
    expect(painel, "o painel deveria existir depois de abrir").not.toBeNull();
    // O que importa: nenhum ancestral do painel é a fileira. Se ele voltar pra
    // dentro dela, herda transform/máscara/recorte e o clique morre de novo.
    expect(painel!.closest(".filtro-faixa")).toBeNull();
    expect(container.contains(painel)).toBe(false);
  });

  it("clicar num dia registra a ponta e não fecha o painel", () => {
    render(<Palco />);
    abrir();

    fireEvent.mouseDown(dia("10"));
    fireEvent.click(dia("10"));

    // Painel continua aberto: o `mousedown` caiu DENTRO dele, e o teste de
    // "tocou fora" tem que olhar as duas caixas (botão e painel).
    expect(document.querySelector(".gp-pop")).not.toBeNull();
    // A ponta vive na grade (o RangeCalendar só emite `onChange` quando a
    // faixa fecha): o dia tocado fica marcado como selecionado.
    expect(dia("10").getAttribute("data-selected")).toBe("true");
  });

  it("faixa completa aplica o período", () => {
    render(<Palco />);
    abrir();

    fireEvent.click(dia("10"));
    fireEvent.click(dia("20"));

    const aplicar = screen.getByRole("button", { name: "Aplicar" });
    expect(aplicar).not.toBeDisabled();
    fireEvent.click(aplicar);

    expect(screen.getByTestId("estado").textContent).toMatch(/^custom:\d{4}-\d{2}-10:\d{4}-\d{2}-20$/);
    expect(document.querySelector(".gp-pop")).toBeNull();
  });

  it("mousedown fora fecha, mesmo com o painel no <body>", () => {
    render(<Palco />);
    abrir();
    expect(document.querySelector(".gp-pop")).not.toBeNull();

    fireEvent.mouseDown(document.body);
    expect(document.querySelector(".gp-pop")).toBeNull();
  });

  it("Escape fecha", () => {
    render(<Palco />);
    abrir();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.querySelector(".gp-pop")).toBeNull();
  });

  it("chip de período não passa por 'custom'", () => {
    render(<Palco />);
    fireEvent.click(screen.getByText("7 dias"));
    expect(screen.getByTestId("estado").textContent).toBe("7d::");
  });
});

// A âncora é medida com `getBoundingClientRect`, que em jsdom devolve zeros —
// posição é assunto do navegador (verificado em /dev-tridify, num invólucro com
// transform + overflow + mask de propósito). Aqui só garantimos que a medição
// não explode sem `window.innerWidth` plausível.
it("posiciona sem quebrar quando a âncora mede zero", () => {
  vi.spyOn(window, "innerWidth", "get").mockReturnValue(320);
  render(<Palco />);
  abrir();
  expect(document.querySelector<HTMLElement>(".gp-pop")!.style.position).toBe("fixed");
});
