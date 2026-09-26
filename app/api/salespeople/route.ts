import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getProfile } from "@/lib/require-auth";
import { podeGerirMetas } from "@/lib/pode-gerir-metas";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  photo_url: z.string().url().nullable().optional(),
  team: z.enum(["marketing", "comercial"]).optional(),
  monthly_goal: z.number().optional(),
  weekly_goal: z.number().optional(),
  daily_goal: z.number().optional(),
});

// PUT /api/salespeople — atualiza metas/foto de um vendedor (autenticado).
export async function PUT(req: NextRequest) {
  // getProfile confere `active`; getAuthedUser só confere que existe sessão —
  // quem foi desligado continuava escrevendo aqui.
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // A meta alimenta a parede pública da TV: mesmo portão de /api/metas.
  if (!(await podeGerirMetas(me.role, me.id, me.username))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.issues }, { status: 422 });
  }
  const { id, ...fields } = parsed.data;
  const db = createSupabaseAdminClient();
  const { error } = await db.from("salespeople").update(fields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
