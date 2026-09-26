import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { resolveMyModuleKeys } from "@/lib/perfis";
import { notificar } from "@/lib/notificacoes";
import { custoDasQuedas } from "@/lib/status-custo";
import { resumoDaSemana } from "@/lib/status-relatorio";
import type { Incidente } from "@/lib/status-servidor";
import type { Role } from "@/lib/rbac";

export const dynamic = "force-dynamic";

// Relatório semanal da página de status (segunda, 8h de Brasília — vercel.json).
// O que caiu, por quanto tempo, o item que mais sofreu e o gasto estimado em
// anúncio. Vai como notificação no Gaius pra quem resolve `administracao:status`
// (admin pelo papel, TI e gestor pela ficha) — a MESMA resolução do resto do
// sistema, então a lista nunca discorda de quem consegue abrir o /status.
// O cron é a máquina: autentica por CRON_SECRET, como os outros crons.

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ erro: "unauthorized" }, { status: 401 });
  try {
    const db = createSupabaseAdminClient();
    const desde = new Date(Date.now() - 7 * 864e5).toISOString();
    const { data } = await db.from("status_incidentes")
      .select("id,key,nome,tipo,motivo,inicio,fim,duracao_s")
      .gte("inicio", desde).order("inicio").limit(500);
    const incidentes = (data ?? []) as Incidente[];
    const custos = await custoDasQuedas(incidentes).catch(() => ({} as Record<number, number>));
    const r = resumoDaSemana(incidentes, custos);

    const { data: perfis } = await db.from("profiles").select("id,role,username").eq("active", true).limit(500);
    const ids: string[] = [];
    for (const p of (perfis ?? []) as { id: string; role: Role; username: string | null }[]) {
      const chaves = await resolveMyModuleKeys({ id: p.id, role: p.role, username: p.username }).catch(() => [] as string[]);
      if (chaves.includes("administracao:status")) ids.push(p.id);
    }
    await notificar(ids.map((user_id) => ({ user_id, tipo: "sistema" as const, titulo: r.titulo, corpo: r.corpo, link: "/status" })));
    return NextResponse.json({ ok: true, pessoas: ids.length, quedas: r.quedas, titulo: r.titulo });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as { message?: string })?.message || "cron_error" }, { status: 500 });
  }
}
