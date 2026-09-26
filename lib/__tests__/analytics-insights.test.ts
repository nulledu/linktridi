import { describe, expect, it } from "vitest";
import { gerarInsights, type EntradaInsights } from "@/lib/analytics/insights";
import type { Comparacao, EtapaFluxo, ParadoEtapa, SerieAnalitica } from "@/lib/analytics/tipos";

const cmp = (atual: number, anterior: number): Comparacao => ({
  atual, anterior, deltaPct: anterior > 0 ? Math.round(((atual - anterior) / anterior) * 1000) / 10 : null,
});

const serie = (nome: string, valores: number[]): SerieAnalitica => ({
  nome,
  pontos: valores.map((v, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, atual: v, anterior: v })),
  total: valores.reduce((s, v) => s + v, 0),
  totalAnterior: valores.reduce((s, v) => s + v, 0),
  media: Math.round(valores.reduce((s, v) => s + v, 0) / valores.length),
});

const etapa = (over: Partial<EtapaFluxo> = {}): EtapaFluxo => ({
  key: "producao", nome: "Produção", icon: "tools", total: 100, deltaPct: 0, parados: 0, etapas: [9], ...over,
});

const parado = (over: Partial<ParadoEtapa> = {}): ParadoEtapa => ({
  id: 3, nome: "Contornos", parados: 0, diasMedio: 0, deltaPct: null, nivel: "baixa", ...over,
});

/** Operação chata: nada fora do ritmo, nenhuma fila. */
function base(): EntradaInsights {
  return {
    resumo: {
      pedidos: cmp(100, 100), produzidos: cmp(100, 100), enviados: cmp(100, 100),
      tempoMedioDias: cmp(3, 3), atrasados: 0, slaPct: cmp(80, 80), slaMetaDias: 5,
    },
    fluxo: [etapa()],
    parados: [],
    series: { fabricados: serie("Fabricado", [10, 10, 10, 10]), enviados: serie("Enviado", [10, 10, 10, 10]) },
  };
}

describe("insights da operação", () => {
  it("dia calmo devolve UM insight neutro — nunca a faixa vazia", () => {
    // Faixa sumindo inteira faz a tela parecer quebrada; o que não pode é
    // inventar alarme.
    const r = gerarInsights(base());
    expect(r).toHaveLength(1);
    expect(r[0].tom).toBe("neutro");
  });

  it("produção abaixo da média do período vira atenção com o número na frase", () => {
    const e = base();
    e.series.fabricados = serie("Fabricado", [10, 10, 10, 5]); // média 9, último 5
    const r = gerarInsights(e);
    const i = r.find((x) => x.id === "producao-abaixo");
    expect(i?.tom).toBe("atencao");
    expect(i?.texto).toMatch(/\d+% abaixo da média/);
  });

  it("não acusa nada quando o volume é pequeno demais pra significar algo", () => {
    // 1 → 2 é +100% e não é notícia. Sem o piso, todo fim de semana virava alarme.
    const e = base();
    e.series.fabricados = serie("Fabricado", [1, 1, 1, 0]);
    expect(gerarInsights(e).every((i) => i.id !== "producao-abaixo")).toBe(true);
  });

  it("fila grande que gira no mesmo dia NÃO é gargalo", () => {
    const e = base();
    e.parados = [parado({ parados: 200, diasMedio: 0.3 })];
    expect(gerarInsights(e).some((i) => i.id.startsWith("gargalo"))).toBe(false);
  });

  it("fila grande e parada há dias é gargalo, com a espera escrita", () => {
    const e = base();
    e.parados = [parado({ parados: 184, diasMedio: 2.4, nivel: "alta" })];
    const i = gerarInsights(e).find((x) => x.id.startsWith("gargalo"));
    expect(i?.tom).toBe("ruim");
    expect(i?.titulo).toContain("Contornos");
    expect(i?.texto).toContain("2,4 dias");
    expect(i?.alvo).toBe("parados");
  });

  it("prazo que CAI é boa notícia — o tom não sai do sinal do delta", () => {
    const e = base();
    e.resumo.tempoMedioDias = cmp(2.8, 3.4);
    const i = gerarInsights(e).find((x) => x.id === "prazo");
    expect(i?.tom).toBe("bom");
    expect(i?.titulo).toBe("Prazo melhorou");
  });

  it("atraso vira frase pela FATIA do pipeline, não pelo número solto", () => {
    const e = base();
    e.fluxo = [etapa({ parados: 400 })];
    e.resumo.atrasados = 40; // 10% — abaixo do piso
    expect(gerarInsights(e).some((i) => i.id === "atrasados")).toBe(false);
    e.resumo.atrasados = 160; // 40%
    const i = gerarInsights(e).find((x) => x.id === "atrasados");
    expect(i?.tom).toBe("ruim");
  });

  it("ordena por urgência e respeita o teto", () => {
    const e = base();
    e.series.fabricados = serie("Fabricado", [10, 10, 10, 5]);
    e.resumo.enviados = cmp(200, 100);
    e.resumo.tempoMedioDias = cmp(2, 4);
    e.resumo.slaPct = cmp(90, 70);
    e.fluxo = [etapa({ parados: 400 })];
    e.resumo.atrasados = 200;
    e.parados = [parado({ parados: 184, diasMedio: 2.4, nivel: "alta" })];
    const r = gerarInsights(e, 3);
    expect(r).toHaveLength(3);
    expect(r[0].tom).toBe("ruim");
    // Todo insight tem destino — insight sem "ver análise" é enfeite.
    expect(r.every((i) => !!i.alvo)).toBe(true);
  });
});
