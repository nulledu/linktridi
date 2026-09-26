import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { RoadmapsClient } from "./RoadmapsClient";

export const dynamic = "force-dynamic";

// TI › Roadmaps. Filtros chegam pela URL (os cartões da Visão geral abrem a
// lista já no recorte). A lista de pessoas serve o seletor de responsável.
export default async function RoadmapsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { data } = await createSupabaseAdminClient()
    .from("profiles").select("id,name").eq("active", true).order("name", { ascending: true }).limit(300);
  const pessoas = ((data ?? []) as { id: string; name: string | null }[]).map((p) => ({ id: p.id, nome: p.name ?? "" }));
  return <RoadmapsClient pessoas={pessoas} inicial={{ status: sp.status, filtro: sp.filtro, novo: sp.novo }} />;
}
