import { describe, it, expect } from "vitest";
import { abasDeVendas, ABAS_VENDAS } from "../vendas/VendasClient";

// ── A navegação do Analytics ────────────────────────────────────────────────
//
// Eram cinco abas no topo mais seis por dentro, e "Visão geral" existia nos
// DOIS níveis significando coisas diferentes (produção em cima, venda por
// canal embaixo). Estas travas não são sobre gosto de rótulo; são sobre as
// duas coisas que davam defeito de verdade:
//
//  1. quem vê o quê tem que morar num lugar só — a regra duplicada foi como a
//     Beatriz acabou em times diferentes em duas telas;
//  2. "Faturamento" (empresa inteira) e "Canais" (o corte do comercial) não
//     podem aparecer juntos: são a mesma pergunta em recortes diferentes, e
//     lado a lado voltam a ser a duplicação que a reorganização veio matar.

/** Espelha a regra do AnalyticsClient — se ela mudar lá, muda aqui de propósito. */
function subsDoAnalytics(views: string[], canEmpresa: boolean) {
  return [
    ...(canEmpresa ? ["faturamento"] : []),
    ...abasDeVendas(views).filter((t) => !(canEmpresa && t.key === "geral")).map((t) => t.key),
  ];
}

describe("Analytics — as abas de Vendas", () => {
  it("nenhum rótulo se repete entre os recortes", () => {
    const nomes = ABAS_VENDAS.map((t) => t.nome);
    expect(new Set(nomes).size, `rótulos repetidos em ${nomes.join(", ")}`).toBe(nomes.length);
  });

  it("'Visão geral' não volta a existir aqui — esse nome é da aba de Operação", () => {
    const colidem = ABAS_VENDAS.filter((t) => /vis[ãa]o geral/i.test(t.nome)).map((t) => t.key);
    expect(
      colidem,
      "Um recorte de VENDAS chamado 'Visão geral' colide com a aba de topo, que é de " +
      "PRODUÇÃO. O mesmo rótulo pra dois assuntos na mesma tela era metade da confusão.",
    ).toEqual([]);
  });

  it("quem enxerga a empresa toda NÃO vê Faturamento e Canais juntos", () => {
    const todas = ["set:comercial", "set:vendedoras", "set:marketing", "set:marketplace"];
    const subs = subsDoAnalytics(todas, true);
    expect(subs).toContain("faturamento");
    expect(
      subs,
      "Faturamento é superconjunto de Canais: os dois juntos são a duplicação de volta.",
    ).not.toContain("geral");
  });

  it("quem só enxerga o comercial continua com uma tela — a que a permissão dele permite", () => {
    const subs = subsDoAnalytics(["set:comercial"], false);
    expect(
      subs,
      "Sem `canEmpresa` a pessoa não pode ler o faturamento inteiro, então Canais é a " +
      "única porta dela. Removê-la deixaria esse acesso sem tela nenhuma.",
    ).toContain("geral");
    expect(subs).not.toContain("faturamento");
  });

  it("gestão (sem chave de setor) vê todos os recortes", () => {
    const subs = subsDoAnalytics([], true);
    for (const k of ["pedidos", "vendedoras", "marketing", "marketplace", "outros"]) {
      expect(subs, `faltou ${k}`).toContain(k);
    }
  });

  it("chave de setor restringe de verdade", () => {
    const subs = subsDoAnalytics(["set:marketing"], false);
    expect(subs).toEqual(["marketing"]);
  });
});
