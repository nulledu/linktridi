import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule, getProfileForModule } from "@/lib/require-auth";
import {
  desvincularProduto, LojasTabelaAusente, produtosDisponiveis, vincularProdutos,
} from "@/lib/lojas-db";

export const dynamic = "force-dynamic";

// ── Catálogo compartilhado ───────────────────────────────────────────────────
// Loja é ORGANIZAÇÃO: a mesma peça costuma ser vendida em mais de uma vitrine.
// Esta rota liga e desliga esse vínculo.
//
// Vincular é ESCRITA de catálogo, então exige a mesma sub que governa preço e
// produto — quem só acompanha pedido não passa a poder mudar o que a loja vende
// por ter aberto a tela.
const podeLer = () => getProfileForModule("lojas");
const podeEscrever = () => getProfileForAnyModule("lojas:produtos");

const semTabela = () =>
  NextResponse.json(
    { error: "tabela_ausente", detalhe: "Rode o supabase/lojas-catalogo-compartilhado.sql no Supabase." },
    { status: 409 },
  );

const falha = (e: unknown) =>
  e instanceof LojasTabelaAusente ? semTabela()
    : /relation .* does not exist|Could not find the table/i.test(String((e as Error).message)) ? semTabela()
    : NextResponse.json({ error: String((e as Error).message) }, { status: 500 });

/** O que dá pra trazer de outras lojas. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await podeLer())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  try { return NextResponse.json({ produtos: await produtosDisponiveis(id) }); } catch (e) { return falha(e); }
}

/** Passa a vender aqui os produtos escolhidos. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await podeEscrever())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const corpo = await req.json().catch(() => ({}));
  const ids = Array.isArray(corpo?.produtos) ? corpo.produtos.filter((x: unknown) => typeof x === "string") : [];
  if (!ids.length) return NextResponse.json({ error: "Escolha ao menos um produto." }, { status: 400 });
  try {
    await vincularProdutos(id, ids);
    return NextResponse.json({ ok: true, vinculados: ids.length });
  } catch (e) { return falha(e); }
}

/**
 * Tira da vitrine desta loja um produto de outra.
 *
 * NÃO apaga o produto: quem apaga é a loja dona. Um "remover" que apagasse a
 * peça na origem faria a loja B sumir com o produto da loja A — e ninguém
 * espera isso de um botão que diz "não vender mais aqui".
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await podeEscrever())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const produtoId = new URL(req.url).searchParams.get("produto") ?? "";
  if (!produtoId) return NextResponse.json({ error: "Produto não informado." }, { status: 400 });
  try {
    await desvincularProduto(id, produtoId);
    return NextResponse.json({ ok: true });
  } catch (e) { return falha(e); }
}
