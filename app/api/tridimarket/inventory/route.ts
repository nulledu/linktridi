import { NextRequest, NextResponse } from "next/server";
import { audit, inventoryAdjustmentInput, marketApiError, marketDb, marketRepository, parseProfileIds, requireMarketAdmin } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try { return NextResponse.json({ ok: true, data: await marketRepository().products(parseProfileIds(req.url)) }); }
  catch (error) { return marketApiError(error); }
}

export async function POST(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const parsed = inventoryAdjustmentInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_inventory_adjustment", issues: parsed.error.flatten() }, { status: 422 });
  const db = marketDb();
  const { productId, profileId, delta, reason, toProfileId } = parsed.data;

  // ── Transferência entre empresas ──────────────────────────────────────────
  // Sai de `profileId`, entra em `toProfileId`. Caminho separado do ajuste
  // porque as duas pontas precisam acontecer JUNTAS: gravar a saída e falhar na
  // entrada faz as unidades desaparecerem do sistema. Quem garante isso é a
  // função `mercadinho.transferir_estoque` (supabase/mercadinho-transferir-estoque.sql),
  // que faz saldos + histórico numa transação só.
  if (toProfileId) {
    const qtd = Math.abs(delta);
    if (toProfileId === profileId) {
      return NextResponse.json({ ok: false, error: "mesma_empresa", detalhe: "Origem e destino são a mesma empresa." }, { status: 422 });
    }
    try {
      const { data, error } = await db.rpc("transferir_estoque", {
        p_produto: productId, p_origem: profileId, p_destino: toProfileId,
        p_qtd: qtd, p_motivo: reason || null, p_autor: actor.id,
      });
      if (error) throw error;
      const linha = Array.isArray(data) ? data[0] : data;
      await audit(actor.id, "inventory.transfer", "product", productId,
        { unidade: profileId }, { para: toProfileId, quantidade: qtd, reason: reason || null });
      // Produto sem preço no destino não aparece no tablet de lá, mesmo com
      // saldo. Avisar aqui evita o "transferi e não apareceu".
      const { count } = await db.from("precos")
        .select("produto_id", { count: "exact", head: true })
        .eq("unidade_id", toProfileId).eq("produto_id", productId);
      return NextResponse.json({
        ok: true,
        data: {
          origem: Number(linha?.saldo_origem ?? 0),
          destino: Number(linha?.saldo_destino ?? 0),
          semPrecoNoDestino: (count ?? 0) === 0,
        },
      });
    } catch (error) {
      const e = error as { message?: string; code?: string; hint?: string };
      // 42883 / PGRST202: a função ainda não existe neste banco (o SQL não
      // rodou). Cai pro caminho de reserva, que faz em dois passos e DESFAZ a
      // primeira ponta se a segunda falhar — pior que a transação, melhor que
      // recusar a operação.
      const faltaFuncao = e.code === "42883" || e.code === "PGRST202"
        || /transferir_estoque|function .* does not exist|Could not find the function/i.test(e.message ?? "");
      if (!faltaFuncao) {
        return NextResponse.json({ ok: false, error: e.code || "transfer_error", detalhe: e.hint || e.message }, { status: 409 });
      }
      return transferirEmDoisPassos(db, { productId, profileId, toProfileId, qtd, reason, actorId: actor.id });
    }
  }

  try {
    const { data: atual, error: erroAtual } = await db.from("estoque")
      .select("quantidade").eq("unidade_id", profileId).eq("produto_id", productId).maybeSingle();
    if (erroAtual) throw erroAtual;

    const antes = Number(atual?.quantidade ?? 0);
    const depois = antes + delta;
    // `estoque.quantidade` tem CHECK (>= 0): uma baixa maior que o saldo seria
    // recusada pelo banco com erro cru. Melhor explicar quanto existe.
    if (depois < 0) {
      return NextResponse.json({
        ok: false, error: "estoque_insuficiente",
        detalhe: `Só há ${antes} un. em estoque — não dá pra baixar ${Math.abs(delta)}.`,
      }, { status: 409 });
    }

    // A chave de `estoque` é (unidade_id, produto_id); a tabela NÃO tem coluna
    // `id`, e o update antigo filtrava por `id` (undefined) — nunca acertava a
    // linha. Um upsert pela chave real resolve os dois casos, com ou sem linha
    // existente, e sem `empresa_id`, que também não existe aqui.
    const { error: erroUpsert } = await db.from("estoque").upsert(
      { unidade_id: profileId, produto_id: productId, quantidade: depois, atualizado_em: new Date().toISOString() },
      { onConflict: "unidade_id,produto_id" },
    );
    if (erroUpsert) throw erroUpsert;

    // Histórico. `tipo` é limitado por CHECK: entrada é ENTRADA, baixa manual é
    // AJUSTE (PERDA/VENDA/TRANSFERENCIA têm origem própria). `quantidade` é
    // sempre positiva — a direção vem do tipo.
    const { error: erroMov } = await db.from("movimentacoes").insert({
      unidade_id: profileId, produto_id: productId,
      tipo: delta > 0 ? "ENTRADA" : "AJUSTE",
      // `motivo` é nullable no banco: sem observação a linha do histórico
      // registra o ajuste do mesmo jeito, só sem texto.
      quantidade: Math.abs(delta), motivo: reason || null, autor_id: actor.id,
    });
    if (erroMov) throw erroMov;

    await audit(actor.id, "inventory.adjust", "product", productId, { quantity: antes }, { quantity: depois, reason: reason || null });
    // `data` com ANTES e DEPOIS: é o que a tela usa pra dizer "12 → 9 un." em
    // vez de um "pronto" que não prova nada, e pra corrigir a linha na hora
    // sem esperar o catálogo inteiro recarregar. `quantity` fica no topo por
    // compatibilidade com quem já lia de lá.
    return NextResponse.json({ ok: true, quantity: depois, data: { before: antes, quantity: depois } });
  } catch (error) { return marketApiError(error); }
}

