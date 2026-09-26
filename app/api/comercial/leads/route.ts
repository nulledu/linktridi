import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { papelOuChave } from "@/lib/acesso";
import { listLeads, addLead, removeLead } from "@/lib/comercial";

export const dynamic = "force-dynamic";
const PODE = ["admin", "gerente_vendas", "colaborador"];

export async function GET() {
  const me = await getProfile();
  if (!me || !(await papelOuChave(me, PODE, "comercial"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ leads: await listLeads() });
}

export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await papelOuChave(me, PODE, "comercial"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let b: { telefone?: string; data?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!b.telefone) return NextResponse.json({ error: "missing_telefone" }, { status: 400 });
  const lead = await addLead(b.telefone, b.data ?? null, me.name || me.username);
  if (!lead) return NextResponse.json({ error: "invalid_telefone" }, { status: 400 });
  return NextResponse.json({ lead });
}

export async function DELETE(req: NextRequest) {
  const me = await getProfile();
  if (!me || !(await papelOuChave(me, PODE, "comercial"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  await removeLead(id);
  return NextResponse.json({ ok: true });
}
