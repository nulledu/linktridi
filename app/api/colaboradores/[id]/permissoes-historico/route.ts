import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/colaboradores/[id]/permissoes-historico — últimas alterações de acesso
// (quem mudou e quando). Quem tem a área "Colaboradores" — é leitura da mesma
// aba que a grade. Tolerante: sem a tabela, devolve lista vazia.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getProfileForModule("colaboradores"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("permissoes_historico")
    .select("id,areas,qtd,alterado_por_nome,created_at")
    .eq("employee_id", id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ historico: [] });
  return NextResponse.json({ historico: data ?? [] });
}
