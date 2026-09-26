import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { caminhoProduto } from "@/lib/lojas";
import { resumoDoProduto } from "@/lib/tridiflow-tutoriais";

export interface ProdutoTutorialPublico { id: string; titulo: string; descricao: string; imagemUrl: string; href: string }

export async function buscarProdutosTutoriais(ids: string[]): Promise<ProdutoTutorialPublico[]> {
  const unicos = [...new Set(ids.filter(Boolean))].slice(0, 100);
  if (!unicos.length) return [];
  try {
    const db = createSupabaseAdminClient();
    const { data, error } = await db.from("loja_produtos").select("id,loja_id,titulo,descricao,imagens,status").in("id", unicos).eq("status", "ativo");
    if (error || !data?.length) return [];
    const produtos = data as { id: string; loja_id: string; titulo: string; descricao: string | null; imagens: unknown }[];
    const lojasIds = [...new Set(produtos.map((p) => p.loja_id))];
    const { data: lojas } = await db.from("lojas").select("id,slug,status").in("id", lojasIds).eq("status", "publicada");
    const slugs = new Map(((lojas ?? []) as { id: string; slug: string }[]).map((l) => [l.id, l.slug]));
    return produtos.flatMap((p) => {
      const lojaSlug = slugs.get(p.loja_id); if (!lojaSlug) return [];
      const imagens = Array.isArray(p.imagens) ? p.imagens as { url?: string }[] : [];
      return [{ id: p.id, titulo: String(p.titulo || "Produto"), descricao: resumoDoProduto(p.descricao || ""), imagemUrl: imagens[0]?.url || "", href: `/l/${lojaSlug}/${caminhoProduto({ id: p.id, titulo: String(p.titulo || "Produto") })}` }];
    });
  } catch { return []; }
}
