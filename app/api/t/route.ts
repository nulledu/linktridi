import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// PÚBLICO — ingestão do pixel próprio (tf-track.js). Recebe pageviews/eventos de
// sites externos, cria/atualiza o visitante e grava o evento. Tolerante à
// ausência das tabelas (trafego_visitantes/trafego_eventos) — nunca quebra a
// página do cliente. CORS liberado (roda em domínios de terceiros).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }

// Deriva dispositivo/navegador/SO do user-agent (barato, sem lib).
function device(ua: string): string {
  if (/Mobi|Android(?!.*Tablet)|iPhone/i.test(ua)) return "mobile";
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  return "desktop";
}
function browser(ua: string): string {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "Safari";
  return "Outro";
}
function os(ua: string): string {
  if (/Windows/i.test(ua)) return "Windows";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iOS/i.test(ua)) return "iOS";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Outro";
}

interface Payload {
  site?: string; vid?: string; sid?: string; evento?: string; url?: string; ref?: string;
  first?: Record<string, string>; utm?: Record<string, string>; screen?: string; lang?: string;
  ua?: string; dados?: Record<string, unknown>; ts?: number; eid?: string;
}

export async function POST(req: NextRequest) {
  let p: Payload;
  try { p = JSON.parse(await req.text()) as Payload; } catch { return new NextResponse(null, { status: 204, headers: CORS }); }
  if (!p.vid || !p.eid || !p.evento) return new NextResponse(null, { status: 204, headers: CORS });

  const ua = String(p.ua || req.headers.get("user-agent") || "").slice(0, 500);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  const pais = req.headers.get("x-vercel-ip-country") || null;
  const dev = `${device(ua)} · ${os(ua)} · ${browser(ua)}`;

  try {
    const db = createSupabaseAdminClient();
    // Visitante: cria no 1º evento (com a first-touch), atualiza last_seen.
    await db.from("trafego_visitantes").upsert({
      vid: p.vid,
      first_utm: p.first ?? {},
      landing: (p.first?.landing as string) ?? p.url ?? null,
      referrer: (p.first?.referrer as string) ?? p.ref ?? null,
      last_seen: new Date().toISOString(),
      device: dev, ua, ip, pais,
    }, { onConflict: "vid", ignoreDuplicates: false });
    // Evento (eid é PK → dedup automático de reenvio).
    await db.from("trafego_eventos").upsert({
      eid: p.eid, vid: p.vid, sid: p.sid ?? null, site: p.site ?? null,
      evento: String(p.evento).slice(0, 60), url: p.url ?? null, referrer: p.ref ?? null,
      utm: p.utm ?? {}, dados: p.dados ?? {}, device: dev, ua, ip, pais,
      criado_em: p.ts ? new Date(p.ts).toISOString() : new Date().toISOString(),
    }, { onConflict: "eid", ignoreDuplicates: true });
  } catch { /* tabela ausente / falha temporária: ignora, não quebra o cliente */ }

  return new NextResponse(null, { status: 204, headers: CORS });
}
