import { NextRequest, NextResponse } from "next/server";
import { getAdminProfile, getProfileForAnyModule } from "@/lib/require-auth";
import { aplicarTurno, listTurnos, removerTurno, salvarTurno } from "@/lib/ponto-turnos";

export const dynamic = "force-dynamic";

// GET /api/ponto/turnos — predefinições de horário da empresa.
export async function GET(req: NextRequest) {
  if (!(await getProfileForAnyModule("administracao", "colaboradores"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const todos = new URL(req.url).searchParams.get("todos") === "1";
  try {
    return NextResponse.json({ turnos: await listTurnos(todos) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST /api/ponto/turnos — cria/edita turno, ou aplica um turno a pessoas.
//   { acao: "aplicar", turnoId, pessoaIds[] }
//   { nome, entrada, saida, almocoInicio?, almocoFim?, trabalhaSabado?, ... }
export async function POST(req: NextRequest) {
  // Mexer em jornada é mexer no que a empresa deve/cobra: só admin.
  if (!(await getAdminProfile())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    if (b.acao === "aplicar") {
      const turnoId = String(b.turnoId ?? "");
      const ids = Array.isArray(b.pessoaIds) ? (b.pessoaIds as unknown[]).map(String) : [];
      if (!turnoId || !ids.length) return NextResponse.json({ error: "invalid" }, { status: 422 });
      return NextResponse.json({ ok: true, atualizadas: await aplicarTurno(turnoId, ids) });
    }

    const nome = String(b.nome ?? "").trim();
    const entrada = String(b.entrada ?? "");
    const saida = String(b.saida ?? "");
    const hora = (v: string) => /^\d{2}:\d{2}$/.test(v);
    if (!nome || !hora(entrada) || !hora(saida)) return NextResponse.json({ error: "invalid" }, { status: 422 });

    // Almoço só vale completo: metade (só a ida) daria um desconto inventado.
    const ai = String(b.almocoInicio ?? ""), af = String(b.almocoFim ?? "");
    const comAlmoco = hora(ai) && hora(af);

    const turno = await salvarTurno({
      id: b.id ? String(b.id) : undefined,
      nome, entrada, saida,
      almocoInicio: comAlmoco ? ai : null,
      almocoFim: comAlmoco ? af : null,
      trabalhaSabado: !!b.trabalhaSabado,
      sabadoEntrada: hora(String(b.sabadoEntrada ?? "")) ? String(b.sabadoEntrada) : null,
      sabadoSaida: hora(String(b.sabadoSaida ?? "")) ? String(b.sabadoSaida) : null,
      ordem: Number(b.ordem ?? 99),
      ativo: b.ativo !== false,
    });
    return NextResponse.json({ ok: true, turno });
  } catch (e) {
    const msg = (e as Error).message;
    if (/relation .* does not exist|Could not find the table/i.test(msg)) {
      return NextResponse.json({ error: "migracao_pendente", action: "rodar supabase/ponto_turnos.sql" }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/ponto/turnos?id=... — desativa (não apaga: gente ficaria órfã).
export async function DELETE(req: NextRequest) {
  if (!(await getAdminProfile())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "invalid" }, { status: 422 });
  try {
    await removerTurno(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
