import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NumeroVivo } from "../ui/micro";

// ── Um número parcial na tela é pior que nenhum ──────────────────────────────
//
// O `NumeroVivo` conta até o valor. O desenho antigo guardava o número MOSTRADO
// no estado e só o acertava no último quadro — então, quando a contagem morria
// no meio, a tela ficava parada num valor intermediário. Medido no navegador:
// prop 9 exibindo "2"; prop 16 exibindo "3". Sem erro, sem aviso, e com cara de
// número certo — que é o que torna esse defeito pior que um gráfico vazio.
//
// O jsdom não roda `requestAnimationFrame` de verdade, então este ambiente É o
// caso "a animação nunca aconteceu". Se o componente depender dela pra mostrar
// o valor certo, o teste pega.

describe("NumeroVivo — nunca mostra um número que não é o dado", () => {
  it("sem nenhum quadro de animação, exibe o valor de verdade", () => {
    render(<NumeroVivo valor={9} />);
    expect(screen.getByText("9")).toBeTruthy();
  });

  it("valor grande também sai inteiro, não pela metade", () => {
    render(<NumeroVivo valor={71476} />);
    // pt-BR: 71.476
    expect(screen.getByText("71.476")).toBeTruthy();
  });

  it("respeita o formatador — e o que ele formata é o valor final", () => {
    render(<NumeroVivo valor={142.79} formatar={(n) => `R$ ${n.toFixed(2)}`} />);
    expect(screen.getByText("R$ 142.79")).toBeTruthy();
  });

  it("zero é zero, não some", () => {
    render(<NumeroVivo valor={0} />);
    expect(screen.getByText("0")).toBeTruthy();
  });
});
