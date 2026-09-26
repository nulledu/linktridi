// Webhook da Yampi — o que entra por aqui vira faturamento, então a assinatura
// é o portão e o resto é peneira.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { lojaErpDoCaminho, segredoDoWebhook, pedidoDoWebhook, quandoFoi, PAGOS } from "@/lib/yampi-webhook";

const corpoPedido = (over: Record<string, unknown> = {}, evento = "order.paid") => ({
  event: evento,
  time: "2026-09-22 17:56:00",
  merchant: { id: 123, alias: "carimbos-tridi" },
  resource: {
    id: 1000001, number: 78287479133399, created_at: "2026-09-22 17:56:00",
    value_total: 242.9, value_products: 242.9, value_shipment: 0, value_discount: 0,
    status: { data: { alias: "paid", name: "Pago" } }, ...over,
  },
});

describe("de qual loja é o webhook", () => {
  it("o caminho decide — não há adivinhação de loja", () => {
    expect(lojaErpDoCaminho("trafego")).toBe("Carimbos Tridi");
    expect(lojaErpDoCaminho("qualquer")).toBeNull();
  });

  it("só a loja de TRÁFEGO tem webhook — a orgânica vem do ERP", () => {
    // Endereço que aceita e não é usado vira porta aberta sem dono.
    expect(lojaErpDoCaminho("organico")).toBeNull();
    expect(segredoDoWebhook("organico")).toBe("");
  });

  it("o nome da loja sai do env quando o ERP renomear", () => {
    vi.stubEnv("YAMPI_LOJA_TRAFEGO", "Carimbos Tridi 2");
    expect(lojaErpDoCaminho("trafego")).toBe("Carimbos Tridi 2");
    vi.unstubAllEnvs();
  });

  it("o segredo é o do webhook de tráfego", () => {
    vi.stubEnv("YAMPI_WEBHOOK_SECRET_TRAFEGO", "wh_a");
    expect(segredoDoWebhook("trafego")).toBe("wh_a");
    expect(segredoDoWebhook("outra")).toBe("");
    vi.unstubAllEnvs();
  });
});

describe("o que o corpo do webhook vira", () => {
  it("pedido pago vira linha do espelho, com o valor de PRODUTO", () => {
    const p = pedidoDoWebhook(corpoPedido());
    expect(p?.numero).toBe("78287479133399");
    expect(p?.valorProdutos).toBe(242.9);
    expect(PAGOS.has(p!.status)).toBe(true);
  });

  it("juros e frete ficam de fora do valor que vira faturamento", () => {
    // Caso real 78287942180761 (API, 23/09): total 955,76 = produto 815,70 +
    // juros de parcelamento 140,06 (`value_tax` — o nome engana, é juros).
    const p = pedidoDoWebhook(corpoPedido({ value_total: 955.76, value_products: 815.7, value_tax: 140.06 }));
    expect(p?.valorProdutos).toBe(815.7);
    expect(p?.valorTotal).toBe(955.76);
  });

  it("evento que não é de pedido é ignorado, não quebra", () => {
    expect(pedidoDoWebhook({ event: "customer.created", resource: { id: 1 } })).toBeNull();
    expect(pedidoDoWebhook({ event: "cart.reminder", resource: { id: 1, number: 9 } })).toBeNull();
  });

  it("nota fiscal NÃO passa por pedido", () => {
    // `order.invoice.*` também começa com "order." mas o recurso é a nota: sem
    // valores, ela zeraria a linha boa que já estava no espelho.
    expect(pedidoDoWebhook({ event: "order.invoice.created", resource: { id: 1, number: 78287479133399 } })).toBeNull();
  });

  it("pedido sem número não entra — é por ele que o ERP cruza", () => {
    expect(pedidoDoWebhook(corpoPedido({ number: null }))).toBeNull();
  });

  it("status recusado/cancelado chega e é reconhecido como NÃO pago", () => {
    const p = pedidoDoWebhook(corpoPedido({ status: { data: { alias: "refused" } } }, "order.status.updated"));
    expect(PAGOS.has(p!.status)).toBe(false);
  });

  it("corpo estranho não derruba a rota", () => {
    expect(pedidoDoWebhook(null)).toBeNull();
    expect(pedidoDoWebhook({})).toBeNull();
    expect(pedidoDoWebhook({ resource: "isso não é objeto" })).toBeNull();
  });
});

describe("data sem fuso é São Paulo", () => {
  it("pedido da manhã não cai no dia anterior", () => {
    // Sem o -03:00 o Date leria como UTC e 22/09 10:26 viraria 22/09 07:26 em
    // SP — pior, o de 00:30 cairia em 21/09.
    expect(quandoFoi("2026-09-22 10:26:31")).toBe("2026-09-22T10:26:31-03:00");
    expect(new Date(quandoFoi("2026-09-22 00:30:00")).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })).toBe("2026-09-22");
  });

  it("aceita as duas formas que a Yampi manda", () => {
    expect(quandoFoi({ date: "2026-09-22 10:26:31.000000" })).toBe("2026-09-22T10:26:31-03:00");
    expect(quandoFoi("2026-09-22T10:26:31-03:00")).toBe("2026-09-22T10:26:31-03:00");
    expect(quandoFoi(null)).toBe("");
  });
});

