// ── API da Yampi (fonte da verdade do checkout) ──────────────────────────────
// Por que este módulo existe: até 22/09/2026 TODA venda de checkout entrava no
// app por uma via só — a tabela `pedidos` do ERP legado, alimentada pela
// integração da Yampi com o ERP. Medido nesse dia, às 18h, a loja de tráfego
// tinha 19 pedidos pagos na Yampi (R$ 4.562,76) e 17 no ERP (R$ 3.944,80). Os
// R$ 617,96 de diferença fecham no centavo em duas causas (conferido pela API
// em 23/09):
//
//   • R$ 390,80 — produto de DOIS pedidos que ainda não tinham chegado ao ERP
//     (78287757038595 das 10:26 e 78287115848230 das 11:05). Sete horas
//     depois de pagos não existiam lá em forma nenhuma; no dia seguinte
//     estavam. É ATRASO de importação, e longo — era exatamente a queixa de
//     "demora pra cair". No mês inteiro de setembro o ERP não perdeu pedido:
//     os 3 que pareciam faltar estavam com o número anotado à mão (ver
//     `numeroDoPedido` em lib/trafego-vendas.ts).
//   • R$ 227,16 — JUROS DE PARCELAMENTO, que o card da Yampi soma no total e o
//     ERP corretamente não grava. Frete foi zero em todos os pedidos do dia.
//     (A primeira leitura, sem a API, chamou isso de "frete que o ERP perde"
//     — estava errada: em 78287942180761 o produto é R$ 815,70, exatamente o
//     que o ERP tem, e os R$ 140,06 a mais são `value_tax`.)
//
// Enquanto a única fonte fosse o ERP, nenhum ajuste no app traria de volta
// pedido que não foi importado. Por isso a Yampi passa a ser lida direto.
//
// O VALOR é `value_products`: só produto. Decisão do usuário (22/09/2026),
// "tirando frete e juros do meio". Medido no pedido real:
//   value_total (284,61) = value_products (242,90) + value_tax (41,71)
// `value_tax` é o JUROS do parcelamento — o nome engana, não é imposto — e
// `value_shipment` é o frete. Nenhum dos dois é receita da empresa (juros é do
// gateway, frete é do transportador), e medir ROAS contra eles inflaria o
// retorno do anúncio com dinheiro que nunca foi da loja.
//
// SÓ PAGAMENTO APROVADO entra (decisão do usuário, 22/09/2026): é o mesmo
// critério do card da própria Yampi. Pix/boleto aguardando não é faturamento —
// contar o não pago vira receita que pode nunca existir.

import { lerPedido, type PedidoYampi } from "@/lib/yampi-pedido";

const BASE = "https://api.dooki.com.br/v2";

/**
 * Sem as três variáveis o app segue lendo o ERP, exatamente como antes. É o
 * mesmo desenho do `b2Configurado()`: ambiente sem credencial não quebra, só
 * não ganha a fonte nova. Em produção elas precisam estar na Vercel, senão o
 * buraco da importação volta calado.
 */
export function yampiConfigurado(): boolean {
  return !!(process.env.YAMPI_ALIAS && process.env.YAMPI_TOKEN && process.env.YAMPI_SECRET_KEY);
}

/**
 * A conta tem mais de uma loja, mas SÓ A DE TRÁFEGO vem da Yampi (decisão do
 * usuário, 22/09/2026): a orgânica continua inteira no ERP. `YAMPI_ALIAS` é,
 * portanto, o alias da loja de tráfego — e só ele.
 *
 * A lista separada por vírgula continua aceita porque o `User-Token` é do
 * usuário e atende todos os aliases dele, então ligar a orgânica um dia é
 * acrescentar um alias. Enquanto houver um só, a orgânica nunca entra no
 * espelho e portanto nunca muda de número.
 */
