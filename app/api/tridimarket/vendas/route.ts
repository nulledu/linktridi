import { NextRequest, NextResponse } from "next/server";
import { audit, marketApiError, marketDb, parseIntervalo, parseProfileIds, requireMarketAdmin } from "../_shared";
import { acertarRazao } from "../../../../lib/tridimarket/razao";

export const dynamic = "force-dynamic";

// A dívida desta rota é a mesma do resto: o RAZÃO. Ver lib/tridimarket/razao.ts.
type Db = ReturnType<typeof marketDb>;

// Lança uma venda MANUAL (sem passar pelo tablet). Valor obrigatório, produto
// opcional — serve pra registrar um consumo que não foi bipado. Cai na carteira
// da pessoa (dívida em aberto) e no razão, exatamente como uma compra normal.
// NÃO mexe no estoque: o produto aqui é rótulo do que foi levado, não
// necessariamente uma baixa (quem quer baixar estoque usa a aba Estoque).
export async function POST(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null) as { employeeId?: number; amount?: number; productId?: number | null; note?: string } | null;
  const amount = Math.round(Number(body?.amount) * 100) / 100;
  if (!body?.employeeId || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ ok: false, error: "invalid_sale" }, { status: 422 });
  }
  try {
    const db = marketDb();
    const { data: emp } = await db.from("funcionarios").select("unidade_id,ativo").eq("id", body.employeeId).maybeSingle();
    if (!emp) return NextResponse.json({ ok: false, error: "employee_not_found" }, { status: 409 });

    // `total` na própria venda: a listagem lê essa coluna, e sem ela a venda
    // manual apareceria valendo R$ 0,00.
    const { data: venda, error: vendaErr } = await db.from("vendas")
      .insert({ unidade_id: emp.unidade_id, funcionario_id: body.employeeId, total: amount, pago: false, origem: "manual" })
      .select("id").single();
    if (vendaErr) throw vendaErr;

    // `venda_itens.produto_id` é NOT NULL — sem produto informado a venda fica
    // só com o total (é o caso de "consumo avulso", que é o motivo de existir a
    // venda manual). Antes o insert ia com produto_id nulo e derrubava tudo.
    if (body.productId) {
      const { error: itemErr } = await db.from("venda_itens")
        .insert({ venda_id: venda.id, produto_id: body.productId, quantidade: 1, preco_unit: amount });
      if (itemErr) throw itemErr;
    }

    // Dívida no razão — é O QUE de fato faz a pessoa dever. Sem esta linha a
    // venda manual aparecia na lista e não cobrava ninguém.
    const { error: ledgerErr } = await db.from("lancamentos").insert({
      funcionario_id: body.employeeId, unidade_id: emp.unidade_id,
      tipo: "compra", valor: amount, venda_id: venda.id,
      descricao: body.note?.trim() || "Venda manual",
    });
    if (ledgerErr) throw ledgerErr;

    await audit(actor.id, "sale.manual", "sale", venda.id, undefined, { amount, productId: body.productId ?? null });
    return NextResponse.json({ ok: true, data: { id: venda.id } });
  } catch (error) { return marketApiError(error); }
}

// Marca UMA venda como paga (ou volta a pendente) — atalho para "esta compra
// foi acertada", sem digitar valor e método.
//
// Só virar o `pago` da tabela NÃO tirava a dívida: ela vem do razão. A pessoa
// via a venda como paga e continuava devendo o valor. Agora o razão é acertado
// junto: quitar zera o saldo daquela venda, despagar devolve o valor devido.
export async function PATCH(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null) as { id?: number; paid?: boolean } | null;
  if (!body?.id || typeof body.paid !== "boolean") return NextResponse.json({ ok: false, error: "invalid_sale" }, { status: 422 });
  try {
    const db = marketDb();
    const { data: venda } = await db.from("vendas")
      .select("id,funcionario_id,unidade_id,total,pago").eq("id", body.id).maybeSingle();
    if (!venda) return NextResponse.json({ ok: false, error: "sale_not_found" }, { status: 404 });

    const { error } = await db.from("vendas")
      .update({ pago: body.paid, pago_em: body.paid ? new Date().toISOString() : null }).eq("id", body.id);
    if (error) throw error;

    // Alvo do saldo desta venda: quitada não deve nada; pendente deve o total.
    const delta = await acertarRazao(
      db, venda, body.paid ? 0 : Number(venda.total) || 0,
      body.paid ? `Quitação da venda #${venda.id}` : `Venda #${venda.id} voltou a pendente`,
    );
    await audit(actor.id, body.paid ? "sale.mark_paid" : "sale.mark_unpaid", "sale", body.id, undefined, { paid: body.paid, delta });
    return NextResponse.json({ ok: true });
  } catch (error) { return marketApiError(error); }
}

