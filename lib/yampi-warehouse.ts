// ── Espelho local dos pedidos da Yampi ───────────────────────────────────────
// A API da Yampi é lida por um cron (e pelo webhook) e escrita em
// `yampi_pedidos`; a tela lê SEMPRE daqui. Chamar a API por requisição custaria
// uma invocação por carregamento — foi assim que o Hobby da Vercel pausou o
// projeto em ago/2026 (1,1M de invocações, 11h53m de CPU). Ver
// lib/__tests__/orcamento-de-execucao.
//
// Desde 23/09/2026 o espelho guarda TODO pedido (com `pago`), não só o pago: os
// widgets do painel da Yampi separam Vendas (todos) de Receita (pagos). O
// faturamento da Tridify lê só `pago = true` — ver `pedidosDoEspelho`.
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { pedidosDaLoja, lojasConfiguradas, yampiConfigurado, type PedidoYampi } from "@/lib/yampi-api";
import type { FormaPagamento } from "@/lib/yampi-pedido";
import type { LinhaDoPainel, ItemDoPainel } from "@/lib/yampi-painel";

type Db = ReturnType<typeof createSupabaseAdminClient>;

export interface ResultadoSync {
  loja: string;
  pedidos: number;
  /** Quantos saíram do espelho por terem sumido da Yampi. */
  removidos?: number;
  erro?: string;
}

export interface LinhaYampi {
  numero: string; loja: string; criadoEm: string;
  /** Loja como o ERP a chama. Só vem preenchida pelo webhook (um por loja). */
  lojaErp: string | null;
  valorProdutos: number; valorTotal: number; valorFrete: number;
}

/**
 * Grava pedidos no espelho — o ÚNICO caminho de escrita, usado pelo cron e pelo
 * webhook. Duas escritas que divergissem no primeiro campo novo fariam a mesma
 * venda valer uma coisa quando chega pelo webhook e outra quando o cron passa.
 *
 * `lojaErp` só é mandado quando quem chama SABE a loja (o webhook, pelo
 * endereço). O cron não sabe — e mandar `null` apagaria o que o webhook gravou,
 * porque o upsert escreve toda coluna presente no objeto.
 */
export async function gravarPedidos(db: Db, pedidos: PedidoYampi[], lojaErp?: string): Promise<void> {
  // Em blocos: uma janela larga pode passar de mil linhas, e o PostgREST corta
  // em 1000 por requisição (ver postgrest-limite-1000-linhas).
  for (let i = 0; i < pedidos.length; i += 500) {
    const bloco = pedidos.slice(i, i + 500);
    const { error } = await db.from("yampi_pedidos").upsert(bloco.map((p) => linhaDe(p, lojaErp)), { onConflict: "numero" });
    if (error) throw new Error(error.message);

    // Itens: apaga e regrava os do bloco. Upsert sozinho deixaria pra trás o
    // produto que SAIU do pedido (troca antes do pagamento), e ele seguiria no
    // Top produtos como vendido.
    const numeros = bloco.map((p) => p.numero);
    const del = await db.from("yampi_pedido_itens").delete().in("numero", numeros);
    if (del.error) throw new Error(del.error.message);
    const itens = bloco.flatMap((p) => juntarItens(p));
    if (itens.length) {
      const ins = await db.from("yampi_pedido_itens").insert(itens);
      if (ins.error) throw new Error(ins.error.message);
    }
  }
}

/**
 * O mesmo sku duas vezes no pedido (a Yampi separa por personalização) viraria
 * violação da chave (pedido, sku) no insert. Soma a quantidade numa linha só.
 */
function juntarItens(p: PedidoYampi) {
  const porSku = new Map<number, { numero: string; sku_id: number; produto: string; quantidade: number; preco: number; brinde: boolean }>();
  for (const i of p.itens) {
    const ja = porSku.get(i.skuId);
    if (ja) { ja.quantidade += i.quantidade; continue; }
    porSku.set(i.skuId, { numero: p.numero, sku_id: i.skuId, produto: i.produto, quantidade: i.quantidade, preco: i.preco, brinde: i.brinde });
  }
  return [...porSku.values()];
}

/**
 * Sincroniza o período de TODAS as lojas configuradas.
 *
 * `upsert` por `numero` (chave primária) porque o pedido muda depois de criado:
 * status vira pago, valor é ajustado. Reprocessar o mesmo dia tem que corrigir
 * a linha, não duplicar — por isso a janela do cron cobre vários dias para trás.
 *
 * Estorno e cancelamento chegam aqui como MUDANÇA DE STATUS: o pedido continua
 * na listagem da Yampi com `pago = false`, e o upsert vira a linha. Isso
 * importa porque o webhook não escuta a troca de status (22/09/2026) — esta
 * varredura é quem percebe o estorno.
 */
