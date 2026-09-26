// ── Contas · ajustar saldo (§11) ─────────────────────────────────────────────
// A única forma de o saldo mudar sem uma conta paga por trás. E ela não grava
// saldo nenhum: lança um MOVIMENTO de ajuste, com motivo escrito e assinatura
// de quem fez. O saldo continua sendo a soma — o extrato explica a diferença
// em vez de o número simplesmente amanhecer outro.
//
// Por isso o motivo é obrigatório no `ajustarSaldo()`: um ajuste sem motivo é
// exatamente o que ninguém consegue conferir seis meses depois.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { empresaPermitida } from "@/lib/financeiro/db";
import { ajustarSaldo } from "@/lib/financeiro/escrita";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const eu = await apiFinanceiro("contas");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const empresaId = typeof corpo.empresa_id === "string" ? corpo.empresa_id : "";
  if (!(await empresaPermitida(eu.profile.id, empresaId)))
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });

  const db = createSupabaseAdminClient();
  const { data: conta } = await db.from("fin_contas").select("id,empresa_id,nome").eq("id", id).maybeSingle();
  if (!conta) return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });
  // §2: o gatilho `fin_confere_empresa` também barra, mas em forma de exceção
  // do Postgres. Aqui a pessoa lê o que aconteceu.
  if (conta.empresa_id !== empresaId)
    return NextResponse.json({ erro: "A conta é de outra empresa." }, { status: 403 });

  const r = await ajustarSaldo(
    {
      empresaId,
      contaId: conta.id,
      valor: Number(corpo.valor) || 0,
      motivo: typeof corpo.motivo === "string" ? corpo.motivo : "",
    },
    { id: eu.profile.id, nome: eu.profile.name },
  );

  if (!r.ok) return NextResponse.json({ erro: r.erro ?? "Não deu para ajustar." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
