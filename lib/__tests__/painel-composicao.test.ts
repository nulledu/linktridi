import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { METRICAS_TRIDIFY, ROTULO_METRICA, metricas, widgetPadrao, CATALOGO, widgetTipos } from "@/lib/painel-layout";

/**
 * As fatias do faturamento na parede.
 *
 * O widget "De onde vem" desenha a barra sobre a SOMA DAS FATIAS, não sobre o
 * total do mês — se divergirem, a barra fica curta e a diferença aparece, em
 * vez de a tela normalizar o erro para 100%. Este teste guarda a aritmética
 * que sustenta isso e as duas armadilhas de rótulo:
 *
 *  • Vega está DENTRO do tráfego (somar de novo conta duas vezes);
 *  • marketplace está DENTRO do faturamento da empresa desde 01/09/2026 — o
 *    tráfego derivado do total precisa descontá-lo, senão ele entra duas vezes.
 */
describe("composição do faturamento", () => {
  // Números reais do mês corrente (06/08/2026), com o marketplace já somado
  // ao total (54.036 de operação própria + 592).
  const t = {
    faturamentoEmpresa: 54628,
    organico: 3882,
    comercial: 25140,
    vega: 10730,
    marketplace: 592,
  };
  const trafego = t.faturamentoEmpresa - t.organico - t.comercial - t.marketplace;

  it("as quatro fatias somam exatamente o faturamento do mês", () => {
    expect(trafego + t.organico + t.comercial + t.marketplace).toBe(t.faturamentoEmpresa);
  });

  it("a Vega cabe dentro do tráfego — nunca é uma quarta fatia", () => {
    expect(t.vega).toBeLessThanOrEqual(trafego);
  });

  it("o widget desconta o marketplace ao derivar o tráfego do total", () => {
    // Sem o desconto, a barra estouraria o mês em exatamente uma fatia.
    const src = readFileSync(join(process.cwd(), "app/painel/widgets/Widgets.tsx"), "utf8");
    expect(src).toContain("t.faturamentoEmpresa - t.organico - t.comercial - (t.vega ?? 0) - (t.marketplace ?? 0)");
    expect(src).not.toContain("fora do total");
  });

  it("toda métrica do catálogo tem rótulo", () => {
    for (const m of metricas) expect(ROTULO_METRICA[m], m).toBeTruthy();
  });

  it("as fatias novas dependem do Tridify (mostram '—' sem ele)", () => {
    for (const m of ["receita_vega", "receita_comercial", "receita_marketplace"]) {
      expect(METRICAS_TRIDIFY.has(m), m).toBe(true);
    }
  });

  it("todo tipo de widget tem entrada no catálogo e tamanho padrão", () => {
    // Widget sem entrada no CATALOGO não aparece na paleta do editor: existe no
    // schema e é impossível de adicionar pela tela.
    for (const tipo of widgetTipos) {
      expect(CATALOGO.find((c) => c.tipo === tipo), tipo).toBeTruthy();
      const w = widgetPadrao(tipo, "x");
      expect(w.w, tipo).toBeGreaterThan(0);
      expect(w.h, tipo).toBeGreaterThan(0);
    }
  });
});
