import { NextRequest, NextResponse } from "next/server";
import {
  COLS_MSG_BASE, COLS_MSG_NOVO, corpo, falta, jsonInvalido, meuPapel, naoAutenticado,
  papelEfetivo, paraMensagem, perfisDe, semAcesso, sessao, temEsquemaNovo, type Db,
} from "@/lib/chat/servidor";
import { extrairMencoes, extrairUrls, podeApagar, podeEditar, podeNoCanal, previa } from "@/lib/chat/regras";
import { notificar } from "@/lib/notificacoes";
import type { Anexo, CardContexto, Mensagem, PaginaMensagens, Reacao } from "@/lib/chat/tipos";

export const dynamic = "force-dynamic";

const LIMITE_PADRAO = 60;
const LIMITE_MAX = 120;

// ── GET ─────────────────────────────────────────────────────────────────────
// ?canal=          janela mais recente
// &antes=<iso>     página anterior (rolar para cima)
// &thread=<id>     respostas de uma thread
// &fixadas=1       só as fixadas
export async function GET(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const p = req.nextUrl.searchParams;
  const canal = p.get("canal");
  if (!canal) return falta("canal");
  if (!(await meuPapel(db, canal, me.id))) return semAcesso();

  const novo = await temEsquemaNovo(db);
  const cols = novo ? COLS_MSG_NOVO : COLS_MSG_BASE;
  const limite = Math.min(LIMITE_MAX, Math.max(1, Number(p.get("limite")) || LIMITE_PADRAO));
  const thread = p.get("thread");

  let q = db.from("central_mensagens").select(cols).eq("conversa_id", canal);
  if (p.get("fixadas")) {
    q = q.eq("fixada", true).order("created_at", { ascending: false }).limit(50);
    const { data } = await q;
    return NextResponse.json({ mensagens: ((data ?? []) as Record<string, unknown>[]).map(paraMensagem) });
  }
  if (thread && novo) {
    // A thread inteira sobe de uma vez: conversa de thread é curta por natureza.
    q = q.eq("thread_id", thread).order("created_at", { ascending: true }).limit(200);
  } else {
    // A raiz do canal NÃO mostra respostas de thread (elas vivem no painel).
    if (novo) q = q.is("thread_id", null);
    const antes = p.get("antes");
    if (antes) q = q.lt("created_at", antes);
    q = q.order("created_at", { ascending: false }).limit(limite + 1);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });

  let linhas = (data ?? []) as Record<string, unknown>[];
  let temMais = false;
  if (!thread) {
    temMais = linhas.length > limite;
    if (temMais) linhas = linhas.slice(0, limite);
    linhas.reverse();                                  // volta à ordem cronológica
  }
  const mensagens = linhas.map(paraMensagem);

  const ids = mensagens.map((m) => m.id);
  const [reacoes, autores] = await Promise.all([
    ids.length
      ? db.from("central_reacoes").select("mensagem_id,user_id,emoji").in("mensagem_id", ids)
          .then((r: { data: Reacao[] | null }) => r.data ?? [])
      : Promise.resolve([]),
    perfisDe(db, mensagens.map((m) => m.autor_id)),
  ]);

  const pagina: PaginaMensagens = {
    mensagens, reacoes, autores,
    cursor: mensagens.length ? mensagens[0].created_at : null,
    tem_mais: temMais,
  };
  return NextResponse.json(pagina);
}

