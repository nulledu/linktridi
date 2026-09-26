// ── Estoque entrou → quem estava esperando pode andar? ───────────────────────
//
// A ordem travada ("aguardando_material", atividade ou programação de máquina)
// tem suas faltas registradas em `producao_esperas`. Quando o estoque de um
// item ENTRA (conferência aprovada, recebimento, entrada por leitura), este
// gancho pergunta: alguém esperava por ele? Re-checa TODAS as esperas de cada
// ordem contra o saldo atual e, só quando TODAS couberem (tudo-ou-nada — não
// se libera ordem pra fazer metade), promove: atividade → `pendente` (cai no
// tablet), programação → `fila` (aparece na parede).
//
// TOLERANTE POR PRINCÍPIO: liberar é derivado. Qualquer erro (tabela ausente,
// corrida) sai calado — a varredura diária re-decide tudo, e a entrada de
// estoque que disparou o gancho nunca pode falhar por causa dele.

import { createSupabaseAdminClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function liberarEsperasDoItem(itemId: string): Promise<void> {
  const id = String(itemId ?? "").trim();
  if (!id) return;
  try {
    const db: Db = createSupabaseAdminClient();
    const { data: gatilho, error } = await db.from("producao_esperas")
      .select("atividade_id,programacao_id").eq("item_id", id).limit(200);
    if (error || !gatilho?.length) return;
    const atividadeIds = [...new Set((gatilho as { atividade_id: string | null }[])
      .map((g) => g.atividade_id).filter(Boolean))] as string[];
    const programacaoIds = [...new Set((gatilho as { programacao_id: string | null }[])
      .map((g) => g.programacao_id).filter(Boolean))] as string[];

    // TODAS as esperas dessas ordens (não só as deste item) + saldos atuais.
    const filtros = [
      atividadeIds.length ? `atividade_id.in.(${atividadeIds.join(",")})` : "",
      programacaoIds.length ? `programacao_id.in.(${programacaoIds.join(",")})` : "",
    ].filter(Boolean).join(",");
    const { data: esperas } = await db.from("producao_esperas")
      .select("id,atividade_id,programacao_id,item_id,falta")
      .or(filtros).limit(500);
    if (!esperas?.length) return;
    const itemIds = [...new Set((esperas as { item_id: string }[]).map((e) => e.item_id))];
    const { data: itens } = await db.from("estoque_itens")
      .select("id,quantidade").in("id", itemIds).limit(500);
    const saldo = new Map(((itens ?? []) as { id: string; quantidade: number }[])
      .map((i) => [i.id, Number(i.quantidade) || 0]));

    const porDono = new Map<string, {
      tipo: "atividade" | "programacao";
      esperas: { id: string; item_id: string; falta: number }[];
    }>();
    for (const e of esperas as { id: string; atividade_id: string | null; programacao_id: string | null; item_id: string; falta: number }[]) {
      const chave = e.atividade_id ? `a:${e.atividade_id}` : `p:${e.programacao_id}`;
      const dono = porDono.get(chave) ?? { tipo: e.atividade_id ? "atividade" as const : "programacao" as const, esperas: [] };
      dono.esperas.push({ id: e.id, item_id: e.item_id, falta: e.falta });
      porDono.set(chave, dono);
    }
    for (const [chave, dono] of porDono) {
      const cabe = dono.esperas.every((e) => (saldo.get(e.item_id) ?? 0) >= e.falta);
      if (!cabe) continue;
      const donoId = chave.slice(2);
      // Update condicional no status: se alguém já mexeu (dispensou, cancelou),
      // a promoção não atropela.
      if (dono.tipo === "atividade") {
        await db.from("atividades").update({ status: "pendente" })
          .eq("id", donoId).eq("status", "aguardando_material");
      } else {
        await db.from("maquina_programacoes").update({ status: "fila" })
          .eq("id", donoId).eq("status", "aguardando_material");
      }
      await db.from("producao_esperas").delete().in("id", dono.esperas.map((e) => e.id));
    }
  } catch { /* liberar é derivado; a varredura diária re-decide */ }
}
