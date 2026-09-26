import { describe, it, expect } from "vitest";
import { gerarCodigoAtivacao, validarVersaoInput, acaoValida } from "@/lib/tv-frota-admin";

describe("gerarCodigoAtivacao", () => {
  it("tem o tamanho pedido e evita caracteres ambíguos", () => {
    const c = gerarCodigoAtivacao(8);
    expect(c).toHaveLength(8);
    expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/); // sem 0/O/1/I/L
  });
  it("não repete na prática (100 códigos distintos)", () => {
    const set = new Set(Array.from({ length: 100 }, () => gerarCodigoAtivacao()));
    expect(set.size).toBe(100);
  });
});

describe("validarVersaoInput", () => {
  const base = { versionCode: 3, versionName: "1.3", url: "https://cdn/x.apk", sha256: "a".repeat(64) };
  it("aceita entrada válida e normaliza", () => {
    const r = validarVersaoInput({ ...base, obrigatoria: true, notas: " nota " });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.versao.obrigatoria).toBe(true); expect(r.versao.notas).toBe("nota"); }
  });
  it("recusa versionCode não-inteiro", () => {
    expect(validarVersaoInput({ ...base, versionCode: 1.5 }).ok).toBe(false);
    expect(validarVersaoInput({ ...base, versionCode: 0 }).ok).toBe(false);
  });
  it("exige url https", () => {
    expect(validarVersaoInput({ ...base, url: "http://cdn/x.apk" }).ok).toBe(false);
  });
  it("exige sha256 de 64 hex", () => {
    expect(validarVersaoInput({ ...base, sha256: "abc" }).ok).toBe(false);
    expect(validarVersaoInput({ ...base, sha256: "A".repeat(64) }).ok).toBe(true); // aceita maiúsculo, normaliza
  });
});

describe("acaoValida", () => {
  it("só deixa passar o conjunto fechado", () => {
    expect(acaoValida("comando")).toBe(true);
    expect(acaoValida("publicar_versao")).toBe(true);
    expect(acaoValida("dropar_tabela")).toBe(false);
    expect(acaoValida(null)).toBe(false);
  });
});
