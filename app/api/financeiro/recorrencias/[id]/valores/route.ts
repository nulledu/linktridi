// ── O valor combinado de UM mês de uma recorrência ───────────────────────────
// Luz, água, cartão: a regra tem uma estimativa, e quem sabe o número do mês o
// informa aqui. A partir daí é ele que a geração usa, e a linha da agenda
// deixa de ser palpite.
//
// `PUT` e não `POST` de propósito: informar de novo CORRIGE. O par
// (recorrência, competência) é único por índice, então o segundo envio é a
// mesma operação — clique duplo, retry de timeout e reenvio terminam no mesmo
// estado, que é a regra de idempotência do módulo (§16).

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida } from "@/lib/financeiro/db";
import { centavos, competenciaDe } from "@/lib/financeiro/calculos";
import { materializarOcorrencia } from "@/lib/financeiro/materializar-recorrencia";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COMPETENCIA = /^\d{4}-\d{2}(-\d{2})?$/;

/** Tabela ausente = SQL que o dono ainda não rodou; a mensagem diz isso. */
const SEM_TABELA = new Set(["42P01", "PGRST205"]);

async function carregar(id: string, userId: string) {
  if (!UUID.test(id)) return { erro: NextResponse.json({ erro: "Identificador inválido." }, { status: 400 }) };
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("fin_recorrencias").select("id,empresa_id,descricao").eq("id", id).maybeSingle();
  if (error) return { erro: NextResponse.json({ erro: error.message }, { status: 500 }) };
  if (!data) return { erro: NextResponse.json({ erro: "Recorrência não encontrada." }, { status: 404 }) };
  const linha = data as { id: string; empresa_id: string; descricao: string };
  if (!(await empresaPermitida(userId, linha.empresa_id))) {
    return { erro: NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 }) };
  }
  return { linha, db };
}

/** Os valores já informados, para a ficha desenhar a lista. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const eu = await apiFinanceiro("cadastros");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const achado = await carregar(id, eu.profile.id);
  if ("erro" in achado) return achado.erro;

  const { data, error } = await achado.db
    .from("fin_recorrencia_valores")
    .select("competencia,valor,observacao")
    .eq("recorrencia_id", id)
    .order("competencia", { ascending: false })
    .limit(60);
  // Sem a tabela, a tela mostra a lista vazia e o aviso de SQL pendente — não
  // um erro, porque não há nada errado com o cadastro.
  if (error) {
    return NextResponse.json(
      SEM_TABELA.has(error.code ?? "")
        ? { valores: [], pendente: true }
        : { erro: error.message },
      { status: SEM_TABELA.has(error.code ?? "") ? 200 : 500 },
    );
  }
  return NextResponse.json({ valores: data ?? [], pendente: false });
}

/** Informa (ou corrige) o valor de um mês. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const eu = await apiFinanceiro("cadastros");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const bruta = String(corpo.competencia ?? "");
  if (!COMPETENCIA.test(bruta)) {
    return NextResponse.json({ erro: "Informe o mês no formato AAAA-MM." }, { status: 400 });
  }
  // Sempre o 1º dia: a chave de idempotência da geração é montada a partir de
  // AAAA-MM, e meia-competência nunca casaria com ela.
  const competencia = competenciaDe(bruta.length === 7 ? `${bruta}-01` : bruta);

  const valor = centavos(Number(corpo.valor) || 0);
  if (valor < 0) return NextResponse.json({ erro: "O valor não pode ser negativo." }, { status: 400 });

  const achado = await carregar(id, eu.profile.id);
  if ("erro" in achado) return achado.erro;
  const { linha, db } = achado;

  const { error } = await db
    .from("fin_recorrencia_valores")
    .upsert(
      {
        recorrencia_id: id, competencia, valor,
        observacao: typeof corpo.observacao === "string" ? corpo.observacao.trim() || null : null,
        updated_by: eu.profile.id, created_by: eu.profile.id,
      },
      { onConflict: "recorrencia_id,competencia" },
    );
  if (error) {
    if (SEM_TABELA.has(error.code ?? "")) {
      return NextResponse.json(
        { erro: "Falta rodar supabase/financeiro_recorrencia_variavel.sql para guardar valores por mês." },
        { status: 503 },
      );
    }
    return NextResponse.json({ erro: error.message }, { status: 400 });
  }

  // Se o compromisso daquele mês JÁ existe, ele não se corrige sozinho: a
  // geração é idempotente pela chave, então rodá-la de novo não reescreve o
  // valor. Atualizar aqui é o que faz o número informado chegar à agenda em
  // vez de valer só a partir da próxima volta.
  const { error: erroAgenda } = await db
    .from("fin_compromissos")
    .update({ valor, updated_by: eu.profile.id })
    .eq("empresa_id", linha.empresa_id)
    .eq("origem", "recorrencia")
    .eq("origem_id", id)
    .eq("competencia", competencia)
    // Conta paga não se mexe: o extrato já explicou aquele dinheiro, e mudar o
    // valor por baixo faria a baixa deixar de bater com o movimento.
    .is("pago_em", null);
  const aviso = erroAgenda
    ? "Valor guardado, mas o compromisso deste mês não foi atualizado — confira na agenda."
    : undefined;

  // Não existindo ainda, materializa: quem informou o número quer a conta na
  // agenda com ele, não na volta seguinte.
  const materializada = await materializarOcorrencia(linha.empresa_id, id, competencia, {
    id: eu.profile.id, nome: eu.profile.name,
  });

  await auditar({
    empresa_id: linha.empresa_id, entidade: "recorrencia", entidade_id: id, acao: "editar",
    user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { valor_do_mes: { competencia, valor } },
  });

  return NextResponse.json({
    ok: true, competencia, valor,
    criou_compromisso: materializada.ok && materializada.dados?.criado === true,
    ...(aviso ? { aviso } : {}),
  });
}

/** Volta a valer a estimativa da regra para aquele mês. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const eu = await apiFinanceiro("cadastros");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const bruta = new URL(req.url).searchParams.get("competencia") ?? "";
  if (!COMPETENCIA.test(bruta)) {
    return NextResponse.json({ erro: "Informe o mês no formato AAAA-MM." }, { status: 400 });
  }
  const competencia = competenciaDe(bruta.length === 7 ? `${bruta}-01` : bruta);

  const achado = await carregar(id, eu.profile.id);
  if ("erro" in achado) return achado.erro;

  const { error } = await achado.db
    .from("fin_recorrencia_valores").delete()
    .eq("recorrencia_id", id).eq("competencia", competencia);
  if (error && !SEM_TABELA.has(error.code ?? "")) {
    return NextResponse.json({ erro: error.message }, { status: 400 });
  }
  // O compromisso já lançado NÃO volta para a estimativa sozinho: ele é uma
  // conta que existe, e mexer nela sem ninguém pedir seria pior que deixar o
  // número que já estava lá.
  return NextResponse.json({ ok: true });
}
