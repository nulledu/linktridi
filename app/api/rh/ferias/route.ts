import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { apiRh } from "@/lib/rh/gate";
import { anotarNoHistorico } from "@/lib/rh/dados";
import { SELO_FERIAS, diasEntre, ehFeriasStatus } from "@/lib/rh/tipos";
import { conferirFerias } from "@/lib/jornada/ferias";

export const dynamic = "force-dynamic";

const texto = (v: unknown, max = 200): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
};
const data = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

/** "01/02/2026" a partir do ISO, sem `Date` (fuso não entra na conta). */
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** POST — programa um período de férias. */
export async function POST(req: Request) {
  const eu = await apiRh("ferias_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const employeeId = texto(corpo.employee_id, 64);
  const de = data(corpo.de);
  const ate = data(corpo.ate);
  if (!employeeId) return NextResponse.json({ erro: "Colaborador não informado." }, { status: 400 });
  if (!de || !ate) return NextResponse.json({ erro: "Informe a saída e o retorno." }, { status: 400 });
  if (ate < de) return NextResponse.json({ erro: "O retorno não pode ser antes da saída." }, { status: 400 });

  const enviados = Number(corpo.dias);
  const dias = Number.isFinite(enviados) && enviados >= 0
    ? Math.min(365, Math.round(enviados))
    : diasEntre(de, ate);

  // Dois donos pro mesmo dia é o defeito que esta conferência existe pra
  // impedir: outro período da mesma pessoa, ou uma folga compensatória já
  // aprovada dentro da janela. O cliente já conferiu em
  // `/api/rh/ferias/conflitos` enquanto a pessoa escolhia — conferência de
  // tela é conveniência, a trava é aqui.
  const conf = await conferirFerias({ employeeId, de, ate });
  if (!conf.ok) {
    const bloqueia = conf.conflitos.filter((c) => c.bloqueia);
    return NextResponse.json(
      { erro: bloqueia[0]?.detalhe ?? "Esse período choca com outro registro.", conflitos: conf.conflitos },
      { status: 409 },
    );
  }

  const { data: criado, error } = await createSupabaseAdminClient()
    .from("rh_ferias")
    .insert({
      employee_id: employeeId,
      aquisitivo_de: data(corpo.aquisitivo_de),
      aquisitivo_ate: data(corpo.aquisitivo_ate),
      de, ate, dias,
      status: "programada",
      observacao: texto(corpo.observacao, 2000),
      autor_id: eu.profile.id,
      autor_nome: eu.profile.name,
      created_by: eu.profile.id,
    })
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  await anotarNoHistorico({
    employee_id: employeeId, tipo: "ferias", titulo: "Férias programadas",
    detalhe: `${br(de)} a ${br(ate)} · ${dias} ${dias === 1 ? "dia" : "dias"}`,
    dados: { ferias_id: criado?.id ?? null },
    autor_id: eu.profile.id, autor_nome: eu.profile.name,
  });

  return NextResponse.json({ ok: true, id: criado?.id ?? null, feriados: conf.feriados, conflitos: conf.conflitos });
}

/** PATCH — inicia, conclui ou cancela um período. */
export async function PATCH(req: Request) {
  const eu = await apiRh("ferias_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const id = texto(corpo.id, 64);
  if (!id) return NextResponse.json({ erro: "Período não informado." }, { status: 400 });
  if (!ehFeriasStatus(corpo.status)) {
    return NextResponse.json({ erro: "Situação inválida para um período de férias." }, { status: 400 });
  }
  const status = corpo.status;

  const db = createSupabaseAdminClient();
  const { data: alterado, error } = await db.from("rh_ferias")
    .update({ status, updated_by: eu.profile.id })
    .eq("id", id)
    .select("employee_id,de,ate,dias")
    .maybeSingle();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!alterado) return NextResponse.json({ erro: "Período não encontrado." }, { status: 404 });

  await anotarNoHistorico({
    employee_id: alterado.employee_id, tipo: "ferias",
    titulo: `Férias: ${SELO_FERIAS[status].label.toLowerCase()}`,
    detalhe: `${br(alterado.de)} a ${br(alterado.ate)}`,
    autor_id: eu.profile.id, autor_nome: eu.profile.name,
  });

  return NextResponse.json({ ok: true });
}

/** DELETE — apaga um período de férias. */
export async function DELETE(req: Request) {
  const eu = await apiRh("ferias_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "Período não informado." }, { status: 400 });

  const db = createSupabaseAdminClient();
  const { data: antes } = await db.from("rh_ferias")
    .select("employee_id,de,ate").eq("id", id).maybeSingle();

  const { error } = await db.from("rh_ferias").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  if (antes?.employee_id) {
    await anotarNoHistorico({
      employee_id: antes.employee_id, tipo: "ferias", titulo: "Período de férias removido",
      detalhe: `${br(antes.de)} a ${br(antes.ate)}`,
      autor_id: eu.profile.id, autor_nome: eu.profile.name,
    });
  }

  return NextResponse.json({ ok: true });
}
