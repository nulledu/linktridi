import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, comTolerancia, empresaPermitida } from "@/lib/financeiro/db";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { centavos, hojeISO } from "@/lib/financeiro/calculos";
import { COLABORADOR_STATUS, type ColaboradorStatus } from "@/lib/financeiro/tipos";

// ── Folha · editar pessoa (§13) ──────────────────────────────────────────────
// NÃO existe DELETE aqui, e a ausência é a regra: desligar é `status:
// "desligado"`. A linha continua sendo apontada por quem já a citou — o bem do
// patrimônio sob responsabilidade da pessoa, os compromissos de folha das
// competências passadas — e apagá-la deixaria cada um desses registros órfão,
// com um responsável que ninguém mais consegue nomear. Quem está fora da folha
// some das somas por `status != 'desligado'` (ver `folhaTotal` em db.ts), não
// por ter sumido da tabela.

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

function falha(e: { code?: string; message?: string }) {
  if (e.code === "42P01" || e.code === "PGRST205" || (e.message ?? "").includes("does not exist")) {
    return NextResponse.json({ erro: "O SQL do Financeiro ainda não foi rodado neste banco." }, { status: 503 });
  }
  return NextResponse.json({ erro: e.message || "Não deu para salvar o cadastro." }, { status: 500 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const eu = await apiFinanceiro("folha");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const db = createSupabaseAdminClient();

  // A empresa vem da LINHA, nunca do corpo: o `empresa_id` que o cliente manda
  // serviria para editar o salário de alguém de outra empresa (§17).
  const { data: atual, error: erroLeitura } = await db
    .from("fin_colaboradores")
    .select("id,empresa_id,nome,salario_base,beneficios,status,desligamento")
    .eq("id", id)
    .maybeSingle();
  if (erroLeitura) return falha(erroLeitura);

  const pessoa = atual as
    | {
        id: string; empresa_id: string; nome: string; salario_base: number;
        beneficios: number; status: string; desligamento: string | null;
      }
    | null;
  if (!pessoa) return NextResponse.json({ erro: "Colaborador não encontrado." }, { status: 404 });
  if (!(await empresaPermitida(eu.profile.id, pessoa.empresa_id))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  const patch: Record<string, unknown> = {};
  if (corpo.nome !== undefined) {
    const nome = texto(corpo.nome);
    if (!nome) return NextResponse.json({ erro: "Informe o nome da pessoa." }, { status: 400 });
    patch.nome = nome;
  }
  if (corpo.employee_id !== undefined) patch.employee_id = ref(corpo.employee_id);
  if (corpo.setor !== undefined) patch.setor = texto(corpo.setor);
  if (corpo.cargo !== undefined) patch.cargo = texto(corpo.cargo);
  if (corpo.vinculo !== undefined) patch.vinculo = typeof corpo.vinculo === "string" && corpo.vinculo ? corpo.vinculo : null;
  if (corpo.observacao !== undefined) patch.observacao = texto(corpo.observacao);
  if (corpo.salario_base !== undefined) patch.salario_base = dinheiro(corpo.salario_base);
  if (corpo.beneficios !== undefined) patch.beneficios = dinheiro(corpo.beneficios);
  if (corpo.dia_pagamento !== undefined) patch.dia_pagamento = diaDoMes(corpo.dia_pagamento);
  if (corpo.admissao !== undefined) patch.admissao = dataISO(corpo.admissao);
  if (corpo.desligamento !== undefined) patch.desligamento = dataISO(corpo.desligamento);

  if (corpo.status !== undefined) {
    const status = umDe<ColaboradorStatus>(COLABORADOR_STATUS, corpo.status, "ativo");
    patch.status = status;
    // A data do desligamento acompanha o status sozinha. Desligado sem data
    // deixa a folha do mês passado sem começo nem fim quando alguém for
    // conferir por que o total mudou; e reativar sem limpar a data deixaria uma
    // pessoa ativa com desligamento no passado.
    patch.desligamento = status === "desligado"
      ? ((patch.desligamento as string | null | undefined) ?? pessoa.desligamento ?? hojeISO())
      : null;
  }

  // Dados bancários, gratificação e a conta que paga entraram depois do primeiro
  // `financeiro.sql`. Vão num pacote à parte para que o banco atrasado só custe
  // ESSES campos, e não a edição inteira — ver `comTolerancia` em db.ts.
  const extras: Record<string, unknown> = {};
  if (corpo.gratificacao !== undefined) extras.gratificacao = dinheiro(corpo.gratificacao);
  if (corpo.valor_hora !== undefined) extras.valor_hora = dinheiro(corpo.valor_hora);
  if (corpo.conta_id !== undefined) extras.conta_id = ref(corpo.conta_id);
  if (corpo.banco !== undefined) extras.banco = texto(corpo.banco);
  if (corpo.agencia !== undefined) extras.agencia = texto(corpo.agencia);
  if (corpo.conta_numero !== undefined) extras.conta_numero = texto(corpo.conta_numero);
  if (corpo.pix_tipo !== undefined) extras.pix_tipo = texto(corpo.pix_tipo);
  if (corpo.pix_chave !== undefined) extras.pix_chave = texto(corpo.pix_chave);
  if (corpo.whatsapp !== undefined) extras.whatsapp = texto(corpo.whatsapp);

  if (!Object.keys(patch).length && !Object.keys(extras).length) return NextResponse.json({ ok: true });

  patch.updated_by = eu.profile.id;
  const { error } = await comTolerancia(
    async (novos) => await db.from("fin_colaboradores").update({ ...patch, ...novos }).eq("id", pessoa.id),
    extras,
  );
  if (error) return falha(error);

  await auditar({
    empresa_id: pessoa.empresa_id, entidade: "colaborador", entidade_id: pessoa.id,
    acao: patch.status === "desligado" && pessoa.status !== "desligado" ? "desligar" : "editar",
    user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: {
      antes: {
        nome: pessoa.nome, salario_base: pessoa.salario_base,
        beneficios: pessoa.beneficios, status: pessoa.status,
      },
      depois: patch,
    },
  });

  return NextResponse.json({ ok: true });
}
