import { describe, expect, it } from "vitest";
import { conferirVale, emitirVale, hashDoPin, pinFraco, pinValido } from "../atividades-autorizacao";

const K = "segredo-de-teste";
const AT = "11111111-1111-1111-1111-111111111111";
const SUP = "22222222-2222-2222-2222-222222222222";

describe("código de supervisor", () => {
  it("só aceita 4 a 6 dígitos", () => {
    expect(pinValido("1234")).toBe(true);
    expect(pinValido("123456")).toBe(true);
    expect(pinValido("123")).toBe(false);
    expect(pinValido("12a4")).toBe(false);
    expect(pinValido(1234)).toBe(false);
  });
  it("recusa código óbvio", () => {
    for (const p of ["1111", "1234", "4321", "987654", "000000"]) expect(pinFraco(p)).toBe(true);
    for (const p of ["2580", "1357", "739104"]) expect(pinFraco(p)).toBe(false);
  });
  it("hash é determinístico e depende do segredo", () => {
    expect(hashDoPin("2580", K)).toBe(hashDoPin("2580", K));
    expect(hashDoPin("2580", K)).not.toBe(hashDoPin("2580", "outro"));
  });
});

// A trava do /api/device/push: sem vale válido, devolver/dispensar não aplica.
describe("vale da recusa", () => {
  const agora = 1_000_000;
  const vale = emitirVale(AT, "devolver", SUP, agora, K);
  it("vale certo devolve o supervisor", () => {
    expect(conferirVale(vale, AT, "devolver", agora + 1000, K)).toBe(SUP);
  });
  it("não serve pra outra atividade nem outro tipo", () => {
    expect(conferirVale(vale, "33333333-3333-3333-3333-333333333333", "devolver", agora, K)).toBeNull();
    expect(conferirVale(vale, AT, "dispensar", agora, K)).toBeNull();
  });
  it("vence em 24 h e não aceita adulteração", () => {
    expect(conferirVale(vale, AT, "devolver", agora + 25 * 3600 * 1000, K)).toBeNull();
    expect(conferirVale(vale.replace(SUP, "44444444-4444-4444-4444-444444444444"), AT, "devolver", agora, K)).toBeNull();
    expect(conferirVale(undefined, AT, "devolver", agora, K)).toBeNull();
  });
});
