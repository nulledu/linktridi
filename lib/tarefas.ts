// ── Central de Trabalho · tarefas (CRUD) ─────────────────────────────────────
// Tarefa pessoal / atividade da empresa / item vinculado — tudo é uma `tarefa`
// com um TIPO DE ORIGEM. Tolerante: sem a tabela, retorna vazio/no-op.
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type TarefaStatus = "pendente" | "em_andamento" | "aguardando" | "bloqueada" | "concluida" | "cancelada";
export type TarefaPrioridade = "baixa" | "media" | "alta" | "urgente";
// `request` (solicitação) NUNCA é gravado na tabela `tarefas`: a solicitação
// continua morando em `central_solicitacoes` e só é APRESENTADA como tarefa na
// Central, do mesmo jeito que `activity`. Está no tipo porque a tela inteira —
// lista, kanban, calendário, matriz — fala em `Tarefa`, e um segundo tipo de
// item duplicaria as quatro visões pra mostrar a mesma coisa.
export type OrigemTipo = "personal" | "activity" | "request" | "message" | "order" | "system_issue" | "purchase" | "inventory" | "customer";
/** Eixos da matriz de Eisenhower. `null` = não definido → o quadrante é sugerido. */
export type NivelEisenhower = "alta" | "baixa" | null;

