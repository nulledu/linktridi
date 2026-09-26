import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Etiqueta, FolhaDeEtiquetas, type DadosEtiqueta } from "../Etiqueta";

// A caixa lacrada na etiqueta impressa.
//
// Uma etiqueta pode valer 50 folhas de alavanca, e quem pega a caixa na
// prateleira não tem como conferir isso sem romper o lacre — se o número não
// estiver impresso, ele não existe. O contrário também é regra: etiqueta de UMA
// peça não escreve "1 un", porque um campo que repete o mesmo valor em quase
// toda etiqueta para de ser lido, e aí o dia em que ele diz 50 passa batido.

const BASE: DadosEtiqueta = {
  codigo: "MDF6MM-BR-18-000042",
  nome: "Folha de alavanca",
  corDimensoes: "Branco · 2750×1840",
  local: "GAL-A",
  localDetalhe: "C3 · B2",
  impressoEm: "2026-08-12T12:00:00.000Z",
  responsavel: "João",
};

describe("Etiqueta — a caixa diz quantas peças tem", () => {
  it("imprime o selo com o número de peças quando a etiqueta vale mais de uma", () => {
    render(<Etiqueta dados={{ ...BASE, quantidade: 50 }} />);
    // Só o NÚMERO dentro do quadro. A palavra "CAIXA" saiu quando a etiqueta
    // encolheu pra 15mm: medido na renderização a 3×, "CAIXA 1000 un" pedia
    // ~15mm e vazava pra fora da borda, e o selo é a única coisa da etiqueta
    // que não pode truncar. O quadro só é desenhado quando a quantidade passa
    // de 1, então a moldura já diz "tem mais de uma peça aqui dentro" — a
    // palavra repetia o que ela mostrava.
    expect(screen.getByText("50 un")).toBeTruthy();
  });

  it("não escreve nada sobre quantidade na etiqueta de uma peça só", () => {
    const { container } = render(<Etiqueta dados={{ ...BASE, quantidade: 1 }} />);
    expect(container.textContent).not.toMatch(/CAIXA/);
    expect(container.textContent).not.toMatch(/1 un/);
  });

  it("etiqueta antiga (sem a coluna quantidade) vale uma peça e não ganha selo", () => {
    const { container } = render(<Etiqueta dados={BASE} />);
    expect(container.textContent).not.toMatch(/CAIXA/);
    // O resto da etiqueta continua inteiro — o selo é aditivo, não substitui nada.
    expect(screen.getByText("Folha de alavanca")).toBeTruthy();
    expect(screen.getByText("Branco · 2750×1840")).toBeTruthy();
    // "GAL-A" em cima diz o galpão, de relance e em negrito; "C3 · B2" desceu
    // pra faixa do pé, que é o endereço fino de quem já está na estante. Colado
    // no local ele custava 21mm da faixa de cima e fazia o nome e a cor cortarem.
    expect(screen.getByText("GAL-A")).toBeTruthy();
    expect(screen.getByText("C3 · B2")).toBeTruthy();
  });

  it("o número da caixa nunca corta com reticências — quem encolhe é o nome", () => {
    render(<Etiqueta dados={{ ...BASE, nome: "Compensado Naval 15mm Virola Selecionado", quantidade: 1000 }} />);
    // `textOverflow: ellipsis` aqui transformaria 1000 em "100…", que não é
    // informação incompleta: é informação ERRADA, e sai impressa em papel pra
    // alguém contar estoque em cima dela.
    const numero = screen.getByText("1000 un") as HTMLElement;
    expect(numero.style.textOverflow).toBe("");
    expect(numero.style.whiteSpace).toBe("nowrap");

    // O nome, sim, corta — a identidade da peça está no código de barras.
    //
    // E corta com RETICÊNCIAS numa linha só, não mais na segunda linha
    // (`-webkit-line-clamp: 2`). No empilhado uma segunda linha de nome custaria
    // 3,4mm de barra da etiqueta INTEIRA, porque o texto não sobe mais ao lado
    // das barras; em troca a vaga dele passou de ~21mm de coluna pra ~26mm de
    // faixa. Trocar caractere de nome por barra legível é o negócio que este
    // desenho existe pra fazer.
    const nome = screen.getByText("Compensado Naval 15mm Virola Selecionado") as HTMLElement;
    expect(nome.style.overflow).toBe("hidden");
    expect(nome.style.textOverflow).toBe("ellipsis");
    expect(nome.style.whiteSpace).toBe("nowrap");
  });
});

describe("Folha de etiquetas — etiquetas e peças são números diferentes", () => {
  it("mostra as peças ao lado das etiquetas quando há caixa no lote", () => {
    render(<FolhaDeEtiquetas etiquetas={[
      { ...BASE, codigo: "A-000001", quantidade: 50 },
      { ...BASE, codigo: "A-000002" },
    ]} />);
    expect(screen.getByText(/2 etiquetas · 51 peças/)).toBeTruthy();
    expect(screen.getByText("50 un")).toBeTruthy();
  });

  it("sem caixa nenhuma, o segundo número seria o mesmo — e não aparece", () => {
    render(<FolhaDeEtiquetas etiquetas={[
      { ...BASE, codigo: "A-000001" },
      { ...BASE, codigo: "A-000002" },
    ]} />);
    expect(screen.getByText("2 etiquetas")).toBeTruthy();
  });
});
