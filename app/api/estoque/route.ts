import { NextRequest, NextResponse } from "next/server";
import { getProfile, getProfileForModule } from "@/lib/require-auth";
import { podeAjustarEstoque } from "@/lib/estoque-permissoes";
import { buildEstoqueSnapshot, registrarMovimento } from "@/lib/estoque";

export const dynamic = "force-dynamic";

export async function GET() {
  // Mesmo portão da página (requireModule("estoque")): quem tem o módulo por
  // cargo/nível vê o estoque. Escrever (POST) segue restrito a admin/estoquista.
  const me = await getProfileForModule("estoque");
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ...(await buildEstoqueSnapshot()), canManage: await podeAjustarEstoque(me) });
}

// POST → ajuste manual de estoque. Body: { produto_id, produto_nome, delta, motivo }
//
// Esta rota é o `delta` puro: somar e tirar do saldo, sem tocar no cadastro. É
// literalmente a sub-permissão "Ajustar quantidade" — antes bastava
// `estoque:itens`, a mesma chave de quem só queria consultar o catálogo.
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await podeAjustarEstoque(me))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let b: { produto_id?: number; produto_nome?: string; delta?: number; motivo?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const delta = Math.round(Number(b.delta) || 0);
  if (!b.produto_id || !b.produto_nome || !delta) return NextResponse.json({ error: "invalid" }, { status: 400 });

  try {
    await registrarMovimento({
      produto_id: b.produto_id, produto_nome: b.produto_nome, delta,
      motivo: b.motivo?.trim() || "Ajuste manual", origem: "manual", por_nome: me.name || me.username,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: "failed", detail: String(e) }, { status: 500 });
  }
}
