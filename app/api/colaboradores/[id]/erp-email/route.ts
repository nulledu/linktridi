import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// E-mail vem do ERP legado: usuarios.email, casado por usuarios.user_id =
// employees.erp_user_id (mesmo vínculo do import-erp).
const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || "";

async function ensureAdmin() {
  const p = await getProfile();
  return p && p.role === "admin" ? p : null;
}

// GET /api/colaboradores/[id]/erp-email — devolve { email } do ERP pelo vínculo.
// Só admin. Não grava nada: o admin confirma no Salvar do editor.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await ensureAdmin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;

  const db = createSupabaseAdminClient();
  const { data: emp } = await db.from("employees").select("erp_user_id").eq("id", id).maybeSingle();
  const erpId = (emp as { erp_user_id?: string | null } | null)?.erp_user_id;
  if (!erpId) return NextResponse.json({ error: "sem_vinculo_erp" }, { status: 404 });

  try {
    const r = await fetch(`${LEGACY_URL}/rest/v1/usuarios?user_id=eq.${encodeURIComponent(erpId)}&select=email&limit=1`, {
      headers: { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` }, cache: "no-store",
    });
    if (!r.ok) return NextResponse.json({ error: "erp_indisponivel" }, { status: 502 });
    const rows = (await r.json()) as Array<{ email?: string | null }>;
    const email = (rows[0]?.email || "").trim().toLowerCase() || null;
    if (!email) return NextResponse.json({ error: "sem_email_no_erp" }, { status: 404 });
    return NextResponse.json({ email });
  } catch {
    return NextResponse.json({ error: "erp_indisponivel" }, { status: 502 });
  }
}
