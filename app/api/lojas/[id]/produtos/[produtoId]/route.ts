import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { removerProduto, salvarProduto, LojasTabelaAusente } from "@/lib/lojas-db";
import { lerProduto } from "@/lib/lojas-entrada";

export const dynamic = "force-dynamic";

const podeEscrever = () => getProfileForAnyModule("lojas:produtos");

const falha = (e: unknown) =>
  e instanceof LojasTabelaAusente
    ? NextResponse.json({ error: "tabela_ausente", detalhe: "Rode o supabase/lojas.sql no Supabase." }, { status: 409 })
    : NextResponse.json({ error: String((e as Error).message) }, { status: 500 });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; produtoId: string }> }) {
  if (!(await podeEscrever())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id, produtoId } = await params;
  const lido = lerProduto(await req.json().catch(() => ({})));
  if (!lido.ok) return NextResponse.json({ error: lido.erro }, { status: 400 });
  try {
    // O `eq("loja_id")` do repositório é o que impede editar o produto de OUTRA
    // loja trocando o id na URL — o id do produto sozinho não prova de quem é.
    return NextResponse.json({ produto: await salvarProduto(id, lido.dados, produtoId) });
  } catch (e) { return falha(e); }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; produtoId: string }> }) {
  if (!(await podeEscrever())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id, produtoId } = await params;
  try {
    await removerProduto(id, produtoId);
    return NextResponse.json({ ok: true });
  } catch (e) { return falha(e); }
}
