// ── Nota que chegou antes da compra (§8) ─────────────────────────────────────
// O caminho normal do módulo é compra → nota: a compra nasce, vira agenda, e a
// nota chega depois só para documentar. Só que no mundo real o papel chega
// primeiro — o fornecedor manda a NF-e no mesmo instante da entrega e ninguém
// tinha lançado nada. Até agora essa nota virava só um alerta de pendência que
// não tinha como ser resolvido pela tela.
//
// O portão é `compras`, não `notas`: o que sai daqui é uma COMPRA, e quem só
// cadastra documento fiscal não pode abrir despesa da empresa por um atalho.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida } from "@/lib/financeiro/db";
import { centavos } from "@/lib/financeiro/calculos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const db = () => createSupabaseAdminClient();

interface LinhaNota {
  id: string; empresa_id: string; tipo: string; numero: string | null; serie: string | null;
  parceiro_nome: string | null; fornecedor_id: string | null; compra_id: string | null;
  emissao: string; valor: number; status: string;
}

function falha(e: { code?: string; message?: string }) {
  if (e.code === "42P01" || e.code === "PGRST205" || (e.message ?? "").includes("does not exist")) {
    return NextResponse.json({ erro: "O SQL do Financeiro ainda não foi rodado neste banco." }, { status: 503 });
  }
  return NextResponse.json({ erro: e.message || "Não deu para criar a compra." }, { status: 500 });
}

/** O nome que a compra recebe: o documento e quem está do outro lado dele. */
function descricaoDaNota(n: LinhaNota): string {
  const doc = n.numero ? `NF ${n.numero}${n.serie ? `-${n.serie}` : ""}` : "NF sem número";
  const parceiro = (n.parceiro_nome ?? "").trim();
  return parceiro ? `${doc} — ${parceiro}` : doc;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const eu = await apiFinanceiro("compras");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const { id } = await params;

  const { data, error } = await db()
    .from("fin_notas")
    .select("id,empresa_id,tipo,numero,serie,parceiro_nome,fornecedor_id,compra_id,emissao,valor,status")
    .eq("id", id)
    .maybeSingle();
  if (error) return falha(error);

  const nota = data as LinhaNota | null;
  if (!nota) return NextResponse.json({ erro: "Nota não encontrada." }, { status: 404 });
  // A empresa sai da LINHA, nunca do corpo: o `empresa_id` que o cliente manda
  // serviria para abrir compra na empresa dos outros (§17).
  if (!(await empresaPermitida(eu.profile.id, nota.empresa_id))) {
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });
  }

  if (nota.compra_id) {
    return NextResponse.json(
      { erro: "Esta nota já aponta para uma compra.", compra_id: nota.compra_id }, { status: 400 });
  }
  // §21: nota emitida é VENDA. Deixá-la gerar compra transformaria a receita da
  // empresa em despesa dela, com o valor certinho e o sinal trocado.
  if (nota.tipo === "emitida") {
    return NextResponse.json(
      { erro: "Nota emitida documenta uma venda — ela não vira compra nem despesa." }, { status: 400 });
  }
  if (nota.status === "cancelada") {
    return NextResponse.json(
      { erro: "Nota cancelada não movimentou nada, então não gera compra." }, { status: 400 });
  }

  const descricao = descricaoDaNota(nota);
  const valor = Math.max(0, centavos(Number(nota.valor)));

  // Nasce RASCUNHO e para por aí. Confirmar é que cria as parcelas e os
  // compromissos, e confirmar aqui seria decidir pela pessoa: a nota traz o
  // valor e a data, mas não traz forma de pagamento, parcelas, conta nem
  // categoria de verdade. Uma dívida na agenda com esses campos chutados é pior
  // do que dívida nenhuma. Quem confere e confirma é gente, na tela de Compras.
  const { data: criada, error: erroCompra } = await db()
    .from("fin_compras")
    .insert({
      empresa_id: nota.empresa_id,
      fornecedor_id: nota.fornecedor_id,
      descricao,
      data: nota.emissao,
      // "outros" em vez de adivinhar pela nota: categoria errada some no
      // relatório por categoria sem ninguém desconfiar, e o §14 diz que o
      // código é estável — classificar no chute vira histórico torto.
      categoria: "outros",
      valor_total: valor,
      status: "rascunho",
      created_by: eu.profile.id,
    })
    .select("id")
    .maybeSingle();

  if (erroCompra) return falha(erroCompra);
  if (!criada) return NextResponse.json({ erro: "Não deu para criar a compra." }, { status: 500 });

  // O `is("compra_id", null)` é a trava do clique duplo: a segunda chamada não
  // encontra linha para atualizar e sai sem sobrescrever o vínculo da primeira.
  const { data: vinculadas, error: erroVinculo } = await db()
    .from("fin_notas")
    .update({ compra_id: criada.id, updated_by: eu.profile.id })
    .eq("id", nota.id)
    .is("compra_id", null)
    .select("id");

  if (erroVinculo || !vinculadas?.length) {
    // Sem vínculo a compra que acabou de nascer não documenta nada e ninguém a
    // viu ainda — apagar aqui é não deixar rascunho órfão poluindo a lista de
    // compras da empresa.
    await db().from("fin_compras").delete().eq("id", criada.id);
    if (erroVinculo) return falha(erroVinculo);

    const { data: agora } = await db()
      .from("fin_notas").select("compra_id").eq("id", nota.id).maybeSingle();
    return NextResponse.json({
      ok: true,
      jaEstava: true,
      compra_id: (agora as { compra_id: string | null } | null)?.compra_id ?? null,
    });
  }

  // Registrado sob a COMPRA: é ela que aparece do nada na lista, e a pergunta
  // que alguém vai fazer daqui a um mês é "de onde saiu esse rascunho?".
  await auditar({
    empresa_id: nota.empresa_id, entidade: "compra", entidade_id: criada.id,
    acao: "compra-da-nota", user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { nota_id: nota.id, numero: nota.numero, descricao, valor_total: valor },
  });

  return NextResponse.json({ ok: true, compra_id: criada.id });
}
