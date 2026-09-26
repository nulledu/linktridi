// ── O que SAIU, por item, depois de um lote de baixa ─────────────────────────
//
// A baixa devolve uma linha por CÓDIGO ("MDF6MM-BR-18-000042 · baixada · 50
// peças"). É o que o servidor precisa pra dizer o que deu errado, e é inútil
// pra quem está de pé no galpão: a pessoa bipou 8 etiquetas e quer ouvir "saíram
// 400 folhas de MDF 6 mm, restam 320". Ninguém confere código de barras de
// cabeça.
//
// Falta ainda o número que a bipagem não tem como saber sozinha: o SALDO. Ele é
// mantido pelo gatilho `estoque_unidades_sync` (supabase/estoque_hierarquia_unidades.sql)
// e só existe depois do UPDATE — por isso o resumo é lido DEPOIS da baixa, nunca
// calculado como "o que tinha menos o que saiu". Um número derivado ficaria
// certo no papel e errado na prateleira sempre que duas pessoas bipassem o mesmo
// item ao mesmo tempo.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { LOTE_MAXIMO_BAIXA, type ResultadoBaixaCodigo } from "@/lib/estoque-baixa";

export interface ItemDaSaida {
  /** Nome do item, como está no catálogo. */
  item: string;
  /** Peças que saíram AGORA neste lote — a soma das caixas bipadas. */
  pecas: number;
  /** O que ficou na prateleira depois desta baixa. */
  saldo: number;
  /** "un", "m", "kg" — o saldo sem unidade não quer dizer nada. */
  unidade: string;
}

/**
 * Agrupa o resultado por ITEM. Puro — sem banco — porque é a parte que precisa
 * de teste: somar caixa com caixa, ignorar o que não saiu, e não inventar linha
 * pra item que o banco não devolveu.
 *
 * Só `baixada` conta. `desconhecida` e `ja_baixada` não tiraram nada da
 * prateleira agora; entrar no total faria a tela do galpão anunciar uma saída
 * que não aconteceu — exatamente o erro que o resumo existe pra impedir.
 *
 * A ORDEM é a da primeira aparição no lote, não alfabética: é a ordem em que a
 * pessoa bipou, e é a que ela reconhece ao conferir o que acabou de fazer.
 */
export function agruparSaidaPorItem(
  resultado: ResultadoBaixaCodigo[],
  itemIdPorCodigo: Map<string, string>,
  itens: Map<string, { nome: string; quantidade: number; unidade: string }>,
): ItemDaSaida[] {
  const porItemId = new Map<string, ItemDaSaida>();
  for (const linha of resultado) {
    if (linha.situacao !== "baixada") continue;
    const itemId = itemIdPorCodigo.get(linha.codigo);
    if (!itemId) continue;
    const dados = itens.get(itemId);
    // Item que o banco não devolveu não vira linha com nome vazio: uma linha
    // "— 50 peças · restam 0" é pior que linha nenhuma, porque parece zerado.
    if (!dados) continue;
    const acumulado = porItemId.get(itemId);
    const pecas = Number.isFinite(linha.pecas) && linha.pecas > 0 ? linha.pecas : 1;
    if (acumulado) {
      acumulado.pecas += pecas;
    } else {
      porItemId.set(itemId, {
        item: dados.nome,
        pecas,
        // Saldo é o que o gatilho gravou; `< 0` não existe em prateleira.
        saldo: Number.isFinite(dados.quantidade) ? Math.max(0, dados.quantidade) : 0,
        unidade: dados.unidade || "un",
      });
    }
  }
  return [...porItemId.values()];
}

/**
 * O resumo pronto pra descer pro tablet. BEST-EFFORT de propósito: qualquer
 * erro aqui devolve lista vazia em vez de estourar.
 *
 * A baixa JÁ ACONTECEU quando esta função roda. Deixar uma falha de leitura
 * virar 500 faria a operação voltar pra fila offline do tablet e o galpão veria
 * "não subiu" para um material que já saiu do estoque — trocar um resumo
 * bonito por um número errado.
 */
export async function resumoDaSaida(resultado: ResultadoBaixaCodigo[]): Promise<ItemDaSaida[]> {
  const baixados = resultado.filter((r) => r.situacao === "baixada").map((r) => r.codigo);
  if (!baixados.length) return [];
  try {
    const db = createSupabaseAdminClient();
    // Duas consultas com colunas nomeadas, nunca um embed: o `estoque_itens(...)`
    // dentro da unidade arrastaria a ficha inteira do item por etiqueta bipada.
    const { data: unidades, error: eUnid } = await db
      .from("estoque_unidades")
      .select("codigo,item_id")
      .in("codigo", baixados)
      .limit(LOTE_MAXIMO_BAIXA);
    if (eUnid || !unidades?.length) return [];

    const itemIdPorCodigo = new Map<string, string>();
    for (const u of unidades as { codigo: string; item_id: string }[]) itemIdPorCodigo.set(u.codigo, u.item_id);

    const ids = [...new Set(itemIdPorCodigo.values())];
    const { data: linhas, error: eItens } = await db
      .from("estoque_itens")
      .select("id,nome,quantidade,unidade")
      .in("id", ids)
      .limit(LOTE_MAXIMO_BAIXA);
    if (eItens || !linhas) return [];

    const itens = new Map<string, { nome: string; quantidade: number; unidade: string }>();
    for (const it of linhas as { id: string; nome: string; quantidade: number | null; unidade: string | null }[]) {
      itens.set(it.id, { nome: it.nome, quantidade: Number(it.quantidade ?? 0), unidade: it.unidade || "un" });
    }
    return agruparSaidaPorItem(resultado, itemIdPorCodigo, itens);
  } catch {
    return [];
  }
}
