import { requireModuleKeys } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { RoadmapClient } from "./RoadmapClient";

export const dynamic = "force-dynamic";

// TI › Roadmap: a timeline é o elemento principal. As chaves finas descem pro
// cliente decidirem o que aparece (editar/excluir) — a API confere de novo.
export default async function RoadmapPage({ params }: { params: Promise<{ id: string }> }) {
  const { keys } = await requireModuleKeys("ti");
  const { id } = await params;
  const { data } = await createSupabaseAdminClient()
    .from("profiles").select("id,name").eq("active", true).order("name", { ascending: true }).limit(300);
  const pessoas = ((data ?? []) as { id: string; name: string | null }[]).map((p) => ({ id: p.id, nome: p.name ?? "" }));
  return <RoadmapClient id={id} pessoas={pessoas}
    podeEditar={keys.includes("ti:editar")} podeExcluir={keys.includes("ti:excluir")} />;
}
