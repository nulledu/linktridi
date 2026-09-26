import { describe, it, expect } from "vitest";
import { lerPulso } from "../estoque-device-pulso";

describe("o que o tablet conta de si mesmo no heartbeat", () => {
  it("lê o que o app manda hoje", () => {
    expect(lerPulso({ pendingOperations: 12, appVersion: "0.1.0" })).toEqual({
      pendencias: 12,
      appVersao: "0.1.0",
    });
  });

  // Esta é a rota que prova que o aparelho está VIVO. Se ela recusar por causa
  // de um campo, o tablet some do radar justamente quando estiver rodando uma
  // versão que a gente não previu.
  it("corpo ausente não é erro — o heartbeat continua batendo", () => {
    for (const corpo of [null, undefined, "", 0, "não é json", []]) {
      expect(lerPulso(corpo)).toEqual({ pendencias: null, appVersao: null });
    }
  });

  it("aparelho de versão antiga, que não manda nada, ainda é lido", () => {
    expect(lerPulso({})).toEqual({ pendencias: null, appVersao: null });
  });

  it("campo faltando não contamina o outro", () => {
    expect(lerPulso({ pendingOperations: 3 }).appVersao).toBe(null);
    expect(lerPulso({ appVersion: "9.9.9" }).pendencias).toBe(null);
  });

  // O contrato do cliente é Int, mas o decodificador do app é tolerante a
  // string (`IntTolerante`) e a rota não pode ser mais rígida que ele.
  it("número em texto vale como número", () => {
    expect(lerPulso({ pendingOperations: "40" }).pendencias).toBe(40);
  });

  it("lixo no lugar do número vira nulo, nunca NaN", () => {
    for (const v of [{}, [], "abc", null, true, Number.NaN, Infinity]) {
      expect(lerPulso({ pendingOperations: v }).pendencias).toBe(null);
    }
  });

  // "Menos três operações esperando" não existe, e gravar isso contamina
  // qualquer soma feita em cima depois.
  it("negativo satura em zero", () => {
    expect(lerPulso({ pendingOperations: -5 }).pendencias).toBe(0);
  });

  it("fracionário vira inteiro, sem arredondar pra cima", () => {
    expect(lerPulso({ pendingOperations: 3.9 }).pendencias).toBe(3);
  });

  // Um "2.000.000 pendentes" numa tela de acompanhamento só serve pra fazer
  // alguém ignorar o número.
  it("número absurdo satura em vez de virar dado", () => {
    expect(lerPulso({ pendingOperations: 9_999_999_999 }).pendencias).toBe(100_000);
  });

  it("versão é cortada — a coluna não é depósito de payload", () => {
    const gigante = "x".repeat(5000);
    expect(lerPulso({ appVersion: gigante }).appVersao).toHaveLength(40);
  });

  it("versão em branco é o mesmo que não ter dito", () => {
    expect(lerPulso({ appVersion: "   " }).appVersao).toBe(null);
    expect(lerPulso({ appVersion: "" }).appVersao).toBe(null);
  });

  it("versão vem sem espaço sobrando nas pontas", () => {
    expect(lerPulso({ appVersion: "  1.2.3 " }).appVersao).toBe("1.2.3");
  });

  it("versão que não é texto não vira texto", () => {
    expect(lerPulso({ appVersion: 123 }).appVersao).toBe(null);
  });
});
