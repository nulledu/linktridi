import { NextRequest, NextResponse } from "next/server";
import { getProfileForModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Início da semana (segunda 00:00, fuso SP) em ISO.
function inicioSemanaIso(): string {
  const SP = 3 * 3600 * 1000;
  const now = new Date(Date.now() - SP);
  const dow = (now.getUTCDay() + 6) % 7; // 0 = segunda
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow, 3, 0, 0));
  return d.toISOString();
}

// GET /api/colaboradores/[id]/metricas — horas trabalhadas (semana) + produção.
// Mesmo portão da tela: quem tem a área "Colaboradores" (não só o papel admin).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getProfileForModule("colaboradores"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const db = createSupabaseAdminClient();
  const desde = inicioSemanaIso();

  const { data } = await db.from("atividades")
    .select("status,quantidade_feita")
    .eq("para_id", id).gte("concluida_at", desde);
  const rows = (data ?? []) as { status: string; quantidade_feita: number | null }[];

  let concluidas = 0, itens = 0;
  for (const a of rows) {
    if (a.status !== "concluida") continue;
    concluidas++;
    itens += Number(a.quantidade_feita) || 0;
  }

  // Horas trabalhadas (semana) = do PONTO REAL, não das atividades (Marketing/etc
  // não faz atividade e dava sempre 0). Pareia as batidas por POSIÇÃO por dia
  // (1ª abre, 2ª fecha, 3ª abre…) — robusto a batidas ímpares. Tolerante: sem
  // tabela/registro → 0h.
  let minutos = 0;
  try {
    const { data: pes } = await db.from("ponto_pessoas").select("id").eq("colaborador_id", id).eq("ativo", true);
    const pessoaIds = ((pes ?? []) as { id: string }[]).map((p) => p.id);
    if (pessoaIds.length) {
      const { data: regs } = await db.from("ponto_registros")
        .select("batido_em").in("pessoa_id", pessoaIds).gte("batido_em", desde).order("batido_em", { ascending: true });
      const porDia = new Map<string, number[]>();
      for (const r of (regs ?? []) as { batido_em: string }[]) {
        const dia = new Date(Date.parse(r.batido_em) - 3 * 3600e3).toISOString().slice(0, 10);   // dia no fuso SP
        (porDia.get(dia) ?? porDia.set(dia, []).get(dia)!).push(Date.parse(r.batido_em));
      }
      for (const ts of porDia.values()) {
        ts.sort((a, b) => a - b);
        for (let i = 0; i + 1 < ts.length; i += 2) minutos += Math.max(0, Math.round((ts[i + 1] - ts[i]) / 60000));
      }
    }
  } catch { /* ponto ausente → 0h */ }

  return NextResponse.json({ semana: { horas: Math.round((minutos / 60) * 10) / 10, minutos, concluidas, itens } });
}
