import { describe, expect, it } from "vitest";
import { resumoDoProduto } from "@/lib/tridiflow-tutoriais";

// A descrição do ERP vem com HTML dentro — e às vezes já escapado. O cartão do
// tutorial despejava isso como texto, tags à vista, a ficha inteira do produto.
describe("resumo do produto no tutorial", () => {
  it("tira as tags e junta o texto", () => {
    expect(resumoDoProduto("<p><strong>ALMOFADAS</strong></p><ul><li>6x6cm</li></ul>")).toBe("ALMOFADAS 6x6cm");
  });
  it("entende o HTML que chegou escapado", () => {
    expect(resumoDoProduto("&lt;p&gt;Almofada&lt;/p&gt;")).toBe("Almofada");
  });
  it("corta na palavra, não no meio dela", () => {
    const longo = resumoDoProduto("<p>" + "palavra ".repeat(60) + "</p>", 40);
    expect(longo.endsWith("…")).toBe(true);
    expect(longo.length).toBeLessThanOrEqual(41);
    expect(longo).not.toContain("palav…");
  });
  it("texto curto passa inteiro e sem reticência", () => {
    expect(resumoDoProduto("Carimbo automático")).toBe("Carimbo automático");
  });
});
