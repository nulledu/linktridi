import { NextRequest, NextResponse } from "next/server";
import { marketApiError, marketDb, requireMarketAdmin } from "../_shared";

export const dynamic = "force-dynamic";

// Categorias do mercadinho (bebidas, congelados, doces, salgados...).
//
// A tabela `mercadinho.categorias` e a coluna `produtos.categoria_id` já
// existiam desde o schema inicial, e o tablet já busca por categoria — só que
// nada no painel escrevia nesse campo, então todo produto ficava "Sem
// categoria" e a coluna da lista mostrava "—" pra tudo.

export async function GET() {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  try {
    const { data, error } = await marketDb().from("categorias").select("id,nome,imagem_url").order("nome");
    if (error) throw error;
    return NextResponse.json({ ok: true, data: (data ?? []).map((c: { id: number; nome: string; imagem_url: string | null }) => ({
      id: Number(c.id), nome: String(c.nome), imagemUrl: c.imagem_url ?? null,
    })) });
  } catch (error) { return marketApiError(error); }
}

// POST { nome } → cria (ou devolve a existente). Idempotente por NOME: o
// cadastro é feito por várias pessoas e "Bebidas" digitado duas vezes viraria
// duas categorias com o mesmo rótulo, quebrando o agrupamento da lista.
export async function POST(req: NextRequest) {
  if (!(await requireMarketAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  const corpo = await req.json().catch(() => null) as { nome?: string } | null;
  const nome = String(corpo?.nome ?? "").trim();
  if (nome.length < 2 || nome.length > 60) {
    return NextResponse.json({ ok: false, error: "nome_invalido" }, { status: 422 });
  }
  const db = marketDb();
  try {
    // `ilike` e não `eq`: "bebidas" e "Bebidas" são a mesma prateleira.
    const { data: existente } = await db.from("categorias").select("id,nome").ilike("nome", nome).maybeSingle();
    if (existente) {
      return NextResponse.json({ ok: true, data: { id: Number(existente.id), nome: String(existente.nome), imagemUrl: null }, jaExistia: true });
    }
    const { data, error } = await db.from("categorias").insert({ nome }).select("id,nome").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, data: { id: Number(data.id), nome: String(data.nome), imagemUrl: null } });
  } catch (error) { return marketApiError(error); }
}
