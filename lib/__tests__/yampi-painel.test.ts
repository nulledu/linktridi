// Os números do painel da Yampi dentro da Tridify — travados contra o print do
// painel da própria Yampi de 23/09/2026 (loja de tráfego, até ~10:50):
//   Vendas R$ 3.814,76 · 18 pedidos     Receita R$ 3.033,16 · 14 pagos
//   Pix 11 gerados / 7 pagos            Parcelamentos 1x · 3x · 10x
//   Formas: Pix / Cartões               Estados: SP 33% · RS 17% · …
// A API conferiu os mesmos pedidos: produto R$ 3.699,20 (vendas) e R$ 2.917,60
// (receita). A diferença pro print é juros de parcelamento, que aqui fica fora
// — é a regra do dono: valor é SÓ produto.
import { describe, expect, it } from "vitest";
import { montarPainel, periodoAnterior, diaSP, type LinhaDoPainel } from "@/lib/yampi-painel";

let seq = 0;
const l = (o: Partial<LinhaDoPainel>): LinhaDoPainel => ({
  numero: String(78287000000000 + ++seq), criadoEm: "2026-09-23T13:00:00+00:00", pago: true,
  valorProdutos: 100, formaPagamento: "pix", parcelas: 1, uf: "SP", clienteId: seq, ...o,
});

// O dia 23/09 como a API devolveu: 7 pix pagos, 4 pix em aberto, 7 cartões
// pagos (1x ×4, 3x ×1, 10x ×2). Estados dos 18: SP 6, RS 3, RJ 2, PI 2, PE 2,
// + 3 avulsos. Valores somam o produto real do dia.
function dia23(): LinhaDoPainel[] {
  seq = 0;
  const ufs = ["SP", "SP", "SP", "SP", "SP", "SP", "RS", "RS", "RS", "RJ", "RJ", "PI", "PI", "PE", "PE", "CE", "MG", "AL"];
  const base: Partial<LinhaDoPainel>[] = [
    ...Array.from({ length: 7 }, () => ({ formaPagamento: "pix" as const, pago: true, parcelas: 1 })),
    ...Array.from({ length: 4 }, () => ({ formaPagamento: "pix" as const, pago: false, parcelas: 1 })),
    ...Array.from({ length: 4 }, () => ({ formaPagamento: "cartao" as const, pago: true, parcelas: 1 })),
    { formaPagamento: "cartao", pago: true, parcelas: 3 },
    { formaPagamento: "cartao", pago: true, parcelas: 10 },
    { formaPagamento: "cartao", pago: true, parcelas: 10 },
  ];
  // Produto: 14 pagos somam 2.917,60 e os 4 abertos somam 781,60 → 3.699,20.
  return base.map((o, i) => l({ ...o, uf: ufs[i], valorProdutos: o.pago ? (i === 17 ? 2917.6 - 13 * 208 : 208) : 195.4 }));
}

describe("painel da Yampi — bate com o print de 23/09", () => {
  const p = montarPainel({ de: "2026-09-23", ate: "2026-09-23", linhas: dia23(), itens: [], jaCompraram: new Set() });

  it("Vendas = todo pedido criado, SÓ produto", () => {
    expect(p.vendas.pedidos).toBe(18);
    expect(p.vendas.valor).toBeCloseTo(3699.2, 2);   // o painel diz 3.814,76 — a diferença é juros
  });

  it("Receita = só pago, SÓ produto", () => {
    expect(p.receita.pagos).toBe(14);
    expect(p.receita.valor).toBeCloseTo(2917.6, 2);  // o painel diz 3.033,16
  });

  it("Ticket médio é Vendas ÷ pedidos criados (a conta da Yampi)", () => {
    expect(p.ticket.valor).toBeCloseTo(3699.2 / 18, 2);
  });

  it("Pix: 11 gerados, 7 pagos", () => {
    expect(p.pix).toEqual({ gerados: 11, pagos: 7, taxa: 7 / 11 });
  });

  it("Formas de pagamento contam todo pedido criado: Pix 11 × Cartões 7", () => {
    expect(p.formas).toEqual([{ nome: "Pix", valor: 11 }, { nome: "Cartões", valor: 7 }]);
  });

  it("Parcelamentos contam SÓ cartão: 1x 4 · 3x 1 · 10x 2", () => {
    // Somar o pix (sempre 1x) faria "1x" dominar o gráfico e esconder o que
    // ele existe pra mostrar: quanto do cartão é parcelado.
    expect(p.parcelas).toEqual([{ nome: "1x", valor: 4 }, { nome: "3x", valor: 1 }, { nome: "10x", valor: 2 }]);
  });

  it("Estados contam todo pedido criado: SP 33%, RS 17%", () => {
    expect(p.estados[0]).toMatchObject({ nome: "SP", qtd: 6 });
    expect(p.estados[0].pct).toBeCloseTo(6 / 18, 5);
    expect(p.estados[1]).toMatchObject({ nome: "RS", qtd: 3 });
    expect(p.estados).toHaveLength(5);
  });
});