// ── POST → envia ────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const b = await corpo<{
    canal_id?: string; texto?: string; anexos?: Anexo[]; card?: CardContexto | null;
    responde_a?: string | null; thread_id?: string | null;
  }>(req);
  if (!b) return jsonInvalido();
  const canal = String(b.canal_id || "");
  const texto = (b.texto || "").trim();
  const anexos = (b.anexos ?? []).slice(0, 10);
  if (!canal) return falta("canal_id");
  if (!texto && !anexos.length && !b.card) return NextResponse.json({ error: "empty" }, { status: 400 });

  const papel = await meuPapel(db, canal, me.id);
  if (!papel) return semAcesso();
  const novo = await temEsquemaNovo(db);

  const { data: conf } = await db.from("central_conversas")
    .select(novo ? "id,nome,tipo,somente_leitura,arquivado" : "id,nome,tipo").eq("id", canal).maybeSingle();
  const canalConf = {
    papel: papelEfetivo(papel, me.role),
    somente_leitura: !!(conf as { somente_leitura?: boolean } | null)?.somente_leitura,
    arquivado: !!(conf as { arquivado?: boolean } | null)?.arquivado,
  };
  if (!podeNoCanal(canalConf, "escrever")) return semAcesso();

  // Menções: resolvidas no SERVIDOR contra os membros reais do canal. Confiar no
  // cliente aqui deixaria qualquer um disparar notificação para o time inteiro.
  const { data: membros } = await db.from("central_conversa_membros")
    .select(novo ? "user_id,notificar,mudo_ate" : "user_id").eq("conversa_id", canal);
  const idsMembros: string[] = ((membros ?? []) as { user_id: string }[]).map((m) => m.user_id);
  const perfisMembros = await perfisDe(db, idsMembros);
  const { ids: mencionados, todos } = texto
    ? extrairMencoes(texto, idsMembros.map((id) => ({ id, name: perfisMembros[id]?.nome ?? "" })))
    : { ids: [], todos: false };

  const registro: Record<string, unknown> = {
    conversa_id: canal, autor_id: me.id, autor_nome: me.name ?? null,
    texto: texto || null,
    // imagem_url continua preenchido para a tela antiga e o backfill não perder nada.
    imagem_url: anexos.find((a) => a.mime?.startsWith("image/"))?.url ?? null,
    responde_a: b.responde_a ? String(b.responde_a) : null,
  };
  if (novo) Object.assign(registro, {
    tipo: b.card ? "card" : "texto",
    anexos: anexos.length ? anexos : null,
    card: b.card ?? null,
    thread_id: b.thread_id ? String(b.thread_id) : null,
    mencoes: mencionados.length ? mencionados : null,
    mencao_todos: todos,
  });

  const { data, error } = await db.from("central_mensagens").insert(registro)
    .select(novo ? COLS_MSG_NOVO : COLS_MSG_BASE).single();
  if (error || !data) return NextResponse.json({ error: "failed", detail: error?.message }, { status: 500 });
  const mensagem = paraMensagem(data as Record<string, unknown>);

  // Índices dos painéis (arquivos/links) e notificação não podem atrasar o envio.
  if (novo) void indexar(db, mensagem, anexos, texto, me.id);
  void avisar(db, mensagem, conf as { nome?: string; tipo?: string } | null, membros as MembroNotif[], me, todos, mencionados);

  return NextResponse.json({ mensagem });
}

type MembroNotif = { user_id: string; notificar?: string; mudo_ate?: string | null };

async function indexar(db: Db, m: Mensagem, anexos: Anexo[], texto: string, autor: string) {
  try {
    if (anexos.length) {
      await db.from("central_anexos").insert(anexos.map((a) => ({
        mensagem_id: m.id, conversa_id: m.conversa_id, autor_id: autor,
        url: a.url, nome: a.nome, mime: a.mime, tamanho: a.tamanho ?? null,
        largura: a.largura ?? null, altura: a.altura ?? null,
      })));
    }
    const urls = texto ? extrairUrls(texto) : [];
    if (urls.length) {
      await db.from("central_links").insert(urls.map((u) => ({
        mensagem_id: m.id, conversa_id: m.conversa_id, autor_id: autor, url: u,
      })));
    }
  } catch { /* painel de arquivos é acessório: nunca derruba o envio */ }
}

