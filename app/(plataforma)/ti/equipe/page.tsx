import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { chavesDasAreas, subsDaArea } from "@/lib/areas";
import { EquipeTi, type MembroTi } from "./EquipeTi";

export const dynamic = "force-dynamic";

// TI › Equipe: quem tem acesso à área e o que cada pessoa pode fazer. Lê a
// MESMA grade de permissões do sistema (employees.permissoes) — nada paralelo.
export default async function EquipeTiPage() {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("profiles")
    .select("id,name,role,active,employees(photo_url,cargo,permissoes)")
    .eq("active", true).order("name", { ascending: true }).limit(300);

  const subs = subsDaArea("ti");
  const membros: MembroTi[] = [];
  for (const p of (data ?? []) as Record<string, unknown>[]) {
    const emp = (Array.isArray(p.employees) ? p.employees[0] : p.employees) as Record<string, unknown> | null;
    const permissoes = (emp?.permissoes ?? null) as Record<string, boolean> | null;
    const chaves = new Set(chavesDasAreas(permissoes));
    const ehAdmin = p.role === "admin";
    // Admin entra pelo fallback de papel (rbac) enquanto a grade não decide.
    const tem = chaves.has("ti") || (ehAdmin && !(permissoes && "ti" in permissoes && !permissoes.ti));
    if (!tem) continue;
    membros.push({
      id: p.id as string, nome: (p.name as string) ?? "",
      cargo: (emp?.cargo as string) ?? (ehAdmin ? "Administrador" : ""),
      foto: (emp?.photo_url as string) ?? null,
      // Admin por fallback ganha só as subs comuns — as `sensivel` (excluir,
      // acessos) nunca vêm em bloco, igual ao resto do sistema.
      chaves: subs.filter((s) => chaves.has(`ti:${s.key}`) || (ehAdmin && !s.sensivel)).map((s) => s.label),
    });
  }
  return <EquipeTi membros={membros} />;
}
