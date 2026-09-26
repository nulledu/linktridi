import { NextRequest, NextResponse } from "next/server";
import { gateContingencia } from "../../contingencia/_gate";
import { marcarEtapas, desmarcarEtapa } from "@/lib/marketing-aquecimento";

export const dynamic = "force-dynamic";

const DIA = /^\d{4}-\d{2}-\d{2}$/;
// Teto do lote. Marcar a fila inteira do dia de uma vez é o caso normal; acima
// disso é engano (ou script), e um insert sem teto é um jeito de derrubar o banco.
const MAX_LOTE = 200;

// POST — marca etapas cumpridas EM LOTE. Seis chips no mesmo "dia 7 — 20 conversas"
// é UMA chamada: obrigar seis requisições seria obrigar seis gavetas na tela.
export async function POST(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const profile = g.profile;
  const b = await req.json().catch(() => null) as { itens?: unknown; feitoEm?: unknown } | null;
  if (!b || !Array.isArray(b.itens)) {
    return NextResponse.json({ ok: false, error: "json_invalido" }, { status: 400 });
  }
  const itens = (b.itens as Record<string, unknown>[])
    .map((i) => ({ ativoId: String(i.ativoId ?? ""), etapaId: String(i.etapaId ?? "") }))
    .filter((i) => i.ativoId && i.etapaId);
  if (!itens.length) return NextResponse.json({ ok: false, error: "lote_vazio" }, { status: 422 });
  if (itens.length > MAX_LOTE) return NextResponse.json({ ok: false, error: "lote_grande" }, { status: 422 });

  const feitoEm = DIA.test(String(b.feitoEm ?? "")) ? String(b.feitoEm) : undefined;
  try {
    const n = await marcarEtapas({ id: profile.id, nome: profile.name }, itens, feitoEm);
    return NextResponse.json({ ok: true, marcados: n });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "marcar_error" }, { status: 500 });
  }
}

// DELETE — desmarca uma etapa (marcou errado). Fica no log: desfazer é um fato
// do histórico, não um apagamento silencioso.
export async function DELETE(req: NextRequest) {
  const g = await gateContingencia();
  if (!g.ok) return g.res;
  const profile = g.profile;
  const q = req.nextUrl.searchParams;
  const ativoId = q.get("ativoId") || "";
  const etapaId = q.get("etapaId") || "";
  if (!ativoId || !etapaId) return NextResponse.json({ ok: false, error: "faltam_ids" }, { status: 422 });
  try {
    await desmarcarEtapa({ id: profile.id, nome: profile.name }, ativoId, etapaId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "desmarcar_error" }, { status: 500 });
  }
}