export interface Subtarefa { id: string; titulo: string; feita: boolean }
export interface Tarefa {
  id: string;
  titulo: string;
  descricao: string | null;
  status: TarefaStatus;
  prioridade: TarefaPrioridade;
  responsavelId: string | null;
  responsavelNome: string | null;
  criadorId: string | null;
  criadorNome: string | null;
  prazo: string | null;
  lembrarEm: string | null;
  origemTipo: OrigemTipo;
  origemRef: string | null;
  origemLabel: string | null;
  origemUrl: string | null;
  setor: string | null;
  tags: string[];
  lista: string | null;
  subtarefas: Subtarefa[];
  anexos: { nome: string; url: string }[];
  bloqueadaPor: string | null;
  gravidade: string | null;          // problemas: baixa|media|alta|critica
  importancia: NivelEisenhower;      // matriz: eixo vertical
  urgencia: NivelEisenhower;         // matriz: eixo horizontal
  avisarConclusao: boolean;          // delegada: avisar o criador ao concluir
  concluidaAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TarefaComentario { id: string; tarefaId: string; autorId: string | null; autorNome: string | null; texto: string; createdAt: string }
export interface TarefaEvento { id: string; acao: string; detalhe: string | null; autorNome: string | null; createdAt: string }

const COLS = "id,titulo,descricao,status,prioridade,responsavel_id,responsavel_nome,criador_id,criador_nome,prazo,lembrar_em,origem_tipo,origem_ref,origem_label,origem_url,setor,tags,lista,subtarefas,anexos,bloqueada_por,gravidade,avisar_conclusao,importancia,urgencia,concluida_at,created_at,updated_at";

type Row = Record<string, unknown>;
function deRow(r: Row): Tarefa {
  return {
    id: r.id as string, titulo: (r.titulo as string) ?? "", descricao: (r.descricao as string) ?? null,
    status: (r.status as TarefaStatus) ?? "pendente", prioridade: (r.prioridade as TarefaPrioridade) ?? "media",
    responsavelId: (r.responsavel_id as string) ?? null, responsavelNome: (r.responsavel_nome as string) ?? null,
    criadorId: (r.criador_id as string) ?? null, criadorNome: (r.criador_nome as string) ?? null,
    prazo: (r.prazo as string) ?? null, lembrarEm: (r.lembrar_em as string) ?? null,
    origemTipo: (r.origem_tipo as OrigemTipo) ?? "personal", origemRef: (r.origem_ref as string) ?? null,
    origemLabel: (r.origem_label as string) ?? null, origemUrl: (r.origem_url as string) ?? null,
    setor: (r.setor as string) ?? null, tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    lista: (r.lista as string) ?? null,
    subtarefas: Array.isArray(r.subtarefas) ? (r.subtarefas as Subtarefa[]) : [],
    anexos: Array.isArray(r.anexos) ? (r.anexos as { nome: string; url: string }[]) : [],
    gravidade: (r.gravidade as string) ?? null, avisarConclusao: !!r.avisar_conclusao,
    importancia: (r.importancia as NivelEisenhower) ?? null, urgencia: (r.urgencia as NivelEisenhower) ?? null,
    bloqueadaPor: (r.bloqueada_por as string) ?? null, concluidaAt: (r.concluida_at as string) ?? null,
    createdAt: (r.created_at as string) ?? "", updatedAt: (r.updated_at as string) ?? "",
  };
}

// Todas as tarefas do usuário (é responsável OU criador). O front resolve as
// listas inteligentes (hoje/atrasadas/…) a partir daqui.
const COLS_F1 = "id,titulo,descricao,status,prioridade,responsavel_id,responsavel_nome,criador_id,criador_nome,prazo,lembrar_em,origem_tipo,origem_ref,origem_label,origem_url,setor,tags,lista,subtarefas,bloqueada_por,concluida_at,created_at,updated_at";   // fase 1 (sem anexos/gravidade)

export async function listMinhasTarefas(userId: string): Promise<Tarefa[]> {
  try {
    const db = createSupabaseAdminClient();
    const q = (cols: string) => db.from("tarefas").select(cols)
      .or(`responsavel_id.eq.${userId},criador_id.eq.${userId}`)
      .order("created_at", { ascending: false }).limit(500);
    let { data, error } = await q(COLS);
    if (error) ({ data, error } = await q(COLS_F1));   // colunas novas ausentes (SQL único pendente)
    if (error) return [];
    return ((data ?? []) as unknown as Row[]).map(deRow);
  } catch { return []; }
}

export interface NovaTarefa {
  titulo: string; descricao?: string | null; prioridade?: TarefaPrioridade; status?: TarefaStatus;
  responsavelId?: string | null; responsavelNome?: string | null; prazo?: string | null; lembrarEm?: string | null;
  origemTipo?: OrigemTipo; origemRef?: string | null; origemLabel?: string | null; origemUrl?: string | null;
  setor?: string | null; tags?: string[]; lista?: string | null; subtarefas?: Subtarefa[];
}
export async function criarTarefa(criador: { id: string; nome: string }, t: NovaTarefa): Promise<Tarefa | null> {
  try {
    const db = createSupabaseAdminClient();
    const { data, error } = await db.from("tarefas").insert({
      titulo: t.titulo.trim(), descricao: t.descricao ?? null, prioridade: t.prioridade ?? "media", status: t.status ?? "pendente",
      responsavel_id: t.responsavelId ?? criador.id, responsavel_nome: t.responsavelNome ?? criador.nome,
      criador_id: criador.id, criador_nome: criador.nome, prazo: t.prazo ?? null, lembrar_em: t.lembrarEm ?? null,
      origem_tipo: t.origemTipo ?? "personal", origem_ref: t.origemRef ?? null, origem_label: t.origemLabel ?? null, origem_url: t.origemUrl ?? null,
      setor: t.setor ?? null, tags: t.tags ?? [], lista: t.lista ?? null, subtarefas: t.subtarefas ?? [],
    }).select(COLS).single();
    if (error || !data) return null;
    return deRow(data as Row);
  } catch { return null; }
}

// Escrita casa por `id` E por quem está na tarefa (criou ou é responsável):
// roda com service_role, então sem o filtro qualquer logado editava/apagava a
// tarefa de outra pessoa sabendo o id.
const naTarefa = (usuarioId: string) => `criador_id.eq.${usuarioId},responsavel_id.eq.${usuarioId}`;

export async function atualizarTarefa(id: string, patch: Partial<Record<string, unknown>>, usuarioId: string): Promise<Tarefa | null> {
  try {
    const db = createSupabaseAdminClient();
    const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const map: Record<string, string> = {
      titulo: "titulo", descricao: "descricao", status: "status", prioridade: "prioridade",
      responsavelId: "responsavel_id", responsavelNome: "responsavel_nome", prazo: "prazo", lembrarEm: "lembrar_em",
      setor: "setor", tags: "tags", lista: "lista", subtarefas: "subtarefas", bloqueadaPor: "bloqueada_por",
      origemTipo: "origem_tipo", origemRef: "origem_ref", origemLabel: "origem_label", origemUrl: "origem_url",
      anexos: "anexos", gravidade: "gravidade", avisarConclusao: "avisar_conclusao",
      importancia: "importancia", urgencia: "urgencia",
    };
    for (const [k, col] of Object.entries(map)) if (patch[k] !== undefined) upd[col] = patch[k];
    // Concluir/reabrir marca o timestamp.
    if (patch.status === "concluida") upd.concluida_at = new Date().toISOString();
    else if (patch.status !== undefined) upd.concluida_at = null;
    const { data, error } = await db.from("tarefas").update(upd).eq("id", id).or(naTarefa(usuarioId)).select(COLS).single();
    if (error || !data) return null;
    return deRow(data as Row);
  } catch { return null; }
}

/** `nao_encontrada` cobre também "existe, mas não é sua" — não confirma a existência. */
export async function removerTarefa(id: string, usuarioId: string): Promise<"ok" | "nao_encontrada" | "erro"> {
  try {
    const { data, error } = await createSupabaseAdminClient().from("tarefas")
      .delete().eq("id", id).or(naTarefa(usuarioId)).select("id");
    if (error) return "erro";
    return (data?.length ?? 0) > 0 ? "ok" : "nao_encontrada";
  } catch { return "erro"; }
}

// ── Comentários + histórico (carregados só ao abrir os detalhes) ─────────────
export async function detalheTarefa(tarefaId: string): Promise<{ comentarios: TarefaComentario[]; historico: TarefaEvento[] }> {
  try {
    const db = createSupabaseAdminClient();
    const [c, h] = await Promise.all([
      db.from("tarefa_comentarios").select("id,tarefa_id,autor_id,autor_nome,texto,created_at").eq("tarefa_id", tarefaId).order("created_at", { ascending: true }).limit(100),
      db.from("tarefa_historico").select("id,acao,detalhe,autor_nome,created_at").eq("tarefa_id", tarefaId).order("created_at", { ascending: false }).limit(60),
    ]);
    return {
      comentarios: ((c.data ?? []) as Row[]).map((r) => ({ id: r.id as string, tarefaId: r.tarefa_id as string, autorId: (r.autor_id as string) ?? null, autorNome: (r.autor_nome as string) ?? null, texto: (r.texto as string) ?? "", createdAt: (r.created_at as string) ?? "" })),
      historico: ((h.data ?? []) as Row[]).map((r) => ({ id: r.id as string, acao: (r.acao as string) ?? "", detalhe: (r.detalhe as string) ?? null, autorNome: (r.autor_nome as string) ?? null, createdAt: (r.created_at as string) ?? "" })),
    };
  } catch { return { comentarios: [], historico: [] }; }
}

export async function comentarTarefa(tarefaId: string, autor: { id: string; nome: string }, texto: string): Promise<TarefaComentario | null> {
  try {
    const db = createSupabaseAdminClient();
    const { data, error } = await db.from("tarefa_comentarios")
      .insert({ tarefa_id: tarefaId, autor_id: autor.id, autor_nome: autor.nome, texto: texto.slice(0, 2000) })
      .select("id,tarefa_id,autor_id,autor_nome,texto,created_at").single();
    if (error || !data) return null;
    void registrarEvento(tarefaId, autor, "comentou", texto.slice(0, 80));
    return { id: data.id as string, tarefaId, autorId: autor.id, autorNome: autor.nome, texto: data.texto as string, createdAt: data.created_at as string };
  } catch { return null; }
}

// Grava um evento no histórico (best-effort; nunca quebra o fluxo).
export async function registrarEvento(tarefaId: string, autor: { id: string; nome: string } | null, acao: string, detalhe?: string | null): Promise<void> {
  try {
    await createSupabaseAdminClient().from("tarefa_historico")
      .insert({ tarefa_id: tarefaId, autor_id: autor?.id ?? null, autor_nome: autor?.nome ?? null, acao, detalhe: detalhe ?? null });
  } catch { /* histórico é opcional */ }
}
