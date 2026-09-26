import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule, getAdminProfile } from "@/lib/require-auth";
import { ehSuperusuario } from "@/lib/superusuario";
import { listRegistros, baterPonto, lancarPontoManual, lancarDiaManual, moverRegistro, removerRegistro, TabelaAusenteError } from "@/lib/ponto";
import { resolvePeriod } from "@/lib/period";

export const dynamic = "force-dynamic";

// Registros de ponto (admin): listar por período/pessoa, lançar manual, apagar.
function erro(e: unknown) {
  if (e instanceof TabelaAusenteError) return NextResponse.json({ error: "tabela_ausente" }, { status: 200 });
  return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const me = await getProfileForAnyModule("administracao", "colaboradores");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const r = resolvePeriod(sp.get("period") || "hoje", sp.get("from"), sp.get("to"));
  try {
    const registros = await listRegistros({ from: r.fromIso, to: r.toIso, pessoaId: sp.get("pessoa") });
    // Selfie de batida é dado sensível: SÓ o superusuário recebe o link (e ele
    // aponta pra /api/ponto/selfie, que confere de novo — o bucket é privado).
    // Pros demais gestores a selfie simplesmente não existe na resposta.
    const superuser = ehSuperusuario(me.id, me.username);
    const comSelfie = registros.map((reg) => ({
      ...reg,
      selfieUrl: superuser && reg.selfieUrl
        ? (reg.selfieUrl.startsWith("http") ? reg.selfieUrl : `/api/ponto/selfie?path=${encodeURIComponent(reg.selfieUrl)}`)
        : null,
    }));
    return NextResponse.json({ registros: comSelfie, periodLabel: r.label });
  } catch (e) { return erro(e); }
}

// Lançamento manual (correção): { pessoaId, tipo, dia?, hora? }.
// Com dia+hora → grava naquele instante (SP). Sem → bate agora (comportamento antigo).
export async function POST(req: NextRequest) {
  // Lançar/corrigir batida manual muda as horas → só admin (o kiosk /bater é à parte).
  if (!(await getAdminProfile())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { pessoaId?: string; tipo?: import("@/lib/ponto").TipoBatida; dia?: string; hora?: string; horas?: string[] };
  if (!b.pessoaId) return NextResponse.json({ error: "pessoa_obrigatoria" }, { status: 400 });
  try {
    // Dia inteiro de uma vez: { pessoaId, dia, horas: ["08:00","12:00",…] }.
    if (b.dia && Array.isArray(b.horas)) {
      const criados = await lancarDiaManual({ pessoaId: b.pessoaId, dia: b.dia, horas: b.horas });
      return NextResponse.json({ criados });
    }
    if (b.dia && b.hora) {
      if (!b.tipo) return NextResponse.json({ error: "tipo_obrigatorio" }, { status: 400 });
      const registro = await lancarPontoManual({ pessoaId: b.pessoaId, tipo: b.tipo, dia: b.dia, hora: b.hora });
      return NextResponse.json({ registro });
    }
    const r = await baterPonto({ pessoaId: b.pessoaId, tipo: b.tipo ?? null, origem: "manual" });
    return NextResponse.json(r);
  } catch (e) { return erro(e); }
}

// Corrigir a hora de uma batida existente: { id, dia, hora }. Preserva selfie e
// origem (apagar+relançar perdia as duas).
export async function PATCH(req: NextRequest) {
  if (!(await getAdminProfile())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { id?: string; dia?: string; hora?: string };
  if (!b.id || !b.dia || !b.hora) return NextResponse.json({ error: "id_dia_hora_obrigatorios" }, { status: 400 });
  try {
    return NextResponse.json({ registro: await moverRegistro(b.id, b.dia, b.hora) });
  } catch (e) { return erro(e); }
}

export async function DELETE(req: NextRequest) {
  if (!(await getAdminProfile())) return NextResponse.json({ error: "forbidden" }, { status: 403 });   // só admin
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_obrigatorio" }, { status: 400 });
  try {
    await removerRegistro(id);
    return NextResponse.json({ ok: true });
  } catch (e) { return erro(e); }
}
