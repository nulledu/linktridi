import { NextRequest, NextResponse } from "next/server";
import { audit, marketApiError, marketDb, requireMarketAdmin } from "../../_shared";
import { planoDeQuantidade, totalDosItens } from "../../../../../lib/tridimarket/venda-edicao";
import { acertarRazao } from "../../../../../lib/tridimarket/razao";

export const dynamic = "force-dynamic";

// Edições finas de uma venda a partir do popup da pessoa:
//  - removeItem: tira uma linha de produto inteira da venda.
//  - setQty:     ajusta a quantidade de um produto.
//  - move:       reatribui a venda a outro cadastro (bipou na conta errada).
//
// DUAS COISAS QUE ESTA ROTA ERRAVA E QUE VALEM PARA QUALQUER EDIÇÃO NOVA:
//
// 1. `venda_itens` tem UMA LINHA POR PRODUTO, com coluna `quantidade`. A versão
//    antiga tratava as linhas como uma-por-unidade: comparava a quantidade
//    desejada com `rowIds.length` e inseria linhas com uma coluna `valor` que
//    não existe. Em "Pringles ×2" (1 linha) o botão de menos mandava alvo=1,
//    batia com `rowIds.length`, não entrava em ramo nenhum e respondia
//    `ok: true` sem mudar nada — clicar não fazia absolutamente nada.
//
// 2. A dívida NÃO vem dos itens: vem do razão (`lancamentos`). Mexer nas linhas
//    sem `acertarRazao` mudava a venda na tela e deixava a pessoa devendo o
//    valor velho — pior que não deixar editar, porque parecia ter funcionado.
type Corpo =
  | { action: "removeItem"; vendaId: number; rowIds: number[] }
  | { action: "setQty"; vendaId: number; produtoId: number | null; unitPrice: number; quantity: number; rowIds: number[] }
  | { action: "move"; vendaId: number; toEmployeeId: number };

type Db = ReturnType<typeof marketDb>;

export async function POST(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as Corpo | null;
  if (!body || !("action" in body)) return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 422 });
  const db = marketDb();
  try {
    if (body.action === "removeItem") {
      const rowIds = (body.rowIds ?? []).map(Number).filter(Number.isFinite);
      if (!body.vendaId || !rowIds.length) return NextResponse.json({ ok: false, error: "invalid_item" }, { status: 422 });
      const { error } = await db.from("venda_itens").delete().in("id", rowIds);
      if (error) throw error;
      const total = await recalcularVenda(db, body.vendaId, "Item removido da venda");
      await audit(actor.id, "sale.item_remove", "sale", body.vendaId, undefined, { rowIds, total });
      return await responder(db, body.vendaId, actor.id, total);
    }

    if (body.action === "setQty") {
      const rowIds = (body.rowIds ?? []).map(Number).filter(Number.isFinite);
      if (!body.vendaId || !rowIds.length) return NextResponse.json({ ok: false, error: "invalid_qty" }, { status: 422 });

      const { data: linhas, error: lerErr } = await db.from("venda_itens")
        .select("id,quantidade,preco_unit").in("id", rowIds).eq("venda_id", body.vendaId);
      if (lerErr) throw lerErr;
      const atuais = ((linhas ?? []) as Array<{ id: number; quantidade: number; preco_unit: number }>)
        .map((l) => ({ id: Number(l.id), quantidade: Number(l.quantidade), precoUnit: Number(l.preco_unit) }));
      // As linhas podem ter sumido entre a tela e o clique (outra aba excluiu a
      // venda). Dizer isso é melhor que gravar em cima do nada.
      if (!atuais.length) return NextResponse.json({ ok: false, error: "item_nao_encontrado" }, { status: 409 });

      const plano = planoDeQuantidade(atuais, body.quantity);
      if (plano.remover.length) {
        const { error } = await db.from("venda_itens").delete().in("id", plano.remover);
        if (error) throw error;
      }
      if (plano.manter != null) {
        const { error } = await db.from("venda_itens")
          .update({ quantidade: plano.novaQuantidade }).eq("id", plano.manter);
        if (error) throw error;
      }

      const total = await recalcularVenda(db, body.vendaId, "Quantidade ajustada na venda");
      await audit(actor.id, "sale.item_qty", "sale", body.vendaId, undefined,
        { produtoId: body.produtoId, quantity: plano.novaQuantidade, total });
      return await responder(db, body.vendaId, actor.id, total);
    }

    if (body.action === "move") {
      if (!body.vendaId || !body.toEmployeeId) return NextResponse.json({ ok: false, error: "invalid_move" }, { status: 422 });
      const { data: alvo } = await db.from("funcionarios").select("id,unidade_id").eq("id", body.toEmployeeId).maybeSingle();
      if (!alvo) return NextResponse.json({ ok: false, error: "employee_not_found" }, { status: 404 });
      const { error } = await db.from("vendas")
        .update({ funcionario_id: alvo.id, unidade_id: alvo.unidade_id })
        .eq("id", body.vendaId);
      if (error) throw error;
      await audit(actor.id, "sale.move", "sale", body.vendaId, undefined, { toEmployeeId: alvo.id });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "unknown_action" }, { status: 422 });
  } catch (error) { return marketApiError(error); }
}

/**
 * Depois de mexer nos itens: refaz `vendas.total` e acerta o RAZÃO, que é de
 * onde a dívida sai de verdade. Venda marcada como paga fica com alvo 0.
 */
async function recalcularVenda(db: Db, vendaId: number, motivo: string): Promise<number> {
  const { data: itens, error } = await db.from("venda_itens")
    .select("quantidade,preco_unit").eq("venda_id", vendaId);
  if (error) throw error;
  const total = totalDosItens(((itens ?? []) as Array<{ quantidade: number; preco_unit: number }>)
    .map((i) => ({ quantidade: Number(i.quantidade), precoUnit: Number(i.preco_unit) })));

  const { data: venda, error: vendaErr } = await db.from("vendas")
    .select("id,funcionario_id,unidade_id,pago").eq("id", vendaId).maybeSingle();
  if (vendaErr) throw vendaErr;
  if (!venda) return total;   // já sumiu (outra aba excluiu): nada a acertar

  const { error: upErr } = await db.from("vendas").update({ total }).eq("id", vendaId);
  if (upErr) throw upErr;
  await acertarRazao(db, venda as { id: number; funcionario_id: number; unidade_id: string },
    venda.pago ? 0 : total, motivo);
  return total;
}

/** Resposta comum: some com a venda que ficou vazia e devolve o total novo. */
async function responder(db: Db, vendaId: number, actorId: string, total: number) {
  await limparVendaVazia(db, vendaId, actorId);
  return NextResponse.json({ ok: true, data: { total } });
}

// Uma venda sem nenhum item vira dívida-fantasma de R$ 0 e polui a lista.
// Quando a última linha sai, a venda vai junto. O razão já foi zerado pelo
// `recalcularVenda` antes disto — a ordem importa, porque `lancamentos.venda_id`
// é `on delete set null` e depois não haveria como achar o que estornar.
async function limparVendaVazia(db: Db, vendaId: number, actorId: string) {
  const { count } = await db.from("venda_itens").select("id", { count: "exact", head: true }).eq("venda_id", vendaId);
  if ((count ?? 0) === 0) {
    await db.from("vendas").delete().eq("id", vendaId);
    await audit(actorId, "sale.delete_empty", "sale", vendaId, undefined, undefined);
  }
}
