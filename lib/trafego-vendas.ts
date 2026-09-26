// ── Vendas REAIS + Lucro (estilo Utmify, melhor: usa o ERP, não pixel) ───────
// Cruza as vendas reais do ERP (pedidos.preco_total, aprovado, chargeback) com o
// gasto do Meta e o modelo de custos → ROAS/ROI/lucro REAIS por canal (tag_utm),
// não a conversão reportada pelo pixel. Cache curto (o ERP é grande).
import {
  getMarketingConfig, FONTE_TRAFEGO_PADRAO, PLAT_YAMPI, PLAT_VEGA, chaveLojaYampi, chavePlataforma, tipoDaFonte,
  tipoPorRegras, tipoDoPedido, ehPlataformaMarketplace, vendaDeMarketplace,
  type CustosConfig, type MetasConfig, type FonteTipo,
} from "@/lib/marketing-config";
import { ehDesdobramentoVega } from "@/lib/plataforma-vendas";
import { IMPOSTO_GASTO_PCT } from "@/lib/marketing-const";
import { eficienciaTrafego } from "@/lib/trafego-eficiencia";
import { itensPorPedido, type ItemPedido } from "@/lib/erp-itens";
import { getMetaPeriodSpend } from "@/lib/meta";
import { comercialTodasVendedoras, idsForaDoComercial } from "@/lib/vendedoras";
import { x1Resumo } from "@/lib/comercial-pedidos";
import { diaDoPedido, noPeriodo, janelaFolgada } from "./dia-do-pedido";
import { ehPedidoCancelado } from "./erp-etapas";
import { resolvePeriod } from "@/lib/period";
import { gastosManuaisDoPeriodo, somaGastosManuais } from "@/lib/trafego-gastos-manuais";
import { pedidosDoEspelho, type LinhaYampi } from "@/lib/yampi-warehouse";

const LEGACY_URL = process.env.LEGACY_SUPABASE_URL || "https://irdptdvkldrghevmtmzc.supabase.co";
const LEGACY_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlyZHB0ZHZrbGRyZ2hldm10bXpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY5OTM4NzgsImV4cCI6MjAzMjU2OTg3OH0.SYzaaJO1jnT7064c6Q5KIcshvD9j_o1TuTFmmF2H46k";
const LEGACY_KEY = process.env.LEGACY_SERVICE_ROLE_KEY || LEGACY_ANON;
const H = { apikey: LEGACY_KEY, Authorization: `Bearer ${LEGACY_KEY}` };

// Normaliza o tag_utm bagunçado (ig/Insta/meta/fb/organic…) em canais limpos.
function canalDe(tag: string | null): { key: string; label: string; pago: boolean } {
  const t = (tag || "").trim().toLowerCase();
  if (["meta", "facebook", "fb", "face"].includes(t)) return { key: "meta", label: "Meta / Facebook", pago: true };
  if (["ig", "insta", "instagram", "story", "storytype", "stories", "reels"].includes(t)) return { key: "instagram", label: "Instagram", pago: true };
  if (["google", "gads", "youtube", "yt", "adwords"].includes(t)) return { key: "google", label: "Google", pago: true };
  if (["tiktok", "tt"].includes(t)) return { key: "tiktok", label: "TikTok", pago: true };
  if (["organic", "organico", "orgânico", "perfil", "bio"].includes(t)) return { key: "organic", label: "Orgânico", pago: false };
  if (["email", "e-mail", "mail"].includes(t)) return { key: "email", label: "E-mail", pago: false };
  if (["sms", "whatsapp", "wpp", "zap"].includes(t)) return { key: "crm", label: "SMS / WhatsApp", pago: false };
  if (t === "manual") return { key: "manual", label: "Manual", pago: false };
  if (t === "duplicado") return { key: "duplicado", label: "Duplicado", pago: false };
  if (!t || t === "sem origem" || t === "(vazio)") return { key: "sem_origem", label: "Sem origem", pago: false };
  return { key: `outro:${t}`, label: (tag || "").trim() || "Outro", pago: false };
}

