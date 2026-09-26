import { NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { canSeeCusto, type Role } from "@/lib/rbac";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { listFornecedoresMateriais } from "@/lib/tridi-custos";

export const dynamic = "force-dynamic";

// GET → fornecedores + materiais (base de custos da Tridi). Preço p/ quem pode ver
// custo (papel) OU tem a sub-permissão estoque:precos.
export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const podeVerCusto = canSeeCusto(me.role as Role)
    || (await resolveMyModuleKeys({ id: me.id, role: me.role as Role })).includes("estoque:precos");
  try {
    const { fornecedores, materiais } = await listFornecedoresMateriais();
    if (podeVerCusto) return NextResponse.json({ fornecedores, materiais, podeVerCusto });
    // Sem custo: zera valores.
    return NextResponse.json({
      fornecedores: fornecedores.map((f) => ({ ...f, valorTotal: 0 })),
      materiais: materiais.map((m) => ({ ...m, valor: 0 })),
      podeVerCusto,
    });
  } catch (e) {
    return NextResponse.json({ error: "custos_failed", detail: String(e).slice(0, 120) }, { status: 502 });
  }
}
