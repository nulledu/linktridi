import { NextRequest, NextResponse } from "next/server";
import { getPaginaPublicada } from "@/lib/tridiflow-db";

export const dynamic = "force-dynamic";

// PÚBLICO — irmão de /api/f/bot, para PÁGINAS (landing e Central de Tutoriais).
//
// O servidor dedicado (gedux.com.br) roda sem nenhum segredo: ele não fala com
// o banco, pergunta ao Gaius. Sem esta rota, /p/<slug> naquele servidor
// respondia "Este link não está disponível" — não por falta da página, mas por
// falta de banco.
//
// SEGURANÇA: devolve o MESMO objeto que /p/<slug> já entrega no HTML de
// qualquer visitante — `getPaginaPublicada` sanitiza os pixels (só IDs
// públicos; token da CAPI fica no servidor).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const host = (sp.get("host") || "").slice(0, 253);
  const slug = (sp.get("slug") || "").slice(0, 200);
  if (!slug) return NextResponse.json({ error: "missing_slug" }, { status: 400 });

  // Erro do banco é 503, não 404: o servidor dedicado só esquece a página
  // guardada em memória quando o Gaius diz que ela não existe.
  let pagina;
  try { pagina = await getPaginaPublicada(host || null, slug); }
  catch { return NextResponse.json({ error: "indisponivel" }, { status: 503 }); }
  if (!pagina) return NextResponse.json({ error: "nao_encontrado" }, { status: 404 });
  return NextResponse.json({ pagina });
}
