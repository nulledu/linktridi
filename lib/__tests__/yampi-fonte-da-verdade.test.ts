// A Yampi manda no que é da Yampi — travas do que foi medido em 22/09/2026.
//
// Naquele dia a loja de tráfego tinha 19 pedidos pagos na Yampi e 17 no ERP.
// Dois só chegaram ao ERP 7h+ depois de pagos; o resto da diferença do card era juros de
// parcelamento, que fica fora dos dois lados. Este teste existe porque a
// correção é invisível no dia a dia:
// se ela parar de funcionar, o número volta a ser MENOR — e número menor não
// parece defeito, parece um dia fraco de vendas.
import { describe, expect, it } from "vitest";
import { comOsPedidosDaYampi } from "@/lib/trafego-vendas";
import { lojasConfiguradas, yampiConfigurado } from "@/lib/yampi-api";

type Pedido = Parameters<typeof comOsPedidosDaYampi>[0][number];
type Linha = Parameters<typeof comOsPedidosDaYampi>[1][number];

const pedido = (p: Partial<Pedido> & { id_proprio: string }): Pedido => ({
  id: 1, created_at: "2026-09-22T10:00:00-03:00", tag_utm: null, qual_yampi: "Carimbos Tridi",
  preco_total: 100, preco_yampi: 100, preco_frete_venda: 0, plataforma_id: 6, etapa_id: 5,
  valores_corretos: true, data_aprovado: null, arquivado: false, chargeback: false,
  excluido: false, responsavel_id: null, ...p,
});

const linha = (l: Partial<Linha> & { numero: string }): Linha => ({
  loja: "carimbos-tridi", lojaErp: null, criadoEm: "2026-09-22T10:00:00-03:00",
  valorProdutos: 100, valorTotal: 100, valorFrete: 0, ...l,
});

