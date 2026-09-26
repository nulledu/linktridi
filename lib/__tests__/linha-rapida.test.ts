import { describe, it, expect } from "vitest";
import { interpretarLinha } from "@/lib/financeiro/linha-rapida";

/**
 * "Aluguel 8.000 dia 10" → descrição, valor, vencimento.
 *
 * Cada caso aqui é uma frase que alguém de fato escreveria. A regra que
 * importa mais que qualquer outra: o que a linha NÃO entende fica na
 * descrição, visível — nunca some em silêncio.
 */

const HOJE = "2026-08-22"; // sábado
const FORN = [
  { id: "f1", nome: "Madeireira X" },
  { id: "f2", nome: "Alexandre Império das Chapas" },
  { id: "f3", nome: "Itaúba Móveis" },
];
const CONTAS = [{ id: "c1", nome: "Itaú" }, { id: "c2", nome: "Mercado Pago" }];

describe("valor", () => {
  it("lê milhar com ponto e centavos com vírgula", () => {
    expect(interpretarLinha("Aluguel 8.000,50", { hoje: HOJE }).valor).toBe(8000.5);
  });
  it("lê número seco de três dígitos ou mais", () => {
    expect(interpretarLinha("Energia 430", { hoje: HOJE }).valor).toBe(430);
    expect(interpretarLinha("Internet 8000", { hoje: HOJE }).valor).toBe(8000);
  });
  it("R$ na frente vale para qualquer número", () => {
    expect(interpretarLinha("Café R$ 12", { hoje: HOJE }).valor).toBe(12);
  });
  it("número curto SEM R$ não é dinheiro — fica na descrição", () => {
    const r = interpretarLinha("MDF 3mm", { hoje: HOJE });
    expect(r.valor).toBeNull();
    expect(r.descricao).toBe("MDF 3mm");
  });
  it("mil e k multiplicam", () => {
    expect(interpretarLinha("Empilhadeira 1,2 mil", { hoje: HOJE }).valor).toBe(1200);
    expect(interpretarLinha("Empilhadeira 2k", { hoje: HOJE }).valor).toBe(2000);
  });
  it("com dois números fica o maior", () => {
    const r = interpretarLinha("2 caixas 450", { hoje: HOJE });
    expect(r.valor).toBe(450);
  });
});

describe("data", () => {
  it("hoje, amanhã, depois de amanhã", () => {
    expect(interpretarLinha("Frete hoje", { hoje: HOJE }).data).toBe("2026-08-22");
    expect(interpretarLinha("Frete amanhã", { hoje: HOJE }).data).toBe("2026-08-23");
    expect(interpretarLinha("Frete depois de amanhã", { hoje: HOJE }).data).toBe("2026-08-24");
  });
  it("'dia 10' é o PRÓXIMO dia 10 — se já passou, é o do mês que vem", () => {
    expect(interpretarLinha("Aluguel 8.000 dia 10", { hoje: HOJE }).data).toBe("2026-09-10");
    expect(interpretarLinha("Aluguel 8.000 dia 25", { hoje: HOJE }).data).toBe("2026-08-25");
  });
  it("dd/mm e dd/mm/aaaa", () => {
    expect(interpretarLinha("Seguro 1.500 15/09", { hoje: HOJE }).data).toBe("2026-09-15");
    expect(interpretarLinha("Seguro 1.500 15/01/2027", { hoje: HOJE }).data).toBe("2027-01-15");
  });
  it("'dia 10' não vira R$ 10 — a data sai antes do dinheiro", () => {
    const r = interpretarLinha("Aluguel dia 10", { hoje: HOJE });
    expect(r.data).toBe("2026-09-10");
    expect(r.valor).toBeNull();
    expect(r.descricao).toBe("Aluguel");
  });
  it("em N dias e próximo mês", () => {
    expect(interpretarLinha("Boleto em 5 dias", { hoje: HOJE }).data).toBe("2026-08-27");
    expect(interpretarLinha("Boleto próximo mês", { hoje: HOJE }).data).toBe("2026-09-22");
  });
  it("dia da semana é o próximo — sábado num sábado é o outro sábado", () => {
    expect(interpretarLinha("Pagar segunda", { hoje: HOJE }).data).toBe("2026-08-24");
    expect(interpretarLinha("Pagar sábado", { hoje: HOJE }).data).toBe("2026-08-29");
  });
  it("31 de fevereiro vira 28, não escorrega para março", () => {
    expect(interpretarLinha("Conta 31/02", { hoje: HOJE }).data).toBe("2026-02-28");
  });
});

