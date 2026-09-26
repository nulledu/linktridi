import { NextRequest, NextResponse } from "next/server";
import { getBotPublicado } from "@/lib/tridiflow-db";

export const dynamic = "force-dynamic";

// PÚBLICO — usado pelo servidor dedicado aos chats (PLAYER_API_BASE), que roda
// sem acesso ao banco.
//
// SEGURANÇA: devolve exatamente o mesmo objeto que o player já entrega ao
// navegador de qualquer visitante. getBotPublicado() sanitiza os pixels (só os
// IDs públicos saem; o token da CAPI fica no servidor). Nada aqui é novo — quem
// abre /f/<slug> já recebe isto no HTML.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const host = (sp.get("host") || "").slice(0, 253);
  const slug = (sp.get("slug") || "").slice(0, 200);
  if (!slug) return NextResponse.json({ error: "missing_slug" }, { status: 400 });

  // Erro do banco ≠ "não existe": o servidor dedicado guarda o bot em memória
  // e só apaga com 404. Um tropeço do Supabase respondendo 404 despublicaria
  // o funil por lá até a próxima ida.
  let bot;
  try { bot = await getBotPublicado(host || null, slug); }
  catch { return NextResponse.json({ error: "indisponivel" }, { status: 503 }); }
  if (!bot) return NextResponse.json({ error: "nao_encontrado" }, { status: 404 });
  return NextResponse.json({ bot });
}
