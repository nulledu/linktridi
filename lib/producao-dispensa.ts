// ── "Não precisa fazer": a dispensa da atividade automática ──────────────────
//
// O fallback da automação. Dispensar cancela a ordem, solta as esperas dela e
// grava NO ITEM o saldo daquele momento — o motor não recria a reposição
// enquanto o saldo não cair abaixo disso (dispensaVale em
// lib/producao-em-cadeia.ts). Caiu mais, a falta é nova e a atividade volta.
//
// Duas portas chamam isto: a rota web (POST /api/atividades/dispensar, painel
// Produção do dia) e a op `dispensar` da fila offline do tablet. Idempotente
// por natureza: a segunda dispensa da mesma atividade acha status `cancelada`,
// o update condicional não muda nada e a memória é regravada igual.

import { createSupabaseAdminClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function dispensarAtividade(
  atividadeId: string,
  por: string,
  motivo: string | null,
): Promise<{ ok: boolean; erro?: string }> {
  const id = String(atividadeId ?? "").trim();
  if (!id) return { ok: false, erro: "Atividade não informada." };
  const db: Db = createSupabaseAdminClient();

  const sel = (colunas: string) => db.from("atividades").select(colunas).eq("id", id).limit(1);
  // `criada_por_automacao` pode não existir (SQL pendente) — cai no selo velho.
  let { data, error } = await sel("id,status,produto_nome,por_nome,criada_por_automacao");
  if (error) ({ data } = await sel("id,status,produto_nome,por_nome"));
  const a = data?.[0] as {
    status: string; produto_nome: string | null; por_nome: string | null;
    criada_por_automacao?: boolean | null;
  } | undefined;
  if (!a) return { ok: false, erro: "Atividade não encontrada." };
  const automatica = a.criada_por_automacao === true || a.por_nome === "Sistema (requisição)";
  if (!automatica) {
    return { ok: false, erro: "Só atividade criada pela automação se dispensa — as outras se devolvem." };
  }
  if (a.status === "concluida") return { ok: false, erro: "Esta atividade já foi concluída." };

  const { error: eCancela } = await db.from("atividades")
    .update({ status: "cancelada" })
    .eq("id", id).neq("status", "concluida");
  if (eCancela) return { ok: false, erro: "Não deu pra dispensar agora. Tente de novo." };
  await db.from("producao_esperas").delete().eq("atividade_id", id)
    .then(() => undefined, () => undefined);

  // A memória no item. Tolerante: sem as colunas (SQL pendente), sem memória —
  // a varredura recria amanhã, que era o comportamento antigo.
  if (a.produto_nome) {
    const { data: itens } = await db.from("estoque_itens")
      .select("id,quantidade").ilike("nome", String(a.produto_nome)).limit(1);
    const item = itens?.[0] as { id: string; quantidade: number } | undefined;
    if (item) {
      await db.from("estoque_itens").update({
        reposicao_dispensada_saldo: Math.max(0, Number(item.quantidade) || 0),
        reposicao_dispensada_em: new Date().toISOString(),
        reposicao_dispensada_por: por,
        reposicao_dispensada_motivo: motivo ? String(motivo).slice(0, 280) : null,
      }).eq("id", item.id).then(() => undefined, () => undefined);
    }
  }
  return { ok: true };
}
