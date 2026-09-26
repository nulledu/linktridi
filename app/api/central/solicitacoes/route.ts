import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/require-auth";
import {
  TIPOS_SOLICITACAO, SETORES_DESTINO, PRIORIDADES, DESTINOS_SOLICITACAO,
  MAX_IMAGENS_SOLICITACAO, setorDoTipoSolicitacao,
} from "@/lib/central";
import { notificar } from "@/lib/notificacoes";
import {
  COLS_BASE, COLS_EXTRA, PODE_RESOLVER, assinaturaDaFila, faltaColuna, listarSolicitacoes,
} from "@/lib/central-solicitacoes";

export const dynamic = "force-dynamic";

// GET ?assinatura=1 → tick do poll (não devolve a lista, ver o módulo).
// GET → lista todas (mais recentes primeiro) + se eu posso resolver.
export async function GET(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (req.nextUrl.searchParams.get("assinatura")) {
    return NextResponse.json({ assinatura: await assinaturaDaFila() });
  }

  return NextResponse.json({
    solicitacoes: await listarSolicitacoes(),
    podeResolver: PODE_RESOLVER.includes(me.role),
    meuId: me.id,
  });
}

// Só URLs do nosso próprio storage entram: a lista é renderizada como <img>
// para todo mundo, então aceitar link arbitrário do corpo é hospedar tracker
// alheio dentro do ERP.
function imagensValidas(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return v
    .map((u) => String(u || "").trim())
    .filter((u) => u && base && u.startsWith(`${base}/storage/v1/object/public/`))
    .slice(0, MAX_IMAGENS_SOLICITACAO);
}

// POST → cria solicitação. Qualquer usuário autenticado.
export async function POST(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const titulo = String(b.titulo || "").trim();
  if (!titulo) return NextResponse.json({ error: "missing_titulo" }, { status: 400 });
  const tipo = TIPOS_SOLICITACAO.includes(String(b.tipo) as never) ? String(b.tipo) : "Outro";
  const setor = SETORES_DESTINO.includes(String(b.setor_destino) as never) ? String(b.setor_destino) : setorDoTipoSolicitacao(tipo);
  const prioridade = PRIORIDADES.includes(String(b.prioridade) as never) ? String(b.prioridade) : "normal";
  const imagens = imagensValidas(b.imagens);
  const db = createSupabaseAdminClient();

  // Destino: pessoa só vale se o perfil existe e está ativo — o nome vem do
  // banco, nunca do corpo da requisição (senão qualquer um forja "Diretoria").
  let destinoTipo = DESTINOS_SOLICITACAO.includes(String(b.destino_tipo) as never) ? String(b.destino_tipo) : "setor";
  let destinatarioId: string | null = null;
  let destinatarioNome: string | null = null;
  if (destinoTipo === "pessoa") {
    const pedido = String(b.destinatario_id || "");
    const { data: p } = pedido
      ? await db.from("profiles").select("id,name,username,active").eq("id", pedido).maybeSingle()
      : { data: null };
    if (p && p.active !== false) {
      destinatarioId = p.id;
      destinatarioNome = p.name || p.username || null;
    } else {
      destinoTipo = "setor";  // pessoa inválida vira pedido de setor, não erro
    }
  }

  const base = {
    autor_id: me.id,
    autor_nome: me.name ?? null,
    tipo, setor_destino: setor, titulo,
    descricao: b.descricao ? String(b.descricao).trim() : null,
    prioridade,
    status: "pendente",
  };
  const linha = {
    ...base,
    imagens,
    destino_tipo: destinoTipo,
    destinatario_id: destinatarioId,
    destinatario_nome: destinatarioNome,
  };
  let { data, error } = await db.from("central_solicitacoes").insert(linha).select(COLS_EXTRA).single();
  if (error && faltaColuna(error.message)) {
    ({ data, error } = await db.from("central_solicitacoes").insert(base).select(COLS_BASE).single());
  }
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });

  // Endereçada a alguém: só essa pessoa é avisada — avisar o batalhão inteiro
  // era exatamente o ruído que fez pedirem destino nominal.
  try {
    const alvos: string[] = destinatarioId
      ? [destinatarioId]
      : ((await db.from("profiles").select("id").eq("active", true).in("role", PODE_RESOLVER)).data ?? [])
        .map((p: { id: string }) => p.id);
    await notificar(alvos.filter((id: string) => id !== me.id).map((id: string) => ({
      user_id: id,
      tipo: "solicitacao" as const,
      titulo: `Solicitação · ${destinatarioNome ?? setor}`,
      corpo: titulo,
      link: "/central/solicitacoes",
      de_nome: me.name ?? null,
    })));
  } catch { /* não bloqueia */ }

  return NextResponse.json({ solicitacao: data });
}

// PATCH → muda status. Body: { id, status, motivo_recusa? }.
// Resolve quem tem cargo de aprovador OU quem recebeu a solicitação no nome.
export async function PATCH(req: NextRequest) {
  const me = await getProfile();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const id = String(b.id || "");
  const status = String(b.status || "");
  if (!id || !["aprovada", "recusada", "concluida", "cancelada"].includes(status)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const db = createSupabaseAdminClient();
  // Uma leitura só resolve as duas perguntas: quem é o dono e pra quem foi.
  // (`destinatario_id` pode não existir ainda — o select cai pro formato antigo.)
  let alvo: { autor_id: string; status: string; destinatario_id?: string | null } | null = null;
  {
    const r = await db.from("central_solicitacoes").select("autor_id,status,destinatario_id").eq("id", id).maybeSingle();
    if (r.error && faltaColuna(r.error.message)) {
      const r2 = await db.from("central_solicitacoes").select("autor_id,status").eq("id", id).maybeSingle();
      alvo = r2.data;
    } else if (r.error) {
      return NextResponse.json({ error: "failed" }, { status: 500 });
    } else {
      alvo = r.data;
    }
  }
  if (!alvo) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Cancelar é do AUTOR, não de quem aprova: pedido aberto por engano não
  // deveria precisar que um gerente "recuse" — vira recusa no histórico de
  // alguém que não recusou nada. Só vale enquanto ninguém respondeu.
  const autorizado = status === "cancelada"
    ? alvo.autor_id === me.id && alvo.status === "pendente"
    : PODE_RESOLVER.includes(me.role) || alvo.destinatario_id === me.id;
  if (!autorizado) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const patch: Record<string, unknown> = {
    status,
    resolvido_por: me.id,
    resolvido_em: new Date().toISOString(),
  };
  if (status === "recusada") patch.motivo_recusa = b.motivo_recusa ? String(b.motivo_recusa).trim() : null;
  const { error } = await db.from("central_solicitacoes").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });

  // Quem pediu fica sabendo sem precisar voltar na tela pra conferir. (Quem
  // cancela é o próprio autor, então esse caso não gera notificação nenhuma.)
  try {
    if (alvo.autor_id !== me.id) {
      const { data: s } = await db.from("central_solicitacoes").select("titulo").eq("id", id).maybeSingle();
      const rotulo = status === "aprovada" ? "aprovada" : status === "recusada" ? "recusada" : "concluída";
      await notificar([{
        user_id: alvo.autor_id, tipo: "solicitacao" as const,
        titulo: `Solicitação ${rotulo}`, corpo: String(s?.titulo ?? ""),
        link: "/central/solicitacoes", de_nome: me.name ?? null,
      }]);
    }
  } catch { /* não bloqueia */ }

  return NextResponse.json({ ok: true });
}
