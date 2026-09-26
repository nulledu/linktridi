import { NextRequest, NextResponse } from "next/server";
import { falta, meuPapel, naoAutenticado, semAcesso, sessao, temEsquemaNovo } from "@/lib/chat/servidor";

export const dynamic = "force-dynamic";

// Painel "Links": tudo que foi compartilhado no canal, mais novo primeiro.
export async function GET(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const canal = req.nextUrl.searchParams.get("canal");
  if (!canal) return falta("canal");
  if (!(await meuPapel(db, canal, me.id))) return semAcesso();
  if (!(await temEsquemaNovo(db))) return NextResponse.json({ links: [] });

  const { data } = await db.from("central_links")
    .select("mensagem_id,url,titulo,autor_id,created_at")
    .eq("conversa_id", canal)
    .order("created_at", { ascending: false })
    .limit(200);
  return NextResponse.json({ links: data ?? [] });
}
