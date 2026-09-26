import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { papelOuChave } from "@/lib/acesso";
import { resolvePeriod } from "@/lib/period";
import { pullPedidos, setExtra, donoDoPedido, erpIdDoPerfil } from "@/lib/comercial-pedidos";
import { semForaDoComercial } from "@/lib/comercial-geral";

export const dynamic = "force-dynamic";
const PODE = ["admin", "gerente_vendas", "colaborador"];
// Só admin e gerente de vendas mexem em pedido dos outros.
const PODE_TUDO = ["admin", "gerente_vendas"];

// GET ?period=&from=&to= → pedidos puxados do ERP + responsáveis.
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await papelOuChave(me, PODE, "comercial"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const range = resolvePeriod(sp.get("period"), sp.get("from"), sp.get("to"));
  try {
    // Admin tem "Lançar pedido" sozinho; quem não é vendedor sai da lista.
    const data = semForaDoComercial(await pullPedidos(range));
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}

// PATCH { ref, dias_conversa?, fonte? } → grava campos extras de um pedido.
export async function PATCH(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await papelOuChave(me, PODE, "comercial"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: { ref?: string; dias_conversa?: number | null; fonte?: string | null; ocupacao?: string | null };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!b.ref) return NextResponse.json({ error: "missing_ref" }, { status: 400 });
  // Fora da gestão, só edita o próprio pedido. A checagem é aqui e não só na
  // tela: esconder o campo não impede um PATCH direto na API.
  if (!(await papelOuChave(me, PODE_TUDO))) {
    const [dono, meuErp] = await Promise.all([donoDoPedido(b.ref), erpIdDoPerfil(me.id)]);
    if (!dono || !meuErp || dono !== meuErp) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const patch: { dias_conversa?: number | null; fonte?: string | null; ocupacao?: string | null } = {};
  if (b.dias_conversa !== undefined) patch.dias_conversa = b.dias_conversa == null ? null : Math.max(0, Math.round(Number(b.dias_conversa) || 0));
  if (b.fonte !== undefined) patch.fonte = b.fonte || null;
  if (b.ocupacao !== undefined) patch.ocupacao = b.ocupacao ? String(b.ocupacao).trim() : null;
  await setExtra(b.ref, patch);
  return NextResponse.json({ ok: true });
}
