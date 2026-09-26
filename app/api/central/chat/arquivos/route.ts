import { NextRequest, NextResponse } from "next/server";
import { falta, meuPapel, naoAutenticado, semAcesso, sessao, temEsquemaNovo } from "@/lib/chat/servidor";

export const dynamic = "force-dynamic";

// Painel "Arquivos". Lê `central_anexos`, não `central_mensagens` — varrer as
// mensagens do canal atrás de anexo arrastaria o texto de tudo junto.
export async function GET(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const canal = req.nextUrl.searchParams.get("canal");
  if (!canal) return falta("canal");
  if (!(await meuPapel(db, canal, me.id))) return semAcesso();
  if (!(await temEsquemaNovo(db))) return NextResponse.json({ arquivos: [] });

  const { data } = await db.from("central_anexos")
    .select("id,mensagem_id,conversa_id,autor_id,url,nome,mime,tamanho,largura,altura,created_at")
    .eq("conversa_id", canal)
    .order("created_at", { ascending: false })
    .limit(200);
  return NextResponse.json({ arquivos: data ?? [] });
}
