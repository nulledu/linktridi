import { describe, expect, it } from "vitest";
import { batidoEmValido } from "../ponto";

// 03/08/2026: o tablet ficou a manhã sem rede e esvaziou a fila às 09:57. Como
// a batida subia SEM horário, o now() do banco carimbou tudo no minuto do envio
// e 21 pessoas "entraram" juntas. O carimbo do cliente é o que conserta isso —
// e esta janela é o que impede um tablet com relógio quebrado de estragar o
// espelho de ponto de um jeito pior.
describe("batidoEmValido", () => {
  const agora = Date.parse("2026-08-03T12:57:00.000Z");

  it("aceita a batida atrasada da fila offline", () => {
    expect(batidoEmValido("2026-08-03T10:00:00.000Z", agora)).toBe("2026-08-03T10:00:00.000Z");
  });

  it("aceita o fim de semana inteiro sem rede", () => {
    expect(batidoEmValido("2026-08-01T13:00:00.000Z", agora)).toBe("2026-08-01T13:00:00.000Z");
  });

  it("aceita semanas de fila parada — redatar tudo pra hoje é pior que atrasar", () => {
    expect(batidoEmValido("2026-07-28T10:00:00.000Z", agora)).toBe("2026-07-28T10:00:00.000Z");
    expect(batidoEmValido("2026-07-10T10:00:00.000Z", agora)).toBe("2026-07-10T10:00:00.000Z");
  });

  it("recusa mais velho que 30 dias — isso é relógio quebrado, não atraso", () => {
    expect(batidoEmValido("2026-06-01T10:00:00.000Z", agora)).toBeNull();
  });

  it("tolera 5min de desencontro de relógio, recusa o resto do futuro", () => {
    expect(batidoEmValido("2026-08-03T13:00:00.000Z", agora)).toBe("2026-08-03T13:00:00.000Z");
    expect(batidoEmValido("2026-08-03T15:00:00.000Z", agora)).toBeNull();
  });

  it("sem carimbo ou com lixo → null (o banco carimba na chegada, como antes)", () => {
    for (const v of [undefined, null, "", "ontem", 123, {}]) {
      expect(batidoEmValido(v, agora)).toBeNull();
    }
  });
});
