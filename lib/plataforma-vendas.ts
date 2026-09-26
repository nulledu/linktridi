// ── Vendas de UMA plataforma do ERP (peça comum) ─────────────────────────────
// O que a Vega (plataformas.id = 8) e a Yampi (6) têm igual: são pedidos reais
// do ERP legado, o faturamento é o que o cliente fechou no CHECKOUT
// (`preco_yampi`) e o que a vendedora vendeu depois é upsell, que pertence ao
// Comercial. As peças vendidas saem da mesma config (Tridify → "Peças que
// acompanho"), então chancela/carimbo contam do mesmo jeito nas duas.
//
// Isto aqui era o corpo de `lib/vega.ts`. Virou módulo próprio quando o mesmo
// card passou a existir pra Yampi: duas cópias da regra de brinde e da fatia
// checkout/upsell divergiriam na primeira correção feita só de um lado.
//
// Cuidado importante com paginação: o PostgREST devolve no MÁXIMO 1000 linhas
// por resposta. Pedir `limit` maior não adianta — quem não pagina conta errado
// e nem percebe (foi exatamente o bug dos cards do TridiFlow).

import { getMarketingConfig, classificarPeca, linhasPorUnidade, DEFAULT_PECAS, type PecaCategoria } from "@/lib/marketing-config";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || "";
const H = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

export interface PedidoPlataforma {
  id: number;
  created_at: string | null;
  preco_total: number | null;
  preco_yampi: number | null;
  excluido: boolean | null;
  tag_utm: string | null;
  qual_yampi: string | null;
  valores_corretos: boolean | null;
  id_proprio: string | null;
}

export interface PedidoResumido {
  id: number;
  at: string;
  total: number;
  origem: string | null;
  itens: number;
}

/** Uma peça acompanhada, quantas saíram no período e quanto faturou. */
export interface PecaContada {
  id: string;
  label: string;
  /** UNIDADES vendidas — kit conta como 1, não como as 4 linhas do ERP. */
  qtd: number;
  /** Fatia do faturamento de checkout que veio desta peça (ver `ratear`). */
  valor: number;
}

export interface ResumoPlataforma {
  de: string; ate: string;
  // Pedido que entrou = venda. `data_aprovado` do ERP NÃO entra aqui: aquele
  // campo é a aprovação da ARTE na esteira de produção, não do pagamento —
  // usá-lo como "venda confirmada" daria um número errado.
  //
  // Faturamento = só o que o cliente fechou no checkout (`preco_yampi`). O que
  // a vendedora vendeu DEPOIS, na conversa (preco_total − preco_yampi), é
  // upsell e pertence ao Comercial — é assim que o card "Faturamento total da
  // empresa" já conta (lib/trafego-vendas.ts). Enquanto o card da Vega somava
  // `preco_total`, a mesma Vega aparecia com dois valores diferentes no mesmo
  // painel (R$ 23.035,92 num card × R$ 19.046,62 no outro).
  faturamento: number;
  /** Upsell da vendedora nesses mesmos pedidos. Fora do faturamento acima. */
  upsell: number;
  pedidos: number;
  ticket: number;
  /** Quantidade de PEÇAS vendidas por tipo (não de pedidos), na ordem da config. */
  pecas: PecaContada[];
  /** Faturamento dos itens que não são peça acompanhada (tinta, almofada,
   *  frete embutido no total…). Existe pra a soma das peças fechar com o
   *  faturamento do card em vez de sobrar dinheiro sem dono. */
  outros: number;
  serie: { dia: string; faturamento: number; pedidos: number }[];
  ultimos: PedidoResumido[];
}

/**
 * Lê uma tabela inteira respeitando o teto de 1000 linhas por resposta.
 *
 * Duas coisas que este laço aprendeu com o ERP legado de verdade:
 *
 * • **Falha não vira lista curta.** O `if (!res.ok) break` original tratava um
 *   522 do Cloudflare (o ERP demorando demais pra responder) igual a "acabaram
 *   as linhas": a página voltava vazia e o card mostrava R$ 0,00 com cara de
 *   número certo. Zero silencioso é pior que erro — quem vê um erro recarrega,
 *   quem vê zero acredita. Agora estoura, e a tela diz que não deu.
 * • **Falha transitória se repete uma vez.** 5xx, 429 e o timeout do ERP
 *   costumam passar na segunda tentativa; sem o retry, um soluço de dois
 *   segundos derruba o widget inteiro. 4xx (query errada) não se repete: é
 *   defeito nosso e tentar de novo só gasta tempo.
 */
