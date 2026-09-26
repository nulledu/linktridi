import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { podeAtividades } from "@/lib/atividades-acesso";
import { voltarPraFila } from "@/lib/atividades-recusadas";

export const dynamic = "force-dynamic";

// POST { id } — Atividades › Recusadas › "Voltar pra fila". Mesma chave do
// código de supervisor (atividades:autorizar): quem libera a recusa no tablet
// é quem decide quando a ordem volta. A lista vem pela página (sem poll).
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await podeAtividades(me, "autorizar"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: { id?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "dados_invalidos" }, { status: 400 }); }
  const id = String(b.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  try {
    const ok = await voltarPraFila(id);
    if (!ok) return NextResponse.json({ error: "recusado", detalhe: "Esta atividade já saiu da fila de recusadas. Recarregue a página." }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "falhou", detalhe: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
