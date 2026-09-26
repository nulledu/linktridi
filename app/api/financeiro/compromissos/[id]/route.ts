// ── PATCH e DELETE /api/financeiro/compromissos/[id] ─────────────────────────
// Editar e cancelar UMA conta. Duas decisões mandam neste arquivo:
//
//   · DELETE não apaga (§19). Vira "cancelado" e continua na base — histórico
//     financeiro apagado é conferência que ninguém consegue mais fechar, e o
//     que sobra é a palavra de quem apagou.
//   · Compromisso PAGO não é editado por aqui. Valor, vencimento e status dele
//     já viraram movimento na conta; mexer no compromisso sem mexer no
//     movimento faz o extrato divergir do dashboard em silêncio. O caminho é
//     reverter a baixa (DELETE em .../pagar) e então editar.

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

// "pago" e "cancelado" ficam de fora: o primeiro tem rota própria (gera
// movimento) e o segundo é o DELETE. Aceitá-los aqui criaria conta paga sem
// dinheiro saindo de lugar nenhum. "atrasado" nem existe no banco — é lido do
// relógio em `statusEfetivo`.
const STATUS_EDITAVEL = new Set(["previsto", "pendente", "agendado"]);

interface Linha {
  id: string; empresa_id: string; descricao: string; categoria: string;
  valor: number; vencimento: string; status: string;
}

async function ler(id: string): Promise<Linha | null> {
  const { data } = await createSupabaseAdminClient()
    .from("fin_compromissos")
    .select("id,empresa_id,descricao,categoria,valor,vencimento,status")
    .eq("id", id)
    .maybeSingle();
  return (data as Linha | null) ?? null;
}

async function contaDaEmpresa(contaId: string, empresaId: string): Promise<boolean> {
  const { data } = await createSupabaseAdminClient()
    .from("fin_contas")
    .select("id")
    .eq("id", contaId)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  return !!data;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const eu = await apiFinanceiro("compromissos");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const { id } = await params;
  const linha = await ler(id);
  if (!linha) return NextResponse.json({ erro: "Compromisso não encontrado." }, { status: 404 });
  // A empresa vem da LINHA, não do corpo (§17): o corpo é o cliente falando.
  if (!(await empresaPermitida(eu.profile.id, linha.empresa_id)))
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  if (linha.status === "cancelado")
    return NextResponse.json({ erro: "Compromisso cancelado não pode ser editado." }, { status: 400 });

  const mudanca: Record<string, unknown> = {};
  // Só o que mexe em dinheiro ou prazo entra no log — com o valor velho ao lado
  // do novo, que é a pergunta que se faz na conferência ("mudou de quanto pra
  // quanto, e quem mudou").
  const sensivel: Record<string, { de: unknown; para: unknown }> = {};

  if (corpo.descricao !== undefined) {
    const descricao = texto(corpo.descricao);
    if (!descricao) return NextResponse.json({ erro: "Escreva a descrição." }, { status: 400 });
    mudanca.descricao = descricao;
  }

  if (corpo.categoria !== undefined) mudanca.categoria = texto(corpo.categoria) || "outros";

  if (corpo.valor !== undefined) {
    const valor = centavos(Number(corpo.valor));
    if (!Number.isFinite(valor) || valor <= 0)
      return NextResponse.json({ erro: "Informe um valor maior que zero." }, { status: 400 });
    if (valor !== centavos(Number(linha.valor))) {
      mudanca.valor = valor;
      sensivel.valor = { de: centavos(Number(linha.valor)), para: valor };
    }
  }

  if (corpo.vencimento !== undefined) {
    const vencimento = corpo.vencimento;
    if (!ehDia(vencimento))
      return NextResponse.json({ erro: "Vencimento inválido — use AAAA-MM-DD." }, { status: 400 });
    if (vencimento !== linha.vencimento) {
      mudanca.vencimento = vencimento;
      // Competência anda junto: deixá-la para trás jogaria a conta no mês
      // errado de todo relatório que agrupa por competência.
      mudanca.competencia = competenciaDe(vencimento);
      sensivel.vencimento = { de: linha.vencimento, para: vencimento };
    }
  }

  if (corpo.status !== undefined) {
    const status = texto(corpo.status);
    if (!STATUS_EDITAVEL.has(status))
      return NextResponse.json({ erro: "Status inválido — pagar e cancelar têm caminho próprio." }, { status: 400 });
    if (status !== linha.status) {
      mudanca.status = status;
      sensivel.status = { de: linha.status, para: status };
    }
  }

  if (corpo.conta_id !== undefined) {
    const contaId = texto(corpo.conta_id) || null;
    if (contaId && !(await contaDaEmpresa(contaId, linha.empresa_id)))
      return NextResponse.json({ erro: "A conta é de outra empresa." }, { status: 400 });
    mudanca.conta_id = contaId;
  }

  if (corpo.observacao !== undefined) mudanca.observacao = texto(corpo.observacao) || null;

  if (linha.status === "pago" && Object.keys(sensivel).length)
    return NextResponse.json(
      { erro: "Compromisso pago: reverta o pagamento antes de mudar valor, vencimento ou status." },
      { status: 400 },
    );

  if (!Object.keys(mudanca).length) return NextResponse.json({ ok: true });

  const { error } = await createSupabaseAdminClient()
    .from("fin_compromissos")
    .update({ ...mudanca, updated_by: eu.profile.id })
    .eq("id", linha.id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  if (Object.keys(sensivel).length) {
    await auditar({
      empresa_id: linha.empresa_id, entidade: "compromisso", entidade_id: linha.id,
      acao: "editar", user_id: eu.profile.id, user_nome: eu.profile.name, dados: sensivel,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const eu = await apiFinanceiro("compromissos");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;
  const linha = await ler(id);
  if (!linha) return NextResponse.json({ erro: "Compromisso não encontrado." }, { status: 404 });
  if (!(await empresaPermitida(eu.profile.id, linha.empresa_id)))
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });

  // Cancelar de novo é o estado que a pessoa pediu — 200, não erro.
  if (linha.status === "cancelado") return NextResponse.json({ ok: true, jaEstava: true });
  if (linha.status === "pago")
    return NextResponse.json(
      { erro: "Compromisso pago: reverta o pagamento antes de cancelar." },
      { status: 400 },
    );

  const { error } = await createSupabaseAdminClient()
    .from("fin_compromissos")
    .update({ status: "cancelado", updated_by: eu.profile.id })
    .eq("id", linha.id);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  await auditar({
    empresa_id: linha.empresa_id, entidade: "compromisso", entidade_id: linha.id,
    acao: "cancelar", user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { de: linha.status, descricao: linha.descricao, valor: centavos(Number(linha.valor)), vencimento: linha.vencimento },
  });

  return NextResponse.json({ ok: true });
}
