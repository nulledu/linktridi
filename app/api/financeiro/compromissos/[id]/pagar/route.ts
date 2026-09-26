// ── POST e DELETE /api/financeiro/compromissos/[id]/pagar ────────────────────
// Dar baixa e desfazer a baixa (§6, §16). O trabalho pesado — movimento,
// idempotência, sincronizar a compra de origem, estorno que preserva o
// movimento original — mora em `lib/financeiro/escrita.ts`. Aqui é só o portão:
// quem pode, em qual empresa, com que dados.
//
// A operação repetida volta 200 com `jaEstava: true`, nunca erro. Clique duplo,
// retry de timeout e dois navegadores abertos terminam no MESMO estado, e é
// esse estado que a pessoa pediu — responder "falhou" para uma conta que
// ACABOU de ser paga faz alguém pagar de novo por outro caminho.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { empresaPermitida } from "@/lib/financeiro/db";
import { pagarCompromisso, reverterPagamento } from "@/lib/financeiro/escrita";
import { centavos } from "@/lib/financeiro/calculos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** `Date.parse` de ISO recusa 31/02 — a regex sozinha aceitaria. */
const ehDia = (v: unknown): v is string =>
  typeof v === "string" && DIA.test(v) && !Number.isNaN(Date.parse(v));

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Só a empresa dona da linha: é ela que decide se esta pessoa pode continuar. */
async function empresaDoCompromisso(id: string): Promise<string | null> {
  const { data } = await createSupabaseAdminClient()
    .from("fin_compromissos")
    .select("id,empresa_id")
    .eq("id", id)
    .maybeSingle();
  return (data as { empresa_id: string } | null)?.empresa_id ?? null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const eu = await apiFinanceiro("pagar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const contaId = texto(corpo.conta_id);
  if (!contaId) return NextResponse.json({ erro: "Escolha a conta de onde o dinheiro sai." }, { status: 400 });

  const { id } = await params;
  const empresaId = await empresaDoCompromisso(id);
  if (!empresaId) return NextResponse.json({ erro: "Compromisso não encontrado." }, { status: 404 });
  if (!(await empresaPermitida(eu.profile.id, empresaId)))
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });

  // Valor ausente = paga o valor do compromisso. Valor PRESENTE é pagamento
  // parcial/com desconto e precisa ser um número de verdade.
  let valor: number | undefined;
  if (corpo.valor !== undefined && corpo.valor !== null) {
    valor = centavos(Number(corpo.valor));
    if (!Number.isFinite(valor) || valor <= 0)
      return NextResponse.json({ erro: "Informe um valor maior que zero." }, { status: 400 });
  }

  let data: string | undefined;
  if (corpo.data !== undefined && corpo.data !== null) {
    const quando = corpo.data;
    if (!ehDia(quando))
      return NextResponse.json({ erro: "Data inválida — use AAAA-MM-DD." }, { status: 400 });
    data = quando;
  }

  const r = await pagarCompromisso(
    { compromissoId: id, contaId, valor, data, observacao: texto(corpo.observacao) || undefined },
    { id: eu.profile.id, nome: eu.profile.name },
  );
  if (!r.ok) return NextResponse.json({ erro: r.erro ?? "Não foi possível dar baixa." }, { status: 400 });

  return NextResponse.json({ ok: true, jaEstava: !!r.jaEstava });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const eu = await apiFinanceiro("pagar");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const empresaId = await empresaDoCompromisso(id);
  if (!empresaId) return NextResponse.json({ erro: "Compromisso não encontrado." }, { status: 404 });
  if (!(await empresaPermitida(eu.profile.id, empresaId)))
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });

  const r = await reverterPagamento(id, { id: eu.profile.id, nome: eu.profile.name });
  if (!r.ok) return NextResponse.json({ erro: r.erro ?? "Não foi possível reverter." }, { status: 400 });

  return NextResponse.json({ ok: true, jaEstava: !!r.jaEstava });
}
