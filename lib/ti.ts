// ── TI · projetos de tecnologia e roadmaps (consultas de SERVIDOR) ──────────
// As regras puras e os tipos moram em lib/ti-regras.ts (o que o cliente pode
// importar); aqui ficam as idas ao banco. Tolerante como lib/tarefas.ts: sem
// as tabelas, devolve vazio/no-op.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { progressoDaEtapa, progressoDoRoadmap, estaAtrasada } from "@/lib/ti-regras";
import type { TiProjeto, TiEtapa, TiRoadmap, TiHistorico, RoadmapStatus, EtapaStatus, TarefaVinculada } from "@/lib/ti-regras";

export * from "@/lib/ti-regras";

// ── Leitura ──────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const COLS_ROADMAP = "id,projeto_id,titulo,descricao,status,inicio,prazo,responsavel_id,responsavel_nome,progresso_manual,created_at,updated_at";
const COLS_ETAPA = "id,roadmap_id,titulo,descricao,status,inicio,prazo,concluida_em,responsavel_id,responsavel_nome,ordem,progresso_manual,depende_de,observacoes";
const COLS_TAREFA = "id,titulo,status,prazo,responsavel_nome";

function deEtapa(r: Row, tarefas: TarefaVinculada[]): TiEtapa {
  const base = {
    id: r.id as string, roadmapId: r.roadmap_id as string,
    titulo: (r.titulo as string) ?? "", descricao: (r.descricao as string) ?? null,
    status: (r.status as EtapaStatus) ?? "nao_iniciada",
    inicio: (r.inicio as string) ?? null, prazo: (r.prazo as string) ?? null,
    concluidaEm: (r.concluida_em as string) ?? null,
    responsavelId: (r.responsavel_id as string) ?? null, responsavelNome: (r.responsavel_nome as string) ?? null,
    ordem: (r.ordem as number) ?? 0, progressoManual: (r.progresso_manual as number) ?? null,
    dependeDe: (r.depende_de as string) ?? null, observacoes: (r.observacoes as string) ?? null,
    tarefas,
  };
  return { ...base, progresso: progressoDaEtapa(base), atrasada: estaAtrasada(base) };
}

async function montarRoadmaps(rows: Row[]): Promise<TiRoadmap[]> {
  if (!rows.length) return [];
  const db = createSupabaseAdminClient();
  const ids = rows.map((r) => r.id as string);
  const projetoIds = [...new Set(rows.map((r) => r.projeto_id as string))];

  const [projRes, etapasRes] = await Promise.all([
    db.from("ti_projetos").select("id,nome").in("id", projetoIds).limit(200),
    db.from("ti_roadmap_etapas").select(COLS_ETAPA).in("roadmap_id", ids).order("ordem", { ascending: true }).limit(1000),
  ]);
  const projetos = new Map(((projRes.data ?? []) as Row[]).map((p) => [p.id as string, (p.nome as string) ?? ""]));
  const etapaRows = (etapasRes.data ?? []) as Row[];

  // Tarefas vinculadas: uma ida pros vínculos, outra pras tarefas — colunas
  // nomeadas, sem embed (a tabela `tarefas` não tem FK de propósito).
  const etapaIds = etapaRows.map((e) => e.id as string);
  const tarefasPorEtapa = new Map<string, TarefaVinculada[]>();
  if (etapaIds.length) {
    const { data: links } = await db.from("ti_etapa_tarefas").select("etapa_id,tarefa_id").in("etapa_id", etapaIds).limit(2000);
    const tarefaIds = [...new Set(((links ?? []) as Row[]).map((l) => l.tarefa_id as string))];
    const tarefas = new Map<string, TarefaVinculada>();
    if (tarefaIds.length) {
      const { data: ts } = await db.from("tarefas").select(COLS_TAREFA).in("id", tarefaIds).limit(2000);
      for (const t of (ts ?? []) as Row[]) {
        tarefas.set(t.id as string, {
          id: t.id as string, titulo: (t.titulo as string) ?? "", status: (t.status as string) ?? "pendente",
          prazo: (t.prazo as string) ?? null, responsavelNome: (t.responsavel_nome as string) ?? null,
        });
      }
    }
    for (const l of (links ?? []) as Row[]) {
      const t = tarefas.get(l.tarefa_id as string);
      if (!t) continue; // tarefa apagada — vínculo morto, ignora
      const arr = tarefasPorEtapa.get(l.etapa_id as string) ?? [];
      arr.push(t); tarefasPorEtapa.set(l.etapa_id as string, arr);
    }
  }

  return rows.map((r) => {
    const etapas = etapaRows.filter((e) => e.roadmap_id === r.id).map((e) => deEtapa(e, tarefasPorEtapa.get(e.id as string) ?? []));
    const base = {
      id: r.id as string, projetoId: r.projeto_id as string, projetoNome: projetos.get(r.projeto_id as string) ?? "",
      titulo: (r.titulo as string) ?? "", descricao: (r.descricao as string) ?? null,
      status: (r.status as RoadmapStatus) ?? "planejamento",
      inicio: (r.inicio as string) ?? null, prazo: (r.prazo as string) ?? null,
      responsavelId: (r.responsavel_id as string) ?? null, responsavelNome: (r.responsavel_nome as string) ?? null,
      progressoManual: (r.progresso_manual as number) ?? null,
      criadoEm: (r.created_at as string) ?? "", atualizadoEm: (r.updated_at as string) ?? "",
      etapas,
    };
    const progresso = progressoDoRoadmap(base, etapas);
    const atrasado = estaAtrasada(base) || etapas.some((e) => e.atrasada);
    return { ...base, progresso, atrasado };
  });
}

