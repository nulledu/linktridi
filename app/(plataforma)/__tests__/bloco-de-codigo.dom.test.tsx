// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BlocoDeCodigo } from "../ui/BlocoDeCodigo";

describe("BlocoDeCodigo", () => {
  it("mostra o código realçado e oferece o copiar do kit", () => {
    const { container } = render(<BlocoDeCodigo codigo={"const a = 1;"} linguagem="ts" titulo="ex.ts" />);
    // o realce quebra o texto em muitos <span>; o conteúdo somado é o código.
    expect(container.textContent).toContain("const a = 1");
    expect(screen.getByText("ex.ts")).toBeInTheDocument();
    // o botão de copiar é o BotaoCopiar do kit (aria-label "Copiar"), não um novo.
    expect(screen.getByRole("button", { name: "Copiar" })).toBeInTheDocument();
  });

  it("semCopiar esconde o botão", () => {
    render(<BlocoDeCodigo codigo={"x"} linguagem="ts" semCopiar />);
    expect(screen.queryByRole("button", { name: "Copiar" })).toBeNull();
  });

  it("numeros desenha a canaleta com uma linha por linha", () => {
    const { container } = render(<BlocoDeCodigo codigo={"a\nb\nc"} linguagem="ts" numeros />);
    expect(container.querySelectorAll(".ui-cod-num")).toHaveLength(3);
  });

  it("apara o \\n final pra não desenhar uma linha fantasma", () => {
    const { container } = render(<BlocoDeCodigo codigo={"a\nb\n"} linguagem="ts" numeros />);
    expect(container.querySelectorAll(".ui-cod-num")).toHaveLength(2);
  });
});