describe("top produtos", () => {
  it("soma unidades por produto, marca brinde e corta em 5", () => {
    const itens = [
      ...Array.from({ length: 18 }, (_, i) => ({ numero: String(i), produto: "Parabéns! Seu pedido vai com um brinde", quantidade: 1, brinde: true })),
      { numero: "1", produto: "Chancela personalizada", quantidade: 6, brinde: false },
      { numero: "2", produto: "Chancela personalizada", quantidade: 4, brinde: false },
      { numero: "3", produto: "Kit Carimbo - 2S", quantidade: 8, brinde: false },
      { numero: "4", produto: "Carimbo Ideal para Guardanapo", quantidade: 1, brinde: false },
    ];
    const p = montarPainel({ de: "2026-09-23", ate: "2026-09-23", linhas: [], itens, jaCompraram: new Set() });
    expect(p.produtos.map((x) => [x.nome, x.qtd])).toEqual([
      ["Parabéns! Seu pedido vai com um brinde", 18],
      ["Chancela personalizada", 10],
      ["Kit Carimbo - 2S", 8],
      ["Carimbo Ideal para Guardanapo", 1],
    ]);
    expect(p.produtos[0].brinde).toBe(true);
    expect(p.produtos[1].brinde).toBeUndefined();
  });
});

describe("clientes recorrentes", () => {
  it("recorrente = já pagou antes do período OU pagou mais de uma vez nele", () => {
    const linhas = [
      l({ clienteId: 1 }),                   // já comprou antes → recorrente
      l({ clienteId: 2 }), l({ clienteId: 2 }), // duas vezes no período → recorrente
      l({ clienteId: 3 }),                   // novo
      l({ clienteId: 4, pago: false }),      // não pagou → não entra na conta
    ];
    const p = montarPainel({ de: "2026-09-01", ate: "2026-09-23", linhas, itens: [], jaCompraram: new Set([1]) });
    expect(p.recorrencia).toEqual({ recorrentes: 2, novos: 1, taxa: 2 / 3 });
  });
});

describe("série e comparação", () => {
  it("dia sem pedido vira zero, não buraco — e o dia é o de São Paulo", () => {
    // 01:14 UTC do dia 23 é 22:14 do dia 22 em SP.
    expect(diaSP("2026-09-23T01:14:30+00:00")).toBe("2026-09-22");
    const p = montarPainel({
      de: "2026-09-21", ate: "2026-09-23",
      linhas: [l({ criadoEm: "2026-09-23T01:14:30+00:00", valorProdutos: 242.9 })],
      itens: [], jaCompraram: new Set(),
    });
    expect(p.serie.map((x) => [x.d, x.vendas])).toEqual([["2026-09-21", 0], ["2026-09-22", 242.9], ["2026-09-23", 0]]);
  });

  it("sem período anterior, a variação é nula (não zero)", () => {
    const p = montarPainel({ de: "2026-09-23", ate: "2026-09-23", linhas: [l({})], itens: [], jaCompraram: new Set() });
    expect(p.vendas.anterior).toBeNull();
  });

  it("período anterior tem o mesmo tamanho e, se o atual é hoje, corta no mesmo horário", () => {
    const agora = new Date("2026-09-23T13:46:00Z"); // 10:46 em SP
    expect(periodoAnterior("2026-09-23", "2026-09-23", agora)).toEqual({ de: "2026-09-22", ate: "2026-09-22", corteISO: "2026-09-22T10:46:00-03:00" });
    expect(periodoAnterior("2026-09-01", "2026-09-10", agora)).toEqual({ de: "2026-08-22", ate: "2026-08-31", corteISO: null });
  });
});
