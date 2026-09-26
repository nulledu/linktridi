import { describe, expect, it } from "vitest";
import { avaliarGeo, ehAcessoDeFora, modoGeo, paisDaRequisicao, paisesPermitidos } from "@/lib/geo-acesso";

// O gate de localidade. O teste guarda as três garantias que impedem a proteção
// de virar "gente trancada fora do próprio trabalho".

describe("paisDaRequisicao", () => {
  it("lê o cabeçalho da Vercel e normaliza", () => {
    expect(paisDaRequisicao(new Headers({ "x-vercel-ip-country": "br" }))).toBe("BR");
  });
  it("sem cabeçalho (dev local) → null, nunca um país inventado", () => {
    expect(paisDaRequisicao(new Headers())).toBeNull();
    expect(paisDaRequisicao(new Headers({ "x-vercel-ip-country": "XX" }))).toBeNull();
  });
});

describe("configuração por ambiente", () => {
  it("sem variável nenhuma já REGISTRA (mas não bloqueia)", () => {
    // A coleta não pode depender de alguém lembrar de configurar: sem dado, a
    // decisão de bloquear seria tomada às cegas. Registrar não afeta ninguém.
    expect(modoGeo({})).toBe("registrar");
    expect(paisesPermitidos({})).toEqual(["BR"]);
  });
  it("modo escrito errado NUNCA vira bloqueio — cai em registrar", () => {
    expect(modoGeo({ GEO_MODO: "sim" })).toBe("registrar");
    expect(modoGeo({ GEO_MODO: "bloquearr" })).toBe("registrar");
    expect(modoGeo({ GEO_MODO: "BLOQUEAR" })).toBe("bloquear");
    expect(modoGeo({ GEO_MODO: "off" })).toBe("off");
  });
  it("aceita lista de países", () => {
    expect(paisesPermitidos({ GEO_PAISES: "br, pt " })).toEqual(["BR", "PT"]);
  });
});

describe("avaliarGeo", () => {
  const bloquear = { modo: "bloquear" as const, permitidos: ["BR"] };

  it("bloqueia país de fora quando o modo é bloquear", () => {
    const v = avaliarGeo("RU", bloquear);
    expect(v.permitir).toBe(false);
    expect(v.motivo).toBe("pais_bloqueado");
  });

  it("deixa passar o país permitido", () => {
    expect(avaliarGeo("BR", bloquear).permitir).toBe(true);
  });

  it("FAIL-OPEN: país desconhecido nunca é bloqueado", () => {
    // Sem isto, uma falha de geolocalização (IP novo, edge sem geo) viraria
    // gente trancada fora do trabalho.
    const v = avaliarGeo(null, bloquear);
    expect(v.permitir).toBe(true);
    expect(v.motivo).toBe("pais_desconhecido");
  });

  it("modo registrar NUNCA bloqueia, mesmo de fora", () => {
    expect(avaliarGeo("US", { modo: "registrar", permitidos: ["BR"] }).permitir).toBe(true);
  });

  it("modo off deixa tudo passar", () => {
    expect(avaliarGeo("US", { modo: "off", permitidos: ["BR"] }).permitir).toBe(true);
  });

  it("isento passa mesmo de fora (quem viaja)", () => {
    const v = avaliarGeo("PT", { ...bloquear, isento: true });
    expect(v.permitir).toBe(true);
    expect(v.motivo).toBe("isento");
  });
});

describe("ehAcessoDeFora", () => {
  it("marca acesso de fora mesmo quando não se bloqueia (serve pro alerta)", () => {
    expect(ehAcessoDeFora("US", ["BR"])).toBe(true);
    expect(ehAcessoDeFora("BR", ["BR"])).toBe(false);
    expect(ehAcessoDeFora(null, ["BR"])).toBe(false);
  });
});
