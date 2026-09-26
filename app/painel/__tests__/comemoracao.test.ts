import { describe, expect, it } from "vitest";
import { chaveComemoracao, deveComemorar, ehParedeComercial, mesAtualSP, nomeDoMes } from "../slides/comemoracao";

describe("comemoração da meta do mês", () => {
  it("só a parede do comercial comemora", () => {
    expect(ehParedeComercial(null)).toBe(true);
    expect(ehParedeComercial({ nome: "Comercial" })).toBe(true);
    expect(ehParedeComercial({ nome: "Vendas TV" })).toBe(true);
    expect(ehParedeComercial({ nome: "Produção" })).toBe(false);
    expect(ehParedeComercial({ nome: "Logística" })).toBe(false);
  });
  it("uma vez por mês: a chave lembrada segura a repetição", () => {
    const time = { goal: 100, current: 120 };
    expect(deveComemorar(time, false)).toBe(true);
    expect(deveComemorar(time, true)).toBe(false);
    expect(deveComemorar({ goal: 0, current: 10 }, false)).toBe(false);
    expect(deveComemorar({ goal: 100, current: 99 }, false)).toBe(false);
    expect(chaveComemoracao("2026-09", "comercial")).toBe("meta-comemorada:2026-09:comercial");
  });
  it("mês vira pelo fuso de São Paulo, não UTC", () => {
    // 01/10 01:00 UTC = 30/09 22:00 em SP
    expect(mesAtualSP(new Date("2026-10-01T01:00:00Z"))).toBe("2026-09");
    expect(nomeDoMes("2026-09")).toBe("setembro");
  });
});
