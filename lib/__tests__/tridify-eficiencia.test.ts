import { describe, it, expect } from "vitest";
import { eficienciaTrafego } from "@/lib/trafego-vendas";
import { IMPOSTO_GASTO_PCT } from "@/lib/marketing-const";

// Trava das duas definições de dinheiro do painel do Tridify, ditadas pelo
// usuário em 05/08/2026:
//
//   ROAS  = faturamentoTrafego ÷ gastoComImposto
//   LUCRO = faturamentoTrafego − gastoComImposto
//
// Só o que o anúncio trouxe contra só o que o anúncio custou — e o custo do
// anúncio inclui o imposto de importação. Os custos de produto/imposto/gateway
// NÃO entram no lucro.
//
// Já se perdeu conta de dinheiro aqui por edição feita em arquivo sobre outro
// assunto. Se este teste quebrar, a pergunta é "a regra mudou de propósito?",
// não "como faço o número bater de novo?".

const SEM_CUSTOS = { produtoPct: 0, impostoPct: 0, gatewayPct: 0, custoFixo: 0 };

// Cenário redondo: 1.000 de gasto, 10.000 de tráfego, 25.000 na empresa toda.
const base = {
  faturamentoTrafego: 10_000, pedidosTrafego: 20,
  faturamentoEmpresa: 25_000, faturamentoPago: 8_000,
  gasto: 1_000, metaRevenue: 9_000, custos: SEM_CUSTOS,
};

describe("eficienciaTrafego · gasto com imposto", () => {
  it("soma o imposto de importação sobre a fatura do Meta", () => {
    const e = eficienciaTrafego(base);
    expect(e.gastoComImposto).toBeCloseTo(1_000 * (1 + IMPOSTO_GASTO_PCT / 100), 6);
    expect(e.gastoComImposto).toBeGreaterThan(base.gasto);
  });

  it("o ROAS é faturamento do tráfego ÷ gasto com imposto", () => {
    const e = eficienciaTrafego(base);
    expect(e.roas).toBeCloseTo(10_000 / e.gastoComImposto, 6);
    // NÃO é a receita do pixel, nem a empresa toda, nem a fatura crua.
    expect(e.roas).not.toBeCloseTo(10_000 / 1_000, 2);
    expect(e.roas).not.toBeCloseTo(e.mer!, 2);
    expect(e.roas).not.toBeCloseTo(e.roasMeta!, 2);
  });

  it("divide TODO ROAS pelo gasto com imposto, nunca pela fatura crua", () => {
    const e = eficienciaTrafego(base);
    const g = e.gastoComImposto;
    expect(e.mer).toBeCloseTo(25_000 / g, 6);
    expect(e.roasMeta).toBeCloseTo(9_000 / g, 6);
    expect(e.roasReal).toBeCloseTo(8_000 / g, 6);
    expect(e.roi).toBeCloseTo(e.lucro / g, 6);
    // O erro que existia: dividir por 1.000 dava ~14% de retorno inventado.
    expect(e.mer).not.toBeCloseTo(25_000 / 1_000, 2);
  });

  it("o lucro é faturamento do tráfego menos o gasto com imposto", () => {
    const e = eficienciaTrafego(base);
    expect(e.lucro).toBeCloseTo(10_000 - e.gastoComImposto, 6);
  });

  it("o CPA é o custo real dividido pelos pedidos do TRÁFEGO", () => {
    const e = eficienciaTrafego(base);
    expect(e.cpa).toBeCloseTo(e.gastoComImposto / 20, 6);
  });
});

describe("eficienciaTrafego · base do lucro é o tráfego", () => {
  it("faturamento de outros canais não muda lucro, margem nem ROI", () => {
    const so = eficienciaTrafego(base);
    // A empresa vendeu o dobro pelo comercial/orgânico: nada disso veio do
    // anúncio, então só o MER (blended) pode se mexer.
    const comMais = eficienciaTrafego({ ...base, faturamentoEmpresa: 50_000 });
    expect(comMais.lucro).toBeCloseTo(so.lucro, 6);
    expect(comMais.margem).toBeCloseTo(so.margem!, 6);
    expect(comMais.roi).toBeCloseTo(so.roi!, 6);
    expect(comMais.mer).toBeGreaterThan(so.mer!);
  });

  it("os custos de produto/imposto/gateway NÃO entram no lucro nem no ROAS", () => {
    const comCustos = { produtoPct: 20, impostoPct: 8, gatewayPct: 4, custoFixo: 5 };
    const sem = eficienciaTrafego(base);
    const com = eficienciaTrafego({ ...base, custos: comCustos });
    // Seguem apurados pra exibição (composição, ROAS de equilíbrio)…
    expect(com.custos).toBeCloseTo(10_000 * 0.32 + 5 * 20, 6);   // 3.300
    // …mas lucro, ROAS, ROI e margem não se mexem por causa deles.
    expect(com.lucro).toBeCloseTo(sem.lucro, 6);
    expect(com.roas).toBeCloseTo(sem.roas!, 6);
    expect(com.roi).toBeCloseTo(sem.roi!, 6);
    expect(com.margem).toBeCloseTo(sem.margem!, 6);
    // O equilíbrio é a exceção: é justamente o "a partir de que ROAS se paga".
    expect(com.roasEquilibrio).toBeGreaterThan(1);
    expect(sem.roasEquilibrio).toBeCloseTo(1, 6);
  });

  it("margem usa o faturamento do tráfego, não o da empresa", () => {
    const e = eficienciaTrafego(base);
    expect(e.margem).toBeCloseTo((e.lucro / 10_000) * 100, 6);
  });
});

