import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { papelOuChave } from "@/lib/acesso";
import { dispensarAtividade } from "@/lib/producao-dispensa";

export const dynamic = "force-dynamic";

// POST { atividadeId, motivo? } — "não precisa fazer" numa atividade criada
// pela automação. Mesma lista de quem pode apertar "Gerar atividades"
// (/api/estoque/reabastecer): dispensar é a outra metade do mesmo botão.
const PODE = ["admin", "estoquista", "gerente_producao"];

export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await papelOuChave(me, PODE, "estoque:ajustar"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let b: { atividadeId?: string; motivo?: string };
  try { b = await req.json(); } catch {
    return NextResponse.json({ error: "dados_invalidos" }, { status: 400 });
  }
  const r = await dispensarAtividade(
    String(b.atividadeId ?? ""),
    me.name ?? "gestor",
    b.motivo ? String(b.motivo) : null,
  );
  if (!r.ok) return NextResponse.json({ error: "recusado", detalhe: r.erro }, { status: 400 });
  return NextResponse.json({ ok: true });
}