describe("espelho da Yampi sobre os pedidos do ERP", () => {
  it("sem espelho, devolve o ERP intacto (ambiente sem credencial não muda número)", () => {
    const erp = [pedido({ id_proprio: "111", preco_total: 250, preco_yampi: 200 })];
    expect(comOsPedidosDaYampi(erp, [])).toBe(erp);
  });

  it("juros sai do meio: o checkout é o valor de PRODUTO, não o total cobrado", () => {
    // Caso real 78287277687396 (API, 23/09): total R$ 160,15 = produto 147,90
    // + juros de parcelamento 12,25. Os juros são do gateway e não podem
    // virar faturamento — o ERP já gravava 147,90 e continua batendo.
    const out = comOsPedidosDaYampi(
      [pedido({ id_proprio: "78287277687396", preco_total: 147.9, preco_yampi: 147.9 })],
      [linha({ numero: "78287277687396", valorProdutos: 147.9, valorTotal: 160.15 })],
    );
    expect(out).toHaveLength(1);
    expect(out[0].preco_yampi).toBe(147.9);
    expect(out[0].preco_total).toBe(147.9);
  });

  it("ERP que gravou MENOS produto que a Yampi é corrigido pra cima (defesa)", () => {
    // Não foi visto em 22/09 — é trava pro dia em que acontecer. Se o total
    // do ERP continuasse mandando, ele seguraria o faturamento pra baixo mesmo
    // com o espelho no lugar, e o defeito voltaria calado.
    const out = comOsPedidosDaYampi(
      [pedido({ id_proprio: "11111111", preco_total: 700, preco_yampi: 700 })],
      [linha({ numero: "11111111", valorProdutos: 815.7, valorTotal: 955.76 })],
    );
    expect(out[0].preco_yampi).toBe(815.7);
    expect(out[0].preco_total).toBe(815.7);
  });

  it("juros NUNCA viram faturamento: total cobrado maior que o produto não sobe o pedido", () => {
    // Caso real 78287942180761 (API, 23/09): produto 815,70, total 955,76.
    // ERP gravou 815,70 — certo. O espelho não pode empurrar pra 955,76.
    const out = comOsPedidosDaYampi(
      [pedido({ id_proprio: "78287942180761", preco_total: 815.7, preco_yampi: 815.7 })],
      [linha({ numero: "78287942180761", valorProdutos: 815.7, valorTotal: 955.76 })],
    );
    expect(out[0].preco_total).toBe(815.7);
    expect(out[0].preco_yampi).toBe(815.7);
  });

  it("upsell pós-venda continua de pé: total maior que o checkout é preservado", () => {
    // O que a vendedora vendeu depois (R$ 39,5 mil em set/2026) é do Comercial.
    // Sobrescrever `preco_total` com o valor da Yampi apagaria isso.
    const out = comOsPedidosDaYampi(
      [pedido({ id_proprio: "78287572561048", preco_total: 247.9, preco_yampi: 147.9 })],
      [linha({ numero: "78287572561048", valorProdutos: 147.9 })],
    );
    expect(out[0].preco_total).toBe(247.9);
    expect(out[0].preco_yampi).toBe(147.9);
  });

  it("pedido que a importação perdeu entra na loja aprendida pelos que casaram", () => {
    // 78287757038595 e 78287115848230: pagos às 10h/11h, no ERP só 7h+
    // depois. Nesse intervalo são órfãos — e têm que contar no dia.
    const out = comOsPedidosDaYampi(
      [pedido({ id_proprio: "78287479133399", qual_yampi: "Carimbos Tridi" })],
      [
        linha({ numero: "78287479133399" }),
        linha({ numero: "78287757038595", valorProdutos: 242.9 }),
        linha({ numero: "78287115848230", valorProdutos: 158.37 }),
      ],
    );
    expect(out).toHaveLength(3);
    const orfaos = out.filter((p) => p.id === -1);
    expect(orfaos.map((p) => p.id_proprio)).toEqual(["78287757038595", "78287115848230"]);
    // Precisa cair na MESMA loja, senão não conta como tráfego.
    expect(orfaos.every((p) => p.qual_yampi === "Carimbos Tridi")).toBe(true);
    expect(orfaos.every((p) => p.plataforma_id === 6 && p.valores_corretos === true)).toBe(true);
    // Sem upsell inventado: o pedido vale o que a Yampi cobrou de produto.
    expect(orfaos.map((p) => p.preco_total)).toEqual([242.9, 158.37]);
    expect(orfaos.map((p) => p.preco_yampi)).toEqual([242.9, 158.37]);
  });

  it("cada alias aprende a SUA loja — órfão da orgânica não vira tráfego", () => {
    const out = comOsPedidosDaYampi(
      [
        pedido({ id_proprio: "10000001", qual_yampi: "Carimbos Tridi" }),
        pedido({ id_proprio: "20000001", qual_yampi: "Carimbos (Organico)" }),
      ],
      [
        linha({ numero: "10000001", loja: "carimbos-tridi" }),
        linha({ numero: "20000001", loja: "carimbos-organico" }),
        linha({ numero: "20000002", loja: "carimbos-organico", valorProdutos: 90 }),
      ],
    );
    const orfao = out.find((p) => p.id === -1);
    expect(orfao?.qual_yampi).toBe("Carimbos (Organico)");
  });

  it("alias que nunca casou com o ERP não adivinha loja — fica de fora", () => {
    const out = comOsPedidosDaYampi(
      [pedido({ id_proprio: "10000001", qual_yampi: "Carimbos Tridi" })],
      [linha({ numero: "10000001" }), linha({ numero: "90000009", loja: "loja-desconhecida" })],
    );
    expect(out).toHaveLength(1);
  });

  it("número do pedido anotado à mão no ERP ainda casa — senão contaria duas vezes", () => {
    // Casos reais de set/2026: a equipe escreve no `id_proprio`. Sem extrair o
    // número, o pedido da Yampi viraria órfão e seria SOMADO de novo.
    const out = comOsPedidosDaYampi(
      [
        pedido({ id_proprio: "78287266851946 - sem contato", preco_total: 147.9, preco_yampi: 147.9 }),
        pedido({ id_proprio: "78287356100427 - 71 9926-2160", preco_total: 175.81, preco_yampi: 175.81 }),
      ],
      [
        linha({ numero: "78287266851946", valorProdutos: 147.9 }),
        linha({ numero: "78287356100427", valorProdutos: 162.9 }),
      ],
    );
    expect(out).toHaveLength(2);                       // nenhum órfão inventado
    expect(out.every((p) => p.id !== -1)).toBe(true);
    expect(out[1].preco_yampi).toBe(162.9);            // e o valor da Yampi foi aplicado
  });

  it("desdobramento `/1` não recebe o valor da Yampi — a venda conta uma vez", () => {
    // Caso real 78287644331649/1: linha de valor zero, duplicada, sem loja.
    const out = comOsPedidosDaYampi(
      [
        pedido({ id_proprio: "78287644331649", preco_total: 242.9, preco_yampi: 242.9 }),
        pedido({ id_proprio: "78287644331649/1", qual_yampi: null, preco_total: 0, preco_yampi: 0 }),
      ],
      [linha({ numero: "78287644331649", valorProdutos: 242.9 })],
    );
    expect(out).toHaveLength(2);
    expect(out[1].preco_total).toBe(0);
    expect(out[1].preco_yampi).toBe(0);
  });

  it("mesmo número duas vezes no ERP: só a primeira linha ganha o valor", () => {
    const out = comOsPedidosDaYampi(
      [
        pedido({ id_proprio: "555555555", preco_total: 100, preco_yampi: 100 }),
        pedido({ id_proprio: "555555555", preco_total: 0, preco_yampi: 0 }),
      ],
      [linha({ numero: "555555555", valorProdutos: 120 })],
    );
    expect(out[0].preco_yampi).toBe(120);
    expect(out[1].preco_yampi).toBe(0);
    expect(out[1].preco_total).toBe(0);
  });

  it("órfão nasce sem aprovação do ERP — não infla a taxa de aprovação", () => {
    const out = comOsPedidosDaYampi(
      [pedido({ id_proprio: "10000001" })],
      [linha({ numero: "10000001" }), linha({ numero: "10000002" })],
    );
    expect(out.find((p) => p.id === -1)?.data_aprovado).toBeNull();
  });
});

describe("configuração", () => {
  it("sem as três variáveis o app segue no ERP", () => {
    const antes = { ...process.env };
    delete process.env.YAMPI_ALIAS; delete process.env.YAMPI_TOKEN; delete process.env.YAMPI_SECRET_KEY;
    expect(yampiConfigurado()).toBe(false);
    expect(lojasConfiguradas()).toEqual([]);
    Object.assign(process.env, antes);
  });

  it("YAMPI_ALIAS aceita lista — a conta tem mais de uma loja", () => {
    const antes = process.env.YAMPI_ALIAS;
    process.env.YAMPI_ALIAS = "carimbos-tridi, carimbos-organico ,";
    expect(lojasConfiguradas()).toEqual(["carimbos-tridi", "carimbos-organico"]);
    if (antes === undefined) delete process.env.YAMPI_ALIAS; else process.env.YAMPI_ALIAS = antes;
  });
});
