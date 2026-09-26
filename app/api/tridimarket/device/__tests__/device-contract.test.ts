import { describe, expect, it } from "vitest";
import { classificarCodigo, deviceActivationInput, deviceHeartbeatInput, devicePurchaseInput, pinSessionInput, tokenDigest } from "../_device";

describe("código de acesso: inativo não é código errado", () => {
  const ativo = { id: 1, unidade_id: "u1", ativo: true };
  const inativo = { id: 2, unidade_id: "u1", ativo: false };

  it("conta desativada tem motivo próprio", () => {
    // Antes isto virava `invalid_pin`: a pessoa ouvia "código não reconhecido",
    // tentava de novo, e ainda somava tentativa na trava do tablet.
    expect(classificarCodigo([inativo]).tipo).toBe("conta_inativa");
  });

  it("código que não existe continua sendo código errado", () => {
    expect(classificarCodigo([]).tipo).toBe("codigo_desconhecido");
  });

  it("só bloqueia quem está inativo", () => {
    // Mesma pessoa cadastrada em várias empresas: basta uma conta ativa.
    const r = classificarCodigo([inativo, ativo]);
    expect(r.tipo).toBe("ativos");
    expect(r.tipo === "ativos" && r.lista).toEqual([ativo]);
  });

  it("sem a coluna `ativo` ninguém fica trancado para fora", () => {
    const semColuna = { id: 3, unidade_id: "u1" };
    expect(classificarCodigo([semColuna]).tipo).toBe("ativos");
  });
});

describe("TridiMarket device API contract", () => {
  it("accepts activation metadata and rejects short codes", () => {
    expect(deviceActivationInput.safeParse({ code: "123456", appVersion: "0.1.0", installationId: crypto.randomUUID() }).success).toBe(true);
    expect(deviceActivationInput.safeParse({ code: "123", appVersion: "0.1.0", installationId: crypto.randomUUID() }).success).toBe(false);
  });

  it("accepts a numeric kiosk PIN only", () => {
    expect(pinSessionInput.safeParse({ pin: "2458" }).success).toBe(true);
    expect(pinSessionInput.safeParse({ pin: "24a8" }).success).toBe(false);
  });

  it("requires a stable operation id and non-empty cart", () => {
    const purchase = { operationId: crypto.randomUUID(), localSequence: 1, employeeId: 2, companyId: 4, deviceOccurredAt: new Date().toISOString(), rulesVersion: 1, items: [{ productId: 3, quantity: 2, unitPrice: 4.5 }] };
    expect(devicePurchaseInput.safeParse(purchase).success).toBe(true);
    expect(devicePurchaseInput.safeParse({ ...purchase, items: [] }).success).toBe(false);
  });

  it("caps pending operations reported by a heartbeat", () => {
    expect(deviceHeartbeatInput.safeParse({ pendingOperations: 30 }).success).toBe(true);
    expect(deviceHeartbeatInput.safeParse({ pendingOperations: 1_000_001 }).success).toBe(false);
  });

  it("never stores the raw device token", () => {
    expect(tokenDigest("secret-device-token")).not.toContain("secret-device-token");
    expect(tokenDigest("secret-device-token")).toHaveLength(64);
  });
});
