// ── Fila de recusadas (23/09/2026) ───────────────────────────────────────────
//
// Ordem devolvida no tablet ("não consigo — falta material") não volta mais pro
// pool depois de 40 min: ela sai da fila de TODO tablet (`impedida = true`,
// filtrada em lib/device.ts › liberadaAgora) e espera aqui. Quem tem
// Atividades › Autorizar lê o motivo e devolve pra fila quando o problema
// passou. O "quem recusou" vem do livro da autorização
// (atividades_autorizacoes), porque o devolver apaga o dono da ordem.
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export interface Recusada {
  id: string;
  tarefa: string;
  categoria: string | null;
  produto_nome: string | null;
  motivo: string;
  /** Quando saiu da fila (devolvida_em); sem a coluna, a criação. */
  em: string;
  recusadaPor: string | null;
  liberadaPor: string | null;
}

const COLS = "id,tarefa,categoria,produto_nome,motivo_impedimento,created_at";

interface Linha {
  id: string; tarefa: string | null; categoria: string | null; produto_nome: string | null;
  motivo_impedimento: string | null; created_at: string; devolvida_em?: string | null;
}

export async function listRecusadas(limite = 100): Promise<Recusada[]> {
  const db = createSupabaseAdminClient();
  const base = (cols: string) => db.from("atividades").select(cols)
    .eq("status", "pendente").eq("impedida", true).eq("pool", true).is("para_id", null)
    .order("created_at", { ascending: false }).limit(limite);
  // `devolvida_em` nasceu num SQL próprio (atividades_devolucao.sql): sem ela
  // a leitura segue com a data de criação em vez de derrubar a fila inteira.
  let r = await base(`${COLS},devolvida_em`);
  if (r.error) r = await base(COLS);
  if (r.error) throw new Error(r.error.message);
  const linhas = (r.data ?? []) as unknown as Linha[];
  if (!linhas.length) return [];

  const quem = new Map<string, { por: string | null; sup: string | null }>();
  try {
    const { data } = await db.from("atividades_autorizacoes")
      .select("atividade_id,pedido_por_nome,supervisor_nome,created_at")
      .in("atividade_id", linhas.map((l) => l.id)).eq("tipo", "devolver").eq("decisao", "aprovada")
      .order("created_at", { ascending: true }).limit(500);
    // Ascendente: a última aprovação de cada ordem sobrescreve as antigas.
    for (const a of (data ?? []) as { atividade_id: string; pedido_por_nome: string | null; supervisor_nome: string | null }[]) {
      quem.set(a.atividade_id, { por: a.pedido_por_nome, sup: a.supervisor_nome });
    }
  } catch { /* sem o livro (SQL pendente): a fila aparece sem o nome */ }

  return linhas
    .map((l) => ({
      id: l.id,
      tarefa: l.tarefa || "Atividade",
      categoria: l.categoria,
      produto_nome: l.produto_nome,
      motivo: (l.motivo_impedimento || "").trim() || "Sem motivo informado",
      em: l.devolvida_em || l.created_at,
      recusadaPor: quem.get(l.id)?.por ?? null,
      liberadaPor: quem.get(l.id)?.sup ?? null,
    }))
    .sort((a, b) => b.em.localeCompare(a.em));
}

/** Devolve a recusada pra fila: sem a marca, com a hora de agora (entra pelo
 *  fim, como toda devolução). Só mexe se ela ainda está recusada. */
export async function voltarPraFila(id: string): Promise<boolean> {
  const db = createSupabaseAdminClient();
  const patch = { impedida: false, motivo_impedimento: null } as Record<string, unknown>;
  const agora = new Date().toISOString();
  const alvo = () => db.from("atividades").update(patch)
    .eq("id", id).eq("status", "pendente").eq("impedida", true).select("id");
  let r = await (async () => { patch.devolvida_em = agora; return alvo(); })();
  if (r.error) { delete patch.devolvida_em; r = await alvo(); }
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []).length > 0;
}
