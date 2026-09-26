import { describe, it, expect } from "vitest";
import {
  COMISSAO_PADRAO, calcularComissao, comissaoLegado, comissoesEfetivas,
  comissoesVisiveis, normalizarComissoes, type ComissaoGestor,
} from "../comissao-gestor";

const base = { fTP: 100_000, fTotal: 250_000, gTP: 20_000 };
const acordo = (p: Partial<ComissaoGestor> = {}): ComissaoGestor => ({
  id: "a", nome: "Gestor A", pessoaId: null,
  pctFaturamento: 0.8, pctEficiencia: 30, ativa: true, ...p,
});

describe("cálculo", () => {
  it("reproduz a fórmula que estava cravada no painel", () => {
    // (100.000 × 0,8%) × ((30% × 250.000) ÷ 20.000) = 800 × 3,75 = 3.000
    const r = calcularComissao(acordo(), base)!;
    expect(r.parteFixa).toBeCloseTo(800, 6);
    expect(r.fator).toBeCloseTo(3.75, 6);
    expect(r.valor).toBeCloseTo(3000, 6);
  });

  it("percentuais diferentes dão comissões diferentes na MESMA base", () => {
    // É o ponto da mudança: dois gestores, dois acordos, um só período.
    const a = calcularComissao(acordo({ pctFaturamento: 0.8 }), base)!.valor;
    const b = calcularComissao(acordo({ pctFaturamento: 1.2 }), base)!.valor;
    expect(b).toBeCloseTo(a * 1.5, 6);
  });

  it("sem gasto no período devolve null, não R$ 0,00", () => {
    // Zero seria mentira ("não deve nada"); o certo é "não dá para calcular".
    expect(calcularComissao(acordo(), { ...base, gTP: 0 })).toBeNull();
    expect(calcularComissao(acordo(), { ...base, gTP: -1 })).toBeNull();
  });
});

describe("normalização do jsonb", () => {
  it("descarta lixo e completa o que falta com o padrão", () => {
    const r = normalizarComissoes([
      { id: "x", nome: "  Caio  ", pessoaId: "u1", pctFaturamento: "1,5" },
      null, "texto", { pessoaId: "u2" },                  // sem nome: fora
      { nome: "Sem números" },
    ]);
    expect(r.map((c) => c.nome)).toEqual(["Caio", "Sem números"]);
    // "1,5" não é número válido em JS → cai no padrão em vez de virar NaN.
    expect(r[0].pctFaturamento).toBe(COMISSAO_PADRAO.pctFaturamento);
    expect(r[1].pctEficiencia).toBe(COMISSAO_PADRAO.pctEficiencia);
    expect(r[1].pessoaId).toBeNull();
    expect(r[1].ativa).toBe(true);
  });

  it("id repetido não colide (some da lista no React)", () => {
    const r = normalizarComissoes([{ id: "g", nome: "A" }, { id: "g", nome: "B" }]);
    expect(new Set(r.map((c) => c.id)).size).toBe(2);
  });

  it("aceita número em texto quando é número mesmo", () => {
    const r = normalizarComissoes([{ nome: "A", pctFaturamento: "1.5", pctEficiencia: 25 }]);
    expect(r[0].pctFaturamento).toBe(1.5);
    expect(r[0].pctEficiencia).toBe(25);
  });
});

describe("lista efetiva", () => {
  it("sem config, mostra o acordo histórico", () => {
    expect(comissoesEfetivas(undefined)).toEqual([comissaoLegado()]);
    expect(comissoesEfetivas(null)[0].pctFaturamento).toBe(0.8);
  });

  it("lista vazia SALVA é escolha, não ausência", () => {
    expect(comissoesEfetivas([])).toEqual([]);
  });
});

describe("visibilidade", () => {
  const lista = [acordo({ id: "a", pessoaId: "u1" }), acordo({ id: "b", nome: "Gestor B", pessoaId: "u2" })];

  it("admin vê todos", () => {
    expect(comissoesVisiveis(lista, { id: "u9", admin: true }, true)).toHaveLength(2);
  });

  it("gestor vê só a dele", () => {
    const r = comissoesVisiveis(lista, { id: "u2", admin: false }, true);
    expect(r.map((c) => c.id)).toEqual(["b"]);
  });

  it("quem não é dono de acordo nenhum não vê valor de ninguém", () => {
    expect(comissoesVisiveis(lista, { id: "u7", admin: false }, true)).toEqual([]);
  });

  it("enquanto nada foi configurado, o acordo histórico continua visível", () => {
    // Senão a tela do gestor de hoje esvazia sem ninguém ter mexido em nada.
    const r = comissoesVisiveis([comissaoLegado()], { id: "u1", admin: false }, false);
    expect(r).toHaveLength(1);
  });
});
