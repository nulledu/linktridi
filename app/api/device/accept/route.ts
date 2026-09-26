import { NextRequest, NextResponse } from "next/server";
import { autenticarDevice } from "@/lib/device";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { notificar } from "@/lib/notificacoes";

export const dynamic = "force-dynamic";

const colunaAusente = (msg: string | undefined) => !!msg && /column .* does not exist|Could not find the .* column/i.test(msg);

// POST /api/device/accept  { atividade_id, colaborador_id }
// A pessoa ACEITOU a ordem no tablet → começa a contar o tempo (iniciada_at = agora).
// Idempotente: se já começou, devolve como está. Só o dono pode aceitar.
export async function POST(req: NextRequest) {
  const auth = await autenticarDevice(req.headers.get("x-device-token"));
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  let b: { atividade_id?: string; colaborador_id?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const id = String(b.atividade_id || "");
  const colaborador = String(b.colaborador_id || "");
  if (!id || !colaborador) return NextResponse.json({ error: "missing_fields" }, { status: 400 });

  const db = createSupabaseAdminClient();
  const now = new Date().toISOString();
  // Inicia o relógio (e passa pra em_andamento, cobrindo dirigidas pendentes) só se
  // ainda não começou (iniciada_at null) e é do dono.
  const doUpdate = (patch: Record<string, unknown>) => db.from("atividades")
    .update({ status: "em_andamento", ...patch }).eq("id", id).eq("para_id", colaborador).is("iniciada_at", null)
    .select("*").maybeSingle();

  let { data, error } = await doUpdate({ iniciada_at: now, aceita_at: now });
  if (error && colunaAusente(error.message)) ({ data, error } = await doUpdate({ iniciada_at: now }));
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });

  // Se não atualizou (já tinha começado), devolve o estado atual.
  if (!data) {
    const { data: atual } = await db.from("atividades").select("*").eq("id", id).maybeSingle();
    return NextResponse.json({ atividade: atual, ja_aceita: true });
  }

  // Avisa quem atribuiu (dirigida): "Fulano aceitou a atividade X".
  const a = data as { por_id?: string | null; para_nome?: string | null; tarefa?: string | null; pool?: boolean | null };
  if (a.por_id && a.pool !== true) {
    await notificar({ user_id: a.por_id, tipo: "tarefa", titulo: "Atividade aceita", corpo: `${a.para_nome || "Alguém"} aceitou: ${a.tarefa || ""}`, link: "/atividades", de_nome: a.para_nome || undefined }).catch(() => {});
  }
  return NextResponse.json({ atividade: data });
}
