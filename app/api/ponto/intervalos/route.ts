import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { lerIntervalos, salvarIntervalos, lancarIntervalos, janelasValidas } from "@/lib/ponto-intervalos";

export const dynamic = "force-dynamic";

// Intervalos automáticos da produção. Só admin (mesma porta do "preencher").
// GET → config + pessoas do ponto pra escolher. PUT → salva e já lança o
// retroativo desde `desde`. POST → só lança (botão "Lançar agora").
async function admin() {
  const me = await getProfile();
  return me && me.role === "admin" ? me : null;
}

export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const db = createSupabaseAdminClient();
  const desde = new Date(Date.now() - 3 * 3600e3 - 7 * 86400e3).toISOString().slice(0, 10);
  const [cfg, { data: pessoas }, { data: retornos }] = await Promise.all([
    lerIntervalos(db),
    db.from("ponto_pessoas").select("id,nome").eq("ativo", true).order("nome").limit(300),
    // Quanto cada um demorou pra tocar "voltei" no tablet (últimos 7 dias).
    // Sem a tabela (SQL não rodado) vem erro e a lista fica vazia.
    db.from("ponto_intervalo_retornos").select("dia,janela,colaborador_nome,fim_em,voltou_em,atraso_s")
      .gte("dia", desde).order("voltou_em", { ascending: false }).limit(200),
  ]);
  return NextResponse.json({ ...cfg, pessoas: pessoas ?? [], retornos: retornos ?? [] });
}

export async function PUT(req: NextRequest) {
  const me = await admin();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { ativo?: boolean; desde?: string; janelas?: unknown };
  const atual = await lerIntervalos();
  const cfg = {
    ativo: typeof b.ativo === "boolean" ? b.ativo : atual.ativo,
    desde: b.desde && /^\d{4}-\d{2}-\d{2}$/.test(b.desde) ? b.desde : atual.desde,
    janelas: b.janelas !== undefined ? janelasValidas(b.janelas) : atual.janelas,
  };
  try {
    await salvarIntervalos(cfg, me.id);
    const r = cfg.ativo ? await lancarIntervalos() : { lancados: 0 };
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}

export async function POST() {
  if (!(await admin())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  try {
    return NextResponse.json(await lancarIntervalos());
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
