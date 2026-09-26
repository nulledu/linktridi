// ── Compras: criar (§7) ──────────────────────────────────────────────────────
// A compra nasce RASCUNHO e não move um centavo. Quem transforma a compra em
// dívida na agenda é a confirmação — que tem rota própria e pode vir junto
// neste mesmo pedido (`confirmar: true`), para quem lança e fecha na mesma tela.
//
// Rascunho existe justamente para o lançamento errado morrer antes de virar
// compromisso: apagar um rascunho não deixa rastro na agenda de ninguém.

import { NextResponse } from "next/server";
import { apiFinanceiro } from "@/lib/financeiro/gate";
import { auditar, empresaPermitida } from "@/lib/financeiro/db";
import { confirmarCompra } from "@/lib/financeiro/escrita";
import { centavos, hojeISO } from "@/lib/financeiro/calculos";
import { PLANOS, type Plano } from "@/lib/financeiro/tipos";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const db = () => createSupabaseAdminClient();

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const ehDia = (v: unknown): v is string => typeof v === "string" && DIA.test(v);
const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

interface Item {
  descricao: string; quantidade: number; unidade: string | null;
  valor_unitario: number; categoria: string | null;
}

/**
 * O que veio no `itens` do corpo, limpo. O teto de 200 linhas é para uma
 * planilha colada inteira não virar um insert do tamanho da tabela.
 */
function limparItens(bruto: unknown): Item[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .slice(0, 200)
    .map((i: Record<string, unknown>) => ({
      descricao: texto(i?.descricao),
      quantidade: numero(i?.quantidade) || 1,
      unidade: texto(i?.unidade) || null,
      valor_unitario: centavos(numero(i?.valor_unitario)),
      categoria: texto(i?.categoria) || null,
    }))
    .filter((i) => i.descricao);
}

const somaDosItens = (itens: Item[]) =>
  centavos(itens.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0));

export async function POST(req: Request) {
  const eu = await apiFinanceiro("compras");
  if (!eu) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corpo) return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });

  const empresaId = texto(corpo.empresa_id);
  if (!(await empresaPermitida(eu.profile.id, empresaId)))
    return NextResponse.json({ erro: "Empresa não permitida." }, { status: 403 });

  const descricao = texto(corpo.descricao);
  if (!descricao) return NextResponse.json({ erro: "Descreva a compra." }, { status: 400 });

  const itens = limparItens(corpo.itens);
  // Total digitado manda; sem ele, mandam os itens. Somar aqui em vez de
  // confiar no número que a tela mandou é o que impede a compra de valer uma
  // coisa no cabeçalho e outra na lista de itens.
  const total = centavos(numero(corpo.valor_total) || somaDosItens(itens));
  if (total < 0) return NextResponse.json({ erro: "O valor não pode ser negativo." }, { status: 400 });

  const confirmar = corpo.confirmar === true;
  if (confirmar && total <= 0)
    return NextResponse.json({ erro: "Compra sem valor não pode ser confirmada." }, { status: 400 });

  const plano: Plano = (PLANOS as readonly string[]).includes(texto(corpo.plano))
    ? (texto(corpo.plano) as Plano) : "a_vista";

  const linha = {
    empresa_id: empresaId,
    fornecedor_id: texto(corpo.fornecedor_id) || null,
    descricao,
    data: ehDia(corpo.data) ? corpo.data : hojeISO(),
    categoria: texto(corpo.categoria) || "outros",
    valor_total: total,
    plano,
    parcelas: Math.min(Math.max(Math.floor(numero(corpo.parcelas) || 1), 1), 120),
    prazo_dias: corpo.prazo_dias == null ? null : Math.max(0, Math.floor(numero(corpo.prazo_dias))),
    primeiro_vencimento: ehDia(corpo.primeiro_vencimento) ? corpo.primeiro_vencimento : null,
    conta_id: texto(corpo.conta_id) || null,
    gera_patrimonio: corpo.gera_patrimonio === true,
    observacao: texto(corpo.observacao) || null,
    status: "rascunho",
    created_by: eu.profile.id,
  };

  const { data: criada, error } = await db().from("fin_compras").insert(linha).select("id").maybeSingle();
  if (error || !criada)
    return NextResponse.json({ erro: error?.message ?? "Não foi possível salvar a compra." }, { status: 500 });

  if (itens.length) {
    const { error: erroItens } = await db()
      .from("fin_compra_itens")
      .insert(itens.map((i, n) => ({ compra_id: criada.id, ...i, ordem: n })));
    if (erroItens) {
      // O total pode ter saído da soma destes itens: guardar a compra sem eles
      // deixaria na tela um valor que nenhuma linha explica. A compra nasceu
      // neste request e ninguém a viu ainda, então apagar aqui é honesto.
      await db().from("fin_compras").delete().eq("id", criada.id);
      return NextResponse.json({ erro: erroItens.message }, { status: 500 });
    }
  }

  await auditar({
    empresa_id: empresaId, entidade: "compra", entidade_id: criada.id,
    acao: "criar", user_id: eu.profile.id, user_nome: eu.profile.name,
    dados: { valor_total: total, plano, parcelas: linha.parcelas, itens: itens.length },
  });

  if (!confirmar) return NextResponse.json({ ok: true, id: criada.id, compromissos: 0, confirmada: false });

  const r = await confirmarCompra(criada.id, { id: eu.profile.id, nome: eu.profile.name });
  // A compra JÁ está gravada. Responder erro aqui faria a tela tentar de novo e
  // criar uma segunda compra igual — o que falhou foi a confirmação, e ela tem
  // porta própria para ser repetida sem duplicar nada.
  if (!r.ok)
    return NextResponse.json({ ok: true, id: criada.id, compromissos: 0, confirmada: false, aviso: r.erro });

  return NextResponse.json({
    ok: true, id: criada.id, compromissos: r.dados?.compromissos ?? 0, confirmada: true,
  });
}
