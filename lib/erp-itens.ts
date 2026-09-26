// Itens dos pedidos do ERP legado (itens_pedidos) — o que cada venda levou.
// Usado por duas coisas: as REGRAS de classificação (produto/categoria decidem
// se a venda é tráfego ou comercial) e a tela de Produtos do Tridify.
//
// Paginação obrigatória: o PostgREST corta a resposta em 1000 linhas sem
// reclamar. Um pedido tem 1 linha por unidade, então 500 pedidos já passam
// disso — sem paginar, produto some da conta e ninguém percebe.

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || "";
const H = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

export interface ItemPedido {
  pedidoId: number;
  nome: string;
  categoriaId: number | null;
  preco: number;
}

async function paginado<T>(caminho: string, max = 40000): Promise<T[]> {
  const linhas: T[] = [];
  for (let ini = 0; ini < max; ini += 1000) {
    const res = await fetch(`${LEGACY_URL}/rest/v1/${caminho}`, {
      headers: { ...H, Range: `${ini}-${ini + 999}`, "Range-Unit": "items" },
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res || !res.ok) break;
    const lote = (await res.json()) as T[];
    linhas.push(...lote);
    if (lote.length < 1000) break;
  }
  return linhas;
}

type ItemRow = { pedido_id: number; nome: string | null; cat_prod_id: number | null; preco: number | null };

/** Itens dos pedidos informados, agrupados por pedido. */
export async function itensPorPedido(ids: number[]): Promise<Map<number, ItemPedido[]>> {
  const mapa = new Map<number, ItemPedido[]>();
  if (!ids.length || !LEGACY_KEY) return mapa;
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200).join(",");
    if (!lote) continue;
    const rows = await paginado<ItemRow>(`itens_pedidos?select=pedido_id,nome,cat_prod_id,preco&pedido_id=in.(${lote})`);
    for (const r of rows) {
      const it: ItemPedido = {
        pedidoId: Number(r.pedido_id),
        nome: String(r.nome ?? "").trim() || "Sem nome",
        categoriaId: r.cat_prod_id == null ? null : Number(r.cat_prod_id),
        preco: Number(r.preco) || 0,
      };
      const arr = mapa.get(it.pedidoId) ?? [];
      arr.push(it);
      mapa.set(it.pedidoId, arr);
    }
  }
  return mapa;
}

/** Nome de cada categoria de produto (tt_categorias_produtos). */
export async function nomesCategorias(): Promise<Record<number, string>> {
  try {
    const res = await fetch(`${LEGACY_URL}/rest/v1/tt_categorias_produtos?select=id,nome`, { headers: H, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return {};
    const rows = (await res.json()) as { id: number; nome: string }[];
    return Object.fromEntries(rows.map((r) => [r.id, r.nome]));
  } catch { return {}; }
}
