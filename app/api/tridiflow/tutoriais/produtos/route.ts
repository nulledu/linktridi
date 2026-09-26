import { NextResponse } from "next/server";
import { getProfileForAnyModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

// Produtos ativos das lojas, pro seletor do bloco "produto" e dos materiais
// ("Você vai precisar"). A foto vai junto: numa lista de 60 carimbos parecidos
// o nome sozinho não diz qual é qual.
export async function GET() {
  if (!(await getProfileForAnyModule("marketing", "tridiflow:tutoriais"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { data, error } = await createSupabaseAdminClient().from("loja_produtos").select("id,titulo,imagens").eq("status", "ativo").order("titulo").limit(1000);
  if (error) return NextResponse.json({ produtos: [] });
  const produtos = ((data ?? []) as { id: string; titulo: string | null; imagens: unknown }[]).map((p) => {
    const imagens = Array.isArray(p.imagens) ? (p.imagens as { url?: unknown }[]) : [];
    const primeira = imagens.find((i) => typeof i?.url === "string")?.url;
    return { id: p.id, titulo: String(p.titulo || "Produto"), imagemUrl: typeof primeira === "string" ? primeira : "" };
  });
  return NextResponse.json({ produtos });
}
