import { NextRequest, NextResponse } from "next/server";
import { getTestePorSlug, logVisita, abTag, type Variante } from "@/lib/trafego-ab";

export const dynamic = "force-dynamic";

// ── Link divisor A/B (público) ───────────────────────────────────────────────
// GET /ab/<slug> → sorteia o visitante numa variante (grudado por cookie),
// registra o clique e REDIRECIONA pro destino, carregando a tag da variante em
// utm_content (pra ligar a venda de volta quando o destino for on-site).

function device(ua: string): string {
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone/i.test(ua)) return "mobile";
  return "desktop";
}

// Sorteio ponderado pelos pesos das variantes.
function sortear(vars: Variante[]): Variante {
  const total = vars.reduce((s, v) => s + Math.max(0, v.peso || 0), 0);
  if (total <= 0) return vars[Math.floor(Math.random() * vars.length)];
  let r = Math.random() * total;
  for (const v of vars) { r -= Math.max(0, v.peso || 0); if (r <= 0) return v; }
  return vars[vars.length - 1];
}

// Anexa a tag da variante ao destino (sem perder query params existentes).
function destinoComTag(url: string, slug: string, varianteId: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;   // trava javascript:/data:
    u.searchParams.set("utm_content", abTag(slug, varianteId));
    u.searchParams.set("ab", slug);
    u.searchParams.set("v", varianteId);
    return u.toString();
  } catch { return null; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const teste = await getTestePorSlug(slug);
  const vars = (teste?.variantes ?? []).filter((v) => v.url);
  if (!teste || vars.length === 0) return new NextResponse("Link não encontrado.", { status: 404 });

  // Variante grudada (cookie por teste) ou sorteio novo.
  const cookieVar = req.cookies.get(`ab_${slug}`)?.value;
  const escolhida = vars.find((v) => v.id === cookieVar) ?? sortear(vars);

  const destino = destinoComTag(escolhida.url, slug, escolhida.id);
  if (!destino) return new NextResponse("Destino inválido.", { status: 400 });

  // Registra o clique só se o teste está ativo (link pausado ainda redireciona).
  const visitante = req.cookies.get("abvid")?.value || crypto.randomUUID();
  if (teste.ativo) {
    await logVisita({
      testeId: teste.id, varianteId: escolhida.id, visitante,
      device: device(req.headers.get("user-agent") || ""),
      referrer: req.headers.get("referer"),
    });
  }

  const res = NextResponse.redirect(destino, 302);
  const umAno = 60 * 60 * 24 * 365;
  res.cookies.set("abvid", visitante, { maxAge: umAno, sameSite: "lax", path: "/" });
  res.cookies.set(`ab_${slug}`, escolhida.id, { maxAge: umAno, sameSite: "lax", path: "/" });
  return res;
}
