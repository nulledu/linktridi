import { NextRequest, NextResponse } from "next/server";
import { autenticarDevice } from "@/lib/device";
import { salvarAmostra } from "@/lib/ponto";

export const dynamic = "force-dynamic";

// POST /api/ponto/amostra — o tablet manda a "assinatura facial" (embedding) de
// uma batida confirmada, pra pessoa ser reconhecida melhor da próxima vez.
// Auth: x-device-token. Guarda só o vetor (não a foto) e apara pro limite.
export async function POST(req: NextRequest) {
  const auth = await autenticarDevice(req.headers.get("x-device-token"));
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  const device = auth.device;

  const b = (await req.json().catch(() => ({}))) as { pessoaId?: string; embedding?: number[] };
  if (!b.pessoaId || !Array.isArray(b.embedding)) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });

  try {
    await salvarAmostra(b.pessoaId, b.embedding);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
