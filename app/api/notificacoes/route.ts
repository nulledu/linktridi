import { NextRequest, NextResponse } from "next/server";
import { getProfile, getProfileForModule } from "@/lib/require-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { notificar, type TipoNotif } from "@/lib/notificacoes";

export const dynamic = "force-dynamic";

// GET → minhas notificações (recentes) + nº não lidas. Resiliente a tabela ausente.
// `?contagem=1` → SÓ o número. O sino fica em toda página de todo usuário e se
// atualiza sozinho; puxar as 40 notificações inteiras com texto a cada ciclo, com
// o painel fechado, era egress puro. A lista só é buscada quando alguém abre.
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createSupabaseAdminClient();
  if (req.nextUrl.searchParams.get("contagem") === "1") {
    try {
      const { count } = await db.from("notificacoes").select("id", { count: "exact", head: true })
        .eq("user_id", me.id).eq("lida", false);
      return NextResponse.json({ naoLidas: count ?? 0 });
    } catch { return NextResponse.json({ naoLidas: 0 }); }
  }
  try {
    const { data } = await db.from("notificacoes").select("id,tipo,titulo,corpo,link,lida,de_nome,created_at")
      .eq("user_id", me.id).order("created_at", { ascending: false }).limit(40);
    const lista = (data ?? []) as { lida: boolean }[];
    return NextResponse.json({ notificacoes: lista, naoLidas: lista.filter((n) => !n.lida).length });
  } catch { return NextResponse.json({ notificacoes: [], naoLidas: 0 }); }
}

// PATCH → marca como lida. { id } ou { todas: true }.
export async function PATCH(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const db = createSupabaseAdminClient();
  let q = db.from("notificacoes").update({ lida: true }).eq("user_id", me.id);
  if (!b.todas && b.id) q = q.eq("id", String(b.id));
  if (!b.todas && !b.id) return NextResponse.json({ error: "invalid" }, { status: 400 });
  await q;
  return NextResponse.json({ ok: true });
}

// POST → PUSH. { titulo, corpo?, link?, para?: userId | "todos", tipo? }
// Portão = a sub-permissão "Notificações" de Configurações (era só o papel
// admin, então ligar o quadradinho não adiantava nada).
export async function POST(req: NextRequest) {
  const me = await getProfileForModule("administracao:notificacoes");
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const titulo = String(b.titulo || "").trim();
  if (!titulo) return NextResponse.json({ error: "missing_titulo" }, { status: 400 });
  const tipo = (["mensagem", "tarefa", "lembrete", "solicitacao", "sistema", "admin"].includes(String(b.tipo)) ? b.tipo : "admin") as TipoNotif;
  const corpo = b.corpo ? String(b.corpo) : null;
  const link = b.link ? String(b.link) : null;
  const db = createSupabaseAdminClient();

  let destinatarios: string[] = [];
  if (b.para && b.para !== "todos") destinatarios = [String(b.para)];
  else {
    const { data } = await db.from("profiles").select("id").eq("active", true);
    destinatarios = (data ?? []).map((p: { id: string }) => p.id);
  }
  await notificar(destinatarios.map((u) => ({ user_id: u, tipo, titulo, corpo, link, de_nome: me.name ?? "Administração" })));
  return NextResponse.json({ ok: true, enviadas: destinatarios.length });
}
