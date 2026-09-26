import { describe, expect, it } from "vitest";
import { lerSaldo } from "@/lib/financeiro/pagarme";
import { ehPagarme } from "@/app/(plataforma)/financeiro/cadastros/contas/SaldoNoGateway";

describe("Pagar.me · saldo", () => {
  it("converte centavos da API v5 em reais", () => {
    const s = lerSaldo({ available_amount: 123456, waiting_funds_amount: 99, transferred_amount: 0 }, new Date(0));
    expect(s).toEqual({ disponivel: 1234.56, aReceber: 0.99, transferido: 0, lidoEm: "1970-01-01T00:00:00.000Z" });
  });
  it("campo ausente vira zero", () => {
    expect(lerSaldo({}).disponivel).toBe(0);
  });
  it("reconhece a conta da Pagar.me pela instituição ou nome", () => {
    expect(ehPagarme({ instituicao: "Pagar.me" })).toBe(true);
    expect(ehPagarme({ nome: "Gateway PagarMe" })).toBe(true);
    expect(ehPagarme({ nome: "Itaú", instituicao: "Itaú" })).toBe(false);
  });
});

import { chavesSecretas, recebedorDaConta } from "@/lib/financeiro/pagarme";

describe("Pagar.me · várias contas", () => {
  it("lê as chaves PAGARME_SK_*", () => {
    expect(chavesSecretas({ PAGARME_SK_TRIDI: " sk_a ", PAGARME_SK_GEDUX: "sk_b", PAGARME_SK_VAZIA: "", OUTRA: "x" })).toEqual(["sk_a", "sk_b"]);
  });
  const chaves = new Map([["re_a", "sk_a"], ["re_b", "sk_b"]]);
  it("conta escolhe o recebedor pelo número", () => {
    expect(recebedorDaConta("re_b", chaves)).toBe("re_b");
    expect(recebedorDaConta("re_x", chaves)).toBeNull();
  });
  it("sem número só adivinha quando há um recebedor só", () => {
    expect(recebedorDaConta(null, chaves)).toBeNull();
    expect(recebedorDaConta("", new Map([["re_u", "sk"]]))).toBe("re_u");
  });
});
