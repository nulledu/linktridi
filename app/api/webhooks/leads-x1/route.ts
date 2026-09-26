import { NextRequest, NextResponse } from "next/server";
import { addLeadX1 } from "@/lib/comercial";

export const dynamic = "force-dynamic";

// Segredo do webhook X1: SÓ do env X1_WEBHOOK_SECRET (fail-closed). Sem ele a
// rota responde 503 e o Facebook não recebe o challenge. Não há fallback no
// código: segredo no git não autoriza nada. Use como ?token=... ou header
// x-webhook-secret (x-hub-signature não é validado).
const segredo = () => process.env.X1_WEBHOOK_SECRET?.trim() || "";

function autorizado(req: NextRequest, secret: string): boolean {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || req.headers.get("x-webhook-secret") || "";
  return token === secret;
}

// Pega o 1º valor presente entre várias chaves possíveis (payloads variam).
function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

// Normaliza payloads comuns (Facebook Lead Ads, Typeform, formulários simples).
function extrair(body: Record<string, unknown>): { telefone: string | null; nome: string | null; fonte: string | null } {
  // Facebook Lead Ads: entry[].changes[].value.field_data[{name, values[]}]
  const fb = (() => {
    try {
      const entry = (body.entry as { changes?: { value?: { field_data?: { name: string; values: string[] }[] } }[] }[] | undefined)?.[0];
      const fields = entry?.changes?.[0]?.value?.field_data;
      if (!Array.isArray(fields)) return null;
      const map: Record<string, string> = {};
      for (const f of fields) map[(f.name || "").toLowerCase()] = (f.values || [])[0] || "";
      return {
        telefone: map["phone_number"] || map["telefone"] || map["phone"] || map["whatsapp"] || null,
        nome: map["full_name"] || map["nome"] || map["name"] || null,
        fonte: "facebook",
      };
    } catch { return null; }
  })();
  if (fb && fb.telefone) return fb;

  // Genérico (formulário simples / Typeform / Zapier).
  return {
    telefone: pick(body, ["telefone", "phone", "phone_number", "whatsapp", "celular", "tel"]),
    nome: pick(body, ["nome", "name", "full_name", "cliente"]),
    fonte: pick(body, ["fonte", "source", "origem"]) || "facebook",
  };
}

// GET — verificação de assinatura do Facebook (hub.challenge) ou healthcheck.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const verify = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const secret = segredo();
  if (mode === "subscribe" && secret && verify === secret && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ ok: true, webhook: "leads-x1" });
}

// POST — recebe o lead e grava como tipo='x1'.
export async function POST(req: NextRequest) {
  const secret = segredo();
  if (!secret) return NextResponse.json({ error: "webhook_nao_configurado" }, { status: 503 });
  if (!autorizado(req, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const { telefone, nome, fonte } = extrair(body);
  if (!telefone) return NextResponse.json({ error: "missing_phone", recebido: Object.keys(body) }, { status: 400 });

  const res = await addLeadX1({ telefone, nome, fonte, payload: body });
  if (!res.ok) return NextResponse.json({ error: "failed", motivo: res.motivo }, { status: 500 });
  return NextResponse.json({ ok: true, id: res.id, duplicado: res.motivo === "duplicado" });
}
