import { describe, it, expect } from "vitest";
import { codigoDaUnidade, partirCodigo, skuAutomatico, MOTIVOS_BAIXA } from "../estoque-unidades";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("código da unidade", () => {
  it("é SKU + sequencial de 6 dígitos", () => {
    expect(codigoDaUnidade("MDF6MM-BR-18", 42)).toBe("MDF6MM-BR-18-000042");
  });
  it("aguenta mais de um milhão sem truncar", () => {
    expect(codigoDaUnidade("X", 1234567)).toBe("X-1234567");
  });
  it("parte o código de volta em SKU e sequência", () => {
    expect(partirCodigo("MDF6MM-BR-18-000042")).toEqual({ sku: "MDF6MM-BR-18", seq: 42 });
  });
  it("recusa código sem sequência em vez de devolver NaN", () => {
    expect(partirCodigo("MDF6MM")).toBeNull();
    expect(partirCodigo("MDF-ABC")).toBeNull();
  });
  it("ida e volta fecha", () => {
    const c = codigoDaUnidade("A-B-C", 7);
    expect(partirCodigo(c)).toEqual({ sku: "A-B-C", seq: 7 });
  });
  it("SKU automático usa UM prefixo só, seja qual for a hierarquia", () => {
    // Eram oito prefixos (MP, MPP, CMP, PEC, PRD…) e o catálogo acabou com cinco
    // convenções vivas ao mesmo tempo. Decisão do dono: PRD-#### pra tudo.
    expect(skuAutomatico("materia_prima", 7)).toBe("PRD-0007");
    expect(skuAutomatico("produto", 123)).toBe("PRD-0123");
    expect(skuAutomatico("inventada", 1)).toBe("PRD-0001");
  });
  it("os motivos de baixa batem com o check do banco", () => {
    expect(MOTIVOS_BAIXA.map((m) => m.key)).toEqual(["consumido", "expedido", "perdido", "devolvido"]);
  });
  it("todo ícone de MOTIVOS_BAIXA existe no mapa do Icon.tsx", () => {
    // Ícone que não existe no mapa não quebra nada visivelmente — o <Icon>
    // engole em silêncio em produção (só avisa no console em dev) e desenha
    // nada. Um botão de baixa sem ícone é exatamente esse tipo de defeito
    // que só aparece quando alguém olha a tela e sente falta de algo.
    const iconTsx = readFileSync(join(__dirname, "../../app/(plataforma)/Icon.tsx"), "utf8");
    const chaves = [...iconTsx.matchAll(/^\s*"?([\w-]+)"?:\s*'</gm)].map((m) => m[1]);
    for (const motivo of MOTIVOS_BAIXA) {
      expect(chaves).toContain(motivo.icon);
    }
  });
});
