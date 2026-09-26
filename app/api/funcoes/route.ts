import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProfileForModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { listFuncoes, FUNCOES } from "@/lib/funcoes";

export const dynamic = "force-dynamic";

// Portão da ÁREA (mesmo da aba de Funções, dentro de Colaboradores) e não do
// papel: quem recebeu a área na grade precisa conseguir usar a tela inteira.
// Atribuir função não distribui poder no sistema — é rótulo de quem faz o quê.
async function admin() {
  return getProfileForModule("colaboradores");
}

// GET /api/funcoes — atribuições atuais.
export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ funcoes: await listFuncoes() });
}

const schema = z.object({
  erp_user_id: z.string().uuid(),
  nome: z.string().trim().min(1),
  foto_url: z.string().url().nullable().optional(),
  funcao: z.enum(FUNCOES.map((f) => f.key) as [string, ...string[]]),
});

// POST /api/funcoes — atribui (ou atualiza) a função de uma pessoa do ERP.
export async function POST(req: NextRequest) {
  if (!(await admin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  const db = createSupabaseAdminClient();
  const { error } = await db.from("funcoes").upsert({
    erp_user_id: parsed.data.erp_user_id,
    nome: parsed.data.nome,
    foto_url: parsed.data.foto_url ?? null,
    funcao: parsed.data.funcao,
    active: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/funcoes?id=<erp_user_id> — remove a função (some do dash).
export async function DELETE(req: NextRequest) {
  if (!(await admin())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });
  const db = createSupabaseAdminClient();
  const { error } = await db.from("funcoes").delete().eq("erp_user_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