// Exclui uma venda inteira (?id=).
//
// ERA O BUG: apagar a venda não mexia no razão, e como é o razão que forma a
// dívida, o valor continuava em aberto — a venda sumia da lista e a pessoa
// seguia devendo. O lançamento da compra não pode ser apagado (o gatilho
// `lancamento_imutavel` recusa delete e update), então zeramos o saldo com um
// ESTORNO antes de excluir. O histórico fica: dá pra ver a compra e o estorno.
export async function DELETE(req: NextRequest) {
  const actor = await requireMarketAdmin();
  if (!actor) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ ok: false, error: "invalid_sale" }, { status: 422 });
  try {
    const db = marketDb();
    const { data: venda } = await db.from("vendas")
      .select("id,funcionario_id,unidade_id,total,pago").eq("id", id).maybeSingle();
    if (!venda) return NextResponse.json({ ok: false, error: "sale_not_found" }, { status: 404 });

    // Estorna ANTES de excluir: `lancamentos.venda_id` é `on delete set null`,
    // então depois do delete não haveria mais como saber quais lançamentos eram
    // desta venda pra compensá-los.
    const delta = await acertarRazao(db, venda, 0, `Estorno da venda #${venda.id} (excluída)`);

    const { error: itemErr } = await db.from("venda_itens").delete().eq("venda_id", id);
    if (itemErr) throw itemErr;
    const { error: vendaErr } = await db.from("vendas").delete().eq("id", id);
    if (vendaErr) {
      // O `on delete set null` da FK é um UPDATE em `lancamentos`, e o gatilho
      // de imutabilidade barrava até esse. Sem o SQL abaixo a exclusão nunca
      // completa — e o erro cru não diz o que fazer.
      if (/imutável|imutavel/i.test(vendaErr.message ?? "")) {
        return NextResponse.json({
          ok: false, error: "razao_bloqueia_exclusao",
          detalhe: "Rode supabase/tridimarket_excluir_venda.sql: o gatilho do razão está barrando o desvínculo da venda. O estorno já foi lançado, então a dívida desta venda já está zerada.",
        }, { status: 409 });
      }
      throw vendaErr;
    }
    await audit(actor.id, "sale.delete", "sale", id, { funcionario_id: venda.funcionario_id, pago: venda.pago, total: venda.total, estorno: delta }, undefined);
    return NextResponse.json({ ok: true });
  } catch (error) { return marketApiError(error); }
}

