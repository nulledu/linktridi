import { NextRequest, NextResponse } from "next/server";
import {
  COLS_MSG_BASE, COLS_MSG_NOVO, corpo, jsonInvalido, meusCanais,
  naoAutenticado, paraMensagem, sessao, temEsquemaNovo,
} from "@/lib/chat/servidor";

export const dynamic = "force-dynamic";

// Encaminha N mensagens para N canais. Copia texto, anexos e card — a mensagem
// encaminhada é nova e independente (editar a original não muda a cópia).
export async function POST(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const b = await corpo<{ mensagens?: string[]; canais?: string[]; comentario?: string }>(req);
  if (!b?.mensagens?.length || !b.canais?.length) return jsonInvalido();

  const meus = new Set(await meusCanais(db, me.id));
  const destinos = b.canais.filter((c) => meus.has(c)).slice(0, 10);
  if (!destinos.length) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const novo = await temEsquemaNovo(db);
  const { data } = await db.from("central_mensagens")
    .select(novo ? COLS_MSG_NOVO : COLS_MSG_BASE)
    .in("id", b.mensagens.slice(0, 20));

  // Só posso encaminhar o que eu poderia ler.
  const origem = ((data ?? []) as Record<string, unknown>[])
    .map(paraMensagem)
    .filter((m) => meus.has(m.conversa_id) && !m.excluida_em)
    .sort((a, b2) => a.created_at.localeCompare(b2.created_at));
  if (!origem.length) return NextResponse.json({ ok: true, enviadas: 0 });

  const comentario = (b.comentario ?? "").trim();
  const linhas: Record<string, unknown>[] = [];
  for (const canal of destinos) {
    if (comentario) {
      linhas.push({ conversa_id: canal, autor_id: me.id, autor_nome: me.name ?? null, texto: comentario });
    }
    for (const m of origem) {
      const base: Record<string, unknown> = {
        conversa_id: canal, autor_id: me.id, autor_nome: me.name ?? null,
        texto: m.texto, imagem_url: m.anexos.find((a) => a.mime?.startsWith("image/"))?.url ?? null,
      };
      if (novo) Object.assign(base, {
        tipo: m.card ? "card" : "texto",
        anexos: m.anexos.length ? m.anexos : null,
        card: m.card,
      });
      linhas.push(base);
    }
  }

  const { error } = await db.from("central_mensagens").insert(linhas);
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, enviadas: linhas.length });
}
