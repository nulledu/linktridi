import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { listFeriados, addFeriado, removeFeriado } from "@/lib/ponto";

export const dynamic = "force-dynamic";

// Portão do painel de Ponto: quem tem Configurações OU Colaboradores (é de
// dentro de Colaboradores que o painel abre). Era o papel "admin" — com a área
// liberada na grade, o painel montava e cada aba voltava 403.
async function admin() { return getProfileForAnyModule("administracao", "colaboradores"); }

// GET ?mes=YYYY-MM  → feriados do mês
export async function GET(req: NextRequest) {
  if (!(await admin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const mes = req.nextUrl.searchParams.get("mes") || undefined;
  return NextResponse.json({ feriados: await listFeriados(mes && /^\d{4}-\d{2}$/.test(mes) ? mes : undefined) });
}

// POST { dia:"YYYY-MM-DD", descricao?, tipo?:"folga"|"troca" } → marca feriado
// (o mesmo dia marcado de novo com outro tipo só troca o tipo)
export async function POST(req: NextRequest) {
  if (!(await admin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { dia?: string; descricao?: string | null; tipo?: string | null };
  if (!b.dia || !/^\d{4}-\d{2}-\d{2}$/.test(b.dia)) return NextResponse.json({ error: "dia_invalido" }, { status: 400 });
  const tipo = b.tipo === "troca" ? "troca" : "folga";
  try { await addFeriado(b.dia, (b.descricao || "").trim() || null, tipo); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 }); }
}

// DELETE ?dia=YYYY-MM-DD → desmarca
export async function DELETE(req: NextRequest) {
  if (!(await admin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dia = req.nextUrl.searchParams.get("dia") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return NextResponse.json({ error: "dia_invalido" }, { status: 400 });
  try { await removeFeriado(dia); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 }); }
}