export async function sincronizarYampi(de: string, ate: string): Promise<ResultadoSync[]> {
  if (!yampiConfigurado()) return [];
  const db = createSupabaseAdminClient();
  const out: ResultadoSync[] = [];

  for (const loja of lojasConfiguradas()) {
    try {
      const pedidos = await pedidosDaLoja(de, ate, loja);
      await gravarPedidos(db, pedidos);
      const removidos = await removerOsQueSumiram(db, loja, de, ate, new Set(pedidos.map((p) => p.numero)));
      await db.from("yampi_sync").upsert({ loja, ultima_rodada: new Date().toISOString(), ultimo_erro: null, pedidos: pedidos.length }, { onConflict: "loja" });
      out.push({ loja, pedidos: pedidos.length, removidos });
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      // O erro FICA GRAVADO. Falha silenciosa aqui é pior que erro visível: a
      // tela seguiria mostrando o espelho velho como se fosse o de hoje.
      await db.from("yampi_sync").upsert({ loja, ultima_rodada: new Date().toISOString(), ultimo_erro: erro.slice(0, 500), pedidos: 0 }, { onConflict: "loja" });
      out.push({ loja, pedidos: 0, erro });
    }
  }
  return out;
}

/**
 * Apaga da janela o que o espelho tem e a Yampi não devolve mais em status
 * nenhum (pedido excluído na Yampi). Cancelado/estornado NÃO passa por aqui:
 * ele segue listado e o upsert já o marcou como não pago.
 *
 * A comparação é DENTRO da janela sincronizada, nunca fora: apagar por ausência
 * num período que não foi consultado varreria o histórico inteiro na primeira
 * rodada curta.
 *
 * Só roda quando a busca trouxe alguma coisa. Uma resposta vazia é ambígua —
 * pode ser um dia sem venda, mas também pode ser filtro de data que a API
 * ignorou ou um erro que voltou 200 com lista vazia —, e no segundo caso isto
 * apagaria o mês inteiro de faturamento. Dia sem venda nenhuma fica com a
 * linha velha por mais uma rodada; é o lado barato de errar.
 */
async function removerOsQueSumiram(db: Db, loja: string, de: string, ate: string, vistos: Set<string>): Promise<number> {
  if (!vistos.size) return 0;
  const { data } = await db
    .from("yampi_pedidos")
    .select("numero")
    .eq("loja", loja)
    .gte("criado_em", `${de}T00:00:00-03:00`)
    .lte("criado_em", `${ate}T23:59:59-03:00`)
    .limit(5000);
  const sobrando = ((data ?? []) as { numero: string }[])
    .map((r) => String(r.numero))
    .filter((n) => !vistos.has(n));
  if (!sobrando.length) return 0;
  for (let i = 0; i < sobrando.length; i += 200) {
    await db.from("yampi_pedidos").delete().in("numero", sobrando.slice(i, i + 200));
  }
  return sobrando.length;
}

function linhaDe(p: PedidoYampi, lojaErp?: string) {
  return {
    numero: p.numero, yampi_id: p.id, loja: p.loja, criado_em: p.criadoEm,
    ...(lojaErp ? { loja_erp: lojaErp } : {}),
    status: p.status, pago: p.pago,
    valor_produtos: p.valorProdutos, valor_total: p.valorTotal,
    valor_frete: p.valorFrete, valor_desconto: p.valorDesconto, valor_juros: p.valorJuros,
    forma_pagamento: p.formaPagamento, bandeira: p.bandeira, parcelas: p.parcelas,
    uf: p.uf, cliente_id: p.clienteId,
    sincronizado_em: new Date().toISOString(),
  };
}

/**
 * Os PAGOS do espelho no período — o recorte que vira faturamento na Tridify.
 * Colunas nomeadas e paginação porque rota de leitura sem os dois foi o que
 * estourou o egress do Supabase em julho/2026, e o PostgREST corta em 1000.
 */
