import { NextRequest, NextResponse } from "next/server";
import { falta, meuPapel, naoAutenticado, semAcesso, sessao } from "@/lib/chat/servidor";

export const dynamic = "force-dynamic";

// Histórico de edições de uma mensagem — carregado só quando alguém clica em
// "editada", nunca junto da conversa.
export async function GET(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return falta("id");

  const { data: msg } = await db.from("central_mensagens").select("conversa_id").eq("id", id).maybeSingle();
  if (!msg) return NextResponse.json({ edicoes: [] });
  if (!(await meuPapel(db, (msg as { conversa_id: string }).conversa_id, me.id))) return semAcesso();

  const { data } = await db.from("central_mensagem_edicoes")
    .select("texto_anterior,created_at").eq("mensagem_id", id)
    .order("created_at", { ascending: false }).limit(20);
  return NextResponse.json({ edicoes: data ?? [] });
}
