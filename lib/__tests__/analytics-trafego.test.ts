import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resumoDoOverview, funilEtapas, variacao } from "@/lib/analytics-trafego";
import type { AdsOverview, AdMetrics, CampaignRow, Funil } from "@/lib/meta-ads";

/**
 * A aba "Tráfego pago" do Analytics.
 *
 * Ela é um RESUMO servido a partir do mesmo cache do Tridify. As travas aqui
 * são sobre as três coisas que já deram defeito de verdade em painel de mídia:
 *
 *  1. ROAS é RAZÃO. Somar o ROAS de cada campanha dá 12x numa conta que rendeu
 *     3x — e o número inflado é convincente, porque todo o resto da linha está
 *     certo.
 *  2. Degrau de funil que a Meta não devolve (pixel sem evento) não é "ninguém
 *     chegou aqui". Barra zerada no meio do funil leva à conclusão errada.
 *  3. O payload precisa continuar sendo resumo. Devolver o panorama cru daqui
 *     seria meio mega por troca de período — o padrão que estourou o egress em
 *     julho/2026.
 */

function met(over: Partial<AdMetrics> = {}): AdMetrics {
  return {
    spend: 0, impressions: 0, reach: 0, frequency: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0,
    purchases: 0, revenue: 0, roas: null, leads: 0, cpa: null, cpl: null, ...over,
  };
}

function camp(name: string, account: string, spend: number, revenue: number, purchases = 0): CampaignRow {
  return {
    ...met({ spend, revenue, purchases, roas: spend > 0 ? revenue / spend : null }),
    id: name, name, accountId: account, account, status: null, objetivo: null, categoria: null, tags: [],
  };
}

const funilVazio: Funil = { spend: 0, revenue: 0, impressions: 0, reach: 0, cliques: 0, lpv: 0, addCart: 0, checkout: 0, purchases: 0, leads: 0 };

function overview(over: Partial<AdsOverview> = {}): AdsOverview {
  return {
    updatedAt: "2026-08-27T12:00:00.000Z", periodLabel: "Últimos 7 dias",
    since: "2026-08-20", until: "2026-08-27", contasAtivas: 2,
    kpis: { ...met(), prevSpend: null },
    campanhas: [], conjuntos: [], anuncios: [], recomendacoes: [],
    tagsAgg: [], categoriasAgg: [], funil: funilVazio, funisPorTag: [], funisPorCategoria: [],
    ...over,
  };
}

describe("Resumo do tráfego — o ROAS de uma linha", () => {
  it("é a razão das somas, nunca a soma das razões", () => {
    // Duas campanhas da mesma conta: 100→400 (4x) e 900→1800 (2x).
    // Somando as razões daria 6x. A conta gastou 1000 e trouxe 2200 → 2,2x.
    const d = overview({
      campanhas: [camp("A", "Conta 1", 100, 400), camp("B", "Conta 1", 900, 1800)],
    });
    const [conta] = resumoDoOverview(d).contas;
    expect(conta.spend).toBe(1000);
    expect(conta.revenue).toBe(2200);
    expect(conta.roas).toBe(2.2);
  });

  it("é `null` quando a linha não gastou — divisão por zero vira traço, não infinito", () => {
    const d = overview({ campanhas: [camp("A", "Conta 1", 0, 0)] });
    expect(resumoDoOverview(d).contas[0].roas).toBeNull();
  });
});

describe("Resumo do tráfego — as duas listas respondem perguntas diferentes", () => {
  const d = overview({
    campanhas: [
      camp("Pouco gasto, muita venda", "Conta A", 100, 5000),
      camp("Muito gasto, pouca venda", "Conta B", 4000, 200),
    ],
  });

  it("contas ordenam por GASTO — a pergunta ali é onde o dinheiro está", () => {
    expect(resumoDoOverview(d).contas.map((c) => c.nome)).toEqual(["Conta B", "Conta A"]);
  });

  it("campanhas ordenam por RECEITA — a pergunta ali é de onde veio a venda", () => {
    expect(resumoDoOverview(d).campanhas.map((c) => c.nome))
      .toEqual(["Pouco gasto, muita venda", "Muito gasto, pouca venda"]);
  });
});

describe("Resumo do tráfego — ticket médio e período anterior", () => {
  it("ticket é receita ÷ compras", () => {
    const d = overview({ kpis: { ...met({ spend: 100, revenue: 1000, purchases: 8 }), prevSpend: null } });
    expect(resumoDoOverview(d).kpis.ticket).toBe(125);
  });

  it("sem compra o ticket é zero, não uma divisão por zero", () => {
    const d = overview({ kpis: { ...met({ spend: 100, revenue: 0, purchases: 0 }), prevSpend: null } });
    expect(resumoDoOverview(d).kpis.ticket).toBe(0);
  });

  it("período anterior sem gasto NÃO vira comparação", () => {
    // Primeira janela de dados. "+100% vs período anterior" ali é um
    // crescimento que ninguém teve.
    const d = overview({ kpisPrev: met({ spend: 0 }) });
    expect(resumoDoOverview(d).prev).toBeNull();
  });

  it("período anterior com gasto vira comparação", () => {
    const d = overview({ kpisPrev: met({ spend: 500, revenue: 1000, purchases: 4 }) });
    expect(resumoDoOverview(d).prev?.spend).toBe(500);
    expect(resumoDoOverview(d).prev?.ticket).toBe(250);
  });
});

