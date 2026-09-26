import { describe, expect, it } from "vitest";
import { AREA_BY_KEY, chavesDasAreas } from "../areas";

// Bug relatado: "as permissões estão ligadas no perfil e mesmo assim a pessoa
// é barrada na área". Era um furo entre o que a GRADE grava e o que o
// resolver (`chavesDasAreas`) devolve pro gate:
//
// 1. Analytics — as visões por setor (`set:*`) só existiam no modelo antigo por
//    NÍVEL. Quem foi configurado na grade ficava com a área "Analytics" ligada
//    e sem nenhuma visão: Faturamento e Financeiro sumiam da tela.
describe("Analytics — visões por setor vêm da grade", () => {
  it("cada setor liberado na grade vira a chave set:* que a tela usa", () => {
    const keys = chavesDasAreas({ "analytics:comercial": true, "analytics:marketing": true });
    expect(keys).toContain("analytics");
    expect(keys).toContain("set:comercial");
    expect(keys).toContain("set:marketing");
    expect(keys).not.toContain("set:financeiro");
  });

  it("Financeiro é sensível: só entra por grant explícito", () => {
    const legado = chavesDasAreas({ analytics: true });
    expect(legado).toContain("analytics");
    expect(legado).toContain("set:comercial");
    expect(legado).toContain("set:vendedoras");
    expect(legado).not.toContain("set:financeiro");
    expect(chavesDasAreas({ "analytics:financeiro": true })).toContain("set:financeiro");
  });

  it("quem não tem Analytics não ganha setor nenhum", () => {
    const keys = chavesDasAreas({ comercial: true });
    expect(keys.some((k) => k.startsWith("set:"))).toBe(false);
  });
});

describe("Catálogo", () => {
  it("toda sub que implica outra aponta para uma sub que existe na mesma área", () => {
    for (const a of Object.values(AREA_BY_KEY)) {
      const subs = new Set((a.subs ?? []).map((s) => s.key));
      for (const s of a.subs ?? []) {
        for (const dep of s.implica ?? []) expect(subs, `${a.key}:${s.key}`).toContain(dep);
      }
    }
  });
});
