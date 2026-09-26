import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getPixelsServer } from "@/lib/tridiflow-db";
import { modoRemoto, encaminharPara } from "@/lib/player-remoto";

export const dynamic = "force-dynamic";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
// Telefone p/ Meta: só dígitos com DDI. BR (10-11 díg.) → prefixa 55.
function normTelefone(v: string): string {
  const d = v.replace(/\D/g, "");
  return (d.length === 10 || d.length === 11) ? "55" + d : d;
}

// PÚBLICO — Meta Conversions API (server-side, resistente a bloqueio de cookie/iOS).
// Dedup: o MESMO event_id é usado pelo Pixel (browser) e pela CAPI.
// Advanced matching: e-mail/telefone entram com hash SHA-256 (melhora o EMQ).
export async function POST(req: NextRequest) {
  // Servidor dedicado aos chats: o token da CAPI não mora lá — encaminha pro
  // Gaius, repassando user-agent e IP do visitante (senão a Meta atribuiria ao
  // servidor e a qualidade do evento cairia).
  if (modoRemoto()) return encaminharPara(req, "/api/f/evento");
  const b = (await req.json().catch(() => ({}))) as { botId?: string; evento?: string; eventId?: string; valor?: string; url?: string; email?: string; telefone?: string };
  if (!b.botId || !b.evento) return NextResponse.json({ error: "missing" }, { status: 400 });

  const pixels = await getPixelsServer(b.botId).catch(() => null);
  if (!pixels?.capiToken || !pixels?.capiDatasetId) return NextResponse.json({ ok: true, capi: false });

  const email = b.email ? String(b.email).trim().toLowerCase() : "";
  const telefone = b.telefone ? normTelefone(String(b.telefone)) : "";
  const valor = b.valor ? Number(String(b.valor).replace(",", ".")) : undefined;
  const evento = {
    event_name: String(b.evento).slice(0, 64),
    event_time: Math.floor(Date.now() / 1000),
    event_id: String(b.eventId || "").slice(0, 64) || undefined,
    event_source_url: String(b.url || "").slice(0, 500) || undefined,
    action_source: "website",
    user_data: {
      client_user_agent: req.headers.get("user-agent") ?? undefined,
      client_ip_address: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || undefined,
      ...(email ? { em: [sha256(email)], external_id: [sha256(email)] } : {}),
      ...(telefone ? { ph: [sha256(telefone)] } : {}),
    },
    ...(valor && !Number.isNaN(valor) ? { custom_data: { value: valor, currency: "BRL" } } : {}),
  };

  try {
    const r = await fetch(`https://graph.facebook.com/v18.0/${pixels.capiDatasetId}/events?access_token=${encodeURIComponent(pixels.capiToken)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: [evento] }),
      signal: AbortSignal.timeout(4000),
    });
    return NextResponse.json({ ok: r.ok, capi: true });
  } catch {
    return NextResponse.json({ ok: false, capi: true });
  }
}