export async function listarRoadmaps(): Promise<TiRoadmap[]> {
  try {
    const db = createSupabaseAdminClient();
    const { data, error } = await db.from("ti_roadmaps").select(COLS_ROADMAP).order("updated_at", { ascending: false }).limit(200);
    if (error) return [];
    return await montarRoadmaps((data ?? []) as Row[]);
  } catch { return []; }
}

export async function getRoadmap(id: string): Promise<TiRoadmap | null> {
  try {
    const db = createSupabaseAdminClient();
    const { data, error } = await db.from("ti_roadmaps").select(COLS_ROADMAP).eq("id", id).maybeSingle();
    if (error || !data) return null;
    const [r] = await montarRoadmaps([data as Row]);
    return r ?? null;
  } catch { return null; }
}

export async function listarProjetos(): Promise<TiProjeto[]> {
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("ti_projetos").select("id,nome,descricao,status").order("nome", { ascending: true }).limit(200);
    return ((data ?? []) as Row[]).map((p) => ({
      id: p.id as string, nome: (p.nome as string) ?? "", descricao: (p.descricao as string) ?? null, status: (p.status as string) ?? "ativo",
    }));
  } catch { return []; }
}

export async function listarHistorico(roadmapId: string): Promise<TiHistorico[]> {
  try {
    const db = createSupabaseAdminClient();
    const { data } = await db.from("ti_roadmap_historico")
      .select("id,acao,detalhe,autor_nome,created_at").eq("roadmap_id", roadmapId)
      .order("created_at", { ascending: false }).limit(60);
    return ((data ?? []) as Row[]).map((h) => ({
      id: h.id as string, acao: (h.acao as string) ?? "", detalhe: (h.detalhe as string) ?? null,
      autorNome: (h.autor_nome as string) ?? null, createdAt: (h.created_at as string) ?? "",
    }));
  } catch { return []; }
}

export async function registrarHistorico(roadmapId: string, autorNome: string | null, acao: string, detalhe?: string | null): Promise<void> {
  try {
    await createSupabaseAdminClient().from("ti_roadmap_historico")
      .insert({ roadmap_id: roadmapId, acao, detalhe: detalhe ?? null, autor_nome: autorNome });
  } catch { /* histórico é acessório — nunca derruba a ação */ }
}
