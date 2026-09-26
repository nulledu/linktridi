import { NextRequest, NextResponse } from "next/server";
import {
  COLS_MSG_NOVO, corpo, jsonInvalido, meuPapel, naoAutenticado,
  paraMensagem, semAcesso, sessao, temEsquemaNovo,
} from "@/lib/chat/servidor";

export const dynamic = "force-dynamic";

// GET → "salvos para ler depois", com o nome do canal de origem.
export async function GET() {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  if (!(await temEsquemaNovo(db))) return NextResponse.json({ itens: [] });

  const { data: salvos } = await db.from("central_salvos")
    .select("mensagem_id").eq("user_id", me.id)
    .order("created_at", { ascending: false }).limit(100);
  const ids: string[] = ((salvos ?? []) as { mensagem_id: string }[]).map((x) => x.mensagem_id);
  if (!ids.length) return NextResponse.json({ itens: [] });

  const { data: msgs } = await db.from("central_mensagens").select(COLS_MSG_NOVO).in("id", ids);
  const mensagens = ((msgs ?? []) as Record<string, unknown>[]).map(paraMensagem);

  const { data: convs } = await db.from("central_conversas")
    .select("id,nome,tipo").in("id", [...new Set(mensagens.map((m) => m.conversa_id))]);
  type Conv = { id: string; nome: string | null; tipo: string };
  const nome = new Map<string, string>(((convs ?? []) as Conv[]).map((c) =>
    [c.id, c.nome || (c.tipo === "direta" ? "Conversa" : "Canal")]));

  // Mantém a ordem de quando foi salvo, não a da mensagem original.
  const porId = new Map(mensagens.map((m) => [m.id, m]));
  const itens = ids
    .map((id) => porId.get(id))
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map((m) => ({ mensagem: m, canal: nome.get(m.conversa_id) ?? "Canal" }));
  return NextResponse.json({ itens });
}

// POST { mensagem_id, salvar } → marca/desmarca.
export async function POST(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const b = await corpo<{ mensagem_id?: string; salvar?: boolean }>(req);
  if (!b?.mensagem_id) return jsonInvalido();

  const { data: msg } = await db.from("central_mensagens").select("conversa_id").eq("id", b.mensagem_id).maybeSingle();
  if (!msg) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await meuPapel(db, (msg as { conversa_id: string }).conversa_id, me.id))) return semAcesso();

  if (b.salvar === false) {
    await db.from("central_salvos").delete().eq("user_id", me.id).eq("mensagem_id", b.mensagem_id);
  } else {
    await db.from("central_salvos")
      .upsert({ user_id: me.id, mensagem_id: b.mensagem_id }, { onConflict: "user_id,mensagem_id" });
  }
  return NextResponse.json({ ok: true });
}
