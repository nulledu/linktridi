import { NextRequest, NextResponse } from "next/server";
import {
  COLS_MSG_BASE, COLS_MSG_NOVO, corpo, jsonInvalido, meusCanais,
  naoAutenticado, paraMensagem, sessao, temEsquemaNovo,
} from "@/lib/chat/servidor";

export const dynamic = "force-dynamic";

// Reserva do Realtime. Só roda quando o WebSocket está fora, e devolve APENAS o
// que chegou depois do carimbo — no tick comum a resposta é uma lista vazia.
export async function POST(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const b = await corpo<{ canais?: string[]; desde?: string }>(req);
  if (!b?.desde) return jsonInvalido();

  const meus = new Set(await meusCanais(db, me.id));
  const alvo = (b.canais ?? []).filter((c) => meus.has(c)).slice(0, 20);
  if (!alvo.length) return NextResponse.json({ mensagens: [] });

  const novo = await temEsquemaNovo(db);
  const { data } = await db.from("central_mensagens")
    .select(novo ? COLS_MSG_NOVO : COLS_MSG_BASE)
    .in("conversa_id", alvo)
    .gt("created_at", b.desde)
    .order("created_at", { ascending: true })
    .limit(100);

  return NextResponse.json({ mensagens: ((data ?? []) as Record<string, unknown>[]).map(paraMensagem) });
}
