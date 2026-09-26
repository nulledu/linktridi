import { describe, it, expect } from "vitest";
import { decidirRepeticaoDeOperacao, operationIdValido } from "../estoque-device-operacoes";

describe("idempotência das operações do leitor do galpão", () => {
  describe("decidirRepeticaoDeOperacao", () => {
    it("sem registro prévio, não é repetida — segue pro processamento normal", () => {
      expect(decidirRepeticaoDeOperacao(null)).toEqual({ repetida: false });
    });
    it("com registro prévio, devolve o resultado ORIGINAL verbatim, sem reprocessar", () => {
      const resultadoOriginal = { ok: true, resultado: [{ codigo: "X-000001", situacao: "baixada", item: "Cola" }] };
      const decisao = decidirRepeticaoDeOperacao({ resultado: resultadoOriginal });
      expect(decisao).toEqual({ repetida: true, resultado: resultadoOriginal });
    });
  });

  describe("operationIdValido", () => {
    it("aceita um UUID", () => {
      expect(operationIdValido("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    });
    it("recusa o que não é UUID — string vazia, número, id malformado", () => {
      expect(operationIdValido("")).toBe(false);
      expect(operationIdValido(undefined)).toBe(false);
      expect(operationIdValido(123)).toBe(false);
      expect(operationIdValido("nao-e-um-uuid")).toBe(false);
    });
  });
});
