// ── Compras: editar e cancelar (§7, §19) ─────────────────────────────────────
// Duas portas, dois pesos. Enquanto a compra é RASCUNHO ela é só um papel: dá
// para mudar tudo e dá para apagar. Depois de confirmada ela virou dívida na
// agenda de outra pessoa, e as duas operações mudam de natureza — editar passa
// a ter limite, e apagar deixa de existir.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida } from "@/lib/financeiro/db";
import { centavos } from "@/lib/financeiro/calculos";
import { PLANOS, type Plano } from "@/lib/financeiro/tipos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const db = () => createSupabaseAdminClient();

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const ehDia = (v: unknown): v is string => typeof v === "string" && DIA.test(v);
const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

interface Linha {
  id: string; empresa_id: string; descricao: string; status: string;
  valor_total: number; plano: string; parcelas: number; deleted_at: string | null;
}

/** §17: o `id` da URL é o cliente falando. A empresa vem da LINHA, nunca do corpo. */
async function carregar(id: string): Promise<Linha | null> {
  const { data } = await db()
    .from("fin_compras")
    .select("id,empresa_id,descricao,status,valor_total,plano,parcelas,deleted_at")
    .eq("id", id)
    .maybeSingle();
  return (data as Linha) ?? null;
}

// Campos que definem o plano de pagamento — os que a confirmação já traduziu em
// compromissos.
const CAMPOS_DO_PLANO = ["valor_total", "plano", "parcelas", "prazo_dias", "primeiro_vencimento"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const eu = await apiFinanceiro("compras");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const compra = await carregar(id);
  if (!compra || compra.deleted_at) return NextResponse.json({ erro: "Compra não encontrada." }, { status: 404 });
  if (!(await empresaPermitida(eu.profile.id, compra.empresa_id)))
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  if (compra.status === "cancelada")
    return NextResponse.json({ erro: "Compra cancelada não pode ser editada." }, { status: 409 });

  const patch: Record<string, unknown> = {};
  if (corpo.descricao !== undefined) {
    const d = texto(corpo.descricao);
    if (!d) return NextResponse.json({ erro: "Descreva a compra." }, { status: 400 });
    patch.descricao = d;
  }
  if (corpo.fornecedor_id !== undefined) patch.fornecedor_id = texto(corpo.fornecedor_id) || null;
  if (corpo.conta_id !== undefined) patch.conta_id = texto(corpo.conta_id) || null;
  if (corpo.categoria !== undefined) patch.categoria = texto(corpo.categoria) || "outros";
  if (corpo.data !== undefined && ehDia(corpo.data)) patch.data = corpo.data;
  if (corpo.observacao !== undefined) patch.observacao = texto(corpo.observacao) || null;
  if (corpo.gera_patrimonio !== undefined) patch.gera_patrimonio = corpo.gera_patrimonio === true;

  if (corpo.valor_total !== undefined) {
    const v = centavos(numero(corpo.valor_total));
    if (v < 0) return NextResponse.json({ erro: "O valor não pode ser negativo." }, { status: 400 });
    patch.valor_total = v;
  }
  if (corpo.plano !== undefined && (PLANOS as readonly string[]).includes(texto(corpo.plano)))
    patch.plano = texto(corpo.plano) as Plano;
  if (corpo.parcelas !== undefined)
    patch.parcelas = Math.min(Math.max(Math.floor(numero(corpo.parcelas) || 1), 1), 120);
  if (corpo.prazo_dias !== undefined)
    patch.prazo_dias = corpo.prazo_dias == null ? null : Math.max(0, Math.floor(numero(corpo.prazo_dias)));
  if (corpo.primeiro_vencimento !== undefined)
    patch.primeiro_vencimento = ehDia(corpo.primeiro_vencimento) ? corpo.primeiro_vencimento : null;

  // Mexer no plano de uma compra confirmada não refaz as parcelas: os
  // compromissos já estão na agenda, e a compra passaria a valer um número que
  // nenhuma delas soma. Cancelar e refazer é mais longo e é o único caminho que
  // deixa a agenda e a compra contando a mesma história.
  if (compra.status !== "rascunho" && CAMPOS_DO_PLANO.some((c) => c in patch)) {
    return NextResponse.json({
      erro: "Compra já confirmada: valor e parcelamento viraram compromissos. Cancele e refaça para mudar.",
    }, { status: 409 });
  }

  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });

  patch.updated_by = eu.profile.id;
  const { error } = await db().from("fin_compras").update(patch).eq("id", compra.id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  await auditar({
    empresa_id: compra.empresa_id, entidade: "compra", entidade_id: compra.id,
    acao: "editar", user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: {
      antes: { valor_total: compra.valor_total, plano: compra.plano, parcelas: compra.parcelas },
      depois: patch,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const eu = await apiFinanceiro("compras");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const compra = await carregar(id);
  if (!compra || compra.deleted_at) return NextResponse.json({ erro: "Compra não encontrada." }, { status: 404 });
  if (!(await empresaPermitida(eu.profile.id, compra.empresa_id)))
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });

  if (compra.status === "rascunho") {
    const { error } = await db()
      .from("fin_compras")
      .update({ deleted_at: new Date().toISOString(), updated_by: eu.profile.id })
      .eq("id", compra.id);
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

    await auditar({
      empresa_id: compra.empresa_id, entidade: "compra", entidade_id: compra.id,
      acao: "excluir-rascunho", user_id: eu.profile.id, user_nome: eu.profile.name,
      dados: { descricao: compra.descricao, valor_total: compra.valor_total },
    });
    return NextResponse.json({ ok: true, cancelados: 0 });
  }

  if (compra.status === "cancelada") return NextResponse.json({ ok: true, jaEstava: true, cancelados: 0 });

  // Os filhos caem ANTES do pai. Cancelar a compra primeiro e falhar aqui
  // deixaria a compra fora da tela com a dívida viva na agenda — e sem a compra
  // ninguém mais descobre de onde aquela parcela veio. Parcela já paga fica
  // paga: o dinheiro saiu de verdade (§19).
  const { data: cancelados, error: erroCompromissos } = await db()
    .from("fin_compromissos")
    .update({ status: "cancelado", updated_by: eu.profile.id })
    .eq("origem", "compra")
    .eq("origem_id", compra.id)
    .not("status", "in", "(pago,cancelado)")
    .select("id");
  if (erroCompromissos) return NextResponse.json({ erro: erroCompromissos.message }, { status: 500 });

  const { error } = await db()
    .from("fin_compras")
    .update({ status: "cancelada", updated_by: eu.profile.id })
    .eq("id", compra.id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const quantos = (cancelados as { id: string }[] | null)?.length ?? 0;
  await auditar({
    empresa_id: compra.empresa_id, entidade: "compra", entidade_id: compra.id,
    acao: "cancelar", user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { status_anterior: compra.status, valor_total: compra.valor_total, compromissos_cancelados: quantos },
  });

  return NextResponse.json({ ok: true, cancelados: quantos });
}
