import { describe, it, expect } from "vitest";
import { diaDoPedido, noPeriodo, janelaFolgada, somaDias } from "@/lib/dia-do-pedido";

// O defeito real, medido em 02/09/2026: agosto do Mercado Livre nascia com 24
// pedidos (R$ 1.621,97) onde o painel do ML mostra 23 (R$ 1.074). Um dos 24
// era o pedido 2000018225917596, carimbado `2026-09-01T00:00:00+00:00` — data
// SEM HORA, que lida como instante vira 31/08 às 21h em São Paulo.
describe("data sem hora não pode virar o dia anterior", () => {
  it("meia-noite UTC cravada é a DATA dela", () => {
    expect(diaDoPedido("2026-09-01T00:00:00+00:00")).toBe("2026-09-01");
    expect(diaDoPedido("2026-09-01T00:00:00Z")).toBe("2026-09-01");
    expect(diaDoPedido("2026-09-01T00:00:00.000000+00:00")).toBe("2026-09-01");
  });

  it("instante de verdade continua indo pelo fuso de São Paulo", () => {
    // 18:31 UTC = 15:31 em SP, mesmo dia.
    expect(diaDoPedido("2026-08-13T18:31:31.826446+00:00")).toBe("2026-08-13");
    // 01:00 UTC = 22:00 do dia anterior em SP — e AQUI descontar é o certo.
    expect(diaDoPedido("2026-08-14T01:00:00.500000+00:00")).toBe("2026-08-13");
    // 02:59 UTC = 23:59 do dia anterior: o último minuto do dia em SP.
    expect(diaDoPedido("2026-08-14T02:59:59.999000+00:00")).toBe("2026-08-13");
    // 03:00 UTC = 00:00 em SP: já é o dia novo.
    expect(diaDoPedido("2026-08-14T03:00:00.000000+00:00")).toBe("2026-08-14");
  });

  it("um segundo depois da meia-noite NÃO é data sem hora", () => {
    // Pedido feito de fato às 21:00:01 de SP. Não tem a assinatura, então vale
    // o fuso — e o dia é o anterior mesmo.
    expect(diaDoPedido("2026-09-01T00:00:01+00:00")).toBe("2026-08-31");
  });

  it("carimbo vazio ou quebrado não derruba a conta", () => {
    expect(diaDoPedido(null)).toBeNull();
    expect(diaDoPedido("")).toBeNull();
    expect(diaDoPedido("2026-08-13")).toBe("2026-08-13");
    expect(diaDoPedido("nada disso")).toBeNull();
  });
});

describe("o pedido dentro do período", () => {
  it("o pedido de 1º de setembro NÃO é de agosto", () => {
    expect(noPeriodo("2026-09-01T00:00:00+00:00", "2026-08-01", "2026-08-31")).toBe(false);
    expect(noPeriodo("2026-09-01T00:00:00+00:00", "2026-09-01", "2026-09-30")).toBe(true);
  });

  it("as bordas do período são inclusivas", () => {
    expect(noPeriodo("2026-08-01T12:00:00+00:00", "2026-08-01", "2026-08-31")).toBe(true);
    expect(noPeriodo("2026-08-31T23:00:00+00:00", "2026-08-01", "2026-08-31")).toBe(true);
  });
});

describe("a janela que a consulta pede", () => {
  it("abre um dia de folga de cada lado", () => {
    expect(janelaFolgada("2026-08-01", "2026-08-31")).toEqual({ de: "2026-07-31", ate: "2026-09-01" });
  });

  it("a folga é o que faz o pedido de 1º/set chegar até o filtro", () => {
    // Sem a folga, a consulta de setembro (gte 01/09 00:00 -03:00 = 03:00Z)
    // deixaria de fora o pedido carimbado 01/09 00:00Z — ele nunca chegaria
    // ao `noPeriodo` para ser contado no mês certo.
    const { de } = janelaFolgada("2026-09-01", "2026-09-30");
    expect(de).toBe("2026-08-31");
    expect(Date.parse("2026-09-01T00:00:00+00:00")).toBeGreaterThan(Date.parse(`${de}T00:00:00-03:00`));
  });

  it("soma de dias atravessa mês e ano", () => {
    expect(somaDias("2026-08-31", 1)).toBe("2026-09-01");
    expect(somaDias("2026-01-01", -1)).toBe("2025-12-31");
    expect(somaDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});
