import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ehPedidoCancelado, ETAPA_CANCELADO, TABELA_ETAPAS } from "@/lib/erp-etapas";

// ── Duas coisas que andavam juntas, e a segunda escondia a primeira ──────────
//
// 1. Pedido CANCELADO contava como venda. `excluido` não cobre: cancelar no
//    ERP move a ETAPA (14 = Cancelado), não marca o pedido como excluído.
//    Medido em 02/09/2026: 12 pedidos em agosto (R$ 2.048,36), 11 em julho,
//    24 em junho — 11 destes de marketplace.
//
// 2. O motivo de ninguém ter visto: o app pedia o catálogo à tabela `etapas`,
//    que NÃO EXISTE no ERP (a certa é `etapas_pedidos`). O helper `erp()`
//    engole o 404 devolvendo lista vazia, então o mapa de etapas nascia vazio
//    em toda requisição, sem um erro sequer — e "Cancelado" não existia para o
//    sistema. Um 404 silencioso apagou uma etapa inteira do vocabulário.

describe("cancelado não é venda", () => {
  it("a etapa 14 é a cancelada", () => {
    expect(ETAPA_CANCELADO).toBe(14);
    expect(ehPedidoCancelado(14)).toBe(true);
  });

  it("as outras etapas seguem valendo", () => {
    // 13=Enviado, 7=Aprovado, 1=Sem Arte (onde todo pedido de marketplace fica)
    for (const etapa of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 13, 16]) {
      expect(ehPedidoCancelado(etapa), `etapa ${etapa} não é cancelamento`).toBe(false);
    }
  });

  it("pedido sem etapa não vira cancelado por acidente", () => {
    // Se `etapa_id` vier nulo (ou o campo faltar no select), o pedido tem que
    // CONTAR. Tratar ausência como cancelamento zeraria o faturamento inteiro
    // na primeira vez que alguém esquecesse a coluna na consulta.
    expect(ehPedidoCancelado(null)).toBe(false);
    expect(ehPedidoCancelado(undefined)).toBe(false);
  });
});

describe("o catálogo de etapas é pedido à tabela que existe", () => {
  it("é `etapas_pedidos`, nunca `etapas`", () => {
    expect(TABELA_ETAPAS).toBe("etapas_pedidos");
    const src = readFileSync("lib/comercial-pedidos.ts", "utf8");
    expect(src, "voltou a pedir a tabela que não existe").not.toContain('"etapas?select=');
    expect(src).toContain("TABELA_ETAPAS");
  });

  it("quem soma faturamento traz a etapa na consulta", () => {
    // Sem `etapa_id` no select, o filtro de cancelado passa a olhar
    // `undefined` em todo pedido e volta a contar cancelado como venda — sem
    // erro nenhum, que é exatamente como o defeito viveu até agora.
    const src = readFileSync("lib/trafego-vendas.ts", "utf8");
    expect(src, "o select perdeu etapa_id").toMatch(/select=[^`]*\betapa_id\b/);
    expect(src).toContain("ehPedidoCancelado(p.etapa_id)");
  });

  it("a lista de marketplace também tira o cancelado", () => {
    const src = readFileSync("lib/comercial-pedidos.ts", "utf8");
    expect(src).toContain("ehPedidoCancelado(p.etapa_id)");
  });
});
