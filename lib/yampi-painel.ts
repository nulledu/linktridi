// ── Os números do painel da Yampi, dentro da Tridify ─────────────────────────
// Função PURA: recebe as linhas do espelho (lib/yampi-warehouse) e devolve o que
// os widgets desenham. Sem rede, sem env — testável com os números do print do
// painel da Yampi de 23/09/2026.
//
// A regra que manda em tudo (pedido do dono, 23/09/2026): VALOR É SÓ PRODUTO.
// O painel da Yampi mostra `value_total`, que carrega juros de parcelamento e
// frete. Aqui todo dinheiro é `value_products`. Por isso os valores daqui ficam
// abaixo dos da Yampi — de propósito — e as CONTAGENS batem uma a uma.
//
// Cada número usa a mesma base que o painel da Yampi usa (conferido no print):
//   Vendas ............ todo pedido criado (pago ou aguardando)
//   Receita ........... só pedido pago
//   Ticket médio ...... Vendas ÷ pedidos criados (é a conta da Yampi: 3.814,76 ÷ 18)
//   Pix ............... gerados = todo pedido pix; pagos = pix pago
//   Formas de pagamento todo pedido criado (Pix 61% = 11 de 18, contando o não pago)
//   Parcelamentos ..... só CARTÃO (1x 57% = 4 de 7) — pix é sempre à vista
//   Estados ........... todo pedido criado (SP 33% = 6 de 18)
//   Top produtos ...... unidades em todo pedido criado ("18 vendidos" do brinde = 18 pedidos)
//   Recorrentes ....... clientes com pedido PAGO no período (ver `recorrencia`)
import type { FormaPagamento } from "@/lib/yampi-pedido";

export interface LinhaDoPainel {
  numero: string; criadoEm: string; pago: boolean;
  valorProdutos: number;
  formaPagamento: FormaPagamento | null; parcelas: number | null;
  uf: string | null; clienteId: number | null;
}
export interface ItemDoPainel { numero: string; produto: string; quantidade: number; brinde: boolean }

export interface PontoDia { d: string; vendas: number; receita: number; pedidos: number; pagos: number; ticket: number; pixGerados: number; pixPagos: number }
export interface Fatia { nome: string; valor: number }
export interface Posicao { nome: string; qtd: number; pct: number; brinde?: boolean }

export interface PainelYampi {
  de: string; ate: string;
  vendas: { valor: number; pedidos: number; anterior: number | null };
  receita: { valor: number; pagos: number; anterior: number | null };
  ticket: { valor: number; anterior: number | null };
  pix: { gerados: number; pagos: number; taxa: number | null };
  recorrencia: { recorrentes: number; novos: number; taxa: number | null };
  formas: Fatia[];
  parcelas: Fatia[];
  estados: Posicao[];
  produtos: Posicao[];
  serie: PontoDia[];
}

const redondo = (n: number) => Math.round(n * 100) / 100;

/** Dia do pedido no fuso de São Paulo — o espelho devolve UTC. */
export function diaSP(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso.slice(0, 10);
  return new Date(t - 3 * 3600e3).toISOString().slice(0, 10);
}

/** Todos os dias do intervalo, inclusive as pontas — dia sem pedido é zero, não buraco. */
function diasEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(de + "T12:00:00Z"); t <= Date.parse(ate + "T12:00:00Z"); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

const ROTULO_FORMA: Record<FormaPagamento, string> = { pix: "Pix", cartao: "Cartões", boleto: "Boleto", outro: "Outros" };

/**
 * Cliente recorrente: tem pedido PAGO antes do período (`jaCompraram`, que vem
 * do histórico do espelho) OU pagou mais de uma vez dentro do período. A
 * segunda metade existe porque, num mês, quem volta na terceira semana É
 * recorrente, e olhar só o que veio antes do dia 1º o chamaria de novo.
 */
function recorrencia(pagos: LinhaDoPainel[], jaCompraram: Set<number>) {
  const vezes = new Map<number, number>();
  for (const l of pagos) if (l.clienteId != null) vezes.set(l.clienteId, (vezes.get(l.clienteId) || 0) + 1);
  let recorrentes = 0, novos = 0;
  for (const [id, n] of vezes) (jaCompraram.has(id) || n > 1 ? recorrentes++ : novos++);
  const total = recorrentes + novos;
  return { recorrentes, novos, taxa: total ? recorrentes / total : null };
}

function ranking(contagem: Map<string, { qtd: number; brinde?: boolean }>, total: number, max: number): Posicao[] {
  return [...contagem.entries()]
    .sort((a, b) => b[1].qtd - a[1].qtd || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([nome, v]) => ({ nome, qtd: v.qtd, pct: total ? v.qtd / total : 0, ...(v.brinde ? { brinde: true } : {}) }));
}

