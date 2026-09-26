import { NextRequest, NextResponse } from "next/server";
import { hojeISO } from "@/lib/financeiro/calculos";
import { getProfile } from "@/lib/require-auth";
import { papelOuChave } from "@/lib/acesso";
import { listMarketingDias, upsertMarketingDia } from "@/lib/comercial";

export const dynamic = "force-dynamic";

const PODE = ["admin", "gerente_vendas", "colaborador"];

export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await papelOuChave(me, PODE, "comercial"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ dias: await listMarketingDias() });
}

// POST → upsert do lançamento do dia { data, valor_usado, leads }
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await papelOuChave(me, PODE, "comercial"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let b: { data?: string; valor_usado?: number; leads?: number };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const data = typeof b.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.data) ? b.data : hojeISO();

  try {
    await upsertMarketingDia({ data, valor_usado: Number(b.valor_usado) || 0, leads: Number(b.leads) || 0, por_nome: me.name || me.username });
    return NextResponse.json({ ok: true, dia: { data, valor_usado: Number(b.valor_usado) || 0, leads: Math.round(Number(b.leads) || 0) } });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}
