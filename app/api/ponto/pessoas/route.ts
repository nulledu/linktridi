import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { listPessoas, criarPessoa, atualizarPessoa, removerPessoa, TabelaAusenteError } from "@/lib/ponto";

export const dynamic = "force-dynamic";

// CRUD de pessoas do Controle de Ponto — só quem acessa Administração.
function erro(e: unknown) {
  if (e instanceof TabelaAusenteError) return NextResponse.json({ error: "tabela_ausente" }, { status: 200 });
  return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
}

// O hash do PIN nunca sai pro painel — só o boolean temPin.
function semPin(p: Awaited<ReturnType<typeof listPessoas>>[number]) {
  const { pinHash, ...resto } = p;
  void pinHash;
  return resto;
}

export async function GET() {
  if (!(await getProfileForAnyModule("administracao", "colaboradores"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ pessoas: (await listPessoas(true)).map(semPin) });
  } catch (e) { return erro(e); }
}

export async function POST(req: NextRequest) {
  if (!(await getProfileForAnyModule("administracao", "colaboradores"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { nome?: string; colaboradorId?: string | null; fotoUrl?: string | null; fotos?: string[]; pin?: string | null; consentimento?: boolean; jornadaMin?: number | null; entradaPrevista?: string | null; saidaPrevista?: string | null; almocoInicio?: string | null; almocoFim?: string | null; turnoId?: string | null };
  if (!b.nome?.trim()) return NextResponse.json({ error: "nome_obrigatorio" }, { status: 400 });
  if (b.pin && !/^\d{4,6}$/.test(b.pin.trim())) return NextResponse.json({ error: "pin_invalido" }, { status: 400 });
  const hhmm = (s: string | null | undefined) => (typeof s === "string" && /^\d{1,2}:\d{2}$/.test(s.trim()) ? s.trim() : null);
  const jm = typeof b.jornadaMin === "number" && b.jornadaMin > 0 ? Math.min(1440, Math.round(b.jornadaMin)) : null;
  try {
    return NextResponse.json({ pessoa: semPin(await criarPessoa({ nome: b.nome, colaboradorId: b.colaboradorId, fotoUrl: b.fotoUrl, fotos: b.fotos, pin: b.pin, consentimento: b.consentimento, jornadaMin: jm, entradaPrevista: hhmm(b.entradaPrevista), saidaPrevista: hhmm(b.saidaPrevista) })) });
  } catch (e) { return erro(e); }
}

export async function PUT(req: NextRequest) {
  if (!(await getProfileForAnyModule("administracao", "colaboradores"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; nome?: string; colaboradorId?: string | null; fotoUrl?: string | null; fotos?: string[]; ativo?: boolean; pin?: string | null; consentimento?: boolean; jornadaMin?: number | null; trabalhaSabado?: boolean; sabadoMin?: number | null; entradaPrevista?: string | null; saidaPrevista?: string | null; almocoInicio?: string | null; almocoFim?: string | null; turnoId?: string | null; estagiario?: boolean };
  if (!b.id) return NextResponse.json({ error: "id_obrigatorio" }, { status: 400 });
  if (b.pin && !/^\d{4,6}$/.test(b.pin.trim())) return NextResponse.json({ error: "pin_invalido" }, { status: 400 });
  const hhmm = (s: string | null | undefined) => (s === null ? null : typeof s === "string" && /^\d{1,2}:\d{2}$/.test(s.trim()) ? s.trim() : undefined);
  try {
    const { descartados } = await atualizarPessoa(b.id, {
      nome: b.nome, colaboradorId: b.colaboradorId, fotoUrl: b.fotoUrl, fotos: b.fotos, ativo: b.ativo, pin: b.pin, consentimento: b.consentimento,
      jornadaMin: b.jornadaMin === undefined ? undefined : (typeof b.jornadaMin === "number" && b.jornadaMin > 0 ? Math.min(1440, Math.round(b.jornadaMin)) : null),
      trabalhaSabado: typeof b.trabalhaSabado === "boolean" ? b.trabalhaSabado : undefined,
      sabadoMin: b.sabadoMin === undefined ? undefined : (typeof b.sabadoMin === "number" && b.sabadoMin > 0 ? Math.min(1440, Math.round(b.sabadoMin)) : null),
      entradaPrevista: hhmm(b.entradaPrevista), saidaPrevista: hhmm(b.saidaPrevista),
      almocoInicio: hhmm(b.almocoInicio), almocoFim: hhmm(b.almocoFim),
      turnoId: b.turnoId === undefined ? undefined : (b.turnoId || null),
      estagiario: typeof b.estagiario === "boolean" ? b.estagiario : undefined,
    });
    // Campos que NÃO persistiram por coluna ausente → avisa (senão o toggle de
    // sábado "salva" de mentira e o banco credita as horas do sábado).
    const aviso = descartados.includes("estagiario")
      ? "Estagiário NÃO foi salvo: rode supabase/ponto_estagiario.sql no Supabase e salve de novo."
      : descartados.some((c) => c === "trabalha_sabado" || c === "sabado_min")
      ? "Sábado NÃO foi salvo: rode supabase/ponto_sabado.sql no Supabase e salve de novo."
      : descartados.some((c) => c.startsWith("almoco") || c === "turno_id")
        ? "Almoço/turno NÃO foram salvos: rode supabase/ponto_turnos.sql no Supabase e salve de novo."
      : descartados.length ? `Campos não salvos (SQL pendente): ${descartados.join(", ")}.` : undefined;
    return NextResponse.json({ ok: true, ...(aviso ? { aviso } : {}) });
  } catch (e) { return erro(e); }
}

export async function DELETE(req: NextRequest) {
  if (!(await getProfileForAnyModule("administracao", "colaboradores"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_obrigatorio" }, { status: 400 });
  try {
    await removerPessoa(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
