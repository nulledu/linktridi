// ── Recorrências · cadastro (§10) ────────────────────────────────────────────
// A regra NÃO é uma conta a pagar: é a receita de onde as contas saem. Quem
// vence, atrasa e é pago é o compromisso que `/recorrencias/gerar` cria a
// partir daqui.
//
// `proxima_competencia` é o "onde parei" do gerador, e é o único campo desta
// tela que não descreve o contrato com o fornecedor. Ele é derivado do início
// quando o cliente não manda: o gerador até sabe cair no `inicio` sozinho, mas
// gravado ele fica VISÍVEL — e a próxima geração deixa de ser adivinhação de
// quem lê a linha.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, comTolerancia, empresaPermitida } from "@/lib/financeiro/db";
import { centavos, competenciaDe, hojeISO } from "@/lib/financeiro/calculos";
import { PERIODICIDADES, RECORRENCIA_STATUS } from "@/lib/financeiro/tipos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { camposNovosDaRecorrencia } from "@/lib/financeiro/campos-novos";

export const dynamic = "force-dynamic";

const PERIODICIDADE_OK = new Set<string>(PERIODICIDADES);
const STATUS_OK = new Set<string>(RECORRENCIA_STATUS);

const texto = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

const ehData = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

const uuid = (v: unknown): string | null => (typeof v === "string" && v.length >= 32 ? v : null);

/** Fora da faixa vira a borda, não erro: dia 45 é dia 31, e o `diaSeguro` do
 *  gerador ainda corta pro último dia que o mês tem. */
const naFaixa = (v: unknown, min: number, max: number, padrao: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : padrao;
};

export async function POST(req: Request) {
  const eu = await apiFinanceiro("cadastros");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const empresaId = typeof corpo.empresa_id === "string" ? corpo.empresa_id : "";
  if (!(await empresaPermitida(eu.profile.id, empresaId)))
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });

  const descricao = texto(corpo.descricao);
  if (!descricao) return NextResponse.json({ erro: "Escreva o que é esta recorrência." }, { status: 400 });

  const valor = centavos(Number(corpo.valor) || 0);
  if (valor <= 0) return NextResponse.json({ erro: "Informe um valor maior que zero." }, { status: 400 });

  const inicio = ehData(corpo.inicio) ? corpo.inicio : hojeISO();
  const fim = ehData(corpo.fim) ? corpo.fim : null;
  if (fim && fim < inicio)
    return NextResponse.json({ erro: "O fim não pode ser antes do início." }, { status: 400 });

  const periodicidade = PERIODICIDADE_OK.has(String(corpo.periodicidade))
    ? String(corpo.periodicidade) : "mensal";

  const db = createSupabaseAdminClient();
  const lancarPrimeira = corpo.lancar_primeira === true;
  if (lancarPrimeira) {
    if (!eu.poderes.compromissos)
      return NextResponse.json({ erro: "Falta permissão para lançar compromissos." }, { status: 403 });
    const fornecedorId = uuid(corpo.fornecedor_id);
    const contatoId = uuid(corpo.contato_id);
    if (fornecedorId && contatoId)
      return NextResponse.json({ erro: "Escolha somente um favorecido: fornecedor ou contato." }, { status: 400 });
    const { data, error } = await db.rpc("fin_criar_compromisso_recorrente", {
      p_entrada: {
        empresa_id: empresaId, descricao, categoria: texto(corpo.categoria) ?? "outros", valor,
        vencimento: inicio, periodicidade,
        intervalo_meses: naFaixa(corpo.intervalo_meses, 1, 60, 1),
        dia_vencimento: naFaixa(corpo.dia_vencimento, 1, 31, Number(inicio.slice(8, 10))),
        conta_id: uuid(corpo.conta_id), fornecedor_id: fornecedorId, contato_id: contatoId,
        fim, observacao: texto(corpo.observacao),
      },
      p_autor: eu.profile.id,
    });
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });
    const criada = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      ok: true,
      id: (criada as { recorrencia_id?: string } | null)?.recorrencia_id ?? null,
      compromisso_id: (criada as { compromisso_id?: string } | null)?.compromisso_id ?? null,
    });
  }
  const { data, error } = await comTolerancia(
    async (extras) =>
      (await db
        .from("fin_recorrencias")
        .insert({
          ...extras,
          empresa_id: empresaId,
          descricao,
          categoria: texto(corpo.categoria) ?? "outros",
          valor,
          periodicidade,
          intervalo_meses: naFaixa(corpo.intervalo_meses, 1, 60, 1),
          // Sem dia informado, o dia do início: é o que a pessoa combinou com o
          // fornecedor, e evita uma assinatura que começa dia 20 vencer todo dia 1º.
          dia_vencimento: naFaixa(corpo.dia_vencimento, 1, 31, Number(inicio.slice(8, 10))),
          conta_id: uuid(corpo.conta_id),
          fornecedor_id: uuid(corpo.fornecedor_id),
          inicio,
          fim,
          proxima_competencia: competenciaDe(ehData(corpo.proxima_competencia) ? corpo.proxima_competencia : inicio),
          status: STATUS_OK.has(String(corpo.status)) ? String(corpo.status) : "ativa",
          observacao: texto(corpo.observacao),
          created_by: eu.profile.id,
        })
        .select("id")
        .maybeSingle()) as {
          data: { id: string } | null;
          error: { code?: string; message?: string } | null;
        },
    camposNovosDaRecorrencia(corpo),
  );

  if (error || !data) return NextResponse.json({ erro: error?.message ?? "Não deu para salvar." }, { status: 400 });

  await auditar({
    empresa_id: empresaId, entidade: "recorrencia", entidade_id: data.id, acao: "criar",
    user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { descricao, valor, periodicidade, inicio, fim },
  });

  return NextResponse.json({ ok: true, id: data.id });
}
