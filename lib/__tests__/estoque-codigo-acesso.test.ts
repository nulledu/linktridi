import { describe, it, expect } from "vitest";
import { normalizarCodigoAcesso } from "../estoque-codigo-acesso";

describe("normalizarCodigoAcesso", () => {
  it("null vira null (nada a limpar)", () => {
    expect(normalizarCodigoAcesso(null)).toEqual({ valor: null });
  });
  it("string vazia vira null — é como se LIMPA o código", () => {
    expect(normalizarCodigoAcesso("")).toEqual({ valor: null });
  });
  it("só espaço também limpa", () => {
    expect(normalizarCodigoAcesso("   ")).toEqual({ valor: null });
  });
  it("apara espaço nas pontas antes de validar", () => {
    expect(normalizarCodigoAcesso("  1234  ")).toEqual({ valor: "1234" });
  });
  it("aceita de 4 a 8 dígitos", () => {
    expect(normalizarCodigoAcesso("1234")).toEqual({ valor: "1234" });
    expect(normalizarCodigoAcesso("12345678")).toEqual({ valor: "12345678" });
  });
  it("recusa menos de 4 dígitos", () => {
    expect(normalizarCodigoAcesso("123")).toBeNull();
  });
  it("recusa mais de 8 dígitos", () => {
    expect(normalizarCodigoAcesso("123456789")).toBeNull();
  });
  it("recusa letras — teclado numérico do leitor não digita outra coisa", () => {
    expect(normalizarCodigoAcesso("12a4")).toBeNull();
    expect(normalizarCodigoAcesso("abcd")).toBeNull();
  });
  it("recusa símbolos e espaço no meio", () => {
    expect(normalizarCodigoAcesso("12-34")).toBeNull();
    expect(normalizarCodigoAcesso("12 34")).toBeNull();
  });
});
