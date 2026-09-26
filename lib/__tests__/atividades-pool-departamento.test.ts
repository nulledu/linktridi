import { describe, it, expect } from "vitest";
import { poolCasaComPessoa } from "@/lib/atividades";

/**
 * O pool tem que chegar em quem trabalha no setor — inclusive quando o setor
 * da pessoa está no DEPARTAMENTO.
 *
 * A equipe de Logística está cadastrada como setor "Produção" / departamento
 * "Logística". Enquanto o casamento olhava só `employees.setor`, uma ordem
 * criada no pool "Logística" não aparecia pra ninguém: a única equipe do setor
 * era invisível pra ela. A regra agora casa qualquer uma das chaves da pessoa
 * (setor E departamento), com a mesma comparação frouxa do tablet.
 */
describe("poolCasaComPessoa", () => {
  it("logística por departamento: setor Produção + depto Logística vê o pool Logística", () => {
    expect(poolCasaComPessoa("Logística", ["Produção", "Logística"])).toBe(true);
  });

  it("continua vendo o pool do próprio setor", () => {
    expect(poolCasaComPessoa("Produção", ["Produção", "Logística"])).toBe(true);
  });

  it("quem não é do setor não vê", () => {
    expect(poolCasaComPessoa("Logística", ["Vendas", "Comercial"])).toBe(false);
  });

  it("comparação é frouxa e sem acento, nos dois sentidos", () => {
    expect(poolCasaComPessoa("logistica", ["Logística"])).toBe(true);
    expect(poolCasaComPessoa("Entrada Logística", ["Logística"])).toBe(true);
  });

  it("pessoa sem chave nenhuma vê tudo (comportamento histórico do site)", () => {
    expect(poolCasaComPessoa("Logística", [])).toBe(true);
  });

  it("ordem sem setor aparece pra todo mundo", () => {
    expect(poolCasaComPessoa(null, ["Produção"])).toBe(true);
    expect(poolCasaComPessoa("", ["Vendas"])).toBe(true);
  });
});
