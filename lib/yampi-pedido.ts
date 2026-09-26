// ── Um pedido da Yampi, lido UMA vez ─────────────────────────────────────────
// A API (lib/yampi-api) e o webhook (lib/yampi-webhook) recebem o pedido no
// MESMO formato — o webhook manda "todas as includes disponíveis" do recurso.
// Antes cada um tinha a sua leitura, e com os campos do painel (pagamento,
// parcelas, estado, cliente, itens) duas cópias divergiriam no primeiro campo
// novo. Módulo puro: sem env, sem rede, testável.
//
// Campos medidos num pedido real em 23/09/2026 (loja `tridixp`):
//   value_total (284,61) = value_products (242,90) + value_tax (41,71)
//   `value_tax` é o JUROS do parcelamento — o nome engana, não é imposto.
//   status → { data: { alias: "paid", id: 4 } }
//   created_at → { date: "2026-09-23 10:40:49.000000", timezone: "America/Sao_Paulo" }
//   transactions.data[0] → { installments, payment: { data: { alias, is_pix, is_credit_card, is_billet } } }
//   shipping_address.data → { uf }
//   items.data[] → { quantity, price, gift, freebie_id, sku_id, sku: { data: { title } } }

/** Status que contam como pago. Alias vem em `status.data.alias`. */
export const PAGOS = new Set(["paid", "approved", "payment_approved", "delivered", "shipped", "invoiced", "ready_for_shipping", "handling_products"]);

/** `status_id` 4 = "paid" (todo pedido com alias `paid` tinha id 4 em 23/09). */
const STATUS_PAGO = 4;

export type FormaPagamento = "pix" | "cartao" | "boleto" | "outro";

export interface ItemYampi {
  skuId: number;
  produto: string;
  quantidade: number;
  preco: number;
  /** Brinde/presente que acompanha o pedido (ex.: "Parabéns! Seu pedido vai com um…"). */
  brinde: boolean;
}

export interface PedidoYampi {
  /** `number` do pedido — o mesmo que o ERP guarda em `id_proprio`. */
  numero: string;
  /** id interno da Yampi. */
  id: number;
  /** Alias da loja de onde veio. */
  loja: string;
  /** Criação, ISO com fuso de SP. É por ela que o pedido cai num dia. */
  criadoEm: string;
  status: string;
  /** Pago/aprovado. Separa Receita (pagos) de Vendas (todos). */
  pago: boolean;
  /** Só produto: sem frete e sem juros de parcelamento. É o que vira dinheiro. */
  valorProdutos: number;
  /** Guardados pra conferência — nenhum entra em faturamento. */
  valorTotal: number; valorFrete: number; valorDesconto: number; valorJuros: number;
  formaPagamento: FormaPagamento | null;
  bandeira: string | null;
  parcelas: number | null;
  uf: string | null;
  clienteId: number | null;
  itens: ItemYampi[];
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const dados = <T,>(v: unknown): T | undefined => (v && typeof v === "object" ? (v as { data?: T }).data : undefined);

/** `created_at` vem ora string, ora `{ date }`, e sem fuso declarado é SP. */
export function quandoFoi(v: unknown): string {
  const bruto = typeof v === "string" ? v : (v as { date?: string } | null)?.date || "";
  if (!bruto) return "";
  const limpo = bruto.trim().replace(" ", "T").replace(/\.\d+$/, "");
  // Sem o -03:00 explícito o Date lê como UTC e o pedido da manhã cai no dia
  // anterior às 21h — a armadilha que `diaDoPedido` já resolve no ERP.
  return /[Zz]|[+-]\d{2}:?\d{2}$/.test(limpo) ? limpo : `${limpo}-03:00`;
}

function statusDe(r: Record<string, unknown>): string {
  const st = dados<{ alias?: string; name?: string }>(r.status);
  return String(st?.alias || st?.name || r.status_alias || (typeof r.status === "string" ? r.status : "") || "").toLowerCase();
}

/**
 * Forma de pagamento pelos marcadores booleanos da Yampi, não pelo nome: o
 * nome é a BANDEIRA ("Mastercard", "Visa"), e agrupar por ele faria o gráfico
 * de "Formas de pagamento" mostrar uma fatia por cartão em vez de "Cartões".
 */
function formaDe(pagamento: Record<string, unknown> | undefined): { forma: FormaPagamento | null; bandeira: string | null } {
  if (!pagamento) return { forma: null, bandeira: null };
  const bandeira = String(pagamento.alias || pagamento.name || "").toLowerCase() || null;
  if (pagamento.is_pix || pagamento.is_pix_in_installments || bandeira === "pix") return { forma: "pix", bandeira };
  if (pagamento.is_credit_card) return { forma: "cartao", bandeira };
  if (pagamento.is_billet || bandeira === "billet" || bandeira === "boleto") return { forma: "boleto", bandeira };
  return { forma: "outro", bandeira };
}

/**
 * Lê um pedido da resposta da API ou do corpo do webhook. `null` quando não
 * dá pra cruzar com nada (sem número) — é pelo número que o ERP casa.
 */
export function lerPedido(r: unknown, loja: string): PedidoYampi | null {
  if (!r || typeof r !== "object") return null;
  const p = r as Record<string, unknown>;
  const numero = String((p.number as string | number | undefined) ?? "").trim();
  if (!numero) return null;
  const status = statusDe(p);

  // A transação que VALE é a paga, se houver; senão a mais recente. Um pedido
  // pode ter um pix que expirou e um cartão aprovado depois — contar o pix
  // mostraria a forma errada no gráfico.
  const trans = dados<Record<string, unknown>[]>(p.transactions) ?? [];
  const paga = trans.find((t) => String(t.status || "").toLowerCase() === "paid") ?? trans[trans.length - 1];
  const { forma, bandeira } = formaDe(dados<Record<string, unknown>>(paga?.payment));
  const parcelas = paga && num(paga.installments) > 0 ? num(paga.installments) : null;

  const end = dados<Record<string, unknown>>(p.shipping_address);
  const uf = String(end?.uf || end?.state || "").trim().toUpperCase() || null;

  const itens: ItemYampi[] = (dados<Record<string, unknown>[]>(p.items) ?? []).map((i) => {
    const sku = dados<Record<string, unknown>>(i.sku);
    const preco = num(i.price);
    return {
      skuId: num(i.sku_id),
      produto: String(sku?.title || i.name || "Produto sem nome").trim(),
      quantidade: Math.max(1, num(i.quantity)),
      preco,
      // `gift`/`freebie_id` é o marcador oficial; preço zero pega o brinde que
      // entra como item comum (o "Parabéns!…" do painel da Yampi).
      brinde: !!i.gift || i.freebie_id != null || preco === 0,
    };
  }).filter((i) => i.skuId > 0);

  return {
    numero,
    id: num(p.id),
    loja,
    criadoEm: quandoFoi(p.created_at),
    status,
    pago: PAGOS.has(status) || num(p.status_id) === STATUS_PAGO,
    valorProdutos: num(p.value_products),
    valorTotal: num(p.value_total),
    valorFrete: num(p.value_shipment),
    valorDesconto: num(p.value_discount),
    valorJuros: num(p.value_tax),
    formaPagamento: forma,
    bandeira,
    parcelas,
    uf,
    clienteId: num(p.customer_id) || null,
    itens,
  };
}
