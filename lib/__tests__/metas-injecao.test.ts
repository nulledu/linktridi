import { describe, expect, it } from "vitest";
import { idErpSeguro } from "@/lib/metas";

// B1 da auditoria: colaborador_id de uma meta (gravável por gerente não-admin)
// entrava cru na URL do ERP legado. idErpSeguro é o filtro que barra qualquer
// coisa que não seja um id — é o que impede injeção de filtro PostgREST.

describe("idErpSeguro", () => {
  it("aceita ids reais do ERP", () => {
    for (const ok of ["12345", "abc-123", "u_99", "a", "A1b2C3"]) {
      expect(idErpSeguro(ok)).toBe(true);
    }
  });

  it("rejeita payload de injeção de filtro PostgREST", () => {
    for (const mau of [
      "1&outra_coluna=eq.x",   // filtro extra
      "1,2",                   // lista
      "*",                     // curinga select
      "a.b",                   // operador
      "1;drop",                // pontuação
      "",                      // vazio
      "id com espaco",
      "x".repeat(65),          // longo demais
    ]) {
      expect(idErpSeguro(mau)).toBe(false);
    }
  });
});
