import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ehPlataformaMarketplace, tipoDoPedido, tipoDaFonte, chavePlataforma } from "@/lib/marketing-config";

// ── Marketplace é a PLATAFORMA do pedido ─────────────────────────────────────
//
// Pedido do dono (12/09/2026): contar as vendas e o faturamento do marketplace
// "puxando pelos pedidos (mesma lista da Yampi) que têm TikTok, Shopee e
// Mercado Livre como plataforma" — no Analytics, no Tridify e em todo lugar.
//
// O que mudou no ERP: até agosto todo pedido de ML/TikTok nascia na etapa 13;
// desde setembro entra na etapa 1 como qualquer outro, e TODOS têm responsável
// (o dono, em 101 de 101 pedidos de ML/TikTok desde junho). Com isso três
// caminhos tiravam a venda do Marketplace sem aviso:
//   1. a classificação salva na tela de Fontes;
//   2. uma regra de produto ("carimbo X é comercial");
//   3. o Comercial lido por `responsavel_id` (fonte "erp");
// e um quarto a contava DUAS vezes: `pullPedidos` puxa os pedidos de quem lança
// pedido pelo `responsavel_id`, e o dono lança — cada ML/TikTok virava venda
// comercial dele no Geral do Comercial, no X1 e no total da lista.

describe("ehPlataformaMarketplace", () => {
  it("Shopee (3), Mercado Livre (9) e TikTok (10) pelo id", () => {
    for (const id of [3, 9, 10]) expect(ehPlataformaMarketplace(id)).toBe(true);
    for (const id of [1, 2, 4, 5, 6, 7, 8]) expect(ehPlataformaMarketplace(id)).toBe(false);
  });

  it("conta nova no catálogo do ERP entra pelo nome", () => {
    expect(ehPlataformaMarketplace(11, "TikTok Shop")).toBe(true);
    expect(ehPlataformaMarketplace(12, "Mercado Livre 2")).toBe(true);
    expect(ehPlataformaMarketplace(13, "SHOPEE Full")).toBe(true);
    expect(ehPlataformaMarketplace(14, "WhatsApp")).toBe(false);
  });

  it("pedido sem plataforma não é marketplace", () => {
    expect(ehPlataformaMarketplace(null)).toBe(false);
    expect(ehPlataformaMarketplace(undefined, null)).toBe(false);
  });
});

describe("tipoDoPedido: a plataforma passa na frente de tudo", () => {
  const base = { porRegra: null, comercialPeloResponsavel: false, tipoDaOrigem: "ignorar" as const };

  it("pedido do TikTok com responsável e Comercial pelo ERP continua marketplace", () => {
    expect(tipoDoPedido({ ...base, marketplace: true, comercialPeloResponsavel: true })).toBe("marketplace");
  });

  it("regra de produto não tira pedido do marketplace", () => {
    expect(tipoDoPedido({ ...base, marketplace: true, porRegra: "comercial" })).toBe("marketplace");
  });

  it("regra que diz 'marketplace' não põe pedido de outra plataforma lá", () => {
    expect(tipoDoPedido({ ...base, marketplace: false, porRegra: "marketplace", tipoDaOrigem: "trafego" })).toBe("trafego");
    expect(tipoDoPedido({ ...base, marketplace: false, porRegra: "marketplace", comercialPeloResponsavel: true })).toBe("comercial");
  });

  it("fora do marketplace a ordem de antes vale: regra > vendedora > origem", () => {
    expect(tipoDoPedido({ marketplace: false, porRegra: "organico", comercialPeloResponsavel: true, tipoDaOrigem: "trafego" })).toBe("organico");
    expect(tipoDoPedido({ marketplace: false, porRegra: null, comercialPeloResponsavel: true, tipoDaOrigem: "trafego" })).toBe("comercial");
    expect(tipoDoPedido({ marketplace: false, porRegra: null, comercialPeloResponsavel: false, tipoDaOrigem: "trafego" })).toBe("trafego");
  });

  it("a origem sozinha nunca devolve marketplace pra quem não é da plataforma", () => {
    expect(tipoDoPedido({ ...base, marketplace: false, tipoDaOrigem: "marketplace" })).toBe("ignorar");
  });

  it("tipoDaFonte também reconhece a conta nova pelo nome", () => {
    expect(tipoDaFonte(chavePlataforma(11), {}, "Carimbos Tridi", "TikTok Shop")).toBe("marketplace");
    expect(tipoDaFonte(chavePlataforma(11), {}, "Carimbos Tridi")).toBe("ignorar");
  });
});

// ── Quem soma usa a mesma pergunta ───────────────────────────────────────────
// A regra só vale se quem soma perguntar a ela. Uma comparação solta de
// `plataforma_id` num desses arquivos é o jeito de a divergência voltar.
const raiz = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

describe("snapshot e Comercial perguntam à plataforma", () => {
  it("o snapshot de vendas decide o tipo por tipoDoPedido", () => {
    const src = ler("lib/trafego-vendas.ts");
    expect(src).toMatch(/tipoDoPedido\(\{\s*marketplace: ehPlataformaMarketplace\(p\.plataforma_id/);
  });

  it("pullPedidos tira os pedidos de marketplace da venda de vendedora", () => {
    const src = ler("lib/comercial-pedidos.ts");
    const corpo = src.slice(src.indexOf("export async function pullPedidos"), src.indexOf("export async function pedidosMarketplace"));
    expect(corpo).toMatch(/pedsErp\.filter\(\(p\) => !ehPlataformaMarketplace\(/);
  });
});
