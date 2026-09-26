import { describe, expect, it } from "vitest";
import { calculateAccount, evaluatePurchase, formatMarketMoney, roundMoney } from "../tridimarket/domain";

describe("TridiMarket domain", () => {
  it("deriva o saldo aberto e disponível do livro-razão", () => {
    const account = calculateAccount([
      { kind: "purchase", amount: 20, occurredAt: "2026-07-20T10:00:00Z" },
      { kind: "payment", amount: -8, occurredAt: "2026-07-21T10:00:00Z" },
    ], { normal: 100, overdraft: 0 });

    expect(account).toEqual({ open: 12, capacity: 100, available: 88 });
  });

  it("arredonda dinheiro sem carregar erro de ponto flutuante", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(formatMarketMoney(32450.5)).toBe("R$ 32.450,50");
  });

  it("bloqueia carrinho acima do limite total", () => {
    const decision = evaluatePurchase(
      { open: 90, capacity: 100, available: 10 },
      [{ productId: 1, quantity: 1, unitPrice: 12, stock: 4 }],
      { allowStockOverride: true, offlineValid: true },
    );

    expect(decision).toEqual({ status: "blocked_limit", total: 12, stockOverride: false });
  });

  it("permite estoque negativo quando o fallback está habilitado", () => {
    const decision = evaluatePurchase(
      { open: 5, capacity: 100, available: 95 },
      [{ productId: 2, quantity: 2, unitPrice: 5, stock: 1 }],
      { allowStockOverride: true, offlineValid: true },
    );

    expect(decision).toEqual({ status: "approved", total: 10, stockOverride: true });
  });

  it("não inventa autorização quando a validade offline expirou", () => {
    const decision = evaluatePurchase(
      { open: 5, capacity: 100, available: 95 },
      [{ productId: 2, quantity: 1, unitPrice: 5, stock: 10 }],
      { allowStockOverride: true, offlineValid: false },
    );

    expect(decision.status).toBe("blocked_offline_expired");
  });
});
