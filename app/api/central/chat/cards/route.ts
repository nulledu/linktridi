import { NextRequest, NextResponse } from "next/server";
import { falta, meuPapel, naoAutenticado, semAcesso, sessao, temEsquemaNovo } from "@/lib/chat/servidor";
import type { CardContexto } from "@/lib/chat/tipos";

export const dynamic = "force-dynamic";

// "Painel de Atividade Inteligente": as entidades do ERP compartilhadas neste
// canal (atividades, pedidos, tarefas…). É o que diferencia este chat de um
// Slack — a conversa e o sistema são a mesma coisa.
export async function GET(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const canal = req.nextUrl.searchParams.get("canal");
  if (!canal) return falta("canal");
  if (!(await meuPapel(db, canal, me.id))) return semAcesso();
  if (!(await temEsquemaNovo(db))) return NextResponse.json({ cards: [] });

  const { data } = await db.from("central_mensagens")
    .select("id,card,created_at")
    .eq("conversa_id", canal)
    .eq("tipo", "card")
    .is("excluida_em", null)
    .order("created_at", { ascending: false })
    .limit(60);

  type Linha = { id: string; card: CardContexto | null; created_at: string };
  // A mesma atividade compartilhada 5 vezes é UM card no painel, o mais recente.
  const vistos = new Set<string>();
  const cards = ((data ?? []) as Linha[])
    .filter((l) => {
      if (!l.card) return false;
      const chave = `${l.card.tipo}:${l.card.ref}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    })
    .map((l) => ({ mensagem_id: l.id, card: l.card as CardContexto, created_at: l.created_at }));

  return NextResponse.json({ cards });
}