// Transferência sem a função do banco: dois passos, com desfazimento.
//
// Só roda enquanto `supabase/mercadinho-transferir-estoque.sql` não tiver sido
// aplicado. A diferença é real: aqui existe uma janela em que a saída já foi
// gravada e a entrada ainda não. O `catch` desfaz a saída — mas se o processo
// morrer exatamente no meio (deploy, timeout do serverless), o desfazimento não
// acontece e as unidades ficam pendentes. Com a função, essa janela não existe.
type Db = ReturnType<typeof marketDb>;
async function transferirEmDoisPassos(db: Db, p: {
  productId: number; profileId: string; toProfileId: string;
  qtd: number; reason?: string; actorId: string;
}) {
  const saldo = async (unidade: string) => {
    const { data, error } = await db.from("estoque")
      .select("quantidade").eq("unidade_id", unidade).eq("produto_id", p.productId).maybeSingle();
    if (error) throw error;
    return Number(data?.quantidade ?? 0);
  };
  const gravar = async (unidade: string, quantidade: number) => {
    const { error } = await db.from("estoque").upsert(
      { unidade_id: unidade, produto_id: p.productId, quantidade, atualizado_em: new Date().toISOString() },
      { onConflict: "unidade_id,produto_id" },
    );
    if (error) throw error;
  };

  try {
    const antesOrigem = await saldo(p.profileId);
    if (antesOrigem < p.qtd) {
      return NextResponse.json({
        ok: false, error: "estoque_insuficiente",
        detalhe: `Só há ${antesOrigem} un. na origem — não dá para transferir ${p.qtd}.`,
      }, { status: 409 });
    }
    const antesDestino = await saldo(p.toProfileId);

    await gravar(p.profileId, antesOrigem - p.qtd);
    try {
      await gravar(p.toProfileId, antesDestino + p.qtd);
    } catch (falhaEntrada) {
      // Desfaz a saída: sem isto o estoque simplesmente encolhe.
      await gravar(p.profileId, antesOrigem).catch(() => { /* nada mais a fazer */ });
      throw falhaEntrada;
    }

    const motivo = (p.reason || "transferência").trim();
    await db.from("movimentacoes").insert([
      { unidade_id: p.profileId, produto_id: p.productId, tipo: "TRANSFERENCIA", quantidade: p.qtd, motivo: `${motivo} (saída)`, autor_id: p.actorId },
      { unidade_id: p.toProfileId, produto_id: p.productId, tipo: "TRANSFERENCIA", quantidade: p.qtd, motivo: `${motivo} (entrada)`, autor_id: p.actorId },
    ]);
    await audit(p.actorId, "inventory.transfer", "product", p.productId,
      { unidade: p.profileId }, { para: p.toProfileId, quantidade: p.qtd, semFuncaoNoBanco: true });

    const { count } = await db.from("precos")
      .select("produto_id", { count: "exact", head: true })
      .eq("unidade_id", p.toProfileId).eq("produto_id", p.productId);

    return NextResponse.json({
      ok: true,
      data: {
        origem: antesOrigem - p.qtd,
        destino: antesDestino + p.qtd,
        semPrecoNoDestino: (count ?? 0) === 0,
        // A tela não mostra isto, mas fica na resposta: serve pra saber, num
        // suporte, que o banco ainda está sem a função.
        semFuncaoNoBanco: true,
      },
    });
  } catch (error) { return marketApiError(error); }
}

