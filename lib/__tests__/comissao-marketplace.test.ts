import { describe, it, expect } from "vitest";
import {
  chavePlataforma, tipoDaFonte, plataformasMarketplace,
  PLATAFORMAS_MARKETPLACE, PLAT_SHOPEE, PLAT_MERCADO_LIVRE, PLAT_TIKTOK,
} from "../marketing-config";
import {
  ACORDO_MARKETPLACE_VAZIO, calcularComissaoMarketplace, normalizarAcordoMarketplace,
} from "../comissao-marketplace";

/**
 * Pedido do dono (01/09/2026): "pedidos que constam como TikTok, Shopee e
 * Mercado Livre devem ir pra conta das vendas Marketplace e contabilizar
 * comissão para o gerenciador dos marketplaces".
 *
 * Antes só a Shopee estava salva como marketplace; ML e TikTok caíam em
 * "ignorar" e ficavam fora de todo total.
 */
describe("marketplaces nascem classificados", () => {
  it("Shopee (3), Mercado Livre (9) e TikTok (10) são marketplace sem ninguém configurar", () => {
    expect(PLATAFORMAS_MARKETPLACE).toEqual([PLAT_SHOPEE, PLAT_MERCADO_LIVRE, PLAT_TIKTOK]);
    for (const id of PLATAFORMAS_MARKETPLACE) {
      expect(tipoDaFonte(chavePlataforma(id), {}, "Carimbos Tridi")).toBe("marketplace");
      expect(tipoDaFonte(chavePlataforma(id), undefined, "Carimbos Tridi")).toBe("marketplace");
    }
  });

  // 12/09/2026: marketplace passou a ser a PLATAFORMA do pedido, não uma
  // classificação. Um "ignorar" salvo no TikTok tirava a conta inteira do total
  // e do bônus de quem cuida dela, sem nada na tela avisar.
  it("classificação salva NÃO tira a plataforma do marketplace", () => {
    expect(tipoDaFonte("plat:9", { "plat:9": "ignorar" }, "Carimbos Tridi")).toBe("marketplace");
    expect(tipoDaFonte("plat:3", { "plat:3": "comercial" }, "Carimbos Tridi")).toBe("marketplace");
  });

  it("plataforma desconhecida continua em 'ignorar' — aparece como pendente", () => {
    expect(tipoDaFonte("plat:77", {}, "Carimbos Tridi")).toBe("ignorar");
  });
});

describe("plataformasMarketplace é a plataforma, não a classificação", () => {
  it("as três plataformas entram; WhatsApp não vira marketplace", () => {
    const plats = [
      { id: 3, nome: "Shopee" }, { id: 5, nome: "WhatsApp" }, { id: 9, nome: "Mercado Livre" }, { id: 10, nome: "TikTok" },
    ];
    expect(plataformasMarketplace(plats).map((p) => p.id)).toEqual([3, 9, 10]);
  });
});

describe("acordo do gerenciador", () => {
  it("normaliza lixo em acordo vazio e aceita vírgula no percentual", () => {
    expect(normalizarAcordoMarketplace(null)).toEqual(ACORDO_MARKETPLACE_VAZIO);
    expect(normalizarAcordoMarketplace("x")).toEqual(ACORDO_MARKETPLACE_VAZIO);
    expect(normalizarAcordoMarketplace({ pessoaId: "p1", pct: "2,5", ativa: 1 })).toEqual({ pessoaId: "p1", pct: 2.5, ativa: true });
    expect(normalizarAcordoMarketplace({ pct: -3 })).toEqual({ pessoaId: null, pct: 0, ativa: false });
    expect(normalizarAcordoMarketplace({ pessoaId: "", pct: "abc", ativa: true }).pessoaId).toBeNull();
  });

  it("é % do faturamento bruto, em centavos", () => {
    expect(calcularComissaoMarketplace({ pessoaId: "p1", pct: 2.5, ativa: true }, 2028.5)).toBeCloseTo(50.71, 2);
    expect(calcularComissaoMarketplace({ pessoaId: "p1", pct: 10, ativa: true }, 1234.567)).toBe(123.46);
  });

  it("inativo ou sem pessoa não calcula (null ≠ R$ 0,00)", () => {
    expect(calcularComissaoMarketplace({ pessoaId: "p1", pct: 2, ativa: false }, 1000)).toBeNull();
    expect(calcularComissaoMarketplace({ pessoaId: null, pct: 2, ativa: true }, 1000)).toBeNull();
    // Acordo de pé e mês sem venda: zero de verdade.
    expect(calcularComissaoMarketplace({ pessoaId: "p1", pct: 2, ativa: true }, 0)).toBe(0);
    expect(calcularComissaoMarketplace({ pessoaId: "p1", pct: 2, ativa: true }, Number.NaN)).toBe(0);
  });
});