export interface CanalVenda { key: string; label: string; pago: boolean; faturamento: number; pedidos: number; pct: number }
// Série diária na BASE DE MARKETING (não pedidos aprovados): faturamento do
// tráfego (Yampi Carimbos Tridi) e do orgânico por dia de CRIAÇÃO do pedido —
// o mesmo recorte do headline de Lucro & custos. `vendas` = nº de pedidos do
// tráfego no dia.
// `empresa` é a MESMA base do `faturamentoEmpresa` do mês, dia a dia: origens de
// tráfego + orgânico + comercial + marketplace. Existe porque o painel de TV
// mostra faturamento do dia e da semana, e derivá-los de outra consulta faria a
// TV somar uma base e o relatório outra — o erro que já custou caro no ROAS.
// `comercial` e `marketplace` são as MESMAS fatias que formam o total do mês,
// recortadas por dia. Existem porque o Analytics precisa da curva de cada canal
// e derivá-la de outra consulta faria a tela somar uma base e o card outra — o
// mesmo erro que já inflou o faturamento da empresa em R$ 28 mil.
export interface DiaVendas { d: string; trafego: number; organico: number; vendas: number; empresa: number; comercial: number; marketplace: number }
export interface VendasSnapshot {
  since: string; until: string; updatedAt: string;
  // Operação (ERP)
  faturamento: number;        // aprovado, todos os canais
  pedidos: number; aprovados: number; pendentes: number;
  taxaAprovacao: number;      // aprovados / pedidos
  chargebacks: number; taxaChargeback: number;
  ticketMedio: number;
  // Tráfego × gasto Meta
  gasto: number;              // gasto bruto (sem imposto) = fatura do Meta + gastos manuais
  gastoMeta: number;          // só a fatura crua do Meta
  gastoManual: number;        // só os lançados à mão no widget (trafego_gastos_manuais)
  // CUSTO REAL do anúncio = gasto + imposto de importação (IMPOSTO_GASTO_PCT).
  // É ESTE o denominador de todo ROAS/ROI e a saída do lucro: a fatura crua não
  // é o que sai do caixa, então medir eficiência contra ela inflava o retorno.
  gastoComImposto: number;
  // O ROAS e o LUCRO do painel: só o que o anúncio trouxe contra só o que o
  // anúncio custou. Nem o faturamento do ERP inteiro (comercial, orgânico,
  // marketplace são receita que o anúncio não gerou) nem os custos de
  // produto/imposto/gateway entram — ver eficienciaTrafego().
  roas: number | null;        // faturamentoTrafego / gastoComImposto
  lucro: number;              // faturamentoTrafego − gastoComImposto
  custos: number;             // apurado pra exibição (composição, equilíbrio); FORA do lucro
  margem: number | null;      // lucro / faturamentoTrafego
  roi: number | null;         // lucro / gastoComImposto
  mer: number | null;         // ROAS blended = faturamentoEmpresa / gastoComImposto
  // CPA do ANÚNCIO: custo real ÷ pedidos que o anúncio trouxe. Dividir pelos
  // aprovados do ERP inteiro (comercial, orgânico, marketplace) fazia o custo
  // por venda parecer uma fração do que é.
  cpaTrafego: number | null;
  roasEquilibrio: number | null;   // ROAS mínimo pra empatar (mesma base do lucro)
  metaRevenue: number;        // receita reportada pela Meta (pixel)
  roasMeta: number | null;    // receita Meta / gastoComImposto (o que o pixel diz)
  faturamentoPago: number; pedidosPago: number;      // atribuído a canais PAGOS (tráfego)
  // Só a FATIA YAMPI do tráfego (plataforma 6, loja fonte). NÃO é a base do
  // tráfego — a base é `trafegoValor`/`trafegoN`, que soma TODA origem marcada
  // como tráfego. Em 24/07/26 o checkout da loja migrou pra Vega (plataforma
  // 8): quem media o tráfego por este campo viu a receita cair de R$ 107 mil
  // (jul) pra R$ 15 mil (ago) com a loja vendendo igual — a venda existia, só
  // não entrava em checkout nenhum que este campo enxergasse.
  yampiPagasN: number; yampiPagasValor: number;
  // Valor LÍQUIDO por canal (sem o upsell, que já está em comercialValor).
  // São estes que o detalhamento do total da empresa mostra: somados a
  // comercialValor + marketplaceValor dão exatamente faturamentoEmpresa.
  yampiTrafegoLiquido: number; yampiOrgLiquido: number; vegaLiquidoValor: number;
  outrasLiquido: number;   // origens de tráfego/orgânico fora de Yampi/Vega (0 na config padrão)
  yampiNaoPagasN: number; yampiNaoPagasValor: number;
  // "Ainda não aprovado no ERP" na MESMA base do tráfego (toda origem de
  // tráfego, não só a Yampi) — é o que a tela mostra como "aguardando".
  trafegoNaoPagasN: number; trafegoNaoPagasValor: number;
  yampiOrgN: number; yampiOrgValor: number;          // Yampi loja ORGÂNICA (Carimbos Organico) — total da loja
  comercialValor: number; comercialPedidos: number;  // Comercial = TODAS as vendedoras (vendas_planilha)
  // Faturamento TOTAL da empresa = operação própria + MARKETPLACE. Pedido do
  // dono (01/09/2026): "no faturamento total da empresa, tanto no Tridify
  // quanto no painel da TV quanto no geral, considere as vendas do
  // marketplace". É um número só nas três telas. Sem X1 (já está dentro do
  // canal de origem) e sem "ignorar".
  faturamentoEmpresa: number;
  /** Pedidos na mesma base do `faturamentoEmpresa` — é o divisor do ticket. */
  pedidosEmpresa: number;
  // Operação PRÓPRIA = Yampi tráfego + Yampi orgânica + Comercial + Vega, SEM
  // marketplace. É contra ela que o anúncio é julgado (MER, lucro, margem, o
  // F_Total da comissão do gestor): venda de Shopee/ML/TikTok é dinheiro que
  // entrou, mas não é dinheiro que o anúncio trouxe.
  operacaoPropriaValor: number;
  operacaoPropriaN: number;
  faturamentoTrafego: number;  // Yampi tráfego (Carimbos Tridi) + Marketing X1 + Vega (= F_TP da comissão)
  pedidosTrafego: number;       // pedidos que o ANÚNCIO trouxe (origens de tráfego + X1) — base do CPA
  faturamentoX1: number; pedidosX1: number;          // Marketing X1 (fonte Facebook, comercial)
  vegaN: number; vegaValor: number;                  // Vega Checkout (plataforma 8) — entra nos dois totais
  // A BASE DO TRÁFEGO: soma de TODA origem marcada como tráfego (loja Yampi
  // fonte + Vega Checkout + o que for reclassificado em Fontes), no valor de
  // checkout. É contra ela que o gasto do anúncio é medido — trocar de
  // checkout não pode zerar o faturamento do tráfego.
  trafegoValor: number; trafegoN: number;
  organicoValor: number; organicoN: number;          // soma das origens marcadas como ORGÂNICO
  // Marketplace (Shopee, ML, TikTok) ENTRA em faturamentoEmpresa desde
  // 01/09/2026, e fica exposto à parte pra linha própria nos detalhamentos.
  marketplaceValor: number; marketplaceN: number;    // soma das origens marcadas como MARKETPLACE
  fontesResumo: FonteResumo[];                       // cada origem do período (tela de Fontes)
  // Plataforma do pedido × dia (mesmo valor da Fontes). A parede comercial soma
  // Hoje/Semana/Mês dos canais daqui, sem uma consulta por período.
  plataformaDia?: { d: string; plat: number; valor: number; pedidos: number }[];
  // Comercial: o valor usado (comercialValor) vem de UMA das duas fontes. As
  // duas ficam expostas pra tela poder comparar sem somar.
  comercialPlanilhaValor: number;                    // vendas lançadas pelas vendedoras
  comercialRegrasValor: number;                      // pedidos classificados como comercial
  comercialUpsellValor: number; comercialUpsellN: number;   // fatia de pedido Yampi/Vega vendida a mais pela vendedora
  comercialFonte: "erp" | "planilha" | "regras";
  roasReal: number | null;    // faturamentoPago (tag_utm) / gasto — atribuído
  pctAtribuido: number;       // faturamentoPago / faturamento (qualidade do rastreio)
  fonteTrafego: string;       // loja (qual_yampi) usada como fonte das vendas do tráfego
  canais: CanalVenda[];
  serieDia: DiaVendas[];      // faturamento/vendas aprovadas por dia (sparklines)
  custosConfig: CustosConfig;
  metas: MetasConfig;
}

interface PedidoRow { id: number; created_at: string | null; tag_utm: string | null; qual_yampi: string | null; preco_total: number | null; preco_yampi: number | null; preco_frete_venda: number | null; plataforma_id: number | null; etapa_id: number | null; valores_corretos: boolean | null; data_aprovado: string | null; arquivado: boolean | null; chargeback: boolean | null; excluido: boolean | null; responsavel_id: string | null; id_proprio: string | null }

// Uma origem de venda com o que ela trouxe no período — alimenta a tela de
// Fontes (Tridify) e o detalhamento dos cards.
export interface FonteResumo { chave: string; label: string; tipo: FonteTipo; valor: number; pedidos: number }

// ── Quanto do pedido é checkout e quanto é upsell ────────────────────────────
// Em pedido de checkout (Yampi/Vega) o ERP guarda DOIS valores:
//   preco_yampi = o que o cliente fechou no checkout (veio do anúncio)
//   preco_total = o que o pedido virou no fim (com o que a vendedora vendeu a
//                 mais depois, na conversa de pós-venda)
// A diferença é upsell REAL e é dinheiro que entrou — R$ 32 mil em jul/26.
//
// Duas coisas estavam erradas antes:
// • `valorDe` devolvia preco_yampi na Yampi, então essa diferença sumia de
//   TODOS os totais — o faturamento da empresa nascia ~R$32 mil menor.
// • O upsell era estimado por item (`veio_yampi = false`), o que subestimava
//   (só pegava R$13,7 mil: o "aumento" de um item já existente — trocar 9cm²
//   por 16cm² — não vira linha nova, e é o grosso do upsell) e ainda era lixo
//   na Vega, onde 242 de 307 itens vêm com `veio_yampi = false` só por não
//   serem da Yampi, o que fazia venda normal virar "upsell".
const checkoutDe = (p: PedidoRow) => Number(p.preco_yampi) || 0;
const temCheckout = (p: PedidoRow) => (p.plataforma_id === PLAT_YAMPI || p.plataforma_id === PLAT_VEGA) && checkoutDe(p) > 0;