export function lojasConfiguradas(): string[] {
  return (process.env.YAMPI_ALIAS || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function headers(): Record<string, string> {
  return {
    "User-Token": process.env.YAMPI_TOKEN || "",
    "User-Secret-Key": process.env.YAMPI_SECRET_KEY || "",
    Accept: "application/json",
  };
}

export type { PedidoYampi } from "@/lib/yampi-pedido";

/**
 * TODOS os pedidos da loja no período (por data de criação), página a página,
 * cada um com `pago` dizendo se o pagamento foi aprovado.
 *
 * Todos, e não só os pagos, desde 23/09/2026: os widgets do painel da Yampi
 * separam Vendas (todo pedido criado) de Receita (só pago), e o "Pix gerados ×
 * pagos" precisa do pix que não foi pago. Quem soma faturamento na Tridify lê
 * só `pago = true` do espelho.
 *
 * `limit` é 100 por imposição da API. A paginação para quando a página volta
 * curta — e tem trava dura de páginas, como o `fetchPedidos` do ERP: uma API
 * que devolva sempre a mesma página não pode virar laço infinito dentro de uma
 * função com prazo de 60s na Vercel.
 */
export async function pedidosDaLoja(de: string, ate: string, loja?: string): Promise<PedidoYampi[]> {
  if (!yampiConfigurado()) return [];
  const alias = (loja || lojasConfiguradas()[0] || "").trim();
  if (!alias) return [];
  const out: PedidoYampi[] = [];
  for (let page = 1; page <= 100; page++) {
    const q = new URLSearchParams({
      limit: "100", page: String(page),
      // Pagamento/parcelas vêm da transação, o estado do endereço, o Top
      // produtos dos itens. Sem essas includes o pedido chega sem nada disso.
      include: "status,items,shipping_address,transactions",
      // O filtro de período é `date=created_at:DE|ATE`. A primeira versão
      // mandava `start_date`/`end_date`, que a API IGNORA SEM ERRO: devolveu
      // os 34.099 pedidos da loja, de qualquer data (medido em 23/09/2026).
      // Com as 100 páginas de trava, o sync pegaria 10 mil pedidos aleatórios
      // e pararia no meio — sem nada que parecesse falha.
      date: `created_at:${de}|${ate}`,
    });
    const res = await fetch(`${BASE}/${alias}/orders?${q}`, {
      headers: headers(), cache: "no-store", signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      // 429 é rate limit: parar e devolver o que já veio é melhor que estourar
      // a função. Quem chamou decide se refaz — e o chamador é um cron.
      throw new Error(`yampi ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
    }
    const json = (await res.json()) as { data?: unknown[] };
    const linhas = Array.isArray(json.data) ? json.data : [];
    for (const r of linhas) {
      const p = lerPedido(r, alias);
      if (!p) continue;
      // Segunda trava do período, local: se a API voltar a ignorar o filtro
      // (como ignorou `start_date`), o que vier de fora da janela é descartado
      // aqui em vez de entrar no espelho como se fosse do dia.
      const dia = p.criadoEm.slice(0, 10);
      if (!dia || dia < de || dia > ate) continue;
      out.push(p);
    }
    if (linhas.length < 100) break;
  }
  return out;
}

/** Só os pagos — o recorte do faturamento. */
export async function pedidosPagos(de: string, ate: string, loja?: string): Promise<PedidoYampi[]> {
  return (await pedidosDaLoja(de, ate, loja)).filter((p) => p.pago);
}

/** Os pedidos pagos de TODAS as lojas configuradas, no período. */
export async function pedidosPagosDeTodasAsLojas(de: string, ate: string): Promise<PedidoYampi[]> {
  const out: PedidoYampi[] = [];
  // Em série de propósito: a API tem rate limit por recurso, e duas lojas em
  // paralelo dobram o pico sem ganhar nada — o cron não tem pressa.
  for (const loja of lojasConfiguradas()) out.push(...(await pedidosPagos(de, ate, loja)));
  return out;
}
