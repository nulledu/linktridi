import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

// POST → alterna reação. Body: { mensagem_id, emoji }. Já reagiu c/ esse emoji → remove.
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let b: { mensagem_id?: string; emoji?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const mensagem = String(b.mensagem_id || "");
  const emoji = String(b.emoji || "");
  if (!mensagem || !emoji) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const db = createSupabaseAdminClient();
  const { data: existe } = await db.from("central_reacoes")
    .select("emoji").eq("mensagem_id", mensagem).eq("user_id", me.id).eq("emoji", emoji).maybeSingle();
  if (existe) {
    await db.from("central_reacoes").delete().eq("mensagem_id", mensagem).eq("user_id", me.id).eq("emoji", emoji);
    return NextResponse.json({ ok: true, removido: true });
  }
  await db.from("central_reacoes").insert({ mensagem_id: mensagem, user_id: me.id, emoji });
  return NextResponse.json({ ok: true });
}
