import { NextRequest, NextResponse } from "next/server";
import {
  COLS_CONV_BASE, COLS_CONV_NOVO, corpo, falta, jsonInvalido, meusCanais, meuPapel,
  naoAutenticado, papelEfetivo, perfisDe, semAcesso, sessao, temEsquemaNovo, esqueceCanais, type Db,
} from "@/lib/chat/servidor";
import { eGeral, nomeDoGrupo, podeNoCanal } from "@/lib/chat/regras";
import { garantirGeral } from "@/lib/chat/geral";
import type { Canal, Categoria, ModoNotificacao, PapelMembro } from "@/lib/chat/tipos";

export const dynamic = "force-dynamic";

interface LinhaConv {
  id: string; tipo: string; nome: string | null; setor: string | null; criada_por: string | null; created_at: string;
  descricao?: string | null; topico?: string | null; slug?: string | null; categoria_id?: string | null;
  privado?: boolean; somente_leitura?: boolean; arquivado?: boolean; cor?: string | null;
  contexto_tipo?: string | null; contexto_ref?: string | null; atualizado_em?: string;
}
interface LinhaMembro {
  conversa_id: string; user_id: string; favorita?: boolean;
  papel?: PapelMembro; notificar?: ModoNotificacao; mudo_ate?: string | null;
}
interface LinhaMsg {
  id: string; conversa_id: string; autor_id: string; autor_nome: string | null;
  texto: string | null; imagem_url: string | null; created_at: string;
  mencoes?: string[] | null; mencao_todos?: boolean | null;
}

// Janela de mensagens recentes de TODOS os meus canais, num acesso só. É o que
// alimenta prévia + contador. Não-lida é, por definição, recente; acima disso
// a interface satura em "99+" em vez de puxar a tabela inteira.
const JANELA = 400;

