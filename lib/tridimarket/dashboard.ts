// ── TridiMarket · Agregações do Dashboard ───────────────────────────────────
// Funções PURAS (sem I/O) sobre o que o repositório já leu — dá pra testar sem
// banco. Passo 1 do docs/tridimarket-roadmap.md: só o que não exige dado novo.

// Fuso de São Paulo (UTC-3). Sem isto, "horário de pico" sai em UTC e o pico das
// 12h aparece às 15h.
const SP_OFFSET_MS = 3 * 3600 * 1000;

export interface HoraMovimento { hora: number; compras: number; receita: number }

/**
 * Movimento por hora do dia (0–23, horário de SP). Sempre devolve as 24 horas —
 * hora sem venda vale 0, senão o gráfico "pula" e engana a leitura do pico.
 */
export function movimentoPorHora(compras: Array<{ at: string; revenue?: number }>): HoraMovimento[] {
  const balde = Array.from({ length: 24 }, (_, hora) => ({ hora, compras: 0, receita: 0 }));
  for (const c of compras) {
    const t = new Date(c.at).getTime();
    if (!Number.isFinite(t)) continue;                 // data podre não derruba o gráfico
    const h = new Date(t - SP_OFFSET_MS).getUTCHours();
    balde[h].compras += 1;
    balde[h].receita += c.revenue ?? 0;
  }
  return balde;
}

/** Hora com mais compras (empate → a mais cedo). null se não houve venda. */
export function horaDePico(horas: HoraMovimento[] | null | undefined): HoraMovimento | null {
  let melhor: HoraMovimento | null = null;
  // Instalação nova ainda não tem o campo do movimento na resposta da API, e o
  // painel inteiro quebrava com "horas is not iterable" — justo no dia em que
  // o mercadinho é ligado e ninguém comprou nada ainda.
  for (const h of horas ?? []) if (h.compras > 0 && (!melhor || h.compras > melhor.compras)) melhor = h;
  return melhor;
}

export interface ProdutoGiro { id: number; name: string; units: number; revenue: number; semVenda: boolean }

/**
 * Produtos que MENOS saem — do pior pro "menos pior".
 *
 * Duas decisões que mudam o resultado:
 * 1. Inclui produto com ZERO venda. Um ranking de "menos vendidos" tirado só de
 *    quem vendeu esconde exatamente o pior caso (o que não vendeu nada) — que é
 *    o item que o gestor precisa ver pra tirar do catálogo.
 * 2. Só produtos ATIVOS. Item descontinuado sempre teria 0 e entupiria a lista.
 */
export function produtosMenosVendidos(
  produtos: Array<{ id: number; name: string; active?: boolean }>,
  vendidos: Map<number, { units: number; revenue: number }>,
  limite = 8,
): ProdutoGiro[] {
  return produtos
    .filter((p) => p.active !== false)
    .map((p) => {
      const v = vendidos.get(p.id);
      return {
        id: p.id, name: p.name,
        units: v?.units ?? 0, revenue: v?.revenue ?? 0,
        semVenda: !v || v.units === 0,
      };
    })
    // menos unidades primeiro; empate (todos em 0) → menor receita, depois nome
    .sort((a, b) => a.units - b.units || a.revenue - b.revenue || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, limite);
}

export interface DividaFuncionario { key: string; name: string; imageUrl: string | null; open: number; share: number }

/**
 * Dívida por funcionário, do maior pro menor, com a fatia do total em aberto.
 * Ignora quem está zerado ou com CRÉDITO — saldo negativo não é dívida, e somar
 * crédito no total faria a fatia de todo mundo mentir.
 *
 * Chaveado por `key` (a chave de agrupamento de MarketPerson), não por cadastro:
 * quem tem conta em várias empresas aparece UMA vez com a dívida somada.
 */
export function dividaPorFuncionario(
  pessoas: Array<{ key: string; name: string; imageUrl?: string | null; open?: number | null }>,
  limite = 10,
): DividaFuncionario[] {
  const devedores = pessoas
    .map((p) => ({ key: p.key, name: p.name, imageUrl: p.imageUrl ?? null, open: Number(p.open ?? 0) }))
    .filter((p) => p.open > 0)
    .sort((a, b) => b.open - a.open);
  const total = devedores.reduce((s, p) => s + p.open, 0);
  return devedores.slice(0, limite).map((p) => ({ ...p, share: total > 0 ? p.open / total : 0 }));
}