describe("eficienciaTrafego · bordas", () => {
  it("sem gasto, todo indicador que divide por ele vira null (não Infinity)", () => {
    const e = eficienciaTrafego({ ...base, gasto: 0 });
    expect(e.gastoComImposto).toBe(0);
    for (const v of [e.roi, e.mer, e.roasMeta, e.roasReal]) expect(v).toBeNull();
    expect(e.lucro).toBeCloseTo(10_000, 6);
  });

  it("sem pedido de tráfego, o CPA é null em vez de dividir por zero", () => {
    expect(eficienciaTrafego({ ...base, pedidosTrafego: 0 }).cpa).toBeNull();
  });

  it("sem faturamento de tráfego, margem é null e o lucro é o gasto negativo", () => {
    const e = eficienciaTrafego({ ...base, faturamentoTrafego: 0 });
    expect(e.margem).toBeNull();
    expect(e.lucro).toBeCloseTo(-e.gastoComImposto, 6);
  });

  it("ROAS de equilíbrio é null quando os custos já comem o faturamento", () => {
    const e = eficienciaTrafego({
      ...base,
      custos: { produtoPct: 100, impostoPct: 5, gatewayPct: 0, custoFixo: 0 },
    });
    expect(e.roasEquilibrio).toBeNull();
  });

  it("ROAS de equilíbrio é o mínimo pra empatar", () => {
    const e = eficienciaTrafego({
      ...base,
      custos: { produtoPct: 50, impostoPct: 0, gatewayPct: 0, custoFixo: 0 },
    });
    expect(e.roasEquilibrio).toBeCloseTo(2, 6);   // sobra metade → precisa de 2x
  });
});

// ── A LINHA do card de ROAS conta a mesma história que o número ─────────────
//
// Em 04/09/2026 o card mostrava 0,88× na manchete com a curva flutuando em
// 1,45×: a manchete era o ROAS de verdade (checkout do ERP ÷ gasto com
// imposto) e a sparkline era o ROAS do PIXEL (receita atribuída ÷ fatura crua)
// — duas definições no mesmo card, e a curva nunca cruzava o 1× que a manchete
// dizia ter cruzado. `serieRoasReal` monta a linha na MESMA base da manchete:
// tráfego do ERP por dia ÷ gasto diário do armazém REESCALADO pra fechar com o
// gasto+imposto do período ("total manda, série dá proporção" — o armazém
// diário do Meta é sabidamente incompleto).
import { serieRoasReal, serieDoERP, serieDiariaContraGasto } from "@/lib/trafego-eficiencia";
import fs from "node:fs";
import path from "node:path";

describe("serieRoasReal · a série do ROAS na base da manchete", () => {
  // Armazém com METADE do gasto real (aconteceu): fatura+imposto = 1.000,
  // mas os dias somam 500. O fator 2× recoloca a série no nível verdadeiro.
  const meta = [
    { day: "2026-09-01", spend: 100 },
    { day: "2026-09-02", spend: 300 },
    { day: "2026-09-03", spend: 100 },
  ];
  const erp = [
    { d: "2026-09-01", trafego: 220 },
    { d: "2026-09-02", trafego: 660 },
    { d: "2026-09-03", trafego: 0 },
  ];

  it("agregada, a série devolve exatamente o ROAS da manchete", () => {
    const vals = serieRoasReal(meta, erp, 1_000);
    // Σtrafego ÷ gastoComImposto = 880/1000 = 0,88 — o número do card.
    const fator = 1_000 / 500;
    const pooled = 880 / meta.reduce((s, p) => s + p.spend * fator, 0);
    expect(pooled).toBeCloseTo(0.88, 6);
    expect(vals[0]).toBeCloseTo(220 / 200, 6);
    expect(vals[1]).toBeCloseTo(660 / 600, 6);
    expect(vals[2]).toBeCloseTo(0, 6);
  });

  it("dia sem gasto é null (buraco na linha), não zero", () => {
    const vals = serieRoasReal([...meta, { day: "2026-09-04", spend: 0 }], erp, 1_000);
    expect(vals[3]).toBeNull();
  });

  it("dia com gasto e sem venda no ERP é 0 de verdade", () => {
    const vals = serieRoasReal(meta, erp.slice(0, 2), 1_000);
    expect(vals[2]).toBeCloseTo(0, 6);
  });

  it("sem gasto no período não há linha", () => {
    expect(serieRoasReal([{ day: "2026-09-01", spend: 0 }], erp, 1_000).every((v) => v == null)).toBe(true);
    expect(serieRoasReal(meta, erp, 0).every((v) => v == null)).toBe(true);
  });

  it("o card de ROAS do Tridify usa esta série quando o snapshot chega", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../app/(plataforma)/trafego/PainelPersonalizavel.tsx"), "utf8");
    // O pixel continua como ESPERA (snapshot ainda não chegou) — a trava é a
    // série real existir no caminho principal, não o pixel sumir do arquivo.
    expect(src).toContain("serieRoasReal(d.serie, v.serieDia, v.gastoComImposto)");
  });
});

