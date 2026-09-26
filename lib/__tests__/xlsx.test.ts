import { describe, it, expect } from "vitest";
import { crc32, letraDaColuna, montarXLSX, xmlDaAba } from "../financeiro/xlsx";

describe("xlsx sem biblioteca", () => {
  it("nomeia colunas como o Excel", () => {
    expect(letraDaColuna(0)).toBe("A");
    expect(letraDaColuna(25)).toBe("Z");
    expect(letraDaColuna(26)).toBe("AA");
    expect(letraDaColuna(27)).toBe("AB");
  });

  it("CRC-32 bate com o valor conhecido de 'hello'", () => {
    expect(crc32(new TextEncoder().encode("hello")).toString(16)).toBe("3610a686");
  });

  it("número vira <v>, texto vira inlineStr escapado, vazio some", () => {
    const xml = xmlDaAba([{ n: "Ana & Cia", v: 1724.62, x: null }], [
      { cabecalho: "Pessoa", valor: (l) => l.n },
      { cabecalho: "Salário", valor: (l) => l.v },
      { cabecalho: "Vazio", valor: (l) => l.x },
    ]);
    expect(xml).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">Ana &amp; Cia</t></is></c>');
    expect(xml).toContain('<c r="B2"><v>1724.62</v></c>');
    expect(xml).not.toContain('r="C2"');
    expect(xml).toContain('<row r="1">');
  });

  it("o arquivo é um ZIP com as cinco partes na ordem, e o fim aponta o diretório", () => {
    const bytes = montarXLSX([{ a: 1 }], [{ cabecalho: "A", valor: (l) => l.a }], "Folha 08/2026");
    const texto = new TextDecoder("latin1").decode(bytes);
    // Assinaturas: local (PK\x03\x04), central (PK\x01\x02), fim (PK\x05\x06).
    expect(bytes[0]).toBe(0x50); expect(bytes[1]).toBe(0x4b); expect(bytes[2]).toBe(3); expect(bytes[3]).toBe(4);
    expect(texto).toContain("[Content_Types].xml");
    expect(texto).toContain("xl/workbook.xml");
    expect(texto).toContain("xl/worksheets/sheet1.xml");
    expect(texto.lastIndexOf("PK\x05\x06")).toBe(bytes.length - 22);
    // "/" não pode em nome de aba: vira espaço.
    expect(texto).toContain('name="Folha 08 2026"');
    // O número de entradas no diretório central = 5.
    const fim = bytes.length - 22;
    expect(bytes[fim + 10] | (bytes[fim + 11] << 8)).toBe(5);
  });
});
