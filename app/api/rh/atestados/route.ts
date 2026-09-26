import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { apiRh } from "@/lib/rh/gate";
import { anotarNoHistorico } from "@/lib/rh/dados";
import { diasEntre, ehAtestadoStatus } from "@/lib/rh/tipos";

export const dynamic = "force-dynamic";

const texto = (v: unknown, max = 200): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
};
const data = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

/** POST — registra um atestado. */
export async function POST(req: Request) {
  const eu = await apiRh("atestados_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const employeeId = texto(corpo.employee_id, 64);
  const de = data(corpo.de);
  const ate = data(corpo.ate);
  if (!employeeId) return NextResponse.json({ erro: "Colaborador não informado." }, { status: 400 });
  if (!de || !ate) return NextResponse.json({ erro: "Informe o período do atestado." }, { status: 400 });
  if (ate < de) return NextResponse.json({ erro: "A data final não pode ser antes da inicial." }, { status: 400 });

  // Os dias vêm do corpo porque nem todo atestado abona o intervalo inteiro
  // (meio período, dia que já era folga). Sem número válido, cai no período —
  // que é o que a tela sugere.
  const enviados = Number(corpo.dias);
  const dias = Number.isFinite(enviados) && enviados >= 0
    ? Math.min(365, Math.round(enviados))
    : diasEntre(de, ate);

  const { data: criado, error } = await createSupabaseAdminClient()
    .from("rh_atestados")
    .insert({
      employee_id: employeeId,
      de, ate, dias,
      emitido_em: data(corpo.emitido_em),
      cid: texto(corpo.cid, 20),
      profissional: texto(corpo.profissional, 160),
      status: "pendente",
      arquivo: null,
      observacao: texto(corpo.observacao, 2000),
      autor_id: eu.profile.id,
      autor_nome: eu.profile.name,
      created_by: eu.profile.id,
    })
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  // O histórico NÃO carrega CID nem observação: ele é a linha do tempo que a
  // aba de histórico mostra, e essa aba abre para quem tem `rh:ver` — sem a
  // chave de atestados. Registrar o diagnóstico ali vazaria pela porta lateral
  // exatamente o que a permissão separada existe para proteger.
  await anotarNoHistorico({
    employee_id: employeeId, tipo: "atestado", titulo: "Atestado registrado",
    detalhe: `${dias} ${dias === 1 ? "dia" : "dias"}`,
    dados: { atestado_id: criado?.id ?? null },
    autor_id: eu.profile.id, autor_nome: eu.profile.name,
  });

  return NextResponse.json({ ok: true, id: criado?.id ?? null });
}

/** PATCH — aceita ou recusa um atestado. */
export async function PATCH(req: Request) {
  const eu = await apiRh("atestados_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const id = texto(corpo.id, 64);
  if (!id) return NextResponse.json({ erro: "Atestado não informado." }, { status: 400 });
  if (!ehAtestadoStatus(corpo.status)) {
    return NextResponse.json({ erro: "Situação inválida para um atestado." }, { status: 400 });
  }
  const status = corpo.status;

  const db = createSupabaseAdminClient();
  const { data: alterado, error } = await db.from("rh_atestados")
    .update({ status, updated_by: eu.profile.id })
    .eq("id", id)
    .select("employee_id,dias")
    .maybeSingle();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!alterado) return NextResponse.json({ erro: "Atestado não encontrado." }, { status: 404 });

  await anotarNoHistorico({
    employee_id: alterado.employee_id,
    tipo: "atestado",
    titulo: status === "aceito" ? "Atestado aceito" : status === "recusado" ? "Atestado recusado" : "Atestado reaberto",
    detalhe: `${alterado.dias} ${alterado.dias === 1 ? "dia" : "dias"}`,
    autor_id: eu.profile.id, autor_nome: eu.profile.name,
  });

  return NextResponse.json({ ok: true });
}

/** DELETE — apaga um atestado. */
export async function DELETE(req: Request) {
  const eu = await apiRh("atestados_editar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ erro: "Atestado não informado." }, { status: 400 });

  const db = createSupabaseAdminClient();
  const { data: antes } = await db.from("rh_atestados")
    .select("employee_id,de,ate").eq("id", id).maybeSingle();

  const { error } = await db.from("rh_atestados").delete().eq("id", id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  if (antes?.employee_id) {
    await anotarNoHistorico({
      employee_id: antes.employee_id, tipo: "atestado", titulo: "Atestado removido",
      autor_id: eu.profile.id, autor_nome: eu.profile.name,
    });
  }

  return NextResponse.json({ ok: true });
}
