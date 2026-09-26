import { describe, it, expect } from "vitest";
import {
  anoAtualSP, codigoDoNome, mesAtualSigla, nomeDoCriativo, normalizarVariacao, siglaDoEditor, sugestaoDeTag, tagDoProduto,
} from "@/lib/marketing-criativos-const";

describe("nome automático do criativo", () => {
  it("monta {MÊS} {NN} - {PRODUTO} - {EDITOR}", () => {
    expect(nomeDoCriativo("SET", 1, "", "CRB", "Letícia")).toBe("SET 01 - {CRB} - {L}");
    expect(nomeDoCriativo("OUT", 12, null, "CH", "bruno")).toBe("OUT 12 - {CH} - {B}");
  });

  it("variação entra no meio, entre o número e o produto", () => {
    expect(nomeDoCriativo("SET", 1, "v2", "CRB", "Letícia")).toBe("SET 01 - V2 - {CRB} - {L}");
    expect(nomeDoCriativo("SET", 1, "  Depoimento  cliente ", "CRB", "Letícia")).toBe("SET 01 - Depoimento cliente - {CRB} - {L}");
  });

  it("parte ausente não entra (sem traço sobrando)", () => {
    expect(nomeDoCriativo("SET", 3, "", null, "Ana")).toBe("SET 03 - {A}");
    expect(nomeDoCriativo("SET", 3, "", "CRB", "")).toBe("SET 03 - {CRB}");
  });

  it("TRAVA: o nome liga no mesmo código que o banco gera (SET-001), com ou sem variação", () => {
    expect(codigoDoNome(nomeDoCriativo("SET", 1, "", "CRB", "Letícia"))).toBe("SET-001");
    expect(codigoDoNome(nomeDoCriativo("SET", 1, "V3", "CRB", "Letícia"))).toBe("SET-001");
    expect(codigoDoNome(nomeDoCriativo("DEZ", 42, "", "CH", "Leo"))).toBe("DEZ-042");
  });

  it("variação não vira tag nem estoura", () => {
    expect(normalizarVariacao("{V2}")).toBe("V2");
    expect(normalizarVariacao("x".repeat(50))).toHaveLength(30);
  });

  it("sigla do editor ignora acento e sobrenome", () => {
    expect(siglaDoEditor("Érica Lima")).toBe("E");
    expect(siglaDoEditor("")).toBe("");
  });

  it("tag do produto vem da lista (a de fábrica ou a do banco)", () => {
    expect(tagDoProduto("Carimbo")).toBe("CRB");
    expect(tagDoProduto("chancela")).toBe("CH");
    expect(tagDoProduto("Caneca", [{ nome: "Caneca", tag: "CNC" }])).toBe("CNC");
    expect(tagDoProduto("caneca")).toBeNull();
  });

  it("sugere tag a partir do nome", () => {
    // Só sugestão (editável): a 1ª letra + as próximas consoantes.
    expect(sugestaoDeTag("Caneca")).toBe("CNC");
    expect(sugestaoDeTag("Almofada")).toBe("ALM");
    expect(sugestaoDeTag("")).toBe("");
  });

  it("mês e ano corrente são os de São Paulo, não os de UTC", () => {
    expect(mesAtualSigla(Date.parse("2026-09-01T02:00:00Z"))).toBe("AGO"); // 23h de 31/08 em SP
    expect(mesAtualSigla(Date.parse("2026-09-14T15:00:00Z"))).toBe("SET");
    expect(anoAtualSP(Date.parse("2027-01-01T02:00:00Z"))).toBe(2026);
  });
});
