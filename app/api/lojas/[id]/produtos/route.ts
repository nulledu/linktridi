import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule, getProfileForModule } from "@/lib/require-auth";
import { listProdutos, salvarProduto, LojasTabelaAusente } from "@/lib/lojas-db";
import { lerProduto } from "@/lib/lojas-entrada";

export const dynamic = "force-dynamic";

// Ler é a área; ESCREVER exige a sub que mexe no catálogo. Quem só acompanha
// os pedidos não passa a poder mudar preço por ter aberto a tela.
const podeLer = () => getProfileForModule("lojas");
const podeEscrever = () => getProfileForAnyModule("lojas:produtos");

const semTabela = () =>
  NextResponse.json({ error: "tabela_ausente", detalhe: "Rode o supabase/lojas.sql no Supabase." }, { status: 409 });

const falha = (e: unknown) =>
  e instanceof LojasTabelaAusente ? semTabela()
    : NextResponse.json({ error: String((e as Error).message) }, { status: 500 });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await podeLer())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  try { return NextResponse.json({ produtos: await listProdutos(id) }); } catch (e) { return falha(e); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await podeEscrever())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const lido = lerProduto(await req.json().catch(() => ({})));
  if (!lido.ok) return NextResponse.json({ error: lido.erro }, { status: 400 });
  try {
    return NextResponse.json({ produto: await salvarProduto(id, lido.dados) });
  } catch (e) { return falha(e); }
}
