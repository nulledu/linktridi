import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { PROVIDERS, isProvider, normalizarPedido, salvarPedido, type Provider } from "@/lib/marketplaces";

export const dynamic = "force-dynamic";

// POST /api/marketplaces/<provider>/webhook
// Recebe a notificação do marketplace, registra, e tenta gravar o pedido.
// Responde 200 RÁPIDO (os marketplaces exigem ack rápido; o trabalho pesado é best-effort).
export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProvider(provider)) return NextResponse.json({ error: "provider" }, { status: 404 });
  let payload: Record<string, unknown> = {};
  try { payload = await req.json(); } catch { /* alguns mandam form/query */ }
  const db = createSupabaseAdminClient();
  const topico = String(payload.topic || payload.type || "");
  // registra a notificação crua (auditoria/replay)
  const { data: log } = await db.from("marketplace_webhooks").insert({ provider, topico, payload }).select("id").maybeSingle();

  // processa em background-ish (sem travar o ack)
  processar(provider, payload, log?.id).catch(() => {});
  return NextResponse.json({ ok: true });
}

async function processar(provider: Provider, payload: Record<string, unknown>, logId?: string) {
  const db = createSupabaseAdminClient();
  try {
    const def = PROVIDERS[provider];
    const externalId = def.pedidoIdDaNotificacao(payload);
    // conta conectada (com token) p/ buscar o detalhe
    const { data: conta } = await db.from("marketplace_contas")
      .select("id,access_token,external_shop_id").eq("provider", provider).eq("status", "conectado")
      .order("updated_at", { ascending: false }).limit(1).maybeSingle();

    let raw: Record<string, unknown> | null = null;
    // Mercado Livre: detalhe via REST Bearer (mais simples). Shopee/TikTok exigem
    // assinatura HMAC por request — quando plugar credenciais, completar aqui.
    if (provider === "mercado_livre" && externalId && conta?.access_token && def.orderUrl) {
      const r = await fetch(def.orderUrl(externalId), { headers: { Authorization: `Bearer ${conta.access_token}` } });
      if (r.ok) raw = await r.json();
    }
    // fallback: se a própria notificação já trouxe o pedido, usa ela
    if (!raw && (payload.order || payload.data || payload.order_list || payload.orders)) raw = payload;

    if (raw) {
      const norm = normalizarPedido(provider, raw);
      if (norm?.external_id) { await salvarPedido(provider, conta?.id ?? null, norm, raw); }
    }
    if (logId) await db.from("marketplace_webhooks").update({ processado: true }).eq("id", logId);
  } catch (e) {
    if (logId) await db.from("marketplace_webhooks").update({ erro: String(e) }).eq("id", logId);
  }
}

// Mercado Livre faz um GET de verificação ao cadastrar a URL — responde 200.
export async function GET() { return NextResponse.json({ ok: true }); }