export async function pedidosDoEspelho(de: string, ate: string): Promise<LinhaYampi[]> {
  const db = createSupabaseAdminClient();
  const out: LinhaYampi[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await db
      .from("yampi_pedidos")
      .select("numero,loja,loja_erp,criado_em,valor_produtos,valor_total,valor_frete")
      // Só pago: desde que o espelho guarda também o pedido aguardando
      // pagamento, sem este filtro o pix gerado e nunca pago viraria
      // faturamento da Tridify.
      .eq("pago", true)
      .gte("criado_em", `${de}T00:00:00-03:00`)
      .lte("criado_em", `${ate}T23:59:59-03:00`)
      .order("criado_em", { ascending: true })
      .range(from, from + 999);
    if (error || !data?.length) break;
    for (const r of data) {
      out.push({
        numero: String(r.numero), loja: String(r.loja), criadoEm: String(r.criado_em),
        lojaErp: r.loja_erp ? String(r.loja_erp) : null,
        valorProdutos: Number(r.valor_produtos) || 0,
        valorTotal: Number(r.valor_total) || 0,
        valorFrete: Number(r.valor_frete) || 0,
      });
    }
    if (data.length < 1000) break;
  }
  return out;
}

// ── Leitura dos widgets do painel ────────────────────────────────────────────

// Mesma forma que a agregação consome — um tipo só, pra leitura e conta não
// divergirem num campo.
type LinhaPainel = LinhaDoPainel;
type ItemPainel = ItemDoPainel;

/** TODO pedido do período (pago ou não), com o que os widgets agregam. */
export async function pedidosDoPainel(de: string, ate: string): Promise<LinhaPainel[]> {
  const db = createSupabaseAdminClient();
  const out: LinhaPainel[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await db
      .from("yampi_pedidos")
      .select("numero,criado_em,pago,valor_produtos,forma_pagamento,parcelas,uf,cliente_id")
      .gte("criado_em", `${de}T00:00:00-03:00`)
      .lte("criado_em", `${ate}T23:59:59-03:00`)
      .order("criado_em", { ascending: true })
      .range(from, from + 999);
    if (error || !data?.length) break;
    for (const r of data) {
      out.push({
        numero: String(r.numero), criadoEm: String(r.criado_em), pago: r.pago !== false,
        valorProdutos: Number(r.valor_produtos) || 0,
        formaPagamento: (r.forma_pagamento as FormaPagamento | null) ?? null,
        parcelas: r.parcelas == null ? null : Number(r.parcelas),
        uf: r.uf ? String(r.uf) : null,
        clienteId: r.cliente_id == null ? null : Number(r.cliente_id),
      });
    }
    if (data.length < 1000) break;
  }
  return out;
}

/** Itens dos pedidos do período. O Top produtos da Yampi conta todo pedido criado. */
export async function itensDoPainel(numeros: string[]): Promise<ItemPainel[]> {
  const db = createSupabaseAdminClient();
  const out: ItemPainel[] = [];
  // `in` em blocos: URL de consulta tem limite de tamanho, e um mês cheio
  // são ~700 números de 14 dígitos.
  for (let i = 0; i < numeros.length; i += 150) {
    const { data, error } = await db
      .from("yampi_pedido_itens")
      .select("numero,produto,quantidade,brinde")
      .in("numero", numeros.slice(i, i + 150))
      .limit(5000);
    if (error) continue;
    for (const r of data ?? []) out.push({ numero: String(r.numero), produto: String(r.produto), quantidade: Number(r.quantidade) || 0, brinde: !!r.brinde });
  }
  return out;
}

/**
 * Dos clientes pedidos, quais já tinham pedido PAGO antes de `antesDe` — é o
 * "recorrente" do painel da Yampi. Consulta só os ids do período, nunca a base.
 */
export async function clientesComCompraAntes(ids: number[], antesDe: string): Promise<Set<number>> {
  const db = createSupabaseAdminClient();
  const out = new Set<number>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await db
      .from("yampi_pedidos")
      .select("cliente_id")
      .in("cliente_id", ids.slice(i, i + 150))
      .eq("pago", true)
      .lt("criado_em", `${antesDe}T00:00:00-03:00`)
      .limit(5000);
    if (error) continue;
    for (const r of data ?? []) if (r.cliente_id != null) out.add(Number(r.cliente_id));
  }
  return out;
}

/**
 * Quantos PAGOS o espelho tem no período — só o número (`head: true`, corpo
 * vazio). É a assinatura barata que a Tridify pergunta em ritmo de poll: o
 * webhook grava a venda no espelho na hora, e só quando este número muda a
 * tela paga o snapshot inteiro. `null` = não deu pra ler (não é "zero").
 */
export async function contarPagosDoEspelho(de: string, ate: string): Promise<number | null> {
  const { count, error } = await createSupabaseAdminClient()
    .from("yampi_pedidos")
    .select("numero", { count: "exact", head: true })
    .eq("pago", true)
    .gte("criado_em", `${de}T00:00:00-03:00`)
    .lte("criado_em", `${ate}T23:59:59-03:00`);
  return error ? null : count ?? 0;
}
