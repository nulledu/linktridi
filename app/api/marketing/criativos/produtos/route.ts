import { NextRequest, NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import { criarProduto, listProdutos } from "@/lib/marketing-criativos";

export const dynamic = "force-dynamic";

// GET /api/marketing/criativos/produtos — os produtos que um criativo pode
// vender (nome + tag do nome). Lista curta, pedida uma vez ao abrir a tela.
export async function GET() {
  await requireModuleKeys("marketing");
  return NextResponse.json({ ok: true, produtos: await listProdutos() });
}

// POST { nome, tag } — produto novo. Quem sobe criativo pode criar produto:
// a lista é da biblioteca, não configuração do sistema.
export async function POST(req: NextRequest) {
  const { profile, keys } = await requireModuleKeys("marketing");
  if (!keys.includes("marketing:criar")) return NextResponse.json({ ok: false, error: "sem_permissao" }, { status: 403 });
  const b = await req.json().catch(() => null) as { nome?: unknown; tag?: unknown } | null;
  try {
    const produto = await criarProduto(String(b?.nome ?? ""), String(b?.tag ?? ""), { id: profile.id, nome: profile.name });
    return NextResponse.json({ ok: true, produto });
  } catch (error) {
    const msg = (error as Error)?.message || "produto_error";
    const status = ["nome_obrigatorio", "tag_obrigatoria"].includes(msg) ? 422
      : ["produto_existe", "tag_existe"].includes(msg) ? 409
      : msg === "sql_pendente" ? 400 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