// GET → sidebar completa. `?descobrir=1` → canais públicos em que ainda não estou.
export async function GET(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const novo = await temEsquemaNovo(db);

  if (req.nextUrl.searchParams.get("descobrir")) return descobrir(db, me.id, novo);

  let ids = await meusCanais(db, me.id);
  // O Geral é de todo mundo: quem ainda não está nele entra agora, e a lista
  // é relida só nessa primeira vez.
  if (novo) {
    const g = await garantirGeral(db, me.id, ids);
    if (g.entrou) ids = await meusCanais(db, me.id);
  }
  const categorias = novo ? await lerCategorias(db) : [];
  if (!ids.length) return NextResponse.json({ canais: [], categorias, meuId: me.id, salvos: 0 });

  const colsConv = novo ? COLS_CONV_NOVO : COLS_CONV_BASE;
  const colsMembro = novo ? "conversa_id,user_id,favorita,papel,notificar,mudo_ate" : "conversa_id,user_id,favorita";
  const colsMsg = novo
    ? "id,conversa_id,autor_id,autor_nome,texto,imagem_url,created_at,mencoes,mencao_todos"
    : "id,conversa_id,autor_id,autor_nome,texto,imagem_url,created_at";

  const [{ data: convs }, { data: membros }, { data: leituras }, { data: msgs }, salvos] = await Promise.all([
    db.from("central_conversas").select(colsConv).in("id", ids),
    db.from("central_conversa_membros").select(colsMembro).in("conversa_id", ids),
    db.from("central_leituras").select("conversa_id,lido_em").eq("user_id", me.id).in("conversa_id", ids),
    db.from("central_mensagens").select(colsMsg).in("conversa_id", ids)
      .order("created_at", { ascending: false }).limit(JANELA),
    novo
      ? db.from("central_salvos").select("mensagem_id", { count: "exact", head: true }).eq("user_id", me.id)
      : Promise.resolve({ count: 0 }),
  ]);

  const linhasMembro = (membros ?? []) as LinhaMembro[];
  const meus = new Map(linhasMembro.filter((m) => m.user_id === me.id).map((m) => [m.conversa_id, m]));
  const lidoEm = new Map((leituras ?? []).map((l: { conversa_id: string; lido_em: string }) => [l.conversa_id, l.lido_em]));

  // Nome/foto de quem participa — conversa direta mostra o outro; grupo sem
  // nome mostra quem está nele.
  const outros = [...new Set(linhasMembro.filter((m) => m.user_id !== me.id).map((m) => m.user_id))];
  const perfis = await perfisDe(db, outros);

  const ultima = new Map<string, LinhaMsg>();
  const naoLidas = new Map<string, number>();
  const mencoes = new Map<string, number>();
  for (const m of (msgs ?? []) as LinhaMsg[]) {
    if (!ultima.has(m.conversa_id)) ultima.set(m.conversa_id, m);
    if (m.autor_id === me.id) continue;
    const lido = lidoEm.get(m.conversa_id);
    if (lido && m.created_at <= lido) continue;
    naoLidas.set(m.conversa_id, (naoLidas.get(m.conversa_id) ?? 0) + 1);
    if (m.mencao_todos || (m.mencoes ?? []).includes(me.id))
      mencoes.set(m.conversa_id, (mencoes.get(m.conversa_id) ?? 0) + 1);
  }

  const canais: Canal[] = ((convs ?? []) as LinhaConv[]).map((c) => {
    const doCanal = linhasMembro.filter((m) => m.conversa_id === c.id);
    const meu = meus.get(c.id);
    let nome = c.nome ?? "";
    let avatar: string | null = null;
    let parceiro: string | null = null;
    if (c.tipo === "direta") {
      const outro = doCanal.find((m) => m.user_id !== me.id);
      parceiro = outro?.user_id ?? null;
      nome = (parceiro && perfis[parceiro]?.nome) || "Conversa";
      avatar = (parceiro && perfis[parceiro]?.avatar) || null;
    } else if (c.tipo === "setor") {
      nome = c.setor || c.nome || "Setor";
    } else if (c.tipo === "grupo" && !nome.trim()) {
      nome = nomeDoGrupo(doCanal.filter((m) => m.user_id !== me.id).map((m) => perfis[m.user_id]?.nome ?? "").filter(Boolean));
    }
    const u = ultima.get(c.id);
    return {
      id: c.id, tipo: (c.tipo || "grupo") as Canal["tipo"], nome: nome || "Conversa",
      descricao: c.descricao ?? null, topico: c.topico ?? null, slug: c.slug ?? null,
      avatar, cor: c.cor ?? null, categoria_id: c.categoria_id ?? null,
      contexto_tipo: c.contexto_tipo ?? null, contexto_ref: c.contexto_ref ?? null,
      privado: !!c.privado, somente_leitura: !!c.somente_leitura, arquivado: !!c.arquivado,
      membros: doCanal.length,
      favorita: !!meu?.favorita,
      papel: papelEfetivo((meu?.papel as PapelMembro) || "membro", me.role),
      notificar: (meu?.notificar as ModoNotificacao) || "todas",
      mudo_ate: meu?.mudo_ate ?? null,
      atualizado_em: c.atualizado_em || u?.created_at || c.created_at,
      ultima: u ? { texto: previaCurta(u), autor: u.autor_nome, created_at: u.created_at } : null,
      nao_lidas: Math.min(naoLidas.get(c.id) ?? 0, 99),
      mencoes: mencoes.get(c.id) ?? 0,
      parceiro_id: parceiro,
    };
  });

  canais.sort((a, b) => (b.ultima?.created_at ?? b.atualizado_em).localeCompare(a.ultima?.created_at ?? a.atualizado_em));
  return NextResponse.json({ canais, categorias, meuId: me.id, salvos: (salvos as { count?: number }).count ?? 0 });
}

function previaCurta(m: LinhaMsg) {
  if (m.texto?.trim()) return m.texto.slice(0, 140);
  return m.imagem_url ? "Imagem" : "Anexo";
}

async function lerCategorias(db: Db): Promise<Categoria[]> {
  const { data } = await db.from("central_categorias").select("id,nome,ordem").order("ordem").limit(50);
  return (data ?? []) as Categoria[];
}

