// ── 3D · fase 2: máquinas e programações (servidor) ─────────────────────────
// A camada de dados da operação: cadastro de máquinas e o ciclo da programação
// (a_fazer → programado → imprimindo → concluído). O "status inteligente" mora
// aqui e no `statusDaMaquina` (const): mudar o status da programação carimba
// `iniciado_em`/`concluido_em`, e o estado da máquina é DERIVADO na leitura —
// nada de duas fontes de verdade pra dessincronizar.
//
// Histórico não é tabela própria: é a programação concluída/cancelada.
// Tolerante a SQL pendente (supabase/3d_producao.sql), como a biblioteca.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  ESTADOS_MAQUINA, PRIORIDADES, STATUS_PROGRAMACAO,
  type EstadoMaquina, type Maquina3D, type Prioridade, type Programacao3D, type StatusProgramacao,
} from "@/lib/impressao3d-const";

type Row = Record<string, unknown>;
type ErroDb = { message?: string; code?: string } | null;

function semTabela(e: ErroDb): boolean {
  return !!e && (e.code === "42P01" || /does not exist|schema cache/i.test(e.message || ""));
}

// ── Máquinas ────────────────────────────────────────────────────────────────

const COLS_MAQ = "id,nome,identificacao,modelo,estado,local,observacoes,foto_url,criado_em,atualizado_em";

function maquinaDeRow(r: Row): Maquina3D {
  return {
    id: r.id as string,
    nome: (r.nome as string) ?? "",
    identificacao: (r.identificacao as string) ?? "",
    modelo: (r.modelo as string) ?? "",
    estado: (ESTADOS_MAQUINA as readonly string[]).includes(r.estado as string) ? (r.estado as EstadoMaquina) : "ativa",
    local: (r.local as string) ?? "",
    observacoes: (r.observacoes as string) ?? "",
    fotoUrl: (r.foto_url as string) ?? null,
    criadoEm: (r.criado_em as string) ?? "",
    atualizadoEm: (r.atualizado_em as string) ?? "",
  };
}