describe("parcelas", () => {
  it("3x, em 3x, 3 parcelas", () => {
    expect(interpretarLinha("Monitor 1.200 3x", { hoje: HOJE }).parcelas).toBe(3);
    expect(interpretarLinha("Monitor 1.200 em 3x", { hoje: HOJE }).parcelas).toBe(3);
    expect(interpretarLinha("Monitor 1.200 3 parcelas", { hoje: HOJE }).parcelas).toBe(3);
  });
  it("1x não é parcelamento e 3x não vira valor", () => {
    const r = interpretarLinha("Monitor 1.200 3x", { hoje: HOJE });
    expect(r.valor).toBe(1200);
    expect(r.descricao).toBe("Monitor");
  });
});

describe("nomes", () => {
  it("acha o fornecedor sem acento e sem caixa, e tira da descrição", () => {
    const r = interpretarLinha("MDF 3mm 4.500 madeireira x", { hoje: HOJE, fornecedores: FORN });
    expect(r.fornecedor?.id).toBe("f1");
    expect(r.valor).toBe(4500);
    expect(r.descricao).toBe("MDF 3mm");
  });
  it("o nome mais longo que couber inteiro vence", () => {
    const r = interpretarLinha("Chapas 900 Alexandre Império das Chapas", { hoje: HOJE, fornecedores: FORN });
    expect(r.fornecedor?.id).toBe("f2");
    expect(r.descricao).toBe("Chapas");
  });
  it("palavra inteira: 'Itaú' não casa dentro de 'Itaúba'", () => {
    const r = interpretarLinha("Cadeiras 800 Itaúba Móveis", { hoje: HOJE, fornecedores: FORN, contas: CONTAS });
    expect(r.fornecedor?.id).toBe("f3");
    expect(r.conta).toBeNull();
  });
  it("conta e fornecedor na mesma linha", () => {
    const r = interpretarLinha("Cola 120 Madeireira X pelo Itaú", { hoje: HOJE, fornecedores: FORN, contas: CONTAS });
    expect(r.fornecedor?.id).toBe("f1");
    expect(r.conta?.id).toBe("c1");
    expect(r.descricao).toBe("Cola");
  });
});

describe("a frase inteira", () => {
  it("Aluguel 8.000 dia 10 → tudo preenchido e nada perdido", () => {
    const r = interpretarLinha("Aluguel 8.000 dia 10", { hoje: HOJE });
    expect(r).toMatchObject({ descricao: "Aluguel", valor: 8000, data: "2026-09-10", parcelas: null });
    expect(r.entendido).toEqual(["Vence 10/09/2026", "R$ 8.000,00"]);
  });
  it("o que não entende fica na descrição, visível", () => {
    const r = interpretarLinha("Manutenção da empilhadeira setor B", { hoje: HOJE });
    expect(r.valor).toBeNull();
    expect(r.data).toBeNull();
    expect(r.descricao).toBe("Manutenção da empilhadeira setor B");
    expect(r.entendido).toEqual([]);
  });
  it("linha vazia não inventa nada", () => {
    const r = interpretarLinha("   ", { hoje: HOJE });
    expect(r).toMatchObject({ descricao: "", valor: null, data: null, parcelas: null, fornecedor: null, conta: null });
  });
});
