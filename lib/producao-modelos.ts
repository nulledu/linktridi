// Modelos de produção (editáveis, no banco). Fonte das ordens do "Gerar produção".
// Semeados da receita fixa (producao-receita.ts) quando a tabela está vazia, e daí
// em diante editáveis pela tela. Tolerante: sem a tabela, o chamador cai na receita.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { RECEITAS, PRODUTOS } from "@/lib/producao-receita";

export interface ModeloOrdem {
  id: string;
  produto: string;
  fase: number;
  categoria: string;
  tarefa: string;
  detalhe: string | null;
  por_meta: number;
  controla_qtd: boolean;
  produto_id: number | null;
  produto_nome: string | null;
  instrucoes: string | null;
  demo_url: string | null;
  urgente: boolean;
  ordem: number;
  ativo: boolean;
}

export const semTabela = (m: string | undefined) =>
  !!m && /relation .* does not exist|Could not find the table/i.test(m);
const colunaAusente = (m: string | undefined) =>
  !!m && /column .* does not exist|Could not find the .* column/i.test(m);

// Semeia os modelos a partir da receita fixa quando a tabela está VAZIA.
export async function seedModelosSeVazio(): Promise<void> {
  const db = createSupabaseAdminClient();
  const { count, error } = await db.from("producao_modelos").select("id", { count: "exact", head: true });
  if (error) return;                 // sem tabela → nada a semear
  if ((count ?? 0) > 0) return;
  const rows: Record<string, unknown>[] = [];
  for (const p of PRODUTOS) {
    RECEITAS[p].forEach((e, i) => {
      rows.push({ produto: p, fase: e.fase, categoria: e.categoria, tarefa: e.tarefa, detalhe: e.detalhe(30), por_meta: e.porMeta, controla_qtd: e.controlaQtd !== false, ordem: i, ativo: true });
    });
  }
  if (rows.length) await db.from("producao_modelos").insert(rows);
}

// Lista os modelos ativos. null = tabela ainda não existe (usar receita fixa).
export async function listModelos(): Promise<ModeloOrdem[] | null> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.from("producao_modelos").select("*").eq("ativo", true).order("produto", { ascending: true }).order("ordem", { ascending: true });
  if (error) return semTabela(error.message) ? null : [];
  return (data ?? []) as ModeloOrdem[];
}

// Substitui TODAS as ordens de um produto pelas novas (delete + insert). Resiliente
// a colunas ainda não criadas (instrucoes/demo_url) — remove e tenta de novo.
export async function salvarModelosDoProduto(produto: string, ordens: Partial<ModeloOrdem>[]): Promise<{ ok: boolean; detail?: string }> {
  const db = createSupabaseAdminClient();
  const del = await db.from("producao_modelos").delete().eq("produto", produto);
  if (del.error) return { ok: false, detail: del.error.message };
  if (ordens.length === 0) return { ok: true };
  const rows = ordens.map((o, i) => ({
    produto,
    fase: Number(o.fase) || 1,
    categoria: o.categoria ?? "",
    tarefa: o.tarefa ?? "",
    detalhe: o.detalhe ?? null,
    por_meta: Number(o.por_meta) > 0 ? Number(o.por_meta) : 1,
    controla_qtd: o.controla_qtd !== false,
    produto_id: o.produto_id ?? null,
    produto_nome: o.produto_nome ?? null,
    instrucoes: o.instrucoes ?? null,
    demo_url: o.demo_url ?? null,
    urgente: o.urgente === true,
    ordem: i,
    ativo: true,
  }));
  let attempt: Record<string, unknown>[] = rows;
  for (let i = 0; i < 4; i++) {
    const { error } = await db.from("producao_modelos").insert(attempt);
    if (!error) return { ok: true };
    const m = /'([^']+)' column|column "?([^"\s]+)"? .* does not exist/.exec(error.message);
    const col = m?.[1] || m?.[2];
    if (colunaAusente(error.message) && col) { attempt = attempt.map((r) => { const c = { ...r }; delete c[col]; return c; }); continue; }
    return { ok: false, detail: error.message };
  }
  return { ok: false, detail: "colunas ausentes" };
}