// Nome de cada plataforma do ERP (id → nome), pra tela mostrar "Vega Checkout"
// em vez de "plat:8".
export async function nomesPlataformas(): Promise<Record<number, string>> {
  try {
    const res = await fetch(`${LEGACY_URL}/rest/v1/plataformas?select=id,nome`, { headers: H, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return {};
    const rows = (await res.json()) as { id: number; nome: string }[];
    return Object.fromEntries(rows.map((r) => [r.id, r.nome]));
  } catch { return {}; }
}

function rotuloFonte(chave: string, plats: Record<number, string>): string {
  if (chave.startsWith("yampi:")) {
    const loja = chave.slice(6);
    return `Yampi · ${loja ? loja.replace(/\b\w/g, (c) => c.toUpperCase()) : "sem loja"}`;
  }
  const id = Number(chave.replace("plat:", ""));
  return plats[id] || (id ? `Plataforma ${id}` : "Sem plataforma");
}

/** Pedidos do período (id + campos usados na classificação). */
export async function pedidosDoPeriodo(since: string, until: string): Promise<PedidoRow[]> {
  return (await fetchPedidos(since, until)).filter((p) => !p.excluido);
}

async function fetchPedidos(since: string, until: string): Promise<PedidoRow[]> {
  const out: PedidoRow[] = [];
  // Dia fecha em Brasília, não em UTC: sem o -03:00 o "hoje" puxava 3 pedidos da
  // madrugada que pertencem a ontem (29/07 vinha com 10 pedidos em vez de 7).
  //
  // A consulta pede um dia de folga de cada lado e quem decide de verdade é o
  // `noPeriodo`, embaixo. Motivo: um terço dos pedidos de marketplace tem
  // `created_at` de meia-noite UTC cravada — DATA sem hora, não instante — e
  // lida como instante ela vira 21h do dia anterior em SP. Era o que punha o
  // pedido de 1º/set dentro de agosto. Ver lib/dia-do-pedido.ts.
  const folga = janelaFolgada(since, until);
  const q = `select=id,created_at,tag_utm,qual_yampi,preco_total,preco_yampi,preco_frete_venda,plataforma_id,etapa_id,valores_corretos,data_aprovado,arquivado,chargeback,excluido,responsavel_id,id_proprio&created_at=gte.${folga.de}T00:00:00-03:00&created_at=lte.${folga.ate}T23:59:59-03:00&order=id.desc`;
  let from = 0;
  for (;;) {
    const res = await fetch(`${LEGACY_URL}/rest/v1/pedidos?${q}`, { headers: { ...H, Range: `${from}-${from + 999}`, "Range-Unit": "items" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) break;
    const rows = (await res.json()) as PedidoRow[];
    out.push(...rows);
    if (rows.length < 1000) break;
    from += 1000;
    if (from > 20000) break;   // trava de segurança
  }
  // Vega `.../1` é desdobramento, não venda — ver ehDesdobramentoVega.
  return out.filter((p) => noPeriodo(p.created_at, since, until) && !ehDesdobramentoVega(p));
}

// Lojas Yampi disponíveis (valores distintos de pedidos.qual_yampi) — pro seletor
// de Fonte das vendas. Amostra dos pedidos recentes; ignora nulos/vazios.
export async function lojasYampi(): Promise<string[]> {
  try {
    const res = await fetch(`${LEGACY_URL}/rest/v1/pedidos?select=qual_yampi&qual_yampi=not.is.null&order=id.desc`, { headers: { ...H, Range: "0-1999", "Range-Unit": "items" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    const rows = (await res.json()) as { qual_yampi: string | null }[];
    const set = new Set<string>();
    for (const r of rows) { const q = (r.qual_yampi || "").trim(); if (q) set.add(q); }
    return [...set].sort();
  } catch { return []; }
}

// ── A Yampi manda no que é da Yampi ─────────────────────────────────────────
// Medido em 22/09/2026: a loja de tráfego tinha 19 pedidos pagos na Yampi e 17
// no ERP. Dois pedidos (R$ 390,80 de produto) só chegaram ao ERP mais de 7h
// depois de pagos — o atraso de importação que motivou tudo isto. O resto da
// diferença do card (R$ 227,16) era juros de parcelamento, que fica fora dos
// dois lados. Enquanto o ERP fosse a única fonte, a venda do dia só aparecia
// quando a importação quisesse — por isso o espelho da API
// (lib/yampi-warehouse) passa a mandar na loja de TRÁFEGO (decisão do usuário,
// 22/09/2026; a orgânica segue no ERP).
//
// Duas coisas acontecem:
//   1. Pedido que existe nos DOIS: o valor de checkout passa a ser o
//      `value_products` da Yampi — só produto, sem frete e sem juros de
//      parcelamento. O `preco_total` do ERP continua intocado, então o upsell
//      pós-venda (total − checkout) segue sendo medido igual.
//   2. Pedido que só existe na Yampi: entra como pedido novo, com a mesma
//      forma de uma linha do ERP, e segue pelo mesmo caminho de classificação.
//      Não há atalho: ele precisa cair na loja certa pra contar como tráfego.
//
// A LOJA do pedido órfão é APRENDIDA, não configurada: pros pedidos que existem
// dos dois lados, o alias da Yampi e o `qual_yampi` do ERP aparecem juntos, e é
// esse par que batiza os órfãos daquele alias. Pedir pra alguém cadastrar o
// de-para seria uma terceira lista pra manter sincronizada com as outras duas —
// e uma letra trocada faria a venda virar "sem loja" caladamente.
/**
 * O número do pedido como a Yampi o conhece, extraído do `id_proprio` do ERP.
 *
 * O campo é EDITÁVEL no ERP e a equipe escreve nele: em set/2026 havia
 * `"78287266851946 - sem contato"` e `"78287356100427 - 71 9926-2160"` (um
 * telefone). Cruzar pelo texto exato fazia esses pedidos não casarem com a
 * Yampi — e aí o espelho os tratava como ÓRFÃOS e somava de novo: a mesma
 * venda contava duas vezes. O número da Yampi é a primeira sequência longa de
 * dígitos; o resto é anotação de gente.
 */
export function numeroDoPedido(idProprio: string | null | undefined): string {
  return String(idProprio ?? "").match(/\d{8,}/)?.[0] ?? "";
}

export function comOsPedidosDaYampi(pedidos: PedidoRow[], espelho: LinhaYampi[]): PedidoRow[] {
  if (!espelho.length) return pedidos;
  const porNumero = new Map(espelho.map((l) => [l.numero, l]));

  // Alias da Yampi → loja do ERP, por maioria entre os pedidos que casam.
  const votos = new Map<string, Map<string, number>>();
  for (const p of pedidos) {
    const l = porNumero.get(numeroDoPedido(p.id_proprio));
    if (!l || !(p.qual_yampi || "").trim()) continue;
    const urna = votos.get(l.loja) ?? new Map<string, number>();
    urna.set(p.qual_yampi!, (urna.get(p.qual_yampi!) || 0) + 1);
    votos.set(l.loja, urna);
  }
  const lojaDoAlias = new Map<string, string>();
  for (const [alias, urna] of votos) {
    const vencedor = [...urna.entries()].sort((a, b) => b[1] - a[1])[0];
    if (vencedor) lojaDoAlias.set(alias, vencedor[0]);
  }

  const vistos = new Set<string>();
  const out = pedidos.map((p) => {
    // Desdobramento (`78287644331649/1`) é a mesma venda partida em duas linhas
    // do ERP, com valor zero. Ele NÃO recebe o valor da Yampi — senão a venda
    // contaria na linha principal e de novo nele.
    if (/^\s*\d{8,}\s*\//.test(String(p.id_proprio ?? ""))) return p;
    const num = numeroDoPedido(p.id_proprio);
    const l = num ? porNumero.get(num) : undefined;
    // Uma linha por número: se o ERP tiver o mesmo pedido duas vezes, só a
    // primeira ganha o valor da Yampi; a outra fica como o ERP a deixou.
    if (!l || vistos.has(num)) return p;
    vistos.add(num);
    // Só o checkout muda. `preco_total` é o que o pedido virou no ERP (com o
    // upsell da vendedora) e não tem equivalente na Yampi — sobrescrevê-lo
    // apagaria R$ 39,5 mil/mês de venda do Comercial.
    //
    // O `max` é defesa, não correção de caso visto: se um dia o ERP gravar o
    // pedido MENOR do que o produto que a Yampi cobrou, o total do ERP
    // seguraria o número pra baixo, porque é ele que vale como valor do
    // pedido. O pedido vale no mínimo o produto da Yampi; abaixo disso é erro
    // do ERP, não venda menor. Acima, é upsell e continua sendo do Comercial.
    // (Em 22/09 nenhum pedido caiu aqui: as diferenças eram juros, que ficam
    // fora dos dois lados.)
    return { ...p, preco_yampi: l.valorProdutos, preco_total: Math.max(Number(p.preco_total) || 0, l.valorProdutos) };
  });

  for (const l of espelho) {
    if (vistos.has(l.numero)) continue;
    // O webhook tem um endereço por loja, então ele SABE de qual é e grava
    // `lojaErp`. A dedução por alias só entra quando o pedido veio pelo cron.
    const loja = l.lojaErp || lojaDoAlias.get(l.loja);
    // Sem saber a loja, o pedido viraria "sem loja" e cairia num balde que não
    // é o dele. Melhor ficar de fora e aparecer no conferidor do que entrar no
    // lugar errado — este caso só acontece quando NENHUM pedido daquele alias
    // casou com o ERP, que já é sinal de integração parada.
    if (!loja) continue;
    out.push({
      id: -1, created_at: l.criadoEm, tag_utm: null, qual_yampi: loja,
      preco_total: l.valorProdutos, preco_yampi: l.valorProdutos, preco_frete_venda: 0,
      plataforma_id: PLAT_YAMPI, etapa_id: null, valores_corretos: true,
      // Pago na Yampi, mas ainda não aprovado no ERP — que é a verdade: ele
      // nem chegou lá. Assim ele aparece em "aguardando aprovação" em vez de
      // inflar a taxa de aprovação do ERP com um pedido que o ERP não tem.
      data_aprovado: null, arquivado: false, chargeback: false, excluido: false,
      responsavel_id: null, id_proprio: l.numero,
    });
  }
  return out;
}

const cache = new Map<string, { at: number; data: VendasSnapshot }>();

/**
 * Como CADA pedido do snapshot foi classificado — tipo (canal), dia em SP e o
 * upsell que a vendedora vendeu a mais sobre o checkout. Fica FORA do
 * `VendasSnapshot` de propósito: o snapshot sai inteiro em rotas de leitura, e
 * um mapa de milhares de pedidos incharia toda resposta. Quem precisa (a
 * previsão por produto) pede por `classificacaoDosPedidos`.
 */
export interface PedidoClassificado { tipo: string; dia: string | null; upsell: number }
const classes = new Map<string, Map<number, PedidoClassificado>>();

/** Classificação por pedido do MESMO cálculo do snapshot (tráfego/orgânico/comercial/marketplace/ignorar). */
export async function classificacaoDosPedidos(since: string, until: string): Promise<Map<number, PedidoClassificado>> {
  const key = `${since}|${until}`;
  await snapshotVendas(since, until);
  const m = classes.get(key);
  if (m) return m;
  // O snapshot veio do cache mas o mapa foi despejado: remonta uma vez.
  await snapshotVendas(since, until, { recalcular: true });
  return classes.get(key) ?? new Map();
}
const TTL = 3 * 60 * 1000;

// Chamado sempre que a classificação de origem/produto muda (Tridify → Fontes,
// Produtos vendidos, De onde vem o Comercial): sem isto o snapshot cacheado
// (até 3min) devolvia a classificação ANTIGA logo depois de salvar, e a tela
// parecia não ter salvo nada.
export function limparCacheVendas(): void {
  cache.clear();
}

// ── Eficiência do tráfego (função PURA) ─────────────────────────────────────
// A conta vive em `lib/trafego-eficiencia.ts` — módulo sem servidor, pra quem
// só precisa dela (preview, client component) não arrastar este arquivo, que
// importa Supabase/ERP e portanto `next/headers`. Aqui fica só o re-export:
// quem já importava `eficienciaTrafego` daqui continua funcionando.
export { eficienciaTrafego };

/**
 * `recalcular`: ignora o cache de 3 min e refaz a conta agora.
 *
 * É o "Atualizar" da Tridify. Sem ele, o botão até refazia o panorama do Meta,
 * mas os cards de DINHEIRO (faturamento, lucro, comissão) voltavam do cache —
 * e um painel onde metade dos números anda e a outra metade não é indistinguível
 * de um painel que não atualizou nada.
 */
export async function snapshotVendas(since: string, until: string, opts?: { recalcular?: boolean }): Promise<VendasSnapshot> {
  const key = `${since}|${until}`;
  const hit = cache.get(key);
  if (hit && !opts?.recalcular && Date.now() - hit.at < TTL) return hit.data;

  // Comercial = TODAS as vendedoras (vendas_planilha), não só os responsáveis
  // ativos — é o número que bate com o "Vendas Comercial" do dashboard.
  const [pedidosErp, cfg, metaSpend, comercial, x1, plataformasNome, fora, manuais, espelhoYampi] = await Promise.all([
    fetchPedidos(since, until),
    getMarketingConfig(),
    getMetaPeriodSpend(since, until).catch(() => null),
    comercialTodasVendedoras(resolvePeriod("custom", since, until)).catch(() => ({ valor: 0, pedidos: 0, porDia: {} as Record<string, number> })),
    x1Resumo(resolvePeriod("custom", since, until)).catch(() => ({ faturamento: 0, pedidos: 0 })),
    nomesPlataformas().catch(() => ({} as Record<number, string>)),
    // Quem não é vendedor (Samuel, Suzuki). Mesma lista e mesmo memo do livro.
    idsForaDoComercial(),
    gastosManuaisDoPeriodo(since, until),
    // Espelho da API da Yampi. `catch → []` de propósito: espelho indisponível
    // devolve o comportamento antigo (só ERP), não uma tela quebrada.
    pedidosDoEspelho(since, until).catch(() => [] as LinhaYampi[]),
  ]);

  // A partir daqui `pedidos` é a base COMBINADA: ERP com o checkout corrigido
  // pela Yampi, mais os pedidos que a importação perdeu.
  const pedidos = comOsPedidosDaYampi(pedidosErp, espelhoYampi);

  // FONTE DAS VENDAS DO TRÁFEGO: a venda conta como tráfego pela LOJA de origem
  // (pedidos.qual_yampi = "Carimbos Tridi"), não pelo utm bagunçado. O usuário
  // define qual loja é a fonte do tráfego na config (Fonte das vendas).
  const fonteTrafego = (cfg.fonteTrafego || FONTE_TRAFEGO_PADRAO).trim().toLowerCase();
  const ehTrafego = (p: PedidoRow) => (p.qual_yampi || "").trim().toLowerCase() === fonteTrafego;

  const canaisMap = new Map<string, CanalVenda>();
  // `base` = tráfego + orgânico do dia (já sem o upsell). `comRegras`/`comUpsell`
  // ficam SEPARADOS porque o comercial do mês vem de UMA das duas fontes
  // (planilha ou balde classificado): somar os dois no dia contaria a mesma
  // venda duas vezes, e a série deixaria de fechar com o total do mês.
  const diaMap = new Map<string, { trafego: number; organico: number; vendas: number; base: number; comRegras: number; comUpsell: number; marketplace: number }>();
  let faturamento = 0, aprovados = 0, chargebacks = 0, faturamentoPago = 0, pedidosPago = 0;
  // Cancelado não é venda — e `excluido` não cobre: cancelar no ERP move a
  // ETAPA (14 = Cancelado), não marca o pedido como excluído. Eram 12 pedidos
  // em agosto/2026 (R$ 2.048,36) entrando no faturamento como se tivessem
  // acontecido. Ver lib/erp-etapas.ts.
  const total = pedidos.filter((p) => !p.excluido && !ehPedidoCancelado(p.etapa_id));
  const classesDaVez = new Map<number, PedidoClassificado>();

  // Cards Yampi: MESMO critério da tabela "Vendas Yampi – Tráfego Pago" do
  // Analytics (lib/vendas.ts): plataforma Yampi (6), valores_corretos,
  // preco_total > 0, loja fonte — e o valor é preco_yampi, NÃO preco_total.
  // A 1ª versão usava preco_total + exigia aprovado, então o faturamento do
  // card nunca batia com a tabela. Pagas/não pagas separadas por data_aprovado.
  const ehVendaYampi = (p: PedidoRow) =>
    p.plataforma_id === PLAT_YAMPI && p.valores_corretos === true &&
    (Number(p.preco_total) || 0) > 0 && ehTrafego(p);
  // Loja Yampi ORGÂNICA (Carimbos Organico) — mesmo critério do /vendas
  // (marketing.organic): total da loja (pagas+não pagas), valor = preco_yampi.
  const NORM_YAMPI_ORG = "carimbos (organico)";
  const ehYampiOrg = (p: PedidoRow) =>
    p.plataforma_id === PLAT_YAMPI && p.valores_corretos === true &&
    (Number(p.preco_total) || 0) > 0 && (p.qual_yampi || "").trim().toLowerCase() === NORM_YAMPI_ORG;
  let yampiPagasN = 0, yampiPagasValor = 0, yampiNaoPagasN = 0, yampiNaoPagasValor = 0;
  let trafegoNaoPagasN = 0, trafegoNaoPagasValor = 0;
  let yampiOrgN = 0, yampiOrgValor = 0;

  // ── Origens configuráveis (Tridify → Fontes de venda) ─────────────────────
  // Cada pedido vira uma ORIGEM: a Yampi é por LOJA (a mesma plataforma tem loja
  // de tráfego e loja orgânica), as demais são a própria plataforma. O tipo
  // (tráfego / orgânico / ignorar) vem da config; sem config, o padrão repete o
  // comportamento de antes — quem não mexer não vê número mudar.
  const lojaTrafego = cfg.fonteTrafego || FONTE_TRAFEGO_PADRAO;
  const chaveDe = (p: PedidoRow) =>
    p.plataforma_id === PLAT_YAMPI ? chaveLojaYampi(p.qual_yampi || "") : chavePlataforma(Number(p.plataforma_id) || 0);
  // O que o pedido VALEU: sempre `preco_total` — é o dinheiro que entrou. Na
  // Yampi ainda vale a trava de `valores_corretos` (dado sujo não entra em
  // total nenhum). Antes a Yampi devolvia `preco_yampi` aqui, e com isso a
  // diferença checkout→total (o upsell da vendedora, R$32 mil em jul/26)
  // desaparecia de todos os totais: o faturamento da empresa nascia menor que
  // a soma dos próprios pedidos. Quem precisa só do checkout usa `checkoutDe`.
  const valorDe = (p: PedidoRow) =>
    p.plataforma_id === PLAT_YAMPI
      ? (p.valores_corretos === true && (Number(p.preco_total) || 0) > 0 ? Number(p.preco_total) || 0 : 0)
      : Number(p.preco_total) || 0;

  const porFonte = new Map<string, { chave: string; tipo: FonteTipo; valor: number; pedidos: number }>();
  const platDia = new Map<string, { d: string; plat: number; valor: number; pedidos: number }>();
  let trafegoValor = 0, trafegoN = 0, organicoValor = 0, organicoN = 0, marketplaceValor = 0, marketplaceN = 0;
  let comercialRegrasValor = 0, comercialRegrasN = 0;   // pedidos com tipo final "comercial" (regra ou responsavel_id)
  let comercialUpsellValor = 0, comercialUpsellN = 0;   // fatia de pedido Yampi/Vega vendida a mais pela vendedora
  // Valor LÍQUIDO por canal (já sem o upsell, que foi pro Comercial). Quem
  // detalha o total da empresa usa estes — assim a soma das linhas é o próprio
  // total por construção, em vez de a tela refazer a conta e divergir.
  let yampiTrafegoLiquido = 0, yampiOrgLiquido = 0, vegaLiquidoValor = 0, outrasLiquido = 0;
  let vegaN = 0, vegaValor = 0;
  // Comercial (ERP) é o padrão: pedido.responsavel_id vem do ERP direto (sem
  // depender de lançamento manual em planilha), então decide o tipo da ORIGEM
  // também — senão o mesmo pedido contaria em Tráfego (pela loja) E em
  // Comercial (pelo responsável) ao mesmo tempo.
  const usarErpNoComercial = cfg.comercialFonte === "erp";
  const usaBaldeClassificado = usarErpNoComercial || cfg.comercialFonte === "regras";

  // Regras de classificação. Só busca os ITENS dos pedidos quando existe regra
  // por produto/categoria — senão seria uma consulta pesada à toa em todo load.
  const regras = (cfg.classificacao ?? []).filter((r) => r.ativa && r.valor);
  const precisaItens = regras.some((r) => r.campo === "produto" || r.campo === "categoria");
  const itens: Map<number, ItemPedido[]> = precisaItens
    ? await itensPorPedido(total.map((p) => Number(p.id)).filter(Boolean)).catch(() => new Map<number, ItemPedido[]>())
    : new Map<number, ItemPedido[]>();

  // Bucket diário na BASE DE MARKETING, por dia de CRIAÇÃO do pedido (não pela
  // aprovação): Yampi tráfego (Carimbos Tridi) e orgânico. É o que alimenta o
  // gráfico de evolução da aba Lucro & custos.
  const bucketDia = (iso: string | null) => {
    const dia = diaDoPedido(iso);
    if (!dia) return null;
    const dd = diaMap.get(dia) || { trafego: 0, organico: 0, vendas: 0, base: 0, comRegras: 0, comUpsell: 0, marketplace: 0 };
    diaMap.set(dia, dd);
    return dd;
  };

  // FATURAMENTO = SÓ PAGAMENTO APROVADO. Na Yampi o pedido nasce antes de o
  // dinheiro entrar (boleto/pix aguardando, cartão recusado): contar o não pago
  // vira faturamento que nunca existiu. Os não pagos seguem sendo MEDIDOS
  // (yampiNaoPagas*, pra ver quanto está preso), só não entram em nenhum total.
  // `data_aprovado` NÃO é o pagamento da Yampi — é a aprovação do ERP, que entra
  // com dias de atraso (medido em 29/07: os 7 pedidos do dia, todos pagos na
  // Yampi, estavam com data_aprovado null; em 20/07, 17 de 25). Usar esse campo
  // como gate de faturamento zerava o dia inteiro. O que separa faturado de
  // não-faturado já é o filtro de pedido válido (valores_corretos / !excluido /
  // !arquivado / !chargeback) — é ele que reproduz os 7 pedidos da tela da Yampi.
  // data_aprovado segue medido abaixo, só como "ainda não aprovado no ERP".
  for (const p of total) {
    if (ehVendaYampi(p)) {
      const yv = Number(p.preco_yampi) || 0;
      yampiPagasN++; yampiPagasValor += yv;
      const dd = bucketDia(p.created_at); if (dd) { dd.trafego += yv; dd.vendas += 1; }
      if (!p.data_aprovado) { yampiNaoPagasN++; yampiNaoPagasValor += yv; }
    }
    if (ehYampiOrg(p)) {
      const yv = Number(p.preco_yampi) || 0;
      yampiOrgN++; yampiOrgValor += yv;
      const dd = bucketDia(p.created_at); if (dd) dd.organico += yv;
    }
    // Classificação por ORIGEM (config). É daqui que saem os totais da empresa
    // e do tráfego — o gráfico diário usa os mesmos baldes, pra card e curva
    // nunca contarem coisas diferentes.
    const chave = chaveDe(p);
    // REGRA manda mais que origem: "produto X é sempre comercial" vale mesmo
    // que a loja dele esteja marcada como tráfego. Sem regra que case, cai no
    // tipo da origem.
    const doItem = itens.get(Number(p.id));
    const porRegra = regras.length
      ? tipoPorRegras(regras, {
          produtos: doItem?.map((i) => i.nome),
          categorias: doItem?.map((i) => String(i.categoriaId ?? "")),
          origem: rotuloFonte(chave, plataformasNome),
          utm: p.tag_utm,
        })
      : null;
    // Marketplace é a PLATAFORMA do pedido e passa na frente de regra e de
    // vendedora: todo ML/TikTok chega do ERP com responsável (ver tipoDoPedido).
    const nomePlat = plataformasNome[Number(p.plataforma_id)] ?? null;
    const tipo = tipoDoPedido({
      marketplace: ehPlataformaMarketplace(p.plataforma_id, nomePlat),
      porRegra,
      // Responsável que não é vendedor (`foraDoComercial`: os administradores)
      // não faz do pedido uma venda do Comercial — ele fica na origem dele.
      comercialPeloResponsavel: usarErpNoComercial && !!p.responsavel_id && !fora.has(p.responsavel_id),
      tipoDaOrigem: tipoDaFonte(chave, cfg.fontes, lojaTrafego, nomePlat),
    });
    // MARKETPLACE conta a VENDA, não a nota. `preco_total` é a NF inteira
    // (produto + frete); o painel da Shopee/ML/TikTok reporta o produto. Em
    // agosto/2026 o Mercado Livre aparecia como R$ 1.621,97 aqui contra
    // R$ 1.074 no painel dele — R$ 508,77 daquilo era frete. Sem esta linha o
    // bônus de quem cuida das contas seria pago sobre frete de correio.
    //
    // Vale SÓ pro marketplace: nas outras origens `preco_total` é o que a
    // empresa faturou e continua sendo a base de sempre.
    const val = tipo === "marketplace"
      ? vendaDeMarketplace(valorDe(p), p.preco_frete_venda)
      : valorDe(p);
    const acc = porFonte.get(chave) ?? { chave, tipo, valor: 0, pedidos: 0 };
    acc.valor += val; acc.pedidos += 1; acc.tipo = tipo;   // Fontes mostra a origem inteira — upsell não some daqui
    porFonte.set(chave, acc);
    // Upsell = o que o pedido de checkout virou ALÉM do que o cliente fechou
    // no site (preco_total − preco_yampi). Vai pro Comercial; o checkout fica
    // no setor de origem. Pedido já 100% comercial pela origem/regra não se
    // divide. `max(0, …)` porque devolução/ajuste pode deixar o total abaixo
    // do checkout, e isso não é upsell negativo do comercial.
    const upsell = temCheckout(p) && tipo !== "comercial" ? Math.max(0, val - checkoutDe(p)) : 0;
    /*
     * O que o COMERCIAL fez neste pedido, por PLATAFORMA e DIA — é daqui que a
     * parede tira Yampi / Carrinho Ab / WhatsApp. Pedido do dono (14/09/2026):
     * estritamente o que o comercial fez. Pedido do comercial conta inteiro;
     * pedido de checkout do tráfego (Yampi/Vega) conta SÓ o upsell que a
     * vendedora vendeu a mais; o resto não entra. Pedido sem nada do comercial
     * não conta nem como pedido.
     */
    classesDaVez.set(Number(p.id), { tipo, dia: diaDoPedido(p.created_at), upsell });
    const doComercial = tipo === "comercial" ? val : upsell;
    const diaP = doComercial > 0 ? diaDoPedido(p.created_at) : null;
    if (diaP) {
      const plat = Number(p.plataforma_id) || 0;
      const kp = `${diaP}|${plat}`;
      const pd = platDia.get(kp) ?? { d: diaP, plat, valor: 0, pedidos: 0 };
      pd.valor += doComercial; pd.pedidos += 1;
      platDia.set(kp, pd);
    }
    const valSetor = val - upsell;
    if (upsell > 0) { comercialUpsellValor += upsell; comercialUpsellN++; }
    // Faturamento da EMPRESA no dia, pelos mesmos baldes que formam o total do
    // mês (faturamentoEmpresa = trafegoValor + organicoValor + comercial).
    // Marketplace e "ignorar" ficam de fora aqui como ficam lá.
    {
      const dd = bucketDia(p.created_at);
      if (dd) {
        if (tipo === "trafego" || tipo === "organico") dd.base += valSetor;
        else if (tipo === "comercial") dd.comRegras += val;
        else if (tipo === "marketplace") dd.marketplace += valSetor;
        if (upsell > 0) dd.comUpsell += upsell;
      }
    }
    if (tipo === "trafego") {
      trafegoValor += valSetor; trafegoN++;
      if (!p.data_aprovado) { trafegoNaoPagasN++; trafegoNaoPagasValor += valSetor; }
      const dd = bucketDia(p.created_at);
      // A Yampi de tráfego já entrou no bucket acima (ehVendaYampi) — não somar
      // de novo, senão o gráfico dobra.
      if (dd && !ehVendaYampi(p)) { dd.trafego += valSetor; dd.vendas += 1; }
    } else if (tipo === "organico") {
      organicoValor += valSetor; organicoN++;
      const dd = bucketDia(p.created_at);
      if (dd && !ehYampiOrg(p)) dd.organico += valSetor;
    } else if (tipo === "comercial") {
      comercialRegrasValor += val; comercialRegrasN++;
    } else if (tipo === "marketplace") {
      marketplaceValor += valSetor; marketplaceN++;
    }
    // Líquido por canal, pro detalhamento do total da empresa. Baldes
    // EXCLUSIVOS e só do que entra no total (comercial tem linha própria;
    // "ignorar" não entra em lugar nenhum) — é isso que garante que as linhas
    // do card somem exatamente o total.
    if (tipo !== "comercial" && tipo !== "ignorar") {
      if (ehVendaYampi(p)) yampiTrafegoLiquido += valSetor;
      else if (ehYampiOrg(p)) yampiOrgLiquido += valSetor;
      else if (p.plataforma_id === PLAT_VEGA) vegaLiquidoValor += valSetor;
      else if (tipo !== "marketplace") outrasLiquido += valSetor;   // marketplace já tem a sua linha
    }
    if (p.plataforma_id === PLAT_VEGA) { vegaN++; vegaValor += Number(p.preco_total) || 0; }

    if (!p.data_aprovado) continue;              // métricas do ERP = vendas aprovadas
    aprovados++;
    const v = Number(p.preco_total) || 0;
    faturamento += v;
    if (p.chargeback) chargebacks++;
    const c = canalDe(p.tag_utm);
    const e = canaisMap.get(c.key) || { key: c.key, label: c.label, pago: c.pago, faturamento: 0, pedidos: 0, pct: 0 };
    e.faturamento += v; e.pedidos += 1; canaisMap.set(c.key, e);
    if (ehTrafego(p)) { faturamentoPago += v; pedidosPago++; }   // tráfego = loja configurada
  }

  const pedidosTotal = total.length;
  for (const e of canaisMap.values()) e.pct = faturamento > 0 ? (e.faturamento / faturamento) * 100 : 0;
  const canais = [...canaisMap.values()].sort((a, b) => b.faturamento - a.faturamento);
  // Dia que só teve venda de vendedora (nenhum pedido no ERP) também precisa
  // aparecer, senão o faturamento daquele dia some da série.
  const comercialPorDia = comercial.porDia || {};
  for (const d of Object.keys(comercialPorDia)) {
    if (!diaMap.has(d)) diaMap.set(d, { trafego: 0, organico: 0, vendas: 0, base: 0, comRegras: 0, comUpsell: 0, marketplace: 0 });
  }
  const serieDia = [...diaMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, x]) => {
      // MESMA escolha de fonte do total do mês, dia a dia.
      const comercial = usaBaldeClassificado ? x.comRegras + x.comUpsell : comercialPorDia[d] || 0;
      return {
        d, trafego: x.trafego, organico: x.organico, vendas: x.vendas,
        comercial: Math.round(comercial * 100) / 100,
        marketplace: Math.round(x.marketplace * 100) / 100,
        // Mesma base do total do mês: operação própria + marketplace.
        empresa: Math.round((x.base + comercial + x.marketplace) * 100) / 100,
      };
    });

  // Gasto bruto = fatura do Meta + gastos lançados à mão no widget. O imposto de
  // importação entra em eficienciaTrafego sobre a SOMA — manual também paga.
  const gastoMeta = metaSpend?.total ?? 0;
  const gastoManual = somaGastosManuais(manuais);
  const gasto = gastoMeta + gastoManual;
  const cst = cfg.custos;

  // Faturamento TOTAL da empresa = Yampi (Carimbos Tridi, total da loja) +
  // Yampi orgânica + Comercial. O X1 (vendas do comercial marcadas como Facebook)
  // NÃO entra no total — é acompanhado à parte no Marketing, pra não contar duas
  // vezes o que já é "tráfego+comercial". Definição confirmada pelo usuário.
  const comercialValor = Math.round(comercial.valor || 0);
  const comercialPedidos = comercial.pedidos || 0;
  const faturamentoX1 = Math.round(x1.faturamento || 0);   // Marketing X1 (fonte Facebook)
  const pedidosX1 = x1.pedidos || 0;
  // Total da empresa = tudo que as ORIGENS marcadas como tráfego/orgânico
  // trouxeram + Comercial (todas as vendedoras — X1 já entra aqui, por isso NÃO
  // soma X1 de novo). Por padrão isto dá exatamente Yampi tráfego + Yampi
  // orgânica + Vega + Comercial, como antes; o que muda é que agora dá pra
  // reclassificar cada origem na tela de Fontes.
  // O Comercial entra UMA vez só: pedidos com responsavel_id do ERP (padrão,
  // não depende de lançamento manual), ou a planilha legada das vendedoras, ou
  // os pedidos que as regras marcaram como comercial. Somar mais de uma
  // contaria a mesma venda duas vezes.
  const usarRegrasNoComercial = cfg.comercialFonte === "regras";
  // ambos ("regras"/"erp") leem o balde "comercial" da classificação acima + o upsell apurado do Yampi/Vega
  const comercialFinalValor = usaBaldeClassificado ? comercialRegrasValor + comercialUpsellValor : comercialValor;
  // O upsell soma VALOR ao comercial, nunca PEDIDO: ele é uma fatia de um pedido
  // de checkout que já foi contado em tráfego/orgânico. Somando `comercialUpsellN`
  // aqui, agosto/26 mostrava 310 pedidos onde o ERP tinha 233 na base da empresa
  // (238 com marketplace) — 77 pedidos contados duas vezes. E como este é o
  // divisor do ticket médio, o ticket saía um terço menor que o real.
  const comercialFinalPedidos = usaBaldeClassificado ? comercialRegrasN : comercialPedidos;
  // Operação PRÓPRIA (loja + comercial + checkout): a base contra a qual o
  // anúncio é julgado. O TOTAL da empresa é ela mais o marketplace — pedido do
  // dono em 01/09/2026, um número só no Tridify, na TV e no Analytics.
  const operacaoPropriaValor = trafegoValor + organicoValor + comercialFinalValor;
  const operacaoPropriaN = trafegoN + organicoN + comercialFinalPedidos;
  const faturamentoEmpresa = operacaoPropriaValor + marketplaceValor;
  // Faturamento do TRÁFEGO PAGO = origens de tráfego + Marketing X1. É o F_TP
  // da comissão. Recorte DIFERENTE do total da empresa.
  const faturamentoTrafego = trafegoValor + faturamentoX1;
  const pedidosTrafego = trafegoN + pedidosX1;
  // A eficiência (MER, lucro, margem) mede o anúncio contra a operação
  // própria: receita de marketplace não veio do anúncio.
  const ef = eficienciaTrafego({
    faturamentoTrafego, pedidosTrafego, faturamentoEmpresa: operacaoPropriaValor, faturamentoPago,
    gasto, custos: cst, metaRevenue: metaSpend?.totalRevenue ?? 0,
  });

  const fontesResumo: FonteResumo[] = [...porFonte.values()]
    .map((f) => ({ ...f, label: rotuloFonte(f.chave, plataformasNome) }))
    .sort((a, b) => b.valor - a.valor);

  const data: VendasSnapshot = {
    since, until, updatedAt: new Date().toISOString(),
    faturamento, pedidos: pedidosTotal, aprovados, pendentes: Math.max(0, pedidosTotal - aprovados),
    taxaAprovacao: pedidosTotal > 0 ? (aprovados / pedidosTotal) * 100 : 0,
    chargebacks, taxaChargeback: aprovados > 0 ? (chargebacks / aprovados) * 100 : 0,
    ticketMedio: aprovados > 0 ? faturamento / aprovados : 0,
    gasto, gastoMeta, gastoManual, gastoComImposto: ef.gastoComImposto, custos: ef.custos, lucro: ef.lucro,
    cpaTrafego: ef.cpa, roasEquilibrio: ef.roasEquilibrio,
    roas: ef.roas, margem: ef.margem, roi: ef.roi, mer: ef.mer,
    metaRevenue: metaSpend?.totalRevenue ?? 0,
    roasMeta: ef.roasMeta,
    faturamentoPago, pedidosPago,
    yampiPagasN, yampiPagasValor, yampiNaoPagasN, yampiNaoPagasValor,
    trafegoNaoPagasN, trafegoNaoPagasValor: Math.round(trafegoNaoPagasValor * 100) / 100,
    yampiTrafegoLiquido: Math.round(yampiTrafegoLiquido * 100) / 100,
    yampiOrgLiquido: Math.round(yampiOrgLiquido * 100) / 100,
    vegaLiquidoValor: Math.round(vegaLiquidoValor * 100) / 100,
    outrasLiquido: Math.round(outrasLiquido * 100) / 100,
    yampiOrgN, yampiOrgValor,
    comercialValor: comercialFinalValor, comercialPedidos: comercialFinalPedidos,
    comercialPlanilhaValor: comercialValor, comercialRegrasValor, comercialUpsellValor: Math.round(comercialUpsellValor * 100) / 100, comercialUpsellN,
    comercialFonte: usarErpNoComercial ? "erp" : usarRegrasNoComercial ? "regras" : "planilha",
    faturamentoEmpresa, pedidosEmpresa: operacaoPropriaN + marketplaceN,
    operacaoPropriaValor, operacaoPropriaN,
    faturamentoTrafego, pedidosTrafego,
    faturamentoX1, pedidosX1, vegaN, vegaValor,
    trafegoValor, trafegoN, organicoValor, organicoN, marketplaceValor, marketplaceN, fontesResumo,
    plataformaDia: [...platDia.values()],
    roasReal: ef.roasReal,
    pctAtribuido: faturamento > 0 ? (faturamentoPago / faturamento) * 100 : 0,
    fonteTrafego: cfg.fonteTrafego || FONTE_TRAFEGO_PADRAO,
    canais, serieDia, custosConfig: cst, metas: cfg.metas,
  };
  cache.set(key, { at: Date.now(), data });
  classes.set(key, classesDaVez);
  // Mesma poda do cache do snapshot: sem teto, uma entrada por período pedido.
  if (classes.size > 12) classes.delete(classes.keys().next().value as string);
  return data;
}

// ── Feed de eventos (aba Eventos) — a partir dos pedidos reais do ERP.
export interface EventoTrafego { id: string; tipo: string; rotulo: string; quando: string; valor: number | null; fonte: string; cor: "verde" | "amarelo" | "vermelho" | "azul" | "cinza" }
interface PedidoEvtRow { id: number | string; created_at: string; tag_utm: string | null; preco_total: number | null; data_aprovado: string | null; chargeback: boolean | null; excluido: boolean | null; plataforma_id: number | null; id_proprio: string | null }

export async function eventosRecentes(since: string, until: string, limite = 80): Promise<EventoTrafego[]> {
  const q = `select=id,created_at,tag_utm,preco_total,data_aprovado,chargeback,excluido,plataforma_id,id_proprio&created_at=gte.${since}T00:00:00-03:00&created_at=lte.${until}T23:59:59-03:00&order=created_at.desc`;
  const res = await fetch(`${LEGACY_URL}/rest/v1/pedidos?${q}`, { headers: { ...H, Range: "0-499", "Range-Unit": "items" }, cache: "no-store", signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res || !res.ok) return [];
  const rows = (await res.json()) as PedidoEvtRow[];
  const ev: EventoTrafego[] = [];
  for (const p of rows) {
    if (p.excluido || ehDesdobramentoVega(p)) continue;
    const fonte = canalDe(p.tag_utm).label;
    const v = Number(p.preco_total) || 0;
    if (p.chargeback) ev.push({ id: `cb-${p.id}`, tipo: "chargeback", rotulo: "Chargeback", quando: p.data_aprovado || p.created_at, valor: v, fonte, cor: "vermelho" });
    else if (p.data_aprovado) ev.push({ id: `ap-${p.id}`, tipo: "aprovado", rotulo: "Pagamento aprovado", quando: p.data_aprovado, valor: v, fonte, cor: "verde" });
    ev.push({ id: `cr-${p.id}`, tipo: p.data_aprovado ? "criado" : "pendente", rotulo: p.data_aprovado ? "Pedido criado" : "Pedido pendente", quando: p.created_at, valor: v, fonte, cor: p.data_aprovado ? "azul" : "amarelo" });
  }
  ev.sort((a, b) => (a.quando < b.quando ? 1 : -1));
  return ev.slice(0, limite);
}