// A assinatura é o único portão da rota: ela é pública (a Yampi chega sem
// cookie) e o que entra vira dinheiro na tela.
describe("assinatura HMAC-SHA256", () => {
  const assinar = (cru: string, segredo: string) => createHmac("sha256", segredo).update(cru, "utf8").digest("base64");

  let POST: typeof import("@/app/api/yampi/webhook/[loja]/route").POST;
  // Banco falso que registra o que cada tabela recebeu. `upsert` recebe a
  // LISTA de linhas (o caminho de escrita é o mesmo do cron, em blocos).
  const upsert = vi.fn(async (_linhas: Record<string, unknown>[]) => ({ error: null }));
  const inserirItens = vi.fn(async (_itens: Record<string, unknown>[]) => ({ error: null }));
  const apagar = vi.fn((_tabela: string) => ({ in: vi.fn(async () => ({ error: null })), eq: vi.fn(async () => ({ error: null })) }));

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseAdminClient: () => ({
        from: (tabela: string) => ({
          upsert: (linhas: Record<string, unknown>[]) => upsert(linhas),
          insert: (itens: Record<string, unknown>[]) => inserirItens(itens),
          delete: () => apagar(tabela),
        }),
      }),
    }));
    vi.stubEnv("YAMPI_WEBHOOK_SECRET_TRAFEGO", "wh_segredo");
    // `await import` dinâmico: com o mock já registrado, e sem deixar a rota
    // carregada entre testes (ver testes-de-componente).
    ({ POST } = await import("@/app/api/yampi/webhook/[loja]/route"));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  const chamar = (corpo: unknown, assinatura: string | null, loja = "trafego") => {
    const cru = JSON.stringify(corpo);
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (assinatura !== null) headers["x-yampi-hmac-sha256"] = assinatura;
    const req = new NextRequest(`https://gaius.vercel.app/api/yampi/webhook/${loja}`, { method: "POST", body: cru, headers });
    return POST(req, { params: Promise.resolve({ loja }) });
  };

  it("assinatura certa grava o pedido", async () => {
    const corpo = corpoPedido();
    const res = await chamar(corpo, assinar(JSON.stringify(corpo), "wh_segredo"));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledOnce();
    const linha = upsert.mock.calls[0]![0][0];
    expect(linha.numero).toBe("78287479133399");
    expect(linha.pago).toBe(true);
    expect(linha.valor_produtos).toBe(242.9);
    // A loja vem do CAMINHO, não do corpo.
    expect(linha.loja_erp).toBe("Carimbos Tridi");
  });

  it("assinatura errada não grava nada", async () => {
    const res = await chamar(corpoPedido(), assinar("outro corpo", "wh_segredo"));
    expect(res.status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("sem assinatura não grava nada", async () => {
    expect((await chamar(corpoPedido(), null)).status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("sem segredo configurado a rota fecha (fail-closed)", async () => {
    vi.stubEnv("YAMPI_WEBHOOK_SECRET_TRAFEGO", "");
    const corpo = corpoPedido();
    const res = await chamar(corpo, assinar(JSON.stringify(corpo), "wh_segredo"));
    expect(res.status).toBe(503);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("caminho do orgânico não existe — a loja orgânica vem do ERP", async () => {
    const corpo = corpoPedido();
    expect((await chamar(corpo, assinar(JSON.stringify(corpo), "wh_segredo"), "organico")).status).toBe(404);
    expect((await chamar(corpo, assinar(JSON.stringify(corpo), "wh_segredo"), "outra")).status).toBe(404);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("pedido NÃO pago fica no espelho como pago=false — não some", async () => {
    // Desde os widgets do painel (23/09): o aguardando pagamento é o que conta
    // "Vendas" e "Pix gerados", e o estornado vira pago=false. Apagar a linha
    // tiraria o pedido das Vendas; o faturamento da Tridify já lê só os pagos.
    const corpo = corpoPedido({ status: { data: { alias: "waiting_payment" } }, status_id: 1 }, "order.created");
    const res = await chamar(corpo, assinar(JSON.stringify(corpo), "wh_segredo"));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0]![0][0].pago).toBe(false);
    expect(apagar).not.toHaveBeenCalledWith("yampi_pedidos");
  });

  it("os itens do corpo viram linhas do Top produtos", async () => {
    const corpo = corpoPedido({
      items: { data: [
        { sku_id: 10, quantity: 2, price: 121.45, sku: { data: { title: "Chancela personalizada" } } },
        { sku_id: 11, quantity: 1, price: 0, sku: { data: { title: "Parabéns! Seu pedido vai com um brinde" } } },
      ] },
    });
    const res = await chamar(corpo, assinar(JSON.stringify(corpo), "wh_segredo"));
    expect(res.status).toBe(200);
    // Itens velhos do pedido saem antes: produto que saiu do pedido não pode
    // seguir contando como vendido.
    expect(apagar).toHaveBeenCalledWith("yampi_pedido_itens");
    const itens = inserirItens.mock.calls[0]![0];
    expect(itens).toEqual([
      expect.objectContaining({ numero: "78287479133399", sku_id: 10, produto: "Chancela personalizada", quantidade: 2, brinde: false }),
      expect.objectContaining({ sku_id: 11, brinde: true }),
    ]);
  });

  it("evento fora de pedido responde 200 — recusar faria a Yampi desativar o webhook", async () => {
    const corpo = { event: "customer.created", resource: { id: 1 } };
    const res = await chamar(corpo, assinar(JSON.stringify(corpo), "wh_segredo"));
    expect(res.status).toBe(200);
    expect(upsert).not.toHaveBeenCalled();
  });
});
