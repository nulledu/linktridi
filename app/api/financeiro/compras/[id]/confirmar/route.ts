// ── Compras: confirmar (§7, §16) ─────────────────────────────────────────────
// O momento em que a compra deixa de ser papel e entra na agenda: nascem as
// parcelas e os compromissos correspondentes.
//
// Repetir esta chamada é seguro de propósito — `confirmarCompra` grava com
// chave determinística por parcela, então o clique duplo, o retry do celular
// sem sinal e a compra que já estava confirmada terminam todos com o mesmo
// número de compromissos.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { empresaPermitida } from "@/lib/financeiro/db";
import { confirmarCompra } from "@/lib/financeiro/escrita";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const db = () => createSupabaseAdminClient();

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const eu = await apiFinanceiro("compras");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const { data: compra } = await db()
    .from("fin_compras")
    .select("id,empresa_id,status,deleted_at")
    .eq("id", id)
    .maybeSingle();

  const linha = compra as { id: string; empresa_id: string; status: string; deleted_at: string | null } | null;
  if (!linha || linha.deleted_at) return NextResponse.json({ erro: "Compra não encontrada." }, { status: 404 });
  if (!(await empresaPermitida(eu.profile.id, linha.empresa_id)))
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });

  const r = await confirmarCompra(linha.id, { id: eu.profile.id, nome: eu.profile.name });
  if (!r.ok) return NextResponse.json({ erro: r.erro ?? "Não foi possível confirmar a compra." }, { status: 400 });

  return NextResponse.json({ ok: true, compromissos: r.dados?.compromissos ?? 0 });
}
