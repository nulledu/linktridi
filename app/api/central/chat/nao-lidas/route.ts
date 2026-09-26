import { NextResponse } from "next/server";
import { contarNaoLidas, naoAutenticado, sessao } from "@/lib/chat/servidor";

export const dynamic = "force-dynamic";

// GET → só o número: quantas mensagens novas e quantas me citam.
//
// Existe separado de /canais de propósito. A sidebar do chat traz conversas,
// membros, prévias e categorias; a bolinha da barra do celular precisa de dois
// inteiros. Reaproveitar /canais para isso seria baixar a caixa inteira a cada
// minuto, em toda tela do sistema — o padrão que estourou o egress em julho.
//
// A consulta em si mora em `contarNaoLidas` porque o card de Mensagens do
// Início da Central faz a mesma pergunta no render do servidor, sem passar por
// HTTP.
export async function GET() {
  const s = await sessao();
  if (!s) return naoAutenticado();
  return NextResponse.json(await contarNaoLidas(s.db, s.me.id));
}
