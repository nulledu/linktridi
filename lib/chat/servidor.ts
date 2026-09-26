// Só para rotas de API — usa service role e NUNCA pode ir para o browser.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { getProfileSemAcesso, type Profile } from "@/lib/require-auth";
import { NextResponse } from "next/server";
import type { Anexo, CardContexto, Mensagem, PapelMembro } from "./tipos";
import { cached, invalidate } from "@/lib/cache";

export type Db = ReturnType<typeof createSupabaseAdminClient>;

/**
 * O `supabase/central-chat.sql` é rodado à mão. Enquanto ele não roda, as
 * colunas novas não existem e um `select` com elas devolve 42703. Em vez de
 * quebrar a tela, detectamos uma vez por processo e caímos no conjunto antigo.
 *
 * Só "coluna não existe" decide o esquema antigo. Qualquer outro erro —
 * timeout, 5xx, conexão — é passageiro: memorizado, deixava a instância sem
 * menção, anexo, thread e edição até o próximo deploy. Nesse caso supõe o
 * esquema atual e pergunta de novo na próxima chamada.
 */
const COLUNA_AUSENTE = new Set(["42703", "PGRST204"]);
let esquemaNovo: boolean | null = null;
export async function temEsquemaNovo(db: Db): Promise<boolean> {
  if (esquemaNovo !== null) return esquemaNovo;
  const { error } = await db.from("central_conversas").select("privado").limit(1);
  if (!error) return (esquemaNovo = true);
  if (COLUNA_AUSENTE.has(error.code)) return (esquemaNovo = false);
  return true;
}

export const COLS_MSG_BASE = "id,conversa_id,autor_id,autor_nome,texto,imagem_url,responde_a,fixada,created_at";
export const COLS_MSG_NOVO = `${COLS_MSG_BASE},tipo,anexos,card,thread_id,respostas,ultima_resposta_em,editada_em,excluida_em,mencoes,mencao_todos`;

export const COLS_CONV_BASE = "id,tipo,nome,setor,criada_por,created_at";
export const COLS_CONV_NOVO = `${COLS_CONV_BASE},descricao,topico,slug,categoria_id,privado,somente_leitura,arquivado,cor,contexto_tipo,contexto_ref,atualizado_em`;

/** Linha crua do Postgres → Mensagem do contrato. */
export function paraMensagem(l: Record<string, unknown>): Mensagem {
  const anexos = Array.isArray(l.anexos) && l.anexos.length
    ? (l.anexos as Anexo[])
    : l.imagem_url
      ? [{ url: String(l.imagem_url), nome: "imagem", mime: "image/*" }]
      : [];
  return {
    id: String(l.id),
    conversa_id: String(l.conversa_id),
    autor_id: String(l.autor_id),
    autor_nome: (l.autor_nome as string) ?? null,
    texto: (l.texto as string) ?? null,
    tipo: ((l.tipo as string) || "texto") as Mensagem["tipo"],
    anexos,
    card: (l.card as CardContexto) ?? null,
    responde_a: (l.responde_a as string) ?? null,
    thread_id: (l.thread_id as string) ?? null,
    respostas: Number(l.respostas ?? 0),
    ultima_resposta_em: (l.ultima_resposta_em as string) ?? null,
    fixada: !!l.fixada,
    editada_em: (l.editada_em as string) ?? null,
    excluida_em: (l.excluida_em as string) ?? null,
    mencoes: Array.isArray(l.mencoes) ? (l.mencoes as string[]) : [],
    mencao_todos: !!l.mencao_todos,
    created_at: String(l.created_at),
  };
}

// ── Sessão e acesso ─────────────────────────────────────────────────────────

export const naoAutenticado = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });
export const semAcesso = () => NextResponse.json({ error: "forbidden" }, { status: 403 });
export const jsonInvalido = () => NextResponse.json({ error: "invalid_json" }, { status: 400 });
export const falta = (o: string) => NextResponse.json({ error: `missing_${o}` }, { status: 400 });

export async function sessao(): Promise<{ me: Profile; db: Db } | null> {
  // Sem o disparo antecipado de `employees`: nenhuma rota do chat resolve
  // chave de área, e a de não lidas é poll de toda tela.
  const me = await getProfileSemAcesso();
  if (!me) return null;
  return { me, db: createSupabaseAdminClient() };
}

export async function corpo<T>(req: Request): Promise<T | null> {
  try { return (await req.json()) as T; } catch { return null; }
}

/** Papel da pessoa no canal; `null` se ela não é membro. */
export async function meuPapel(db: Db, canalId: string, userId: string): Promise<PapelMembro | null> {
  const { data } = await db.from("central_conversa_membros")
    .select("user_id,papel").eq("conversa_id", canalId).eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return ((data as { papel?: string }).papel as PapelMembro) || "membro";
}

/** Papel efetivo: admin da plataforma administra qualquer canal do qual participa. */
export function papelEfetivo(papel: PapelMembro, role: string): PapelMembro {
  return role === "admin" ? "dono" : papel;
}