export async function listarMaquinas(): Promise<Maquina3D[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("impressao3d_maquinas").select(COLS_MAQ).order("nome").limit(100);
  if (error) {
    if (semTabela(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map(maquinaDeRow);
}

export async function criarMaquina(v: {
  nome: string; identificacao?: string; modelo?: string; local?: string; observacoes?: string; fotoUrl?: string | null;
}): Promise<Maquina3D> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("impressao3d_maquinas")
    .insert({
      nome: v.nome.slice(0, 120),
      identificacao: (v.identificacao || "").slice(0, 40),
      modelo: (v.modelo || "").slice(0, 120),
      local: (v.local || "").slice(0, 120),
      observacoes: (v.observacoes || "").slice(0, 2000),
      foto_url: v.fotoUrl || null,
    })
    .select(COLS_MAQ)
    .single();
  if (error) throw new Error(semTabela(error) ? "tabela_ausente" : error.message);
  return maquinaDeRow(data as Row);
}

export async function atualizarMaquina(
  id: string,
  v: { nome?: string; identificacao?: string; modelo?: string; estado?: string; local?: string; observacoes?: string; fotoUrl?: string | null },
): Promise<Maquina3D | null> {
  const patch: Row = { atualizado_em: new Date().toISOString() };
  if (typeof v.nome === "string" && v.nome.trim()) patch.nome = v.nome.trim().slice(0, 120);
  if (typeof v.identificacao === "string") patch.identificacao = v.identificacao.slice(0, 40);
  if (typeof v.modelo === "string") patch.modelo = v.modelo.slice(0, 120);
  if (typeof v.local === "string") patch.local = v.local.slice(0, 120);
  if (typeof v.observacoes === "string") patch.observacoes = v.observacoes.slice(0, 2000);
  if (v.fotoUrl !== undefined) patch.foto_url = v.fotoUrl || null;
  if (typeof v.estado === "string" && (ESTADOS_MAQUINA as readonly string[]).includes(v.estado)) patch.estado = v.estado;
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("impressao3d_maquinas").update(patch).eq("id", id).select(COLS_MAQ).maybeSingle();
  if (error) {
    if (semTabela(error)) return null;
    throw new Error(error.message);
  }
  return data ? maquinaDeRow(data as Row) : null;
}

/** Apaga só máquina SEM programação (o FK recusa; a tela explica). */
export async function apagarMaquina(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = createSupabaseAdminClient();
  const { error } = await db.from("impressao3d_maquinas").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") return { ok: false, error: "em_uso" };
    return { ok: false, error: semTabela(error) ? "tabela_ausente" : error.message };
  }
  return { ok: true };
}

// ── Programações ────────────────────────────────────────────────────────────

// Embeds com FK NOMEADO: `impressao3d_programacoes` tem DOIS caminhos pra
// `profiles` (responsável e criador) — sem o nome da constraint o PostgREST
// devolve PGRST201 e derruba a consulta inteira (já aconteceu, ver memória).
const COLS_PROG =
  "id,arquivo_id,maquina_id,quantidade,data,hora,prioridade,responsavel_id,observacoes,status,ordem,iniciado_em,concluido_em,criado_em," +
  "arquivo:impressao3d_arquivos(nome,formato)," +
  "maquina:impressao3d_maquinas(nome)," +
  "responsavel:profiles!impressao3d_programacoes_responsavel_id_fkey(name)";

function progDeRow(r: Row): Programacao3D {
  const arq = r.arquivo as { nome?: string; formato?: string } | null;
  const maq = r.maquina as { nome?: string } | null;
  const resp = r.responsavel as { name?: string } | null;
  return {
    id: r.id as string,
    arquivoId: r.arquivo_id as string,
    arquivoNome: arq?.nome ?? "",
    arquivoFormato: arq?.formato ?? "outro",
    maquinaId: (r.maquina_id as string) ?? null,
    maquinaNome: maq?.nome ?? null,
    quantidade: Number(r.quantidade ?? 1),
    data: (r.data as string) ?? null,
    hora: (r.hora as string) ?? null,
    prioridade: (PRIORIDADES as readonly string[]).includes(r.prioridade as string) ? (r.prioridade as Prioridade) : "normal",
    responsavelId: (r.responsavel_id as string) ?? null,
    responsavelNome: resp?.name ?? null,
    observacoes: (r.observacoes as string) ?? "",
    status: (STATUS_PROGRAMACAO as readonly string[]).includes(r.status as string) ? (r.status as StatusProgramacao) : "a_fazer",
    ordem: Number(r.ordem ?? 0),
    iniciadoEm: (r.iniciado_em as string) ?? null,
    concluidoEm: (r.concluido_em as string) ?? null,
    criadoEm: (r.criado_em as string) ?? "",
  };
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export async function listarProgramacoes(f: {
  dia?: string;
  maquinaId?: string;
  arquivoId?: string;
  status?: StatusProgramacao[];
  /** true = só o que está vivo (fora concluído/cancelado). */
  ativas?: boolean;
  limite?: number;
} = {}): Promise<Programacao3D[]> {
  const db = createSupabaseAdminClient();
  let q = db.from("impressao3d_programacoes").select(COLS_PROG);
  if (f.dia && DIA.test(f.dia)) q = q.eq("data", f.dia);
  if (f.maquinaId) q = q.eq("maquina_id", f.maquinaId);
  if (f.arquivoId) q = q.eq("arquivo_id", f.arquivoId);
  if (f.status?.length) q = q.in("status", f.status);
  else if (f.ativas) q = q.not("status", "in", "(concluido,cancelado)");
  const { data, error } = await q
    // Concluído recente primeiro no histórico; na fila quem manda é `ordem`
    // (as telas reordenam localmente — a lista chega inteira e limitada).
    .order("criado_em", { ascending: false })
    .limit(Math.min(Math.max(1, f.limite ?? 300), 500));
  if (error) {
    if (semTabela(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map(progDeRow);
}

export async function criarProgramacao(v: {
  arquivoId: string;
  maquinaId?: string | null;
  quantidade?: number;
  data?: string | null;
  hora?: string | null;
  prioridade?: string;
  responsavelId?: string | null;
  observacoes?: string;
  status?: string;
  criadoPor?: string | null;
}): Promise<Programacao3D> {
  const db = createSupabaseAdminClient();
  // Fim da fila da máquina — quem chega entra atrás; reordenar é outra rota.
  let ordem = 0;
  if (v.maquinaId) {
    const { data: ult } = await db
      .from("impressao3d_programacoes")
      .select("ordem")
      .eq("maquina_id", v.maquinaId)
      .order("ordem", { ascending: false })
      .limit(1);
    ordem = (Number(ult?.[0]?.ordem) || 0) + 1;
  }
  const status = (STATUS_PROGRAMACAO as readonly string[]).includes(v.status || "")
    ? (v.status as StatusProgramacao)
    : v.maquinaId && v.data ? "programado" : "a_fazer";
  const { data, error } = await db
    .from("impressao3d_programacoes")
    .insert({
      arquivo_id: v.arquivoId,
      maquina_id: v.maquinaId || null,
      quantidade: Math.max(1, Math.min(100000, Math.round(v.quantidade ?? 1))),
      data: v.data && DIA.test(v.data) ? v.data : null,
      hora: v.hora && /^\d{2}:\d{2}$/.test(v.hora) ? v.hora : null,
      prioridade: (PRIORIDADES as readonly string[]).includes(v.prioridade || "") ? v.prioridade : "normal",
      responsavel_id: v.responsavelId || null,
      observacoes: (v.observacoes || "").slice(0, 2000),
      status,
      ordem,
      iniciado_em: status === "imprimindo" ? new Date().toISOString() : null,
      criado_por: v.criadoPor || null,
    })
    .select(COLS_PROG)
    .single();
  if (error) throw new Error(semTabela(error) ? "tabela_ausente" : error.message);
  return progDeRow(data as Row);
}

export async function atualizarProgramacao(
  id: string,
  v: {
    maquinaId?: string | null;
    quantidade?: number;
    data?: string | null;
    hora?: string | null;
    prioridade?: string;
    responsavelId?: string | null;
    observacoes?: string;
    status?: string;
    ordem?: number;
  },
): Promise<Programacao3D | null> {
  const patch: Row = { atualizado_em: new Date().toISOString() };
  if (v.maquinaId !== undefined) patch.maquina_id = v.maquinaId || null;
  if (typeof v.quantidade === "number") patch.quantidade = Math.max(1, Math.min(100000, Math.round(v.quantidade)));
  if (v.data !== undefined) patch.data = v.data && DIA.test(v.data) ? v.data : null;
  if (v.hora !== undefined) patch.hora = v.hora && /^\d{2}:\d{2}$/.test(v.hora) ? v.hora : null;
  if (typeof v.prioridade === "string" && (PRIORIDADES as readonly string[]).includes(v.prioridade)) patch.prioridade = v.prioridade;
  if (v.responsavelId !== undefined) patch.responsavel_id = v.responsavelId || null;
  if (typeof v.observacoes === "string") patch.observacoes = v.observacoes.slice(0, 2000);
  if (typeof v.ordem === "number") patch.ordem = Math.max(0, Math.round(v.ordem));
  if (typeof v.status === "string" && (STATUS_PROGRAMACAO as readonly string[]).includes(v.status)) {
    patch.status = v.status;
    // ── Os carimbos do "status inteligente" ───────────────────────────────
    // Iniciar carimba UMA vez (pausar/retomar não zera o início); concluir e
    // cancelar carimbam o fim; voltar pra ativo limpa o fim — a linha volta
    // pro kanban sem fingir que já terminou.
    if (v.status === "concluido" || v.status === "cancelado") patch.concluido_em = new Date().toISOString();
    else patch.concluido_em = null;
  }
  const db = createSupabaseAdminClient();
  if (patch.status === "imprimindo") {
    const { data: atual } = await db.from("impressao3d_programacoes").select("iniciado_em").eq("id", id).maybeSingle();
    if (!atual?.iniciado_em) patch.iniciado_em = new Date().toISOString();
  }
  const { data, error } = await db
    .from("impressao3d_programacoes")
    .update(patch)
    .eq("id", id)
    .select(COLS_PROG)
    .maybeSingle();
  if (error) {
    if (semTabela(error)) return null;
    throw new Error(error.message);
  }
  return data ? progDeRow(data as Row) : null;
}

export async function apagarProgramacao(id: string): Promise<boolean> {
  const db = createSupabaseAdminClient();
  const { error, count } = await db.from("impressao3d_programacoes").delete({ count: "exact" }).eq("id", id);
  if (error) {
    if (semTabela(error)) return false;
    throw new Error(error.message);
  }
  return (count ?? 0) > 0;
}

/** Nova ordem da fila de UMA máquina: a lista de ids na ordem desejada.
 *  São poucas linhas (fila de impressora), então updates um a um bastam. */
export async function reordenarFila(maquinaId: string, ids: string[]): Promise<void> {
  const db = createSupabaseAdminClient();
  for (let i = 0; i < ids.length && i < 100; i++) {
    const { error } = await db
      .from("impressao3d_programacoes")
      .update({ ordem: i + 1, atualizado_em: new Date().toISOString() })
      .eq("id", ids[i])
      .eq("maquina_id", maquinaId);
    if (error && !semTabela(error)) throw new Error(error.message);
  }
}