// Vendas do mercadinho com os ITENS de cada compra. O painel antigo mostrava
// só o total gasto por pessoa; quando alguém contestava uma cobrança não havia
// como responder "o que exatamente foi levado".
export async function GET(req: NextRequest) {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const escopo = parseProfileIds(req.url);
  const { de: desde, ate } = parseIntervalo(req.url);
  // Popup por PESSOA: filtra por cadastro(s) em vez de por empresa. Aceita
  // vários (a mesma pessoa tem cadastro em mais de uma empresa).
  const employeeIds = new URL(req.url).searchParams.getAll("employeeId").map(Number).filter(Number.isFinite);
  try {
    const db = marketDb();
    let q = db.from("vendas")
      .select("id,criado_em,unidade_id,funcionario_id,pago,total")
      .gte("criado_em", desde).lte("criado_em", ate)
      .order("criado_em", { ascending: false }).limit(employeeIds.length ? 800 : 300);
    if (employeeIds.length) q = q.in("funcionario_id", employeeIds);
    else if (escopo?.length) q = q.in("unidade_id", escopo);
    const { data: vendas, error } = await q;
    if (error) throw error;

    const linhas = (vendas ?? []) as Array<{ id: number; criado_em: string; unidade_id: string; funcionario_id: number; pago: boolean; total: number }>;
    const ids = linhas.map((v) => v.id);
    const pessoas = [...new Set(linhas.map((v) => Number(v.funcionario_id)))];
    const perfis = [...new Set(linhas.map((v) => String(v.unidade_id)))];

    const [{ data: itens }, { data: gente }, { data: unidades }] = await Promise.all([
      ids.length ? db.from("venda_itens").select("id,venda_id,produto_id,quantidade,preco_unit").in("venda_id", ids) : Promise.resolve({ data: [] }),
      pessoas.length ? db.from("funcionarios").select("id,nome,foto_url").in("id", pessoas) : Promise.resolve({ data: [] }),
      perfis.length ? db.from("unidades").select("id,nome").in("id", perfis) : Promise.resolve({ data: [] }),
    ]);

    // `venda_itens` tem `quantidade` e `preco_unit` — não existe coluna `valor`.
    // Ler `i.valor` devolvia undefined em toda linha, então TODO item aparecia
    // custando R$ 0,00 e o total da venda saía zerado no popup.
    const itensPorVenda = new Map<number, Array<{ id: number; produto_id: number | null; quantidade: number; precoUnit: number }>>();
    for (const i of (itens ?? []) as Array<{ id: number; venda_id: number; produto_id: number | null; quantidade: number; preco_unit: number }>) {
      const lista = itensPorVenda.get(Number(i.venda_id)) ?? [];
      lista.push({
        id: Number(i.id),
        produto_id: i.produto_id == null ? null : Number(i.produto_id),
        quantidade: Math.max(1, Number(i.quantidade) || 1),
        precoUnit: Number(i.preco_unit) || 0,
      });
      itensPorVenda.set(Number(i.venda_id), lista);
    }
    const produtoIds = [...new Set([...itensPorVenda.values()].flat().map((i) => i.produto_id).filter((v): v is number => v != null))];
    const { data: produtos } = produtoIds.length
      ? await db.from("produtos").select("id,nome,imagem_url").in("id", produtoIds)
      : { data: [] };
    type Produto = { id: number; nome: string; imagem_url: string | null };
    type Pessoa = { id: number; nome: string; foto_url: string | null };
    const produtoPorId = new Map<number, Produto>((produtos ?? []).map((p: Produto) => [Number(p.id), p]));
    const nomePorId = new Map<number, string>((gente ?? []).map((p: Pessoa) => [Number(p.id), String(p.nome)]));
    const fotoPorId = new Map<number, string | null>((gente ?? []).map((p: Pessoa) => [Number(p.id), p.foto_url ?? null]));
    const unidadePorId = new Map<string, string>((unidades ?? []).map((p: { id: string; nome: string }) => [String(p.id), String(p.nome)]));

    const resultado = linhas.map((v) => {
      const doVenda = itensPorVenda.get(v.id) ?? [];
      // Cada linha JÁ tem quantidade (a RPC grava uma linha por produto), então
      // o agrupamento aqui só junta linhas repetidas do mesmo produto.
      // `productId` + `rowIds` (ids das linhas) permitem editar/excluir o item
      // no popup: tirar a linha inteira ou baixar a quantidade.
      const agrupado = new Map<number | null, { productId: number | null; name: string; imageUrl: string | null; quantity: number; total: number; unitPrice: number; rowIds: number[] }>();
      for (const i of doVenda) {
        const p = i.produto_id == null ? undefined : produtoPorId.get(i.produto_id);
        const atual = agrupado.get(i.produto_id) ?? {
          productId: i.produto_id,
          name: p?.nome ?? "Produto removido",
          imageUrl: p?.imagem_url ?? null,
          quantity: 0, total: 0, unitPrice: 0, rowIds: [],
        };
        atual.quantity += i.quantidade;
        atual.total = Math.round((atual.total + i.quantidade * i.precoUnit) * 100) / 100;
        atual.rowIds.push(i.id);
        atual.unitPrice = Math.round((atual.total / atual.quantity) * 100) / 100;
        agrupado.set(i.produto_id, atual);
      }
      return {
        id: v.id,
        at: v.criado_em,
        paid: v.pago === true,
        employeeId: Number(v.funcionario_id),
        employeeName: nomePorId.get(Number(v.funcionario_id)) ?? `#${v.funcionario_id}`,
        employeeImage: fotoPorId.get(Number(v.funcionario_id)) ?? null,
        unitName: unidadePorId.get(String(v.unidade_id)) ?? null,
        items: [...agrupado.values()].sort((a, b) => b.total - a.total),
        // `vendas.total` é a fonte: a venda manual pode não ter item nenhum, e
        // somar itens daria zero numa venda que cobra de verdade.
        total: Number(v.total) || Math.round(doVenda.reduce((s, i) => s + i.quantidade * i.precoUnit, 0) * 100) / 100,
      };
    });

    // Compras que o TABLET dá como sincronizadas e que não têm venda nenhuma.
    //
    // Acontece quando a venda é excluída: a FK zera `venda_id` e sobra um
    // registro dizendo "sincronizada" sem venda. O tablet nunca reenvia (para
    // ele acabou) e a idempotência da RPC recusa a segunda tentativa — então o
    // dinheiro some sem ninguém ver. Ficar calado sobre isso foi o que fez
    // parecer, por dias, que a sincronização estava quebrada.
    //
    // Os DOIS estados contam: 'ESTORNADA' é como o gatilho novo marca, e
    // 'SINCRONIZADA' é o que ficou de antes dele existir. Olhar só um dos dois
    // deixaria metade dos casos invisível — inclusive todos os futuros.
    //
    // Recortado pelo MESMO período da tela: a venda apagada não tem mais data,
    // mas `recebido_em` da operação tem, e é ela que diz quando a compra
    // aconteceu. Sem isso o aviso ficaria aceso para sempre por causa de uma
    // limpeza de teste antiga.
    //
    // Só o NÚMERO, com `head: true`: é um aviso, não uma listagem.
    // Tolerante à ausência da migração — sem ela, a tela só não mostra o aviso.
    let semVenda = 0;
    try {
      const { count } = await db.from("operacoes_compra")
        .select("operacao_id", { count: "exact", head: true })
        .is("venda_id", null)
        .in("status", ["SINCRONIZADA", "ESTORNADA"])
        .gte("recebido_em", desde).lte("recebido_em", ate);
      semVenda = count ?? 0;
    } catch { semVenda = 0; }

    return NextResponse.json({ ok: true, data: { vendas: resultado, operacoesSemVenda: semVenda, periodDays: Math.max(1, Math.round((new Date(ate).getTime() - new Date(desde).getTime()) / 86_400_000)) } });
  } catch (error) { return marketApiError(error); }
}