describe("variacao", () => {
  it("devolve null sem base — 0 → 40 não é '+∞%' nem '+100%'", () => {
    expect(variacao(40, 0)).toBeNull();
    expect(variacao(40, null)).toBeNull();
    expect(variacao(40, undefined)).toBeNull();
  });
  it("arredonda a uma casa", () => {
    expect(variacao(115, 100)).toBe(15);
    expect(variacao(87, 100)).toBe(-13);
    expect(variacao(1234, 1000)).toBe(23.4);
  });
});

describe("Funil do tráfego", () => {
  it("degrau intermediário zerado sai do desenho", () => {
    // Pixel sem evento de carrinho: a Meta não devolve a ação. Uma barra em
    // zero no meio lê-se como "ninguém pôs no carrinho", que é falso.
    const etapas = funilEtapas({ ...funilVazio, cliques: 1000, lpv: 800, addCart: 0, checkout: 0, purchases: 40 });
    expect(etapas.map((e) => e.nome)).toEqual(["Cliques no link", "Visualizações de página", "Compras"]);
  });

  it("clique e compra ficam sempre — são as duas pontas", () => {
    const etapas = funilEtapas(funilVazio);
    expect(etapas.map((e) => e.nome)).toEqual(["Cliques no link", "Compras"]);
    expect(etapas[0].pctTopo).toBeNull();      // o topo não se compara consigo
    expect(etapas[1].pctTopo).toBeNull();      // sem cliques não há base
  });

  it("mede as DUAS conversões: contra o topo e contra o degrau de cima", () => {
    const etapas = funilEtapas({ ...funilVazio, cliques: 1000, lpv: 500, addCart: 100, checkout: 50, purchases: 25 });
    const carrinho = etapas.find((e) => e.nome === "Adições ao carrinho")!;
    expect(carrinho.pctTopo).toBe(10);         // 100 de 1000 cliques
    expect(carrinho.pctAnterior).toBe(20);     // 100 de 500 que viram a página
    const compras = etapas.find((e) => e.nome === "Compras")!;
    expect(compras.pctTopo).toBe(2.5);
    expect(compras.pctAnterior).toBe(50);      // 25 dos 50 checkouts
  });
});

describe("Resumo do tráfego — continua sendo RESUMO", () => {
  it("não carrega anúncios, conjuntos, criativos nem recomendações", () => {
    // A tela do Analytics precisa de oito números, duas curvas e três listas
    // curtas. Reencaminhar o panorama cru daqui é meio mega por troca de
    // período — foi assim que o egress estourou em julho/2026.
    const d = overview({
      campanhas: Array.from({ length: 40 }, (_, i) => camp(`C${i}`, `Conta ${i % 3}`, 100 + i, 200 + i, 1)),
      anuncios: [], conjuntos: [],
    });
    const r = resumoDoOverview(d);
    expect(Object.keys(r).sort()).toEqual(
      ["campanhas", "contas", "contasAtivas", "funil", "kpis", "periodLabel", "prev", "serie", "updatedAt"],
    );
    expect(r.campanhas.length).toBeLessThanOrEqual(6);
    expect(r.contas.length).toBeLessThanOrEqual(8);
  });
});

// ── Portão da aba × portão da rota ──────────────────────────────────────────
//
// A aba nasce da chave `trafego` no `page.tsx`; os números dela vêm de
// `/api/analytics/trafego`. Se as duas usarem chaves diferentes, quem tem a
// área abre a tela e recebe 403 em tudo que ela busca — e o report que chega é
// "as permissões estão certas e a tela não carrega". Já aconteceu antes, com
// outra área; a trava é ler os dois arquivos e comparar.
describe("Analytics · Tráfego pago — o portão", () => {
  const raiz = fileURLToPath(new URL("../..", import.meta.url));
  const pagina = readFileSync(join(raiz, "app/(plataforma)/analytics/page.tsx"), "utf8");
  const rota = readFileSync(join(raiz, "app/api/analytics/trafego/route.ts"), "utf8");

  it("página e rota gateiam pela MESMA chave", () => {
    expect(pagina).toMatch(/canTrafego=\{views\.includes\("trafego"\)\}/);
    expect(rota).toMatch(/getProfileForModule\("trafego"\)/);
  });

  it("a rota devolve RESUMO, nunca o panorama cru", () => {
    // Reencaminhar o `AdsOverview` inteiro daqui é meio mega por troca de
    // período (campanhas + conjuntos + anúncios + criativos + recomendações).
    // Foi esse padrão que estourou o egress em julho/2026.
    expect(rota).toMatch(/resumoDoOverview\(/);
    expect(rota).not.toMatch(/NextResponse\.json\(d[,)]/);
  });

  it("o Financeiro não voltou pro Analytics", () => {
    // Custo, imposto e comissão moram em `/financeiro`, que tem acesso próprio
    // e restrito. Duas portas pro mesmo número com regras de acesso diferentes
    // é a duplicação que esta tela veio desfazer.
    expect(pagina).not.toMatch(/canFinanceiro/);
    expect(existsSync(join(raiz, "app/(plataforma)/analytics/FinanceiroPanel.tsx"))).toBe(false);
  });
});

describe("aba Tráfego do Analytics = cartões do Tridify", () => {
  it("tridifyKpis recorta o snapshot sem refazer conta", async () => {
    const { tridifyKpis } = await import("../analytics-trafego");
    const k = tridifyKpis({ faturamentoTrafego: 43066.3, pedidosTrafego: 247, gasto: 32331.24, gastoComImposto: 36802.65, roas: 1.1702, lucro: 6263.65, cpaTrafego: 174.4196 });
    expect(k).toEqual({ faturamentoTrafego: 43066, pedidosTrafego: 247, gasto: 32331, gastoComImposto: 36803, roas: 1.17, lucro: 6264, cpa: 174.42 });
  });
});
