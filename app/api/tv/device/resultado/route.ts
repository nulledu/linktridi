import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { autorizarTv, respostaAuth } from "../_device";

export const dynamic = "force-dynamic";

/**
 * POST /api/tv/device/resultado — a caixa devolve o resultado de um comando
 * (o print, o log, ou o erro). Fecha o comando na fila.
 *
 * Escrita só quando há resultado de verdade — nunca no ciclo comum. A caixa só
 * consegue fechar comando que seja DELA (o `eq(dispositivo_id)` garante).
 */
export async function POST(req: NextRequest) {
  const auth = await autorizarTv(req);
  if (!("device" in auth)) return respostaAuth(auth)!;
  const device = auth.device;

  let b: { id?: string; ok?: boolean; resultado?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!b.id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const db = createSupabaseAdminClient();
  const { error } = await db.from("tv_comandos").update({
    status: b.ok === false ? "erro" : "concluido",
    resultado: b.resultado ?? null,
    concluido_em: new Date().toISOString(),
  }).eq("id", b.id).eq("dispositivo_id", device.id);

  if (error) return NextResponse.json({ error: "falha", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
