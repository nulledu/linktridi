import { describe, it, expect } from "vitest";
import {
  AUTOMATICO_DESDE, AUTO_PARTES, bonusDoMes, comissaoDoMes, copiasQueFaltam, entradaAutomatica,
  mercadinhoAutomatico, podeComissaoDeVendas, type OrigemRecorrente,
} from "../financeiro/folha-mensal";

describe("bônus × comissão na tela", () => {
  it("tráfego e marketplace somam no BÔNUS; comissão é vendas + outros", () => {
    const m = { bonus: 100, comissao_trafego: 702.5, comissao_marketplace: 50.71, comissao_vendas: 612.5, comissao_outros: 10 };
    expect(bonusDoMes(m)).toBe(853.21);
    expect(comissaoDoMes(m)).toBe(622.5);
  });
});

describe("comissão de vendas é só de quem vende", () => {
  it("Design, Marketing e Comercial recebem sugestão da planilha", () => {
    for (const s of ["Design", "Marketing", "Comercial", "design", "COMERCIAL", "Comércial"]) {
      expect(podeComissaoDeVendas(s), s).toBe(true);
    }
  });

  it("TI, Produção e afins não recebem — o pedido literal do dono", () => {
    for (const s of ["TI", "Produção", "Logística", "Financeiro", "SAC", "Estoque", null, "", "   "]) {
      expect(podeComissaoDeVendas(s), String(s)).toBe(false);
    }
  });

  it("o setor casa pelo COMEÇO, não por pedaço solto", () => {
    // "Comercial · SP" é comercial; "Suporte ao Comercial" não é.
    expect(podeComissaoDeVendas("Comercial · SP")).toBe(true);
    expect(podeComissaoDeVendas("Design gráfico")).toBe(true);
    expect(podeComissaoDeVendas("Suporte ao Comercial")).toBe(false);
    expect(podeComissaoDeVendas("TI/Comercial")).toBe(false);
  });
});

describe("mercadinho automático", () => {
  it("entra sozinho de setembro/2026 em diante, só com a célula em zero e o mês aberto", () => {
    expect(mercadinhoAutomatico({ competencia: "2026-09-01", pago: false, mercadinho: 0 })).toBe(true);
    expect(mercadinhoAutomatico({ competencia: "2026-08-01", pago: false, mercadinho: 0 })).toBe(false);
    expect(mercadinhoAutomatico({ competencia: "2026-09-01", pago: true, mercadinho: 0 })).toBe(false);
    expect(mercadinhoAutomatico({ competencia: "2026-09-01", pago: false, mercadinho: 37.4 })).toBe(false);
  });
});

const mes = (competencia: string, auto: Partial<Record<"auto_vendas" | "auto_trafego" | "auto_marketplace", boolean | null>> = {}) => ({
  competencia, auto_vendas: null, auto_trafego: null, auto_marketplace: null, ...auto,
});

describe("entrada automática por área", () => {
  it("setembro/2026 em diante nasce automático; agosto e antes, manual", () => {
    expect(AUTOMATICO_DESDE).toBe("2026-09-01");
    for (const p of AUTO_PARTES) {
      expect(entradaAutomatica(mes("2026-09-01"), p)).toBe(true);
      expect(entradaAutomatica(mes("2026-12-01"), p)).toBe(true);
      expect(entradaAutomatica(mes("2026-08-01"), p)).toBe(false);
      expect(entradaAutomatica(mes("2026-01-01"), p)).toBe(false);
    }
  });

  it("o interruptor gravado vence a data, nos dois sentidos, área por área", () => {
    expect(entradaAutomatica(mes("2026-08-01", { auto_vendas: true }), "vendas")).toBe(true);
    expect(entradaAutomatica(mes("2026-08-01", { auto_vendas: true }), "trafego")).toBe(false);
    expect(entradaAutomatica(mes("2026-10-01", { auto_marketplace: false }), "marketplace")).toBe(false);
    expect(entradaAutomatica(mes("2026-10-01", { auto_marketplace: false }), "vendas")).toBe(true);
  });
});

describe("bônus recorrente — quais cópias faltam", () => {
  const origem = (p: Partial<OrigemRecorrente> = {}): OrigemRecorrente => ({
    id: "o1", colaborador_id: "c1", competencia: "2026-09-01", valor: 200, descricao: "Meta batida",
    encerrado_em: null, pulados: [], ...p,
  });

  it("gera para o mês seguinte e não para o próprio mês da origem", () => {
    expect(copiasQueFaltam([origem()], [], "2026-10-01").map((o) => o.id)).toEqual(["o1"]);
    expect(copiasQueFaltam([origem()], [], "2026-09-01")).toEqual([]);
  });

  it("é idempotente: cópia que já existe não volta", () => {
    expect(copiasQueFaltam([origem()], [{ origem_id: "o1", competencia: "2026-10-01" }], "2026-10-01")).toEqual([]);
    // Cópia de OUTRO mês não conta como deste.
    expect(copiasQueFaltam([origem()], [{ origem_id: "o1", competencia: "2026-11-01" }], "2026-10-01")).toHaveLength(1);
  });

  it("'só este mês' pula aquele mês e segue nos outros", () => {
    const o = origem({ pulados: ["2026-11-01"] });
    expect(copiasQueFaltam([o], [], "2026-11-01")).toEqual([]);
    expect(copiasQueFaltam([o], [], "2026-12-01")).toHaveLength(1);
  });

  it("'daqui pra frente' encerra a partir da competência marcada", () => {
    const o = origem({ encerrado_em: "2026-11-01" });
    expect(copiasQueFaltam([o], [], "2026-10-01")).toHaveLength(1);
    expect(copiasQueFaltam([o], [], "2026-11-01")).toEqual([]);
    expect(copiasQueFaltam([o], [], "2027-03-01")).toEqual([]);
  });
});