/** Canais públicos, não arquivados, em que ainda não estou — a lista do "entrar". */
async function descobrir(db: Db, meuId: string, novo: boolean) {
  if (!novo) return NextResponse.json({ canais: [] });
  const meus = new Set(await meusCanais(db, meuId));
  const { data } = await db.from("central_conversas")
    .select("id,tipo,nome,descricao,cor,categoria_id,privado,arquivado,somente_leitura,atualizado_em,created_at")
    .eq("privado", false).eq("arquivado", false).eq("tipo", "canal")
    .order("atualizado_em", { ascending: false }).limit(50);
  const canais = ((data ?? []) as LinhaConv[])
    .filter((c) => !meus.has(c.id))
    .map((c): Canal => ({
      id: c.id, tipo: "canal", nome: c.nome || "Canal", descricao: c.descricao ?? null, topico: null,
      slug: null, avatar: null, cor: c.cor ?? null, categoria_id: c.categoria_id ?? null,
      contexto_tipo: null, contexto_ref: null, privado: false, somente_leitura: !!c.somente_leitura,
      arquivado: false, membros: 0, favorita: false, papel: "membro", notificar: "todas", mudo_ate: null,
      atualizado_em: c.atualizado_em || c.created_at, ultima: null, nao_lidas: 0, mencoes: 0,
    }));
  return NextResponse.json({ canais });
}

// ── POST → cria canal / grupo / conversa direta ─────────────────────────────
export async function POST(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const b = await corpo<{
    tipo?: string; nome?: string; descricao?: string; membros?: string[];
    privado?: boolean; categoria_id?: string | null; cor?: string | null;
    contexto_tipo?: string | null; contexto_ref?: string | null;
  }>(req);
  if (!b) return jsonInvalido();
  const novo = await temEsquemaNovo(db);
  const tipo = ["direta", "grupo", "canal", "setor"].includes(String(b.tipo)) ? String(b.tipo) : "grupo";
  const membros = [...new Set([me.id, ...(b.membros ?? []).map(String)])];

  // Conversa direta é única por par: se já existe, devolve a mesma.
  if (tipo === "direta" && membros.length === 2) {
    const outro = membros.find((m) => m !== me.id)!;
    const meus = await meusCanais(db, me.id);
    if (meus.length) {
      const { data: doOutro } = await db.from("central_conversa_membros")
        .select("conversa_id").eq("user_id", outro).in("conversa_id", meus);
      const candidatos = (doOutro ?? []).map((r: { conversa_id: string }) => r.conversa_id);
      if (candidatos.length) {
        const { data: conv } = await db.from("central_conversas")
          .select("id").eq("tipo", "direta").in("id", candidatos).limit(1).maybeSingle();
        if (conv) return NextResponse.json({ canal_id: conv.id, existente: true });
      }
    }
  }

  // Canal (não direta) referenciando uma entidade do ERP já existente: reaproveita.
  if (novo && b.contexto_tipo && b.contexto_ref) {
    const { data: existente } = await db.from("central_conversas")
      .select("id").eq("contexto_tipo", b.contexto_tipo).eq("contexto_ref", b.contexto_ref).limit(1).maybeSingle();
    if (existente) {
      await db.from("central_conversa_membros")
        .upsert(membros.map((u) => ({ conversa_id: existente.id, user_id: u })), { onConflict: "conversa_id,user_id" });
      return NextResponse.json({ canal_id: existente.id, existente: true });
    }
  }

  const base: Record<string, unknown> = { tipo, nome: b.nome?.trim() || null, criada_por: me.id };
  if (novo) Object.assign(base, {
    descricao: b.descricao?.trim() || null,
    privado: tipo === "canal" ? !!b.privado : true,
    categoria_id: b.categoria_id || null,
    cor: b.cor || null,
    slug: tipo === "canal" && b.nome ? paraSlug(b.nome) : null,
    contexto_tipo: b.contexto_tipo || null,
    contexto_ref: b.contexto_ref || null,
  });

  const { data: conv, error } = await db.from("central_conversas").insert(base).select("id").single();
  if (error || !conv) return NextResponse.json({ error: "failed", detail: error?.message }, { status: 500 });

  await db.from("central_conversa_membros").insert(membros.map((u) => ({
    conversa_id: conv.id, user_id: u, ...(novo ? { papel: u === me.id ? "dono" : "membro" } : {}),
  })));
  for (const u of membros) esqueceCanais(u);   // o canal novo tem que aparecer já

  return NextResponse.json({ canal_id: conv.id });
}

