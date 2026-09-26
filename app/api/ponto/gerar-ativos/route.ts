import { NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { gerarPontoDosAtivos } from "@/lib/ponto";

export const dynamic = "force-dynamic";

// POST /api/ponto/gerar-ativos — cria/vincula uma pessoa de ponto pra cada
// usuário ATIVO do sistema. Só admin. Idempotente (pode rodar de novo).
export async function POST() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await gerarPontoDosAtivos());
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
