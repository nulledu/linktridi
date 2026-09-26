import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Comercial pela fonte "erp" (Tráfego › Fontes de venda): o balde do Comercial
 * na Tridify é todo pedido com `responsavel_id`. Samuel e Gabriel Suzuki são
 * administradores e também aparecem como responsáveis no ERP — sem esta trava,
 * trocar a fonte pra "erp" devolvia o faturamento deles pro Comercial, que é
 * exatamente o que o dono pediu pra não acontecer (12/09/2026). O pedido deles
 * fica na origem (loja/plataforma), como qualquer pedido sem vendedora.
 */

vi.mock("@/lib/marketing-config", async (orig) => ({
  ...(await orig<typeof import("@/lib/marketing-config")>()),
  getMarketingConfig: vi.fn(async () => ({
    teto: 0, contas: {}, tagLabels: {}, regras: [],
    custos: { produtoPct: 0, impostoPct: 0, gatewayPct: 0, custoFixo: 0 },
    metas: { roas: 0, cpa: 0, faturamento: 0, lucro: 0, investimento: 0, vendas: 0, margem: 0 },
    fonteTrafego: "Carimbos Tridi", fontes: {}, classificacao: [],
    comercialFonte: "erp",
  })),
}));
vi.mock("@/lib/meta", () => ({ getMetaPeriodSpend: vi.fn(async () => null) }));
vi.mock("@/lib/comercial-pedidos", () => ({ x1Resumo: vi.fn(async () => ({ faturamento: 0, pedidos: 0 })) }));
vi.mock("@/lib/erp-itens", () => ({ itensPorPedido: vi.fn(async () => new Map()) }));

const USUARIOS = [
  { user_id: "sam", nome: "Samuel Jr.", apelido: null },
  { user_id: "suz", nome: "Gabriel Suzuki", apelido: null },
  { user_id: "v1", nome: "Paola", apelido: null },
];
const pedido = (id: number, responsavel_id: string, preco_total: number) => ({
  id, created_at: "2026-09-05T18:00:00.000Z", tag_utm: null, qual_yampi: null,
  preco_total, preco_yampi: null, preco_frete_venda: 0, plataforma_id: 1, etapa_id: null,
  valores_corretos: true, data_aprovado: "2026-09-05T18:30:00.000Z", arquivado: false,
  chargeback: false, excluido: false, responsavel_id,
});
const PEDIDOS = [pedido(1, "v1", 300), pedido(2, "sam", 500), pedido(3, "suz", 70)];

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string) => {
    const u = String(url);
    const corpo = u.includes("/pedidos?") ? PEDIDOS
      : u.includes("/plataformas?") ? [{ id: 1, nome: "WhatsApp" }]
      : u.includes("/usuarios?") ? USUARIOS
      : [];
    return { ok: true, json: async () => corpo };
  });
});

describe("Tridify com o Comercial pela fonte \"erp\"", () => {
  it("pedido de responsável que não é vendedor não entra no Comercial", async () => {
    const { snapshotVendas } = await import("../trafego-vendas");
    const s = await snapshotVendas("2026-09-01", "2026-09-30");
    expect(s.comercialFonte).toBe("erp");
    // Só o pedido da Paola é do Comercial. Sem a trava: 870 em 3 pedidos.
    expect(s.comercialValor).toBe(300);
    expect(s.comercialPedidos).toBe(1);
  });
});
