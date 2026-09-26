import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, comTolerancia, empresaPermitida } from "@/lib/financeiro/db";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { centavos } from "@/lib/financeiro/calculos";
import { COLABORADOR_STATUS, type ColaboradorStatus } from "@/lib/financeiro/tipos";

// ── Folha · cadastrar pessoa (§13) ───────────────────────────────────────────
// Esta rota é a única do Financeiro atrás de `financeiro:folha`, e é assim de
// propósito: salário é o dado mais sensível do módulo. Quem tem o resto do
// Financeiro vê o TOTAL da folha na Visão Geral (`folhaTotal` em db.ts) e nunca
// o valor de ninguém — devolver a lista e esconder no React não adiantaria,
// porque os salários já teriam viajado até o navegador.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id só passa se for uuid: texto solto chega no Postgres como 22P02, um 500 que não explica nada. */
const ref = (v: unknown): string | null => (UUID.test(String(v ?? "")) ? String(v).trim() : null);

const texto = (v: unknown): string | null => String(v ?? "").trim() || null;

const dataISO = (v: unknown): string | null =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v).slice(0, 10) : null;

const dinheiro = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, centavos(n)) : 0;
};

/** O banco tem `check (dia_pagamento between 1 and 31)`: fora disso vira 23514, um 500 sem explicação. */
const diaDoMes = (v: unknown): number | null => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : null;
};

const umDe = <T extends string>(lista: readonly T[], v: unknown, padrao: T): T =>
  lista.includes(v as T) ? (v as T) : padrao;

/**
 * O que entrou DEPOIS do primeiro `financeiro.sql`.
 *
 * Separado do resto porque o dono roda o SQL à mão: entre o deploy do código e
 * a colagem no SQL Editor existe uma janela em que estas colunas não existem, e
 * mandá-las junto derrubaria o cadastro inteiro num PGRST204. Quem escreve
 * tenta COM elas e, se o banco recusar por coluna ausente, repete sem — a
 * pessoa é cadastrada e o dado extra entra quando o SQL rodar.
 */
function camposNovos(corpo: Record<string, unknown>): Record<string, unknown> {
  const campos: Record<string, unknown> = {};
  if (corpo.gratificacao !== undefined) campos.gratificacao = dinheiro(corpo.gratificacao);
  if (corpo.valor_hora !== undefined) campos.valor_hora = dinheiro(corpo.valor_hora);
  if (corpo.vinculo !== undefined) campos.vinculo = typeof corpo.vinculo === "string" && corpo.vinculo ? corpo.vinculo : null;
  if (corpo.conta_id !== undefined) campos.conta_id = ref(corpo.conta_id);
  if (corpo.banco !== undefined) campos.banco = texto(corpo.banco);
  if (corpo.agencia !== undefined) campos.agencia = texto(corpo.agencia);
  if (corpo.conta_numero !== undefined) campos.conta_numero = texto(corpo.conta_numero);
  if (corpo.pix_tipo !== undefined) campos.pix_tipo = texto(corpo.pix_tipo);
  if (corpo.pix_chave !== undefined) campos.pix_chave = texto(corpo.pix_chave);
  if (corpo.whatsapp !== undefined) campos.whatsapp = texto(corpo.whatsapp);
  return campos;
}

function falha(e: { code?: string; message?: string }) {
  if (e.code === "42P01" || e.code === "PGRST205" || (e.message ?? "").includes("does not exist")) {
    return NextResponse.json({ erro: "O SQL do Financeiro ainda não foi rodado neste banco." }, { status: 503 });
  }
  return NextResponse.json({ erro: e.message || "Não deu para salvar o cadastro." }, { status: 500 });
}

export async function POST(req: Request) {
  const eu = await apiFinanceiro("folha");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const empresaId = ref(corpo.empresa_id);
  if (!empresaId || !(await empresaPermitida(eu.profile.id, empresaId))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const nome = texto(corpo.nome);
  if (!nome) return NextResponse.json({ erro: "Informe o nome da pessoa." }, { status: 400 });

  const status = umDe<ColaboradorStatus>(COLABORADOR_STATUS, corpo.status, "ativo");
  const salarioBase = dinheiro(corpo.salario_base);
  const beneficios = dinheiro(corpo.beneficios);

  const { data, error } = await comTolerancia(async (extras) => await createSupabaseAdminClient()
    .from("fin_colaboradores")
    .insert({
      ...extras,
      empresa_id: empresaId,
      // Ponte opcional com a ficha do ERP. Fica solto quando a pessoa da folha
      // ainda não tem cadastro lá — o Financeiro não pode esperar o RH.
      employee_id: ref(corpo.employee_id),
      nome,
      setor: texto(corpo.setor),
      cargo: texto(corpo.cargo),
      salario_base: salarioBase,
      beneficios,
      dia_pagamento: diaDoMes(corpo.dia_pagamento),
      admissao: dataISO(corpo.admissao),
      desligamento: status === "desligado" ? dataISO(corpo.desligamento) : null,
      status,
      observacao: texto(corpo.observacao),
      created_by: eu.profile.id,
    })
    .select("id")
    .maybeSingle(), camposNovos(corpo));

  if (error) return falha(error);

  const id = (data as { id: string } | null)?.id ?? null;
  await auditar({
    empresa_id: empresaId, entidade: "colaborador", entidade_id: id,
    acao: "criar", user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { nome, status, salario_base: salarioBase, beneficios },
  });

  return NextResponse.json({ ok: true, id });
}
