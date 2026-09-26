import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { preencherMesCerto } from "@/lib/ponto";
import { mesAtualSp } from "@/lib/banco-horas";

export const dynamic = "force-dynamic";

// POST { mes?:"YYYY-MM" } — "sete certinho": zera o mês e marca todo mundo como
// tendo cumprido a jornada em cada dia útil (até hoje). Só admin.
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me || me.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { mes?: string };
  const mes = b.mes && /^\d{4}-\d{2}$/.test(b.mes) ? b.mes : mesAtualSp();
  try {
    return NextResponse.json(await preencherMesCerto(mes));
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