/** Perfis (nome + foto) de um punhado de ids, num acesso só. */
export async function perfisDe(db: Db, ids: string[]): Promise<Record<string, { nome: string; avatar: string | null }>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return {};
  const { data } = await db.from("profiles").select("id,name,username,employees(photo_url)").in("id", unicos);
  const out: Record<string, { nome: string; avatar: string | null }> = {};
  type Linha = { id: string; name: string | null; username: string; employees: { photo_url: string | null }[] | { photo_url: string | null } | null };
  for (const p of (data ?? []) as Linha[]) {
    const emp = Array.isArray(p.employees) ? p.employees[0] : p.employees;
    out[p.id] = { nome: p.name || p.username, avatar: emp?.photo_url ?? null };
  }
  return out;
}

/**
 * Ids dos canais em que a pessoa está. Base de quase toda consulta daqui —
 * inclusive de `/api/central/chat/nao-lidas`, que a barra do celular consulta
 * de minuto em minuto, em toda tela do sistema.
 *
 * Cacheado por 30s porque a resposta só muda quando alguém entra ou sai de um
 * canal, o que acontece algumas vezes por semana. Sem isso era uma ida ao banco
 * a mais antes de CADA consulta do chat, só para redescobrir a mesma lista. O
 * atraso máximo é de meio minuto para ver um canal recém-criado aparecer na
 * contagem — a lista de canais em si não passa por aqui.
 */
export async function meusCanais(db: Db, userId: string): Promise<string[]> {
  return cached(`canais:${userId}`, 30_000, async () => {
    const { data, error } = await db.from("central_conversa_membros")
      .select("conversa_id").eq("user_id", userId)
      .limit(500);          // toda listagem tem teto (CLAUDE.md)
    // Falha LANÇA pra não ficar 30s no cache como "não estou em canal nenhum".
    if (error) throw error;
    return (data ?? []).map((m: { conversa_id: string }) => m.conversa_id);
  }).catch(() => [] as string[]);   // esta chamada ainda sai vazia, como antes
}

/**
 * Derruba o cache de `meusCanais`. Chame SEMPRE que a composição de um canal
 * mudar (entrou, saiu, canal criado) — senão quem acabou de ser adicionado
 * passa até 30s sem ver o canal na contagem de não lidas.
 *
 * Sem argumento, esquece todo mundo: é o caso de criar um canal com uma lista
 * de membros, quando são vários userIds de uma vez.
 */
export function esqueceCanais(userId?: string) {
  invalidate(userId ? `canais:${userId}` : "canais:");
}

/** Teto da janela de mensagens novas — passou disso, o número exato não muda decisão nenhuma. */
export const JANELA_NAO_LIDAS = 100;

/**
 * Só os dois números: quantas mensagens novas e quantas me citam.
 *
 * Mora aqui, e não dentro da rota `/api/central/chat/nao-lidas`, porque quem
 * pergunta são dois: a bolinha da barra do celular (pela rota, de minuto em
 * minuto) e o card de Mensagens do Início da Central (direto, no render do
 * servidor). Duplicar a consulta era duplicar a chance de uma das cópias
 * esquecer o `.limit()` ou o `neq(autor_id)`.
 *
 * Três colunas, janela curta e nenhuma escrita: no ciclo comum de quem está em
 * dia a resposta é `{ total: 0, mencoes: 0 }`.
 */
export async function contarNaoLidas(db: Db, meId: string): Promise<{ total: number; mencoes: number }> {
  const ids = await meusCanais(db, meId);
  if (!ids.length) return { total: 0, mencoes: 0 };

  const novo = await temEsquemaNovo(db);
  const { data: leituras } = await db.from("central_leituras")
    .select("conversa_id,lido_em").eq("user_id", meId).in("conversa_id", ids);
  const lidoEm = new Map((leituras ?? []).map((l: { conversa_id: string; lido_em: string }) => [l.conversa_id, l.lido_em]));

  // Piso comum: nada anterior à leitura mais antiga pode ser "novo". Sem isto a
  // janela viria cheia de mensagem velha e o corte teria de ser em memória.
  const piso = ids.length > lidoEm.size ? null : [...lidoEm.values()].sort()[0] ?? null;

  let q = db.from("central_mensagens")
    .select(novo ? "conversa_id,autor_id,created_at,mencoes,mencao_todos" : "conversa_id,autor_id,created_at")
    .in("conversa_id", ids)
    .neq("autor_id", meId)
    .order("created_at", { ascending: false })
    .limit(JANELA_NAO_LIDAS);
  if (piso) q = q.gt("created_at", piso);

  const { data } = await q;
  type Linha = { conversa_id: string; created_at: string; mencoes?: string[] | null; mencao_todos?: boolean | null };

  let total = 0, mencoes = 0;
  for (const m of ((data ?? []) as unknown as Linha[])) {
    const lido = lidoEm.get(m.conversa_id);
    if (lido && m.created_at <= lido) continue;
    total++;
    if (m.mencao_todos || (m.mencoes ?? []).includes(meId)) mencoes++;
  }
  return { total: Math.min(total, JANELA_NAO_LIDAS), mencoes };
}
