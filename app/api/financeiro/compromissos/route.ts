// ── POST /api/financeiro/compromissos ────────────────────────────────────────
// A conta digitada à mão (§6). É o único compromisso que nasce sozinho: os
// outros são consequência de uma compra confirmada, de uma recorrência gerada
// ou da folha, e por isso carregam `idempotency_key`. Aqui, de propósito, não
// existe chave — derivar uma de descrição+valor+vencimento faria a segunda
// metade de um aluguel dividido em dois lançamentos iguais sumir calada.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida } from "@/lib/financeiro/db";
import { centavos, competenciaDe } from "@/lib/financeiro/calculos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** `Date.parse` de ISO recusa 31/02 — a regex sozinha aceitaria. */
const ehDia = (v: unknown): v is string =>
  typeof v === "string" && DIA.test(v) && !Number.isNaN(Date.parse(v));

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** §2: conta e compromisso são da MESMA empresa, senão o saldo da outra mente. */
async function contaDaEmpresa(contaId: string, empresaId: string): Promise<boolean> {
  const { data } = await createSupabaseAdminClient()
    .from("fin_contas")
    .select("id")
    .eq("id", contaId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  return !!data;
}

export async function POST(req: Request) {
  const eu = await apiFinanceiro("compromissos");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const empresaId = texto(corpo.empresa_id);
  if (!(await empresaPermitida(eu.profile.id, empresaId)))
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });

  const descricao = texto(corpo.descricao);
  if (!descricao) return NextResponse.json({ erro: "Escreva a descrição." }, { status: 400 });

  const valor = centavos(Number(corpo.valor));
  if (!Number.isFinite(valor) || valor <= 0)
    return NextResponse.json({ erro: "Informe um valor maior que zero." }, { status: 400 });

  const vencimento = corpo.vencimento;
  if (!ehDia(vencimento))
    return NextResponse.json({ erro: "Vencimento inválido — use AAAA-MM-DD." }, { status: 400 });

  const contaId = texto(corpo.conta_id) || null;
  if (contaId && !(await contaDaEmpresa(contaId, empresaId)))
    return NextResponse.json({ erro: "A conta é de outra empresa." }, { status: 400 });

  const fornecedorId = texto(corpo.fornecedor_id) || null;
  const contatoId = texto(corpo.contato_id) || null;
  if (fornecedorId && contatoId)
    return NextResponse.json({ erro: "Escolha somente um favorecido: fornecedor ou contato." }, { status: 400 });

  const recorrencia = corpo.recorrencia && typeof corpo.recorrencia === "object"
    ? corpo.recorrencia as Record<string, unknown> : null;
  if (recorrencia?.ativa === true) {
    if (!eu.poderes.cadastros)
      return NextResponse.json({ erro: "Falta permissão para criar recorrências." }, { status: 403 });
    const { data, error } = await createSupabaseAdminClient().rpc("fin_criar_compromisso_recorrente", {
      p_entrada: {
        empresa_id: empresaId, descricao, categoria: texto(corpo.categoria) || "outros",
        valor, vencimento, conta_id: contaId, fornecedor_id: fornecedorId, contato_id: contatoId,
        observacao: texto(corpo.observacao) || null,
        periodicidade: texto(recorrencia.periodicidade) || "mensal",
        intervalo_meses: Number(recorrencia.intervalo_meses) || 1,
        dia_vencimento: Number(recorrencia.dia_vencimento) || Number(vencimento.slice(8, 10)),
        fim: texto(recorrencia.fim) || null,
      },
      p_autor: eu.profile.id,
    });
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    const criada = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      ok: true,
      id: (criada as { compromisso_id?: string } | null)?.compromisso_id ?? null,
      recorrencia_id: (criada as { recorrencia_id?: string } | null)?.recorrencia_id ?? null,
    });
  }

  const { data, error } = await createSupabaseAdminClient()
    .from("fin_compromissos")
    .insert({
      empresa_id: empresaId,
      descricao,
      // Categoria é código estável (§14) e o catálogo cresce em código, não no
      // banco: recusar um id desconhecido travaria a edição de compromisso
      // vindo de compra, cuja categoria é de outra lista.
      categoria: texto(corpo.categoria) || "outros",
      valor,
      vencimento,
      competencia: competenciaDe(vencimento),
      // "pendente", nunca "previsto": conta digitada à mão é dívida assumida e
      // precisa aparecer no "a pagar" do mesmo dia em que foi lançada.
      status: "pendente",
      origem: "manual",
      conta_id: contaId,
      fornecedor_id: fornecedorId,
      contato_id: contatoId,
      observacao: texto(corpo.observacao) || null,
      created_by: eu.profile.id,
    })
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  await auditar({
    empresa_id: empresaId, entidade: "compromisso", entidade_id: data?.id ?? null,
    acao: "criar", user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { descricao, valor, vencimento },
  });

  return NextResponse.json({ ok: true, id: data?.id ?? null });
}
