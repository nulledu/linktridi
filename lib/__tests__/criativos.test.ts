import { describe, it, expect } from "vitest";
import { normalizarNome, agruparCriativos, chaveCriativo, inferirMarcaCriativo, resolverMarcaCriativo } from "../criativos";
import type { AdRow } from "../meta-ads";

const ad = (p: Partial<AdRow>): AdRow => ({
  id: Math.random().toString(36).slice(2), name: "X", account: "c1", campaign: "camp",
  status: "ACTIVE", thumb: null, videoId: null, permalink: null, tipo: "video",
  criadoEm: null, categoria: null, tags: [],
  spend: 0, impressions: 0, reach: 0, frequency: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0,
  purchases: 0, revenue: 0, roas: null, leads: 0, cpa: null, cpl: null,
  ...p,
} as AdRow);

describe("normalizarNome", () => {
  it("ignora {TAG}, acento, caixa e espaco", () => {
    expect(normalizarNome("JN 01 V2.2 G")).toBe(normalizarNome("jn  01   v2.2   g"));
    expect(normalizarNome("{CRB} Ação Nº1")).toBe(normalizarNome("Acao N 1"));
  });
  it("trata a duplicata da Meta como o MESMO criativo", () => {
    const base = normalizarNome("JN 01 V2.2 G");
    expect(normalizarNome("JN 01 V2.2 G — Cópia")).toBe(base);
    expect(normalizarNome("JN 01 V2.2 G - Copia 2")).toBe(base);
    expect(normalizarNome("JN 01 V2.2 G (2)")).toBe(base);
    expect(normalizarNome("JN 01 V2.2 G — Cópia (3)")).toBe(base);
  });
  it("nao funde criativos realmente diferentes", () => {
    expect(normalizarNome("JN 01")).not.toBe(normalizarNome("JN 02"));
  });
});

describe("agruparCriativos", () => {
  it("funde o mesmo nome e SOMA as metricas", () => {
    const g = agruparCriativos([
      ad({ name: "JN 01", criadoEm: "2026-03-01T00:00:00+0000", spend: 100, revenue: 300, purchases: 3, impressions: 1000, clicks: 20 }),
      ad({ name: "JN 01 — Cópia", criadoEm: "2026-04-01T00:00:00+0000", spend: 50, revenue: 150, purchases: 2, impressions: 500, clicks: 5 }),
    ], 2026);
    expect(g).toHaveLength(1);
    expect(g[0].spend).toBe(150);
    expect(g[0].revenue).toBe(450);
    expect(g[0].purchases).toBe(5);
    expect(g[0].anuncios).toBe(2);
    expect(g[0].roas).toBeCloseTo(3);
    // CTR recalculado do agregado (25/1500), nao media de medias
    expect(g[0].ctr).toBeCloseTo((25 / 1500) * 100);
  });

  it("TRAVA: mesmo nome em anos diferentes NAO funde", () => {
    const g = agruparCriativos([
      ad({ name: "JN 01", criadoEm: "2025-11-01T00:00:00+0000", spend: 10 }),
      ad({ name: "JN 01", criadoEm: "2026-01-05T00:00:00+0000", spend: 20 }),
    ], 2026);
    expect(g).toHaveLength(2);
    expect(new Set(g.map((x) => x.safra))).toEqual(new Set([2025, 2026]));
  });

  it("sem created_time cai no ano padrao (continua fundindo)", () => {
    const g = agruparCriativos([ad({ name: "JN 01" }), ad({ name: "JN 01" })], 2026);
    expect(g).toHaveLength(1);
    expect(g[0].safra).toBe(2026);
  });

  it("marca CONFLITO quando o mesmo nome+ano tem videos distintos", () => {
    const g = agruparCriativos([
      ad({ name: "JN 01", criadoEm: "2026-02-01T00:00:00+0000", videoId: "v1" }),
      ad({ name: "JN 01", criadoEm: "2026-02-02T00:00:00+0000", videoId: "v2" }),
    ], 2026);
    expect(g).toHaveLength(1);
    expect(g[0].conflito).toBe(true);
  });

  it("mesmo video repetido NAO e conflito", () => {
    const g = agruparCriativos([
      ad({ name: "JN 01", criadoEm: "2026-02-01T00:00:00+0000", videoId: "v1" }),
      ad({ name: "JN 01 — Cópia", criadoEm: "2026-02-02T00:00:00+0000", videoId: "v1" }),
    ], 2026);
    expect(g[0].conflito).toBe(false);
  });

  it("imagem: thumbs de origem distinta viram conflito (query assinada ignorada)", () => {
    const g = agruparCriativos([
      ad({ name: "IMG A", tipo: "imagem", criadoEm: "2026-02-01T00:00:00+0000", thumb: "https://cdn.fb/a.jpg?sig=1" }),
      ad({ name: "IMG A", tipo: "imagem", criadoEm: "2026-02-02T00:00:00+0000", thumb: "https://cdn.fb/a.jpg?sig=999" }),
    ], 2026);
    expect(g[0].conflito).toBe(false);   // mesma origem, assinatura diferente
    const g2 = agruparCriativos([
      ad({ name: "IMG B", tipo: "imagem", criadoEm: "2026-02-01T00:00:00+0000", thumb: "https://cdn.fb/a.jpg?sig=1" }),
      ad({ name: "IMG B", tipo: "imagem", criadoEm: "2026-02-02T00:00:00+0000", thumb: "https://cdn.fb/b.jpg?sig=1" }),
    ], 2026);
    expect(g2[0].conflito).toBe(true);
  });

  it("chave e estavel entre duplicatas (tags/editor sobrevivem)", () => {
    const a1 = ad({ name: "JN 01", criadoEm: "2026-02-01T00:00:00+0000" });
    const a2 = ad({ name: "JN 01 — Cópia", criadoEm: "2026-05-01T00:00:00+0000" });
    expect(chaveCriativo(a1, 2026)).toBe(chaveCriativo(a2, 2026));
  });
});

describe("marcação automática do criativo", () => {
  it.each([
    ["{B} Vídeo 01", "Beatriz"],
    ["{g} Vídeo 02", "Gustavo"],
    ["{L} Vídeo 03", "Leticia"],
  ])("lê o editor do código delimitado em %s", (name, editor) => {
    const grupo = agruparCriativos([ad({ name })], 2026)[0];
    expect(inferirMarcaCriativo(grupo).editor).toBe(editor);
  });

  it("lê {CH} como Chancela também quando o código está na campanha", () => {
    const grupo = agruparCriativos([ad({ name: "Vídeo 04", campaign: "CBO {CH} escala" })], 2026)[0];
    expect(inferirMarcaCriativo(grupo).tags).toEqual(["Chancela"]);
  });

  it("mantém o editor manual e une tags manuais às inferidas", () => {
    const grupo = agruparCriativos([ad({ name: "{B} {CH} Vídeo 05" })], 2026)[0];
    expect(resolverMarcaCriativo(grupo, { chave: grupo.chave, editor: "Gustavo", tags: ["UGC"] })).toEqual({
      chave: grupo.chave,
      editor: "Gustavo",
      tags: ["Chancela", "UGC"],
    });
  });
});
