import { NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { papelOuChave } from "@/lib/acesso";
import { listResponsaveis, erpIdDoPerfil } from "@/lib/comercial-pedidos";
import { foraDoComercial } from "@/lib/vendedoras";

export const dynamic = "force-dynamic";
// Editar pedido de OUTRA pessoa é de admin/gerente de vendas. Todo mundo mais
// só mexe no que é seu — o gate fino mora no PATCH/DELETE, este é o espelho
// que a tela usa pra saber o que desenhar editável.
const PODE_TUDO = ["admin", "gerente_vendas"];

// A lista de "pedidos puxados de" NÃO é mais editável: ela é o reflexo de quem
// tem a sub-permissão "Lançar pedido" na grade. Por isso só existe GET aqui —
// adicionar/remover pessoa se faz em Pessoas → permissões.
export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const podeGerir = await papelOuChave(me, PODE_TUDO);
  const [todos, meErpId] = await Promise.all([listResponsaveis(), erpIdDoPerfil(me.id)]);
  // Admin passa em "Lançar pedido" sozinho — quem não é vendedor
  // (`foraDoComercial`: Samuel, Suzuki) não aparece entre os vendedores.
  const responsaveis = todos.filter((r) => !foraDoComercial(r.nome));
  return NextResponse.json({ responsaveis, podeGerir, meErpId, erpUsers: [] });
}
