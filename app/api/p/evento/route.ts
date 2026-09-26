import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { registrarEvento } from "@/lib/tridiflow-db";

export const dynamic = "force-dynamic";

// PÚBLICA — eventos da página publicada (visualização, vídeo, oferta, CTA).
// Sem sessão: quem chama é o visitante do anúncio. A defesa é a allowlist de
// nomes de evento (em registrarEvento) + limite de tamanho dos campos, não
// autenticação — igual às demais rotas do player.
const entrada = z.object({
  paginaId: z.string().uuid(),
  evento: z.string().min(3).max(40),
  visitante: z.string().max(80).optional(),
  sessaoId: z.string().uuid().optional(),
  url: z.string().max(500).optional(),
  utm: z.record(z.string().max(200)).optional(),
  dispositivo: z.enum(["mobile", "desktop"]).optional(),
  meta: z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  // sendBeacon manda como Blob/text — não dá pra confiar no content-type.
  const cru = await req.text().catch(() => "");
  let corpo: unknown;
  try { corpo = JSON.parse(cru || "{}"); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const p = entrada.safeParse(corpo);
  if (!p.success) return NextResponse.json({ ok: false, error: "invalid" }, { status: 422 });

  await registrarEvento(p.data.paginaId, {
    evento: p.data.evento,
    visitante: p.data.visitante ?? null,
    sessaoId: p.data.sessaoId ?? null,
    url: p.data.url ?? null,
    utm: p.data.utm ?? {},
    dispositivo: p.data.dispositivo ?? null,
    meta: (p.data.meta ?? {}) as Record<string, unknown>,
  });

  // 204: o beacon não lê corpo nenhum.
  return new NextResponse(null, { status: 204 });
}
