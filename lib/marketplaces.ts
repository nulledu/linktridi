// ── Integração de Marketplaces (scaffold pronto p/ plugar credenciais) ──
// Mercado Livre, Shopee e TikTok Shop. Padrão: app registrado → OAuth por loja
// (access_token + refresh_token) → webhook recebe o pedido → busca detalhe →
// normaliza p/ um formato único → grava em marketplace_pedidos.
//
// As credenciais vêm de variáveis de ambiente (você pluga depois). Enquanto não
// houver token, o webhook ainda grava o payload bruto + o que der pra normalizar.

import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type Provider = "mercado_livre" | "shopee" | "tiktok_shop";

export interface ProviderDef {
  key: Provider;
  label: string;
  cor: string;
  // Credenciais (env). Nomes documentados em docs/marketplaces.md.
  env: { id: string; secret: string; extra?: string };
  // OAuth: URL de autorização (quando o provider usa redirect OAuth).
  authorizeUrl?: (redirectUri: string, state: string) => string;
  // Como o webhook descobre o ID do pedido a partir da notificação.
  pedidoIdDaNotificacao: (payload: Record<string, unknown>) => string | null;
  // Endpoint REST p/ buscar o pedido (com token) — devolve a URL.
  orderUrl?: (externalId: string, shopId?: string | null) => string;
}

const APP = process.env.APP_URL || "https://gaius.tridi.app";
export const webhookUrl = (p: Provider) => `${APP}/api/marketplaces/${p}/webhook`;
export const callbackUrl = (p: Provider) => `${APP}/api/marketplaces/${p}/oauth/callback`;

export const PROVIDERS: Record<Provider, ProviderDef> = {
  mercado_livre: {
    key: "mercado_livre", label: "Mercado Livre", cor: "#FFE600",
    env: { id: "ML_CLIENT_ID", secret: "ML_CLIENT_SECRET" },
    authorizeUrl: (redirect, state) =>
      `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=${process.env.ML_CLIENT_ID || ""}&redirect_uri=${encodeURIComponent(redirect)}&state=${state}`,
    // ML manda { topic: "orders_v2", resource: "/orders/123" }
    pedidoIdDaNotificacao: (p) => {
      const res = String(p.resource || "");
      const m = /\/orders\/(\d+)/.exec(res);
      return m ? m[1] : (p.resource ? res.split("/").pop() || null : null);
    },
    orderUrl: (id) => `https://api.mercadolibre.com/orders/${id}`,
  },
  shopee: {
    key: "shopee", label: "Shopee", cor: "#EE4D2D",
    env: { id: "SHOPEE_PARTNER_ID", secret: "SHOPEE_PARTNER_KEY" },
    // Shopee usa assinatura HMAC + partner_id/shop_id; auth via link gerado no painel.
    pedidoIdDaNotificacao: (p) => {
      const data = (p.data || p) as Record<string, unknown>;
      const sn = data.ordersn || data.order_sn;
      return sn ? String(sn) : null;
    },
    orderUrl: (id, shop) => `https://partner.shopeemobile.com/api/v2/order/get_order_detail?order_sn_list=${id}&shop_id=${shop ?? ""}`,
  },
  tiktok_shop: {
    key: "tiktok_shop", label: "TikTok Shop", cor: "#000000",
    env: { id: "TIKTOK_APP_KEY", secret: "TIKTOK_APP_SECRET", extra: "TIKTOK_SERVICE_ID" },
    authorizeUrl: (redirect, state) =>
      `https://services.tiktokshop.com/open/authorize?service_id=${process.env.TIKTOK_SERVICE_ID || ""}&state=${state}`,
    // TikTok manda { type, data: { order_id } }
    pedidoIdDaNotificacao: (p) => {
      const data = (p.data || {}) as Record<string, unknown>;
      return data.order_id ? String(data.order_id) : null;
    },
    orderUrl: (id) => `https://open-api.tiktokglobalshop.com/order/202309/orders?order_ids=${id}`,
  },
};

/** Cookie httpOnly com `<provider>.<state>` do OAuth em andamento (uso único). */
export const COOKIE_OAUTH_STATE = "mkt_oauth_state";

export const isProvider = (s: string): s is Provider => s === "mercado_livre" || s === "shopee" || s === "tiktok_shop";
export const providerConfigured = (p: Provider) => {
  const d = PROVIDERS[p];
  return !!(process.env[d.env.id] && process.env[d.env.secret]);
};

