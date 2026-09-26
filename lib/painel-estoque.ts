import { createSupabaseAdminClient } from "@/lib/supabase/server";

/**
 * Estoque na parede do galpão: o que está abaixo do mínimo e o que já foi
 * produzido mas ainda não entrou porque falta conferir.
 *
 * É de propósito MAIS BARATO que a tela do ERP. `linhasProducaoDia` cruza cada
 * item baixo com a cobertura de produção — uma consulta POR item — e isso é
 * aceitável numa tela que alguém abriu, não numa TV que bate 24h por dia. Aqui
 * são duas consultas fixas: o catálogo com regra de reposição e uma CONTAGEM
 * (`head: true`, corpo vazio) das atividades concluídas sem estoque lançado.
 */

export interface AvisoEstoque {
  nome: string;
  /** Saldo atual. */
  quantidade: number;
  /** Mínimo cadastrado no item — é a regra que faz ele entrar na lista. */
  minimo: number;
  /** Quanto falta para voltar ao ideal (ou ao mínimo, se não há ideal). */
  falta: number;
}

export interface ResumoEstoque {
  atualizadoEm: string;
  /** Itens com regra de reposição e saldo no mínimo ou abaixo dele. */
  abaixo: number;
  /** Subconjunto do anterior: os que estão zerados — a fila para de andar. */
  zerados: number;
  /**
   * Atividades concluídas cujo estoque ainda não entrou. É uma aproximação por
   * cima, a mesma que `contarAcervoAnterior` usa: o que travou no meio da
   * conferência continua com `estoque_lancado = false` e entra na conta.
   */
  conferir: number;
  /** Os mais críticos primeiro (menor saldo em relação ao mínimo). */
  itens: AvisoEstoque[];
}

/** Teto da lista na parede: mais que isso ninguém lê de longe. */
const NA_TELA = 10;

export async function resumoEstoquePainel(): Promise<ResumoEstoque | null> {
  const db = createSupabaseAdminClient();

  const { data, error } = await db
    .from("estoque_itens")
    .select("nome,quantidade,qtd_minima,estoque_ideal")
    .eq("ativo", true)
    .gt("qtd_minima", 0)
    .limit(1000);
  if (error) return null;

  const avisos: AvisoEstoque[] = [];
  let zerados = 0;
  for (const it of (data ?? []) as { nome: string | null; quantidade: number | null; qtd_minima: number | null; estoque_ideal: number | null }[]) {
    const minimo = Number(it.qtd_minima) || 0;
    const quantidade = Number(it.quantidade) || 0;
    if (quantidade > minimo) continue;
    if (quantidade <= 0) zerados++;
    const ideal = Math.max(Number(it.estoque_ideal) || 0, minimo);
    avisos.push({ nome: String(it.nome ?? "").slice(0, 60), quantidade, minimo, falta: Math.max(0, ideal - quantidade) });
  }
  // Critério de corte: quem está mais longe do próprio mínimo aparece primeiro
  // — 0 de 50 é mais grave que 9 de 10, e ordenar pelo saldo cru trocaria a
  // ordem dos dois. Empate desempata pelo que falta produzir.
  avisos.sort((a, b) => (a.quantidade / (a.minimo || 1)) - (b.quantidade / (b.minimo || 1)) || b.falta - a.falta);

  const { count } = await db
    .from("atividades")
    .select("id", { count: "exact", head: true })
    .eq("status", "concluida")
    .eq("estoque_lancado", false);

  return {
    atualizadoEm: new Date().toISOString(),
    abaixo: avisos.length,
    zerados,
    conferir: count ?? 0,
    itens: avisos.slice(0, NA_TELA),
  };
}
