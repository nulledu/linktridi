import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { listarVps, criarVps, atualizarVps, apagarVps } from "@/lib/infraestrutura";
import { TabelaAusenteError } from "@/lib/acessos-cofre";

export const dynamic = "force-dynamic";

// ── Acessos & Infra › VPS ────────────────────────────────────────────────────
// Mesma chave da página /infraestrutura (ver o irmão dominios/route.ts).
const CHAVE = "infraestrutura";

function erro(e: unknown) {
  if (e instanceof TabelaAusenteError)
    return NextResponse.json({ error: "tabela_ausente", detalhe: "Rode supabase/infraestrutura.sql no Supabase." }, { status: 200 });
  return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
}

export async function GET() {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try { return NextResponse.json({ vps: await listarVps() }); }
  catch (e) { return erro(e); }
}

export async function POST(req: NextRequest) {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try { return NextResponse.json({ vps: await criarVps(b, me.id) }); }
  catch (e) { return erro(e); }
}

export async function PATCH(req: NextRequest) {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof b.id !== "string" || !b.id) return NextResponse.json({ error: "id_obrigatorio" }, { status: 400 });
  try { return NextResponse.json({ vps: await atualizarVps(b.id, b) }); }
  catch (e) { return erro(e); }
}

export async function DELETE(req: NextRequest) {
  const me = await getProfileForModule(CHAVE);
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_obrigatorio" }, { status: 400 });
  try { await apagarVps(id); return NextResponse.json({ ok: true }); }
  catch (e) { return erro(e); }
}