// ── Pedido normalizado (formato único do sistema) ──
export interface PedidoNormalizado {
  external_id: string; status: string | null; status_raw: string | null;
  valor: number; frete: number; comprador: string | null;
  itens: { nome: string; qtd: number; preco: number }[]; criado_em: string | null;
}

const num = (v: unknown) => Number(v) || 0;
// Best-effort: mapeia o pedido de cada marketplace p/ o formato único. Ajustar
// conforme o payload real quando as contas estiverem conectadas.
export function normalizarPedido(provider: Provider, raw: Record<string, unknown>): PedidoNormalizado | null {
  try {
    if (provider === "mercado_livre") {
      const itens = ((raw.order_items as Record<string, unknown>[]) || []).map((it) => {
        const item = (it.item || {}) as Record<string, unknown>;
        return { nome: String(item.title || "Item"), qtd: num(it.quantity), preco: num(it.unit_price) };
      });
      const buyer = (raw.buyer || {}) as Record<string, unknown>;
      return {
        external_id: String(raw.id), status_raw: String(raw.status || ""), status: mapStatus("mercado_livre", String(raw.status || "")),
        valor: num(raw.total_amount), frete: num((raw.shipping as Record<string, unknown>)?.cost),
        comprador: String(buyer.nickname || buyer.first_name || "—"), itens, criado_em: (raw.date_created as string) || null,
      };
    }
    if (provider === "shopee") {
      const o = ((raw.order_list as Record<string, unknown>[])?.[0]) || raw;
      const itens = ((o.item_list as Record<string, unknown>[]) || []).map((it) => ({ nome: String(it.item_name || "Item"), qtd: num(it.model_quantity_purchased), preco: num(it.model_discounted_price) }));
      return {
        external_id: String(o.order_sn), status_raw: String(o.order_status || ""), status: mapStatus("shopee", String(o.order_status || "")),
        valor: num(o.total_amount), frete: num(o.estimated_shipping_fee), comprador: String(o.buyer_username || "—"),
        itens, criado_em: o.create_time ? new Date(num(o.create_time) * 1000).toISOString() : null,
      };
    }
    // tiktok_shop
    const o = ((raw.orders as Record<string, unknown>[])?.[0]) || raw;
    const itens = ((o.line_items as Record<string, unknown>[]) || []).map((it) => ({ nome: String(it.product_name || "Item"), qtd: 1, preco: num(it.sale_price) }));
    return {
      external_id: String(o.id || o.order_id), status_raw: String(o.status || ""), status: mapStatus("tiktok_shop", String(o.status || "")),
      valor: num((o.payment as Record<string, unknown>)?.total_amount), frete: num((o.payment as Record<string, unknown>)?.shipping_fee),
      comprador: String(o.buyer_email || o.user_id || "—"), itens, criado_em: o.create_time ? new Date(num(o.create_time) * 1000).toISOString() : null,
    };
  } catch { return null; }
}

function mapStatus(provider: Provider, s: string): string | null {
  const x = s.toLowerCase();
  if (provider === "mercado_livre") { if (x === "paid") return "pago"; if (x === "cancelled") return "cancelado"; if (x === "shipped") return "enviado"; return x || null; }
  if (provider === "shopee") { if (x.includes("ready") || x.includes("shipped")) return "enviado"; if (x.includes("cancel")) return "cancelado"; if (x.includes("complete") || x.includes("paid")) return "pago"; return x || null; }
  if (x.includes("await")) return "pago"; if (x.includes("ship") || x.includes("transit")) return "enviado"; if (x.includes("cancel")) return "cancelado"; return x || null;
}

// Grava (upsert) o pedido normalizado. Idempotente por (provider, external_id).
export async function salvarPedido(provider: Provider, contaId: string | null, p: PedidoNormalizado, raw: Record<string, unknown>) {
  const db = createSupabaseAdminClient();
  await db.from("marketplace_pedidos").upsert({
    provider, conta_id: contaId, external_id: p.external_id, status: p.status, status_raw: p.status_raw,
    valor: p.valor, frete: p.frete, comprador: p.comprador, itens: p.itens, raw, criado_em: p.criado_em,
  }, { onConflict: "provider,external_id" });
}
