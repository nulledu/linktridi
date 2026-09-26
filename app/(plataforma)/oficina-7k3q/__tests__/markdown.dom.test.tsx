// O manual da Oficina é o docs/DEVKIT.md de verdade, renderizado pelo
// markdown mínimo. Se o manual ganhar sintaxe que o renderizador não conhece,
// ela sai crua na tela — este teste renderiza o arquivo real e procura sobras.
import { readFileSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Markdown } from "../markdown";

const fonte = readFileSync(path.join(process.cwd(), "docs/DEVKIT.md"), "utf8");

describe("Oficina: o DEVKIT.md renderiza", () => {
  it("títulos, tabelas e listas viram elementos, sem marcação crua sobrando", () => {
    const { container } = render(<Markdown fonte={fonte} />);
    expect(container.querySelectorAll("h2").length).toBeGreaterThan(5);
    expect(container.querySelectorAll("table").length).toBeGreaterThan(5);
    expect(container.querySelectorAll("li").length).toBeGreaterThan(10);
    const texto = container.textContent ?? "";
    expect(texto).not.toMatch(/\*\*|\]\(|^#{1,4} |\|---/m);
  });

  it("toda célula leva o rótulo da coluna (vira card no celular)", () => {
    const { container } = render(<Markdown fonte={fonte} />);
    const semRotulo = [...container.querySelectorAll("td")].filter((td) => !td.getAttribute("data-l"));
    expect(semRotulo).toHaveLength(0);
  });

  it("link relativo do manual vira link do repositório", () => {
    const { container } = render(<Markdown fonte={"[x](../app/a.tsx)"} />);
    expect(container.querySelector("a")?.getAttribute("href")).toMatch(/^https:\/\/github\.com\/.+\/app\/a\.tsx$/);
  });
});
