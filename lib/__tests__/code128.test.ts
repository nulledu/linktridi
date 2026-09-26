import { describe, it, expect } from "vitest";
import { code128Svg, code128Larguras, checksum128, TABELA_LARGURAS_CODE128_PARA_TESTE } from "../code128";

describe("code128", () => {
  it("checksum do exemplo canônico", () => {
    // "AB" → START_B(104) + A(33) + B(34); soma = 104 + 1*33 + 2*34 = 205.
    // NOTA: o enunciado original deste teste dizia "205 % 103 = 2", mas essa
    // conta está errada — 103×1 = 103, e 205 - 103 = 102 (103×2 = 206 já
    // passa de 205). Conferido de duas formas independentes: (1) aritmética
    // direta; (2) contra o exemplo trabalhado da própria especificação
    // (Wikipedia, "Code 128 § Check digit calculation"), que calcula o
    // checksum de "PJJ123C" em Code Set A passo a passo — soma 878, resto
    // mod 103 = 54 — usando a MESMA fórmula implementada aqui. Um checksum
    // errado gera etiqueta que parece perfeita e não passa em leitor nenhum,
    // então usamos o valor correto (102), não o do enunciado.
    expect(checksum128("AB")).toBe(102);
  });
  it("começa em START-B e termina no padrão de parada", () => {
    const l = code128Larguras("MDF6MM-BR-18-000042");
    expect(l.slice(0, 6).join("")).toBe("211214");
    expect(l.slice(-7).join("")).toBe("2331112");
  });
  it("toda largura é módulo de 1 a 4", () => {
    expect(code128Larguras("ABC").every((n) => Number.isInteger(n) && n >= 1 && n <= 4)).toBe(true);
  });
  it("recusa caractere fora do Code128-B em vez de gerar código ilegível", () => {
    expect(() => code128Larguras("café")).toThrow();
  });
  it("SVG sai com viewBox e sem largura fixa, pra caber na etiqueta", () => {
    const svg = code128Svg("MDF-000001");
    expect(svg).toContain("viewBox");
    expect(svg).not.toMatch(/width="\d+px"/);
  });

  // ── A armadilha do `esticar` ───────────────────────────────────────────────
  //
  // Um `<svg>` com `viewBox` e SEM dimensão não herda o tamanho do pai: ele se
  // dimensiona pela proporção do próprio `viewBox`. Medido na prévia da
  // etiqueta escrita à mão: "GAL-A-C3" numa caixa de 53px saía com 110px de
  // altura, transbordava, e o `overflow: hidden` da etiqueta cortava metade
  // das barras — em silêncio, e só no papel.
  //
  // Por isso o `esticar` traz os três atributos JUNTOS. Sem `width`/`height` a
  // proporção livre não resolve nada.
  it("esticado, o código PREENCHE a caixa em vez de se dimensionar sozinho", () => {
    const svg = code128Svg("GAL-A-C3", { esticar: true });
    expect(svg).toContain('preserveAspectRatio="none"');
    expect(svg).toContain('width="100%"');
    expect(svg).toContain('height="100%"');
    // Continua sem PIXEL — quem manda no tamanho é a CSS da etiqueta.
    expect(svg).not.toMatch(/width="\d+px"/);
  });

  it("sem esticar, nada muda — a etiqueta de produto já foi impressa e conferida assim", () => {
    const svg = code128Svg("MDF-000001");
    expect(svg).not.toContain("preserveAspectRatio");
    // A ABERTURA do <svg>, não o desenho: cada <rect> tem `width` por
    // definição, e é a tag de fora que não pode ganhar dimensão nova.
    const abertura = svg.slice(0, svg.indexOf(">") + 1);
    expect(abertura).not.toContain("width=");
    expect(abertura).not.toContain("height=");
  });
});

// Os 5 invariantes que o enunciado da tarefa pede pra verificar a tabela de
// larguras antes de confiar nela — ver o comentário no topo de code128.ts
// sobre de onde ela veio (Wikipedia, "Code 128 § Bar code widths").
describe("tabela de larguras do Code128 (invariantes)", () => {
  it("tem exatamente 107 entradas (valores 0..106)", () => {
    expect(TABELA_LARGURAS_CODE128_PARA_TESTE.length).toBe(107);
  });

  it("cada entrada tem 6 dígitos, exceto o STOP (índice 106) que tem 7", () => {
    TABELA_LARGURAS_CODE128_PARA_TESTE.forEach((larguras, i) => {
      expect(larguras.length).toBe(i === 106 ? 7 : 6);
    });
  });

  it("a soma das larguras é 11 (13 no STOP) — o invariante que define o Code128", () => {
    TABELA_LARGURAS_CODE128_PARA_TESTE.forEach((larguras, i) => {
      const soma = larguras.split("").reduce((acc, d) => acc + Number(d), 0);
      expect(soma).toBe(i === 106 ? 13 : 11);
    });
  });

  it("índice 104 (START-B) é 211214; índice 106 (STOP) é 2331112", () => {
    expect(TABELA_LARGURAS_CODE128_PARA_TESTE[104]).toBe("211214");
    expect(TABELA_LARGURAS_CODE128_PARA_TESTE[106]).toBe("2331112");
  });

  it("toda largura é um módulo de 1 a 4", () => {
    TABELA_LARGURAS_CODE128_PARA_TESTE.forEach((larguras) => {
      larguras.split("").forEach((d) => {
        const n = Number(d);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(4);
      });
    });
  });
});
