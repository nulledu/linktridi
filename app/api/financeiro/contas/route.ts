// ── Contas · cadastro (§11) ──────────────────────────────────────────────────
// Banco, gateway, cartão e carteira. O que se cadastra aqui é a CONTA; o saldo
// dela não é campo nenhum desta rota — sai da view `fin_contas_saldo`, que soma
// o `saldo_inicial` com os movimentos confirmados.
//
// `saldo_inicial` é a única entrada de dinheiro que não é movimento, e por isso
// só faz sentido no nascimento da conta: é "quanto já tinha lá no dia em que
// comecei a controlar". Depois disso, quem corrige saldo é `/contas/[id]/ajustar`.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, comTolerancia, empresaPermitida } from "@/lib/financeiro/db";
import { centavos } from "@/lib/financeiro/calculos";
import { CONTA_TIPOS } from "@/lib/financeiro/tipos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { camposNovosDaConta } from "@/lib/financeiro/campos-novos";

export const dynamic = "force-dynamic";

const TIPO_OK = new Set<string>(CONTA_TIPOS);

const texto = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

const dia = (v: unknown): number | null => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : null;
};

export async function POST(req: Request) {
  const eu = await apiFinanceiro("contas");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const empresaId = typeof corpo.empresa_id === "string" ? corpo.empresa_id : "";
  if (!(await empresaPermitida(eu.profile.id, empresaId)))
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });

  const nome = texto(corpo.nome);
  if (!nome) return NextResponse.json({ erro: "Dê um nome à conta." }, { status: 400 });

  const tipo = TIPO_OK.has(String(corpo.tipo)) ? String(corpo.tipo) : "banco";
  // Cartão de crédito nasce FORA do saldo disponível: o que ele mostra é limite
  // a gastar, não dinheiro que existe. Somar os dois no mesmo número é como um
  // caixa de R$ 40 mil vira R$ 55 mil sem ninguém ter recebido nada.
  const incluiNoSaldo = typeof corpo.inclui_no_saldo === "boolean"
    ? corpo.inclui_no_saldo : tipo !== "cartao";

  const saldoInicial = centavos(Number(corpo.saldo_inicial) || 0);

  const db = createSupabaseAdminClient();
  const { data, error } = await comTolerancia(
    async (extras) =>
      (await db
        .from("fin_contas")
        .insert({
          ...extras,
          empresa_id: empresaId,
          nome,
          tipo,
          instituicao: texto(corpo.instituicao),
          agencia: texto(corpo.agencia),
          numero: texto(corpo.numero),
          saldo_inicial: saldoInicial,
          inclui_no_saldo: incluiNoSaldo,
          fechamento_dia: dia(corpo.fechamento_dia),
          vencimento_dia: dia(corpo.vencimento_dia),
          cor: texto(corpo.cor),
          ordem: Number.isFinite(Number(corpo.ordem)) ? Math.round(Number(corpo.ordem)) : 0,
          ativa: corpo.ativa === false ? false : true,
          created_by: eu.profile.id,
        })
        .select("id")
        .maybeSingle()) as {
          data: { id: string } | null;
          error: { code?: string; message?: string } | null;
        },
    camposNovosDaConta(corpo),
  );

  if (error || !data) return NextResponse.json({ erro: error?.message ?? "Não deu para salvar." }, { status: 400 });

  await auditar({
    empresa_id: empresaId, entidade: "conta", entidade_id: data.id, acao: "criar",
    user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { nome, tipo, saldo_inicial: saldoInicial, inclui_no_saldo: incluiNoSaldo },
  });

  return NextResponse.json({ ok: true, id: data.id });
}