export function montarPainel(p: {
  de: string; ate: string;
  linhas: LinhaDoPainel[];
  itens: ItemDoPainel[];
  jaCompraram: Set<number>;
  /** O período anterior de mesmo tamanho (já cortado no mesmo horário, se o atual é hoje). */
  anteriores?: LinhaDoPainel[] | null;
}): PainelYampi {
  const { de, ate, linhas, itens, jaCompraram } = p;
  const pagos = linhas.filter((l) => l.pago);
  const soma = (a: LinhaDoPainel[]) => a.reduce((s, l) => s + l.valorProdutos, 0);

  const vendasValor = soma(linhas);
  const receitaValor = soma(pagos);
  const ticket = linhas.length ? vendasValor / linhas.length : 0;

  const ant = p.anteriores ?? null;
  const antVendas = ant ? soma(ant) : null;
  const antReceita = ant ? soma(ant.filter((l) => l.pago)) : null;
  const antTicket = ant && ant.length ? soma(ant) / ant.length : ant ? 0 : null;

  const pix = linhas.filter((l) => l.formaPagamento === "pix");
  const pixPagos = pix.filter((l) => l.pago).length;

  const formas = new Map<string, number>();
  for (const l of linhas) {
    const nome = l.formaPagamento ? ROTULO_FORMA[l.formaPagamento] : "Não informado";
    formas.set(nome, (formas.get(nome) || 0) + 1);
  }

  const parcelas = new Map<number, number>();
  for (const l of linhas) if (l.formaPagamento === "cartao" && l.parcelas) parcelas.set(l.parcelas, (parcelas.get(l.parcelas) || 0) + 1);

  const ufs = new Map<string, { qtd: number }>();
  for (const l of linhas) if (l.uf) ufs.set(l.uf, { qtd: (ufs.get(l.uf)?.qtd || 0) + 1 });
  const comUf = [...ufs.values()].reduce((s, v) => s + v.qtd, 0);

  const prods = new Map<string, { qtd: number; brinde?: boolean }>();
  for (const i of itens) {
    const ja = prods.get(i.produto);
    prods.set(i.produto, { qtd: (ja?.qtd || 0) + i.quantidade, brinde: (ja?.brinde ?? false) || i.brinde });
  }
  const unidades = [...prods.values()].reduce((s, v) => s + v.qtd, 0);

  const porDia = new Map<string, PontoDia>(diasEntre(de, ate).map((d) => [d, { d, vendas: 0, receita: 0, pedidos: 0, pagos: 0, ticket: 0, pixGerados: 0, pixPagos: 0 }]));
  for (const l of linhas) {
    const x = porDia.get(diaSP(l.criadoEm));
    if (!x) continue;
    x.vendas += l.valorProdutos; x.pedidos++;
    if (l.pago) { x.receita += l.valorProdutos; x.pagos++; }
    if (l.formaPagamento === "pix") { x.pixGerados++; if (l.pago) x.pixPagos++; }
  }
  const serie = [...porDia.values()].map((x) => ({ ...x, vendas: redondo(x.vendas), receita: redondo(x.receita), ticket: x.pedidos ? redondo(x.vendas / x.pedidos) : 0 }));

  return {
    de, ate,
    vendas: { valor: redondo(vendasValor), pedidos: linhas.length, anterior: antVendas == null ? null : redondo(antVendas) },
    receita: { valor: redondo(receitaValor), pagos: pagos.length, anterior: antReceita == null ? null : redondo(antReceita) },
    ticket: { valor: redondo(ticket), anterior: antTicket == null ? null : redondo(antTicket) },
    pix: { gerados: pix.length, pagos: pixPagos, taxa: pix.length ? pixPagos / pix.length : null },
    recorrencia: recorrencia(pagos, jaCompraram),
    formas: [...formas.entries()].sort((a, b) => b[1] - a[1]).map(([nome, valor]) => ({ nome, valor })),
    parcelas: [...parcelas.entries()].sort((a, b) => a[0] - b[0]).map(([n, valor]) => ({ nome: `${n}x`, valor })),
    estados: ranking(ufs, comUf, 5),
    produtos: ranking(prods, unidades, 5),
    serie,
  };
}

/**
 * O período anterior de mesmo tamanho. Se o período atual termina HOJE, o
 * último dia do anterior é cortado no mesmo horário de agora — é o "Comparado
 * com 22/09/26 até 10:46" do painel da Yampi. Comparar o dia de hoje pela
 * metade com o dia de ontem inteiro faria toda manhã parecer um desastre.
 */
export function periodoAnterior(de: string, ate: string, agora = new Date()): { de: string; ate: string; corteISO: string | null } {
  const dias = diasEntre(de, ate).length;
  const desloca = (d: string, n: number) => new Date(Date.parse(d + "T12:00:00Z") - n * 864e5).toISOString().slice(0, 10);
  const antDe = desloca(de, dias), antAte = desloca(ate, dias);
  const hojeSP = new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(0, 10);
  if (ate !== hojeSP) return { de: antDe, ate: antAte, corteISO: null };
  // Mesmo relógio de SP, no último dia do período anterior.
  const hhmmss = new Date(agora.getTime() - 3 * 3600e3).toISOString().slice(11, 19);
  return { de: antDe, ate: antAte, corteISO: `${antAte}T${hhmmss}-03:00` };
}