async function canalEGeral(db: Db, canalId: string): Promise<boolean> {
  if (!(await temEsquemaNovo(db))) return false;
  const { data } = await db.from("central_conversas").select("contexto_tipo,contexto_ref").eq("id", canalId).maybeSingle();
  return !!data && eGeral(data as { contexto_tipo: string | null; contexto_ref: string | null });
}

function paraSlug(nome: string) {
  return nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)
    // Nomes iguais em canais diferentes existem; o sufixo evita colidir no índice.
    + "-" + Math.random().toString(36).slice(2, 6);
}

// ── PATCH → edita o canal ou minha preferência nele ─────────────────────────
export async function PATCH(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const b = await corpo<Record<string, unknown> & { id?: string }>(req);
  if (!b?.id) return falta("id");
  const canalId = String(b.id);
  const papel = await meuPapel(db, canalId, me.id);
  if (!papel) return semAcesso();
  const novo = await temEsquemaNovo(db);

  // Preferências pessoais: qualquer membro mexe nas suas.
  const meu: Record<string, unknown> = {};
  if (b.favorita !== undefined) meu.favorita = !!b.favorita;
  if (novo && b.notificar !== undefined) meu.notificar = String(b.notificar);
  if (novo && b.mudo_ate !== undefined) meu.mudo_ate = b.mudo_ate ? String(b.mudo_ate) : null;
  if (Object.keys(meu).length) {
    await db.from("central_conversa_membros").update(meu).eq("conversa_id", canalId).eq("user_id", me.id);
  }

  // Configuração do canal: só quem administra.
  const doCanal: Record<string, unknown> = {};
  if (b.nome !== undefined) doCanal.nome = String(b.nome).trim() || null;
  if (novo) {
    if (b.descricao !== undefined) doCanal.descricao = String(b.descricao ?? "").trim() || null;
    if (b.topico !== undefined) doCanal.topico = String(b.topico ?? "").trim() || null;
    if (b.cor !== undefined) doCanal.cor = b.cor ? String(b.cor) : null;
    if (b.categoria_id !== undefined) doCanal.categoria_id = b.categoria_id ? String(b.categoria_id) : null;
    if (b.privado !== undefined) doCanal.privado = !!b.privado;
    if (b.somente_leitura !== undefined) doCanal.somente_leitura = !!b.somente_leitura;
    if (b.arquivado !== undefined) doCanal.arquivado = !!b.arquivado;
  }
  if (Object.keys(doCanal).length) {
    const efetivo = papelEfetivo(papel, me.role);
    const acao = b.arquivado !== undefined ? "arquivar" : "editar_canal";
    if (acao === "arquivar" && await canalEGeral(db, canalId)) return semAcesso();
    // `arquivado: false` é desarquivar — a checagem padrão barraria por já estar arquivado.
    const contexto = { papel: efetivo, somente_leitura: false, arquivado: false };
    if (!podeNoCanal(contexto, acao)) return semAcesso();
    const { error } = await db.from("central_conversas").update(doCanal).eq("id", canalId);
    if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// ── DELETE → exclui o canal (dono/admin) ou apenas me remove dele ───────────
export async function DELETE(req: NextRequest) {
  const s = await sessao();
  if (!s) return naoAutenticado();
  const { me, db } = s;
  const canalId = req.nextUrl.searchParams.get("id");
  if (!canalId) return falta("id");
  const papel = await meuPapel(db, canalId, me.id);
  if (!papel) return semAcesso();
  // Do Geral ninguém sai nem o exclui — é o canal de todo mundo.
  if (await canalEGeral(db, canalId)) return semAcesso();

  if (podeNoCanal({ papel: papelEfetivo(papel, me.role), somente_leitura: false, arquivado: false }, "excluir_canal")) {
    const { error } = await db.from("central_conversas").delete().eq("id", canalId);
    if (error) return NextResponse.json({ error: "failed", detail: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  // Membro comum: sair do canal.
  await db.from("central_conversa_membros").delete().eq("conversa_id", canalId).eq("user_id", me.id);
  esqueceCanais(me.id);
  return NextResponse.json({ ok: true });
}
