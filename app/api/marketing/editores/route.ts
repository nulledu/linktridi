import { NextResponse } from "next/server";
import { requireModuleKeys } from "@/lib/require-auth";
import { cached } from "@/lib/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/marketing/editores — quem pode aparecer como "editor responsável".
// Colaboradores ativos (o formulário também aceita um nome digitado, pra quem
// ainda não tem conta no sistema). Cache de 5 min: a lista quase não muda.
export async function GET() {
  await requireModuleKeys("marketing");
  try {
    const editores = await cached("marketing:editores", 300_000, async () => {
      const db = createSupabaseAdminClient();
      const { data, error } = await db
        .from("profiles")
        .select("id,name,employees(departamento)")
        .eq("active", true)
        .order("name")
        .limit(300);
      if (error) return [] as { id: string; nome: string; departamento: string | null }[];
      return ((data ?? []) as Record<string, unknown>[]).map((r) => {
        const emp = r.employees as { departamento?: string } | { departamento?: string }[] | null;
        const dep = Array.isArray(emp) ? emp[0]?.departamento : emp?.departamento;
        return { id: r.id as string, nome: (r.name as string) ?? "", departamento: dep ?? null };
      });
    });
    return NextResponse.json({ ok: true, editores });
  } catch (error) {
    const e = error as { message?: string };
    return NextResponse.json({ ok: false, error: e?.message || "editores_error" }, { status: 500 });
  }
}