// ── A linha diária dos OUTROS cards financeiros ─────────────────────────────
// Metade dos KPIs de dinheiro (MER, margem, lucro, ROI, % via tráfego) nascia
// SEM linha nenhuma — rótulo, número e o resto do card vazio. Todos são a
// mesma forma do ROAS (um valor do ERP por dia, às vezes contra o gasto do
// dia), então viraram duas peças reaproveitáveis. O que elas travam aqui é a
// parte que mente em silêncio: uma sparkline errada continua "parecendo certa".
describe("séries diárias do ERP · o que não se sabe não vira zero", () => {
  const meta = [
    { day: "2026-09-01", spend: 100 },
    { day: "2026-09-02", spend: 300 },
    { day: "2026-09-03", spend: 100 },
  ];

  it("casa por DATA, não por índice — série do ERP faltando um dia não desloca a curva", () => {
    // O ERP não tem o dia 02. Casando por índice, o valor do dia 03 apareceria
    // no lugar do 02 e a curva inteira andaria um dia — o defeito clássico de
    // sparkline de dashboard, invisível porque o desenho continua plausível.
    const erp = [{ d: "2026-09-01", empresa: 10 }, { d: "2026-09-03", empresa: 30 }];
    expect(serieDoERP(meta, erp, (p) => p.empresa)).toEqual([10, null, 30]);
  });

  it("SEM nenhum dia em comum, a linha não existe — não é uma reta no chão", () => {
    // Era isto que o banco de provas mostrava com `serieDia: []`: todo dia caía
    // no `?? 0` e o card desenhava uma linha reta no zero, ou seja, um gráfico
    // afirmando que a operação não faturou nada no período.
    const vazio: { d: string; empresa: number }[] = [];
    expect(serieDiariaContraGasto(meta, vazio, (p) => p.empresa, 1_000, (v, g) => v / g).every((v) => v == null)).toBe(true);
    const outroMes = [{ d: "2026-08-01", empresa: 500 }];
    expect(serieDiariaContraGasto(meta, outroMes, (p) => p.empresa, 1_000, (v, g) => v / g).every((v) => v == null)).toBe(true);
  });

  it("com dias em comum, o dia que falta segue sendo zero de verdade", () => {
    // A distinção que o teste acima protege: "não tenho a série" é null, mas
    // "tenho a série e neste dia não vendeu" continua sendo 0 — o anúncio
    // custou e não trouxe.
    const erp = [{ d: "2026-09-01", empresa: 400 }, { d: "2026-09-02", empresa: 1_200 }];
    const vals = serieDiariaContraGasto(meta, erp, (p) => p.empresa, 1_000, (v, g) => v / g);
    expect(vals[0]).toBeCloseTo(400 / 200, 6);
    expect(vals[2]).toBeCloseTo(0, 6);
  });

  it("o gasto do dia entra REESCALADO, então a linha fecha com a manchete", () => {
    // Mesma regra do ROAS: o armazém diário do Meta é incompleto e sem imposto.
    const erp = [{ d: "2026-09-01", empresa: 220 }, { d: "2026-09-02", empresa: 660 }, { d: "2026-09-03", empresa: 0 }];
    const vals = serieDiariaContraGasto(meta, erp, (p) => p.empresa, 1_000, (v, g) => v / g);
    // fator = 1000/500 = 2 → o dia 01 gastou 200, não 100.
    expect(vals[0]).toBeCloseTo(220 / 200, 6);
    expect(vals[1]).toBeCloseTo(660 / 600, 6);
  });

  it("o banco de provas tem série diária de verdade — sem ela o card nasce sem linha", () => {
    // `serieDia: []` no sample fazia o /dev-tridify mostrar exatamente os cards
    // vazios que ele existe pra deixar conferir.
    const src = fs.readFileSync(path.resolve(__dirname, "../trafego-sample.ts"), "utf8");
    expect(src).not.toContain("serieDia: []");
    expect(src).toContain("serieDiaAmostra");
  });
});
