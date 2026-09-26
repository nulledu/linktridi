import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { empresaPermitida } from "@/lib/financeiro/db";
import { materializarOcorrencia } from "@/lib/financeiro/materializar-recorrencia";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPETENCIA = /^\d{4}-\d{2}-01$/;

export async function POST(req: Request) {
  const eu = await apiFinanceiro("compromissos");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const empresaId = String(corpo.empresa_id ?? "");
  const recorrenciaId = String(corpo.recorrencia_id ?? "");
  const competencia = String(corpo.competencia ?? "");
  if (!UUID.test(recorrenciaId) || !COMPETENCIA.test(competencia))
    return NextResponse.json({ erro: "Recorrência ou competência inválida." }, { status: 400 });
  if (!(await empresaPermitida(eu.profile.id, empresaId)))
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });

  const r = await materializarOcorrencia(
    empresaId, recorrenciaId, competencia, { id: eu.profile.id, nome: eu.profile.name });
  if (!r.ok) return NextResponse.json({ erro: r.erro ?? "Não deu para lançar." }, { status: 400 });
  return NextResponse.json({ ok: true, id: r.dados?.id ?? null, criado: r.dados?.criado ?? false, jaEstava: r.jaEstava });
}
