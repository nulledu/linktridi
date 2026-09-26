import { describe, expect, it } from "vitest";
import { insightsDeProdutos, insightsDeVendas, type EntradaProdutos, type EntradaVendas } from "@/lib/analytics/insights-comerciais";

function vendas(over: Partial<EntradaVendas> = {}): EntradaVendas {
  return {
    total: 100_000, pedidos: 500,
    anterior: { revenue: 100_000, count: 500, comercial: 40_000, paid: 30_000, organic: 20_000, marketplace: 10_000, spend: 10_000, roas: 3 },
    canais: [
      { label: "Comercial", value: 40_000 }, { label: "Tráfego pago", value: 30_000 },
      { label: "Orgânico", value: 20_000 }, { label: "Marketplace", value: 10_000 },
    ],
    spend: 10_000, roas: 3,
    semClassificacao: { valor: 0, nomes: [] },
    ...over,
  };
}

function produtos(over: Partial<EntradaProdutos> = {}): EntradaProdutos {
  return { total: 1000, totalAnterior: 1000, categorias: [{ categoria: "Carimbos", total: 400 }, { categoria: "Chancelas", total: 350 }, { categoria: "Tintas", total: 250 }], serie: [100, 100, 100, 100], ...over };
}

describe("insights de vendas", () => {
  it("período sem desvio devolve UM insight neutro", () => {
    const r = insightsDeVendas(vendas());
    expect(r).toHaveLength(1);
    expect(r[0].tom).toBe("neutro");
  });

  it("sem período anterior não inventa comparação", () => {
    // Primeira leitura de um período novo: nenhuma frase pode dizer "acima do
    // anterior" quando não existe anterior.
    const r = insightsDeVendas(vendas({ anterior: undefined }));
    expect(r.every((i) => !/anterior/.test(i.texto) || i.tom === "neutro")).toBe(true);
  });

  it("não acusa variação sobre base de centavos", () => {
    // +40% sobre R$ 80 não é notícia. Sem o piso de dinheiro, todo canal
    // pequeno virava manchete todo dia.
    const r = insightsDeVendas(vendas({
      total: 112, pedidos: 2,
      anterior: { revenue: 80, count: 2, comercial: 80, paid: 0, organic: 0, marketplace: 0, spend: null, roas: null },
    }));
    expect(r.some((i) => i.id === "faturamento")).toBe(false);
  });

  it("ticket separa 'vendeu mais' de 'vendeu mais caro'", () => {
    // Faturamento +20% com pedidos +50%: o ticket CAIU, e é isso que a faixa
    // precisa dizer.
    const r = insightsDeVendas(vendas({ total: 120_000, pedidos: 750 }));
    const i = r.find((x) => x.id === "ticket");
    expect(i?.titulo).toBe("Ticket médio caiu");
  });

  it("ROAS abaixo de 1 é o insight mais grave, sem precisar de base anterior", () => {
    const r = insightsDeVendas(vendas({ roas: 0.8, anterior: undefined }));
    expect(r[0].id).toBe("roas-baixo");
    expect(r[0].tom).toBe("ruim");
  });

  it("venda sem classificação vem com o conserto escrito na frase", () => {
    const i = insightsDeVendas(vendas({ semClassificacao: { valor: 9_000, nomes: ["Vega", "Loja X"] } }))
      .find((x) => x.id === "sem-classificacao");
    expect(i?.texto).toContain("Vega");
    expect(i?.texto).toContain("Fontes de venda");
  });

  it("o canal destacado é o que MAIS mudou, não o maior", () => {
    const r = insightsDeVendas(vendas({
      canais: [
        { label: "Comercial", value: 42_000 },     // +5%
        { label: "Tráfego pago", value: 12_000 },  // −60%
        { label: "Orgânico", value: 20_000 },
        { label: "Marketplace", value: 10_000 },
      ],
    }));
    expect(r.find((i) => i.id.startsWith("canal-"))?.titulo).toBe("Tráfego pago encolheu");
  });
});

describe("insights de produtos", () => {
  it("saída estável devolve o neutro", () => {
    expect(insightsDeProdutos(produtos())[0].tom).toBe("neutro");
  });

  it("categoria com quase metade da saída é uma dependência, não um alarme", () => {
    const i = insightsDeProdutos(produtos({ categorias: [{ categoria: "Carimbos", total: 600 }, { categoria: "Tintas", total: 400 }] }))
      .find((x) => x.id === "concentracao");
    expect(i?.tom).toBe("neutro");
    expect(i?.titulo).toContain("Carimbos");
  });

  it("último dia bem abaixo da média do período vira atenção", () => {
    const i = insightsDeProdutos(produtos({ serie: [100, 100, 100, 40] })).find((x) => x.id === "queda-dia");
    expect(i?.tom).toBe("atencao");
    expect(i?.texto).toMatch(/abaixo da média/);
  });

  it("série pequena demais não gera alarme", () => {
    expect(insightsDeProdutos(produtos({ serie: [5, 5, 5, 0], total: 15, totalAnterior: 15 })).some((i) => i.id === "queda-dia")).toBe(false);
  });
});