export async function paginado<T>(caminho: string, max = 20000): Promise<T[]> {
  const linhas: T[] = [];
  for (let ini = 0; ini < max; ini += 1000) {
    const lote = await comRetry<T[]>(async () => {
      const res = await fetch(`${LEGACY_URL}/rest/v1/${caminho}`, {
        headers: { ...H, Range: `${ini}-${ini + 999}`, "Range-Unit": "items" },
        cache: "no-store", signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw Object.assign(new Error(`ERP ${res.status} em ${caminho.slice(0, 60)}`), { status: res.status });
      return (await res.json()) as T[];
    });
    linhas.push(...lote);
    if (lote.length < 1000) break;
  }
  return linhas;
}

// Repete o que pode ter sido soluço; desiste na hora do que é defeito nosso.
async function comRetry<T>(fn: () => Promise<T>, tentativas = 3): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i < tentativas; i++) {
    try { return await fn(); } catch (e) {
      ultimo = e;
      const st = (e as { status?: number }).status;
      if (st && st < 500 && st !== 429) throw e;          // 4xx: query errada, não adianta insistir
      if (i < tentativas - 1) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw ultimo;
}

// ── Brinde ────────────────────────────────────────────────────────────────────
// Nem a coluna `brinde` nem `preco = 0` servem sozinhas:
//
// • `brinde` vem true no produto principal (a chancela do pedido 69718 tinha
//   brinde=true sendo a única peça de um pedido de R$ 242,90). Ignorá-la por
//   essa flag derrubava a contagem em ~80%.
// • `preco = 0` também aparece no produto principal: o ERP às vezes deixa o
//   valor só no total do pedido.
//
// O que separa os dois casos é RELATIVO ao pedido: item zerado num pedido que
// tem outros itens pagos é brinde ("Carimbo Rede Social(Brinde)", que vai junto
// da chancela). Se o pedido inteiro está zerado, aquele item é o produto
// vendido e precisa contar.
const brindesDoPedido = (linhas: ItemRow[]): Set<ItemRow> => {
  const pagos = linhas.some((i) => Number(i.preco) > 0);
  if (!pagos) return new Set();
  return new Set(linhas.filter((i) => !(Number(i.preco) > 0)));
};

export type ItemRow = {
  pedido_id: number; cat_prod_id: number | null; nome: string | null;
  preco: number | null; decorativo: boolean | null; item_complementar: boolean | null;
};

// Quanto do pedido é venda do checkout e quanto é upsell da vendedora.
// `preco_yampi` zerado ou maior que o total (dado sujo do ERP) cai pro total,
// sem upsell — nunca inventa dinheiro nem some com ele: checkout + upsell =
// preco_total sempre.
export const fatia = (p: PedidoPlataforma) => {
  const total = Number(p.preco_total) || 0;
  const checkout = Number(p.preco_yampi) || 0;
  if (checkout <= 0 || checkout >= total) return { checkout: total, upsell: 0 };
  return { checkout, upsell: total - checkout };
};

// Dia em São Paulo (UTC-3), não em UTC: senão um pedido das 22h cai no dia
// seguinte na série do gráfico.
const dia = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const dinheiro = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** Pedidos de uma plataforma do ERP no período (dia fechado em Brasília). */
/** plataformas.id da Vega Checkout no ERP (repetido de lib/vega.ts pra não criar ciclo). */
const PLAT_VEGA_ID = 8;

/**
 * Pedido da Vega com `id_proprio` terminando em `/n` (ex.: `VCS1O8WTEPA/1`) é
 * desdobramento de outro pedido no ERP, não venda nova — contá-lo duplicaria
 * faturamento e contagem. Só o código sem sufixo (`VCS1O8WTEPA`) conta.
 */
export function ehDesdobramentoVega(p: { plataforma_id?: number | null; id_proprio?: string | null }, plataformaId = p.plataforma_id): boolean {
  return plataformaId === PLAT_VEGA_ID && /\/\d+$/.test((p.id_proprio ?? "").trim());
}

export async function pedidosDaPlataforma(plataformaId: number, de: string, ate: string): Promise<PedidoPlataforma[]> {
  // Dia fecha em Brasília, não em UTC — sem o -03:00 o período pega a madrugada
  // do dia seguinte e perde as 3 primeiras horas do primeiro dia.
  const filtro = `plataforma_id=eq.${plataformaId}&created_at=gte.${de}T00:00:00-03:00&created_at=lte.${ate}T23:59:59-03:00`;
  const pedidos = await paginado<PedidoPlataforma>(
    `pedidos?select=id,created_at,preco_total,preco_yampi,excluido,tag_utm,qual_yampi,valores_corretos,id_proprio&${filtro}&order=id.desc`,
  );
  return pedidos.filter((p) => !ehDesdobramentoVega(p, plataformaId));
}

/**
 * Conta as PEÇAS vendidas nesses pedidos, na ordem da config, e quantos itens
 * cada pedido teve.
 *
 * Quem decide o que é peça é a CONFIG (Tridify → "Peças que acompanho"), não
 * uma regra fixa: a pessoa escolhe o que quer ver e em que ordem. O NOME é o
 * dado confiável — a categoria do ERP erra feio, medido nos pedidos reais:
 * • Chancela está em DUAS categorias: a 9 ("Chancela") e a 6 ("Rede Social"),
 *   com o item chamado "Chancela" nas duas. Olhar só a 9 zerava o card.
 * • O carimbo pode vir com a categoria de OUTRA coisa: "Carimbo 16cm2 - Para
 *   Todas Embalagens" saiu com cat_prod_id 4 ("Almofada Econômica").
 *
 * Item que não casa com nenhuma peça configurada simplesmente não é contado
 * (tinta, almofada, etiqueta, carimbo decorativo…).
 */
export async function pecasDosPedidos(
  pedidos: { id: number; checkout: number }[],
): Promise<{ pecas: PecaContada[]; outros: number; itensPorPedido: Map<number, number> }> {
  const ids = pedidos.map((p) => p.id);
  // A lista de ids não cabe numa URL só — vai em lotes. Eles são independentes,
  // então vão JUNTOS: em 30 dias são 3 lotes que, um atrás do outro, somavam ~4s
  // de espera pura num ERP que já responde devagar.
  const lotes: string[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200).join(",");
    if (lote) lotes.push(lote);
  }
  const itens: ItemRow[] = (await Promise.all(lotes.map((lote) =>
    paginado<ItemRow>(`itens_pedidos?select=pedido_id,cat_prod_id,nome,preco,decorativo,item_complementar&pedido_id=in.(${lote})`),
  ))).flat();
  const cats = (await getMarketingConfig().catch(() => null))?.pecas ?? DEFAULT_PECAS;
  return contarPecas(itens, new Map(pedidos.map((p) => [p.id, p.checkout])), cats);
}

/**
 * A conta em si, sem rede — é aqui que moram as duas regras que já deram
 * número errado no card, e por isso ela é testável sozinha.
 *
 * **Kit é UMA venda.** O ERP explode o "KIT 4 PALAVRAS AFETIVAS" em 4 linhas,
 * uma por palavra escolhida (`opcao_nome`), cada uma a 1/4 do preço. Contando
 * linha a linha, 2 kits apareciam como "8 vendidos" no card — o cliente pagou
 * por kit, é kit que se conta. Quem diz o tamanho é `linhasPorUnidade` da
 * config, e a divisão é POR PEDIDO: linha solta de dado sujo vira 1 unidade em
 * vez de sumir num arredondamento global.
 *
 * **O faturamento da peça é RATEADO.** A soma dos itens não bate com o pedido
 * (frete, desconto e taxa moram só no total: o pedido 73145 fechou R$ 242,90
 * com uma chancela de R$ 162,70). Somar preço de item daria uma "participação"
 * que não fecha com o faturamento mostrado logo acima no mesmo card. Então
 * cada peça leva a fatia do CHECKOUT proporcional ao preço dos seus itens, e o
 * que não é peça acompanhada vai pra `outros` — peças + outros = faturamento.
 */
export function contarPecas(
  itens: ItemRow[],
  checkoutPorPedido: Map<number, number>,
  cats: PecaCategoria[],
): { pecas: PecaContada[]; outros: number; itensPorPedido: Map<number, number> } {
  // Brinde é decidido por pedido (ver `brindesDoPedido`), então as peças só dá
  // pra classificar depois de agrupar os itens pelo pedido a que pertencem.
  const linhasPorPedido = new Map<number, ItemRow[]>();
  for (const it of itens) {
    const arr = linhasPorPedido.get(it.pedido_id);
    if (arr) arr.push(it);
    else linhasPorPedido.set(it.pedido_id, [it]);
  }

  const ativas = cats.filter((c) => c.ativa !== false);
  const linhas = new Map<string, number>();   // linhas do ERP, por peça
  const qtd = new Map<string, number>();      // unidades vendidas, por peça
  const valor = new Map<string, number>();    // faturamento rateado, por peça
  const itensPorPedido = new Map<number, number>();
  let outros = 0;

  for (const [pedidoId, linhasDoPedido] of linhasPorPedido) {
    itensPorPedido.set(pedidoId, linhasDoPedido.length);
    const brindes = brindesDoPedido(linhasDoPedido);
    const contam = linhasDoPedido.filter((it) => !brindes.has(it));  // brinde não é peça vendida
    const checkout = checkoutPorPedido.get(pedidoId) ?? 0;
    // Base do rateio. Pedido inteiro zerado no ERP (valor só no total) divide
    // o checkout por igual entre os itens, senão o dinheiro todo cairia em
    // `outros` e nenhuma peça mostraria faturamento.
    const base = contam.reduce((s, it) => s + (Number(it.preco) || 0), 0);
    const peso = (it: ItemRow) => (base > 0 ? (Number(it.preco) || 0) / base : contam.length ? 1 / contam.length : 0);

    const noPedido = new Map<string, number>();
    for (const it of contam) {
      const id = classificarPeca(it.nome, cats);
      const fatiaItem = checkout * peso(it);
      if (!id) { outros += fatiaItem; continue; }
      noPedido.set(id, (noPedido.get(id) || 0) + 1);
      linhas.set(id, (linhas.get(id) || 0) + 1);
      valor.set(id, (valor.get(id) || 0) + fatiaItem);
    }
    // Kit vira unidade AQUI, com as linhas deste pedido — ver o comentário.
    for (const [id, n] of noPedido) {
      const porUnidade = linhasPorUnidade(ativas.find((c) => c.id === id) ?? cats.find((c) => c.id === id)!);
      qtd.set(id, (qtd.get(id) || 0) + Math.max(1, Math.round(n / porUnidade)));
    }
  }

  // Na ordem da config, só as ativas — é a lista que a pessoa escolheu ver.
  const pecas: PecaContada[] = ativas.map((c) => ({
    id: c.id, label: c.label,
    qtd: qtd.get(c.id) || 0,
    valor: dinheiro(valor.get(c.id) || 0),
  }));
  // Peça desativada na config ainda vendeu — o dinheiro dela vai pra `outros`,
  // senão a barra fecharia em menos de 100%.
  for (const [id, v] of valor) if (!ativas.some((c) => c.id === id)) outros += v;

  return { pecas, outros: dinheiro(outros), itensPorPedido };
}

/** Monta o resumo a partir dos pedidos já filtrados pela regra de cada plataforma. */
export function montarResumo(
  de: string, ate: string,
  validos: PedidoPlataforma[],
  pecas: PecaContada[],
  itensPorPedido: Map<number, number>,
  outros = 0,
): ResumoPlataforma {
  let faturamento = 0, upsell = 0;
  const porDia = new Map<string, { faturamento: number; pedidos: number }>();
  for (const p of validos) {
    const f = fatia(p);
    faturamento += f.checkout; upsell += f.upsell;
    const d = dia(p.created_at!);
    const acc = porDia.get(d) ?? { faturamento: 0, pedidos: 0 };
    acc.faturamento += f.checkout; acc.pedidos++;
    porDia.set(d, acc);
  }

  return {
    de, ate,
    faturamento: dinheiro(faturamento),
    upsell: dinheiro(upsell),
    pedidos: validos.length,
    ticket: validos.length ? dinheiro(faturamento / validos.length) : 0,
    pecas,
    outros: dinheiro(outros),
    serie: [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, v]) => ({ dia: d, faturamento: dinheiro(v.faturamento), pedidos: v.pedidos })),
    ultimos: validos.slice(0, 30).map((p) => ({
      id: p.id,
      at: p.created_at!,
      // O valor do checkout, pra lista fechar com o faturamento acima.
      total: dinheiro(fatia(p).checkout),
      origem: p.tag_utm,
      itens: itensPorPedido.get(p.id) ?? 0,
    })),
  };
}

export { dinheiro };
