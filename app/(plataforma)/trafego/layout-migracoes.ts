// ── Entrada única de widgets novos no "Meu painel" da Tridify ────────────────
// Módulo puro (sem React) pra poder ser testado sem arrastar o painel inteiro.

/** O layout salvo por pessoa (localStorage `trafego.painel.<userId>`). */
export interface LayoutDoPainel<S extends number = number> {
  order: string[]; hidden: string[]; sizes: Record<string, S>;
  /** Posição LÓGICA de cada card na grade base de 4 colunas (lattice.ts). Sem
   *  ela (layout antigo), a posição sai da `order` empacotada. `order` segue
   *  gravada em ordem de leitura pra quem só lê a ordem. */
  itens?: { id: string; x: number; y: number; w: number; h: number }[];
  /** Arrumação feita numa grade menor (tablet), por nº de colunas. Some quando
   *  a base muda — senão o tablet mostraria um painel velho. */
  telas?: Record<string, { id: string; x: number; y: number; w: number; h: number }[]>;
  /** Entradas únicas de widgets novos já aplicadas a este layout. */
  migracoes?: string[];
}

/**
 * Entrada única de widgets novos no painel de quem JÁ tinha um layout salvo.
 *
 * O layout mora no aparelho de cada pessoa e lista as chaves que conhecia
 * quando foi salvo — widget criado depois nunca aparece sozinho. Pedido do dono
 * (23/09/2026): os widgets do painel da Yampi têm que ESTAR na Tridify, não só
 * disponíveis em "Adicionar". Cada entrada roda UMA vez por layout (marca em
 * `migracoes`): quem esconder um deles depois não o vê voltar. Os que a pessoa
 * já tinha posto no painel ficam onde estão; os que faltam entram no fim, onde
 * a sobra da grade é normal.
 */
export const MIGRACOES: { id: string; entram: string[] }[] = [
  { id: "yampi-2026-09-23", entram: ["yampi_p_vendas", "yampi_p_receita", "yampi_p_ticket", "yampi_p_pix", "yampi_p_parcelas", "yampi_p_formas", "yampi_p_estados", "yampi_p_produtos", "yampi_p_recorrentes"] },
];

export function migrarLayout<L extends LayoutDoPainel>(l: L): L {
  const feitas = new Set(l.migracoes ?? []);
  const pendentes = MIGRACOES.filter((m) => !feitas.has(m.id));
  if (!pendentes.length) return l;
  let order = l.order, hidden = l.hidden;
  for (const m of pendentes) {
    order = [...order, ...m.entram.filter((k) => !order.includes(k))];
    hidden = hidden.filter((k) => !m.entram.includes(k));
  }
  return { ...l, order, hidden, migracoes: [...feitas, ...pendentes.map((m) => m.id)] };
}

