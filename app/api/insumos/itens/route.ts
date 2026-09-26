import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

// GET → itens que a produção PODE pedir pelo app: só componentes-peças e peças
// marcados como requisitáveis (o admin escolhe quais no catálogo).
export async function GET() {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createSupabaseAdminClient();
  const { data } = await db.from("estoque_itens")
    .select("nome,categoria,tipo,setor_requisicao").eq("ativo", true).eq("requisitavel", true)
    .order("setor_requisicao", { ascending: true }).order("nome", { ascending: true });
  return NextResponse.json({ itens: data ?? [] });
}
