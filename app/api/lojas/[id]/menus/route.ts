import { NextRequest, NextResponse } from "next/server";
import { getProfileForAnyModule, getProfileForModule } from "@/lib/require-auth";
import type { ItemDeMenu } from "@/lib/lojas-conteudo";
import {
  ConteudoTabelaAusente, criarMenu, listarMenus, removerMenu, salvarMenu,
} from "@/lib/lojas-conteudo-db";

export const dynamic = "force-dynamic";

const podeLer = () => getProfileForModule("lojas");
const podeEscrever = () => getProfileForAnyModule("lojas:produtos");

const semTabela = () =>
  NextResponse.json(
    { error: "tabela_ausente", detalhe: "Rode o supabase/lojas-paginas-menus.sql no Supabase." },
    { status: 409 },
  );

const falha = (e: unknown) =>
  e instanceof ConteudoTabelaAusente ? semTabela()
    : NextResponse.json({ error: String((e as Error).message) }, { status: 400 });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await podeLer())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  try { return NextResponse.json({ menus: await listarMenus(id) }); } catch (e) { return falha(e); }
}

/** Sem `menu` no corpo é menu NOVO; com, é o conteúdo daquele menu. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await podeEscrever())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const c = await req.json().catch(() => ({}));

  if (!c?.menu) {
    const titulo = String(c?.titulo ?? "").trim();
    if (!titulo) return NextResponse.json({ error: "Dê um nome ao menu." }, { status: 400 });
    try { return NextResponse.json({ ok: true, menu: await criarMenu(id, titulo) }); } catch (e) { return falha(e); }
  }

  const itens: ItemDeMenu[] = Array.isArray(c?.itens)
    ? c.itens
        .filter((i: unknown) => !!i && typeof (i as ItemDeMenu).titulo === "string")
        .map((i: ItemDeMenu) => ({ titulo: String(i.titulo), destino: String(i.destino ?? "") }))
    : [];
  try {
    await salvarMenu(id, String(c.menu), String(c?.titulo ?? ""), itens);
    return NextResponse.json({ ok: true });
  } catch (e) { return falha(e); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await podeEscrever())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const menuId = new URL(req.url).searchParams.get("menu") ?? "";
  if (!menuId) return NextResponse.json({ error: "Menu não informado." }, { status: 400 });
  try {
    await removerMenu(id, menuId);
    return NextResponse.json({ ok: true });
  } catch (e) { return falha(e); }
}
