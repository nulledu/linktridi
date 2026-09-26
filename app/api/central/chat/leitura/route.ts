import { NextRequest, NextResponse } from "next/server";
import {
  corpo, falta, jsonInvalido, meuPapel, naoAutenticado, perfisDe, semAcesso, sessao, temEsquemaNovo,
} from "@/lib/chat/servidor";
import type { Pessoa } from "@/lib/chat/tipos";

export const dynamic = "force-dynamic";

// POST → marca o canal como lido. Chamada só quando a pessoa REALMENTE viu algo
// novo; nunca a cada tick de poll (escrita dentro de poll foi o que estourou o
// egress no passado).
export async function POST(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const b = await corpo<{ canal_id?: string; ultima_msg_id?: string | null }>(req);
  if (!b?.canal_id) return jsonInvalido();
  if (!(await meuPapel(db, b.canal_id, me.id))) return semAcesso();

  const novo = await temEsquemaNovo(db);
  const registro: Record<string, unknown> = {
    conversa_id: b.canal_id, user_id: me.id, lido_em: new Date().toISOString(),
  };
  if (novo && b.ultima_msg_id) registro.ultima_msg_id = b.ultima_msg_id;

  await db.from("central_leituras").upsert(registro, { onConflict: "conversa_id,user_id" });
  // Abrir o canal apaga o sino das mensagens dele.
  try {
    await db.from("notificacoes").update({ lida: true })
      .eq("user_id", me.id).eq("tipo", "mensagem").eq("lida", false);
  } catch { /* tabela ausente */ }
  return NextResponse.json({ ok: true });
}

// GET ?canal=&msg= → quem já leu até esta mensagem ("visto por").
export async function GET(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const canal = req.nextUrl.searchParams.get("canal");
  const msgId = req.nextUrl.searchParams.get("msg");
  if (!canal || !msgId) return falta("parametro");
  if (!(await meuPapel(db, canal, me.id))) return semAcesso();

  const { data: msg } = await db.from("central_mensagens").select("created_at").eq("id", msgId).maybeSingle();
  if (!msg) return NextResponse.json({ leitores: [] });
  const carimbo = (msg as { created_at: string }).created_at;

  const { data } = await db.from("central_leituras")
    .select("user_id,lido_em").eq("conversa_id", canal).gte("lido_em", carimbo).limit(200);
  const ids: string[] = ((data ?? []) as { user_id: string }[]).map((l) => l.user_id).filter((id) => id !== me.id);
  const perfis = await perfisDe(db, ids);
  const leitores: Pessoa[] = ids.map((id) => ({
    id, name: perfis[id]?.nome ?? "—", avatar: perfis[id]?.avatar ?? null, setor: null,
  }));
  return NextResponse.json({ leitores });
}
