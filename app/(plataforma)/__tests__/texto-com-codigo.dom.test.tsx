// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TextoComCodigo } from "../ui/TextoComCodigo";

// A mudança tem que ser ADITIVA: texto sem ``` sai igual ao de antes; só o
// bloco de código ganha o BlocoDeCodigo. Se um dia isto virar um markdown
// inteiro, este teste quebra — de propósito.
describe("TextoComCodigo", () => {
  it("texto sem fence sai como parágrafo, sem bloco de código", () => {
    const { container } = render(<TextoComCodigo texto={"olá\nmundo"} />);
    expect(container.querySelector(".ui-cod-pre")).toBeNull();
    expect(container.textContent).toContain("olá");
    expect(container.textContent).toContain("mundo");
  });

  it("troca ```bloco``` pelo BlocoDeCodigo e mantém o texto ao redor", () => {
    const texto = "antes\n```ts\nconst a = 1;\n```\ndepois";
    const { container } = render(<TextoComCodigo texto={texto} />);
    expect(container.querySelector(".ui-cod-pre")).not.toBeNull();
    expect(container.textContent).toContain("antes");
    expect(container.textContent).toContain("const a = 1");
    expect(container.textContent).toContain("depois");
    expect(screen.getByText("ts")).toBeInTheDocument();
  });

  it("não trata negrito/itálico — só código (mudança aditiva)", () => {
    const { container } = render(<TextoComCodigo texto={"isto *não* é itálico"} />);
    expect(container.querySelector("em")).toBeNull();
    expect(container.textContent).toContain("*não*");
  });

  it("fence sem fechamento continua texto (não vira código)", () => {
    const { container } = render(<TextoComCodigo texto={"```ts\nsem fim"} />);
    expect(container.querySelector(".ui-cod-pre")).toBeNull();
    expect(container.textContent).toContain("sem fim");
  });
});
