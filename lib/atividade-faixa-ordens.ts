// ── Trocar "quem faz" de um item vale pras ordens que já estão na fila ───────
//
// Sem isto a correção do cadastro só surtia efeito na PRÓXIMA vez que o item
// caísse abaixo do mínimo — e a ordem errada continuava chamando a pessoa
// errada no tablet (foi assim que 18 ordens de peça de máquina caíram pro
// montador em 10–11/09). Usado pelo PATCH do item e pela classificação em lote.
import { faixaDaAtividade } from "@/lib/atividade-faixa";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface ItemParaRecarimbar {
  nome: string;
  categoria?: string | null;
  setor_responsavel?: string | null;
}

/**
 * Re-carimba a faixa das ordens ABERTAS de cada item e devolve pro pool a que
 * está só OFERECIDA (tem dono, ainda não foi aceita) — a chamada errada sai da
 * frente da pessoa agora. Ordem já aceita não é tocada: quem está com a peça
 * na mão termina.
 *
 * Derivado, nunca crítico: erro é engolido (a varredura do dia re-decide).
 */
export async function recarimbarFaixaDasOrdens(db: Db, itens: ItemParaRecarimbar[]): Promise<void> {
  // Agrupado por FAIXA de destino: a classificação em lote passa dezenas de
  // itens de uma vez, e o par de updates por item virava 2N idas ao banco.
  // Itens que caem na mesma faixa carimbam juntos num único `.in()` — o
  // resultado é idêntico, só o número de round-trips muda (2N → 2 por faixa).
  const porFaixa = new Map<string, string[]>();
  for (const it of itens) {
    if (!it.nome) continue;
    const faixa = faixaDaAtividade(it.setor_responsavel ?? null, `Produzir ${it.nome}`, it.categoria ?? null);
    const nomes = porFaixa.get(faixa) ?? [];
    nomes.push(it.nome);
    porFaixa.set(faixa, nomes);
  }
  for (const [faixa, nomes] of porFaixa) {
    try {
      await db.from("atividades").update({ faixa })
        .in("produto_nome", nomes).eq("pool", true)
        .in("status", ["pendente", "aguardando_material"]).is("para_id", null);
      await db.from("atividades")
        .update({ faixa, status: "pendente", para_id: null, para_nome: "", claimed_at: null })
        .in("produto_nome", nomes).eq("pool", true)
        .eq("status", "em_andamento").is("iniciada_at", null);
    } catch { /* ver acima */ }
  }
}
