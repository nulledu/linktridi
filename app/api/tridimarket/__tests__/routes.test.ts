import { describe, expect, it } from "vitest";
import { deviceCodeInput, inventoryAdjustmentInput, marketApiError, paymentInput, productPatchInput } from "../_shared";

describe("TridiMarket admin API contracts", () => {
  it("rejeita produto sem nome ou preço negativo", () => {
    expect(productPatchInput.safeParse({ id: 1, name: "", price: -1 }).success).toBe(false);
  });

  it("aceita pagamento parcial positivo sem qualquer opção de folha", () => {
    const parsed = paymentInput.parse({ employeeId: 59, profileId: crypto.randomUUID(), amount: 12.5, method: "pix" });
    expect(parsed.amount).toBe(12.5);
    expect(Object.keys(paymentInput.shape)).not.toContain("payroll");
  });

  // A observação passou a ser OPCIONAL: repor o que acabou de chegar não tem
  // o que explicar, e o `min(3)` antigo devolvia "invalid_inventory_adjustment"
  // sem dizer qual campo faltava — a pessoa lia como "o estoque não salva".
  // O que continua obrigatório é o que identifica o ajuste: produto, empresa
  // e uma variação diferente de zero.
  it("aceita ajuste de estoque sem observação, mas não sem variação", () => {
    const base = { productId: 1, profileId: crypto.randomUUID() };
    expect(inventoryAdjustmentInput.safeParse({ ...base, delta: 5 }).success).toBe(true);
    expect(inventoryAdjustmentInput.safeParse({ ...base, delta: 5, reason: "" }).success).toBe(true);
    expect(inventoryAdjustmentInput.safeParse({ ...base, delta: 5, reason: "Reposição" }).success).toBe(true);
    expect(inventoryAdjustmentInput.safeParse({ ...base, delta: 0, reason: "Reposição" }).success).toBe(false);
  });

  it("exige perfil e nome para parear um totem", () => {
    expect(deviceCodeInput.safeParse({ profileId: crypto.randomUUID(), name: "Totem Produção" }).success).toBe(true);
    expect(deviceCodeInput.safeParse({ profileId: "", name: "" }).success).toBe(false);
  });

  it("transforma schema ausente em erro operacional acionável", async () => {
    const response = marketApiError({ message: 'relation "market_ledger_entries" does not exist' });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "market_schema_missing",
      action: "run_supabase_tridimarket_migration",
    });
  });
});