async function avisar(
  db: Db, m: Mensagem, conf: { nome?: string; tipo?: string } | null,
  membros: MembroNotif[], me: { id: string; name: string | null },
  todos: boolean, mencionados: string[],
) {
  try {
    const agora = Date.now();
    const alvo = (membros ?? []).filter((x) => {
      if (x.user_id === me.id) return false;
      if (x.mudo_ate && new Date(x.mudo_ate).getTime() > agora) return false;
      const cita = todos || mencionados.includes(x.user_id);
      if (x.notificar === "nenhuma") return false;
      if (x.notificar === "mencoes") return cita;
      return true;
    });
    if (!alvo.length) return;
    const titulo = conf?.tipo === "direta" ? (me.name ?? "Nova mensagem") : `${me.name ?? "Alguém"} em ${conf?.nome ?? "canal"}`;
    await notificar(alvo.map((x) => ({
      user_id: x.user_id, tipo: "mensagem" as const, titulo,
      corpo: previa(m).slice(0, 120), link: `/mensagens?c=${m.conversa_id}`,
      de_nome: me.name ?? null,
    })));
  } catch { /* sino é acessório */ }
}

// ── PATCH → editar texto ou fixar ───────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const b = await corpo<{ id?: string; texto?: string; fixada?: boolean }>(req);
  if (!b?.id) return falta("id");
  const novo = await temEsquemaNovo(db);

  const { data: atual } = await db.from("central_mensagens")
    .select(novo ? "id,conversa_id,autor_id,texto,excluida_em" : "id,conversa_id,autor_id,texto")
    .eq("id", b.id).maybeSingle();
  if (!atual) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const msg = atual as { id: string; conversa_id: string; autor_id: string; texto: string | null; excluida_em?: string | null };

  const papel = await meuPapel(db, msg.conversa_id, me.id);
  if (!papel) return semAcesso();
  const efetivo = papelEfetivo(papel, me.role);

  if (b.fixada !== undefined) {
    if (!podeNoCanal({ papel: efetivo, somente_leitura: false, arquivado: false }, "fixar")) return semAcesso();
    const { error } = await db.from("central_mensagens").update({ fixada: !!b.fixada }).eq("id", b.id);
    if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (b.texto !== undefined) {
    if (!podeEditar({ autor_id: msg.autor_id, excluida_em: msg.excluida_em ?? null }, me.id)) return semAcesso();
    const texto = String(b.texto).trim();
    if (!texto) return NextResponse.json({ error: "empty" }, { status: 400 });
    if (novo) {
      await db.from("central_mensagem_edicoes").insert({
        mensagem_id: msg.id, texto_anterior: msg.texto, editada_por: me.id,
      });
    }
    const { data, error } = await db.from("central_mensagens")
      .update(novo ? { texto, editada_em: new Date().toISOString() } : { texto })
      .eq("id", b.id).select(novo ? COLS_MSG_NOVO : COLS_MSG_BASE).single();
    if (error || !data) return NextResponse.json({ error: "failed", detail: error?.message }, { status: 500 });
    return NextResponse.json({ mensagem: paraMensagem(data as Record<string, unknown>) });
  }

  return falta("campo");
}

// ── DELETE → apaga (soft, para a thread não perder o pai) ───────────────────
export async function DELETE(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return falta("id");
  const novo = await temEsquemaNovo(db);

  const { data: atual } = await db.from("central_mensagens").select("id,conversa_id,autor_id").eq("id", id).maybeSingle();
  if (!atual) return NextResponse.json({ ok: true });
  const msg = atual as { conversa_id: string; autor_id: string };
  const papel = await meuPapel(db, msg.conversa_id, me.id);
  if (!papel) return semAcesso();
  if (!podeApagar(msg, me.id, { papel: papelEfetivo(papel, me.role), somente_leitura: false, arquivado: false }))
    return semAcesso();

  if (novo) {
    // Soft delete: a bolha vira "mensagem apagada" e as respostas continuam
    // ancoradas. Apagar de verdade levaria a thread inteira junto (cascade).
    await db.from("central_mensagens")
      .update({ excluida_em: new Date().toISOString(), texto: null, imagem_url: null, anexos: null, card: null })
      .eq("id", id);
    await db.from("central_anexos").delete().eq("mensagem_id", id);
    await db.from("central_links").delete().eq("mensagem_id", id);
  } else {
    await db.from("central_mensagens").delete().eq("id", id);
  }
  return NextResponse.json({ ok: true });
}
