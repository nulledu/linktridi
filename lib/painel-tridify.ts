import { snapshotVendas } from "@/lib/trafego-vendas";
import { gastoDiarioMeta } from "@/lib/meta";
import { serieDiariaLocal } from "@/lib/meta-warehouse";
import { cached } from "@/lib/cache";

/**
 * Os números de eficiência do painel de TV vindos do TRIDIFY.
 *
 * Antes o painel calculava os seus: dividia a receita Yampi "Carimbos Tridi"
 * pelo gasto do Meta e chamava aquilo de ROAS. Duas divergências saíam disso:
 *
 *  1. **Denominador** — a fatura crua do Meta, sem o imposto de importação.
 *     Inflava o retorno em ~14%. (Já corrigido, mas na mão, em três telas.)
 *  2. **Numerador** — só a loja Yampi de tráfego. O Tridify conta como receita
 *     do anúncio o `faturamentoTrafego`: Yampi tráfego + Marketing X1 + Vega.
 *
 * Resultado: TV e relatório mostravam ROAS diferentes no mesmo mês, e nenhum
 * dos dois estava "errado" — estavam medindo coisas diferentes com o mesmo
 * nome. Numa TV que ninguém audita, o número que discorda do relatório é o
 * mais perigoso: é o que vira decisão sem conferência.
 *
 * Agora existe UMA fonte: `eficienciaTrafego()`, dentro de `snapshotVendas`.
 * Aqui só se escolhe o período e se recorta o que a TV mostra.
 */

export interface TridifyResumo {
  /** Fatura crua do Meta no mês. */
  gasto: number;
  /** O que o anúncio custou de verdade (fatura + imposto de importação). */
  gastoComImposto: number;
  /** Receita que o anúncio trouxe (Yampi tráfego + X1 + Vega). */
  faturamentoTrafego: number;
  /** Pedidos que o anúncio trouxe — base do CPA. */
  pedidosTrafego: number;
  /** Faturamento TOTAL da empresa no MÊS (operação própria + marketplace, desde 01/09/2026). */
  faturamentoEmpresa: number;
  /** O mesmo total, recortado por dia e por semana (semana começa na segunda). */
  faturamentoDia: number;
  faturamentoSemana: number;
  /** Pedidos na base da empresa — divisor do ticket médio. */
  pedidosEmpresa: number;
  /** Run-rate do mês na base da empresa: total ÷ dias corridos × dias do mês. */
  projecaoMes: number;
  /** Receita das origens marcadas como ORGÂNICO. */
  organico: number;
  /**
   * Vega Checkout (plataforma 8) e Comercial (vendedoras), abertos.
   *
   * Ficam expostos porque são justamente as duas fatias que o total antigo do
   * painel errava — e "está pegando a Vega?" não deve depender de alguém ler o
   * código pra responder. Os dois JÁ ESTÃO dentro de `faturamentoEmpresa`;
   * somar de novo conta duas vezes.
   */
  vega: number;
  vegaPedidos: number;
  comercial: number;
  /**
   * Os CANAIS do faturamento, na mesma discriminação do cartão "Faturamento
   * total da empresa" do Tridify (`FaturamentoEmpresa`): Yampi tráfego, Yampi
   * orgânica, Comercial e Vega Checkout, cada um com a contagem de pedidos.
   *
   * O painel mostrava três fatias agregadas — "tráfego" somava a loja Yampi e
   * a Vega numa só. Quem confere a parede contra a tela do computador via dois
   * números para a mesma coisa e não tinha como saber que eram o mesmo. Estes
   * campos são os do cartão, sem refazer conta nenhuma: somados dão exatamente
   * `faturamentoEmpresa`.
   */
  yampiTrafego: number;
  yampiTrafegoPedidos: number;
  organicoPedidos: number;
  comercialPedidos: number;
  /** Origem reclassificada fora de Yampi/Vega (0 na configuração padrão). */
  outras: number;
  /** A loja usada como fonte do tráfego — o "· Carimbos Tridi" do rótulo. */
  fonteTrafego: string;
  /** Marketplace: DENTRO do total desde 01/09/2026, e exposto à parte pra fatia própria. */
  marketplace: number;
  marketplacePedidos: number;
  roas: number | null;
  roi: number | null;
  /** ROAS blended: tudo que a empresa fez contra o que o anúncio custou. */
  mer: number | null;
  lucro: number;
  margem: number | null;
  cpa: number | null;
  /** ROAS mínimo para empatar considerando os custos da operação. */
  roasEquilibrio: number | null;
  ticketMedio: number;
  taxaAprovacao: number;
  /**
   * A meta de faturamento do TRÁFEGO, do painel de marketing. `0` = sem meta.
   *
   * Vem de `metas.faturamento` do Tridify — a mesma que a equipe já acompanha
   * no cockpit. Uma meta de tráfego própria do painel de TV criaria um segundo
   * número oficial para a mesma pergunta, e a parede é justamente onde os dois
   * apareceriam lado a lado sem ninguém saber qual vale.
   */
  metaTrafego: number;
  /** Teto/meta de investimento no período. `0` = sem meta. */
  metaInvestimento: number;
  /**
   * Investimento e receita atribuída, DIA A DIA do mês corrente.
   *
   * É o grão que faltava para a parede de tráfego responder três perguntas com
   * um dado só: a curva do mês, e os totais de HOJE e da SEMANA (somando a
   * própria série). Sem ela, "diário/semanal/mensal" no tráfego exigiria três
   * consultas — e a TV bate nesta rota 24 horas por dia.
   *
   * O gasto vem do armazém do Meta (`meta_ad_insights_daily`), a receita vem da
   * série do Tridify. Dia sem anúncio entra com zero, e não fora da lista:
   * buraco na série faz a curva pular o dia e a soma da semana mudar de
   * tamanho conforme quando se olha.
   */
  serieTrafego: { d: string; receita: number; pedidos: number; gasto: number }[];
  /**
   * O tráfego aberto por PLATAFORMA de anúncio, cada uma com a própria série.
   *
   * Hoje sai uma entrada só — o Meta —, porque é a única plataforma com gasto
   * no armazém; Google e TikTok são integrações que existem na tela de
   * conexões e nunca foram ligadas. A lista é o formato certo mesmo com um
   * item: quando a segunda plataforma entrar, ela vira DADO aqui e a parede
   * ganha a coluna sozinha, sem bloco novo nem deploy do renderizador.
   *
   * Com uma plataforma só, `serie` repete a série total — a receita atribuída
   * ao anúncio é, hoje, toda do Meta. Quando houver duas, a de cima passa a ser
   * a soma e cada canal fica com a sua; não há dois números discordando porque
   * o de cima é derivado dos de baixo por construção.
   *
   * A entrada só nasce se HOUVE gasto no período. Um "Meta Ads · R$ 0
   * investido" numa parede é lido como "a conta está parada", e o que aconteceu
   * foi o armazém não ter respondido.
   */
  canaisTrafego: { id: string; nome: string; serie: { d: string; receita: number; pedidos: number; gasto: number }[] }[];
  /**
   * Quanto do faturamento o rastreio consegue atribuir, JÁ EM PERCENTUAL
   * (0–100) — é assim que `snapshotVendas` devolve. Multiplicar por 100 de novo
   * dá "1773%", que foi o que apareceu na primeira conferência.
   */
  pctAtribuido: number;
  /** Os três canais da parede comercial (Yampi, Carrinho Ab, WhatsApp), por período. */
  canaisVenda?: CanalParede[];
}

/**
 * Os canais que a parede comercial mostra ao lado do pódio — pedido do dono em
 * 14/09/2026: SÓ estes três, pela PLATAFORMA do pedido no ERP (a "fonte do
 * lead"). Os ids são os da tabela `plataformas` do ERP.
 */
export const CANAIS_PAREDE = [
  { plat: 6, nome: "Yampi" },
  { plat: 1, nome: "Carrinho Ab" },
  { plat: 5, nome: "WhatsApp" },
] as const;

type Soma = { valor: number; pedidos: number };
export interface CanalParede { nome: string; dia: Soma; semana: Soma; mes: Soma }

/**
 * Soma a série plataforma×dia em Hoje / Semana (segunda→hoje) / Mês por canal.
 * Dia depois de `hoje` fica fora (o ERP devolve dia futuro depois das 21h —
 * ver a nota da `serieTrafego`). Pura e exportada: o teste trava as janelas.
 */
export function canaisDaParede(
  linhas: { d: string; plat: number; valor: number; pedidos: number }[],
  hoje: string,
): CanalParede[] {
  const [y, m, d] = hoje.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  const inicioSemana = new Date(Date.UTC(y, m - 1, d - ((dow + 6) % 7), 12)).toISOString().slice(0, 10);
  const zero = (): Soma => ({ valor: 0, pedidos: 0 });
  return CANAIS_PAREDE.map(({ plat, nome }) => {
    const c: CanalParede = { nome, dia: zero(), semana: zero(), mes: zero() };
    for (const l of linhas) {
      if (l.plat !== plat || l.d > hoje) continue;
      c.mes.valor += l.valor; c.mes.pedidos += l.pedidos;
      if (l.d >= inicioSemana) { c.semana.valor += l.valor; c.semana.pedidos += l.pedidos; }
      if (l.d === hoje) { c.dia.valor += l.valor; c.dia.pedidos += l.pedidos; }
    }
    for (const s of [c.dia, c.semana, c.mes]) s.valor = Math.round(s.valor);
    return c;
  });
}

/**
 * Recorta a série diária da empresa em HOJE e ESTA SEMANA (segunda→hoje, o
 * mesmo começo de semana que o ERP usa em `startOf("weekly")`).
 *
 * Função pura e exportada de propósito: é a única conta nova deste arquivo, e
 * "faturamento do dia" é exatamente o tipo de número que ninguém confere na
 * parede. O teste trava o começo da semana e a virada do mês.
 */
export function recortesDaSerie(
  serie: { d: string; empresa: number }[],
  hoje: string,
): { dia: number; semana: number } {
  const [y, m, d] = hoje.split("-").map(Number);
  // Meio-dia UTC evita que fuso/DST empurre a data pro dia anterior.
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  const inicioSemana = new Date(Date.UTC(y, m - 1, d - ((dow + 6) % 7), 12))
    .toISOString()
    .slice(0, 10);
  let dia = 0, semana = 0;
  for (const x of serie) {
    if (x.d === hoje) dia += x.empresa;
    if (x.d >= inicioSemana && x.d <= hoje) semana += x.empresa;
  }
  return { dia: Math.round(dia), semana: Math.round(semana) };
}

/** Primeiro dia do mês e hoje, no fuso de São Paulo, como `YYYY-MM-DD`. */
function mesCorrenteSP(agora = new Date()): { de: string; ate: string } {
  const sp = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const p = (n: number) => String(n).padStart(2, "0");
  const ano = sp.getFullYear();
  const mes = p(sp.getMonth() + 1);
  return { de: `${ano}-${mes}-01`, ate: `${ano}-${mes}-${p(sp.getDate())}` };
}

/**
 * Resumo do mês para o painel. `null` quando o Tridify não responde — a TV
 * continua mostrando o resto; um número a menos é melhor que a tela vazia.
 *
 * Cache de 60s por cima do cache de 3 min do próprio `snapshotVendas`: a TV
 * puxa isto 24 horas por dia e a consulta é cara (ERP legado + Meta).
 */
export async function resumoTridifyDoMes(): Promise<TridifyResumo | null> {
  const { de, ate } = mesCorrenteSP();
  try {
    return await cached(`painel:tridify:${de}:${ate}`, 60_000, async () => {
      const v = await snapshotVendas(de, ate);
      const { dia, semana } = recortesDaSerie(v.serieDia, ate);
      /*
       * O gasto por dia vem do GRAPH, não do armazém local.
       *
       * O armazém está com metade do mês (medido em 27/08/2026: R$ 41.200
       * contra os R$ 85.552 da fatura) — é a mesma incompletude que já fez
       * `getMetaPeriodSpend` reverter um atalho parecido, e a nota está lá.
       * Numa série diária o buraco é pior que no total: os dias que faltam
       * ficam ZERADOS, então "hoje" e "esta semana" na parede anunciavam zero
       * investido em dia que teve anúncio, e reconciliar com o total do mês
       * espalhava o que faltava sobre os dias errados — inflando justamente a
       * semana que alguém está olhando.
       *
       * Com `time_increment=1` a soma dos dias É o total do mês por construção.
       * O armazém fica como reserva: se o Graph não responder, uma forma
       * incompleta ainda é melhor que nenhuma — e o `null` do gasto (ver
       * `somaDaJanela` nos widgets) impede que a lacuna vire "R$ 0".
       */
      const doGraph = await gastoDiarioMeta(de, ate).catch(() => null);
      const gastoPorDia = new Map(
        doGraph
          ? doGraph.map((x) => [x.d, x.gasto] as const)
          : ((await serieDiariaLocal(de, ate).catch(() => null)) ?? []).map((x) => [x.day, x.spend] as const),
      );
      // `vendas` da série do Tridify é a CONTAGEM de pedidos atribuídos ao
      // anúncio (sobe junto com `trafego`, no mesmo `if`) — é o que o cartão
      // "vendas atribuídas" mostra, e é a mesma régua do `pedidosTrafego` do
      // mês. Contar por outro caminho (as `purchases` do Meta, por exemplo)
      // daria dois números com o mesmo nome na mesma parede.
      /*
       * A série PARA no dia de hoje.
       *
       * O ERP devolve pedido com data no futuro — `created_at` em UTC vira o dia
       * seguinte no fuso de São Paulo depois das 21h, e o mês corrente ganha um
       * 28/08 quando ainda é dia 27. Um dia a mais parece inofensivo e não é:
       * ele é o ÚLTIMO da série, então "hoje" na parede passava a ser o dia que
       * ainda não aconteceu (medido: R$ 148 e 1 pedido contra R$ 6 mil do dia
       * real), a semana andava um dia para a frente, e o gráfico terminava num
       * mergulho até o chão que parecia colapso de vendas às 21h.
       */
      const serieTrafego = v.serieDia
        .filter((x) => x.d <= ate)
        .map((x) => ({
          d: x.d,
          receita: Math.round(x.trafego),
          pedidos: x.vendas,
          gasto: Math.round(gastoPorDia.get(x.d) ?? 0),
        }));
      const diasCorridos = Number(ate.slice(8, 10));
      const diasNoMes = new Date(Date.UTC(Number(ate.slice(0, 4)), Number(ate.slice(5, 7)), 0)).getUTCDate();
      return {
        faturamentoDia: dia,
        faturamentoSemana: semana,
        pedidosEmpresa: v.pedidosEmpresa,
        projecaoMes: diasCorridos > 0
          ? Math.round((v.faturamentoEmpresa / diasCorridos) * diasNoMes)
          : Math.round(v.faturamentoEmpresa),
        organico: Math.round(v.organicoValor),
        // `vegaLiquidoValor` (não `vegaValor`) é a fatia que entrou no total:
        // já sem o upsell, que foi contado no comercial.
        vega: Math.round(v.vegaLiquidoValor),
        vegaPedidos: v.vegaN,
        comercial: Math.round(v.comercialValor),
        // Os canais do cartão do Tridify, prontos: a parede não refaz conta.
        yampiTrafego: Math.round(v.yampiTrafegoLiquido),
        yampiTrafegoPedidos: v.yampiPagasN,
        organicoPedidos: v.yampiOrgN,
        comercialPedidos: v.comercialPedidos,
        outras: Math.round(v.outrasLiquido),
        fonteTrafego: v.fonteTrafego,
        marketplace: Math.round(v.marketplaceValor),
        marketplacePedidos: v.marketplaceN,
        gasto: Math.round(v.gasto),
        gastoComImposto: Math.round(v.gastoComImposto),
        faturamentoTrafego: Math.round(v.faturamentoTrafego),
        pedidosTrafego: v.pedidosTrafego,
        faturamentoEmpresa: Math.round(v.faturamentoEmpresa),
        roas: v.roas,
        roi: v.roi,
        mer: v.mer,
        lucro: Math.round(v.lucro),
        margem: v.margem,
        cpa: v.cpaTrafego,
        roasEquilibrio: v.roasEquilibrio,
        // Ticket na base da EMPRESA (o mesmo numerador do faturamento do mês),
        // não sobre os aprovados do ERP inteiro: dividir um total por uma
        // contagem de outro recorte dá um ticket que não existe.
        ticketMedio: v.pedidosEmpresa > 0 ? Math.round(v.faturamentoEmpresa / v.pedidosEmpresa) : 0,
        taxaAprovacao: v.taxaAprovacao,
        canaisVenda: canaisDaParede(v.plataformaDia ?? [], ate),
        canaisTrafego: serieTrafego.some((x) => x.gasto > 0)
          ? [{ id: "meta", nome: "Meta Ads", serie: serieTrafego }]
          : [],
        metaTrafego: Math.round(v.metas?.faturamento ?? 0),
        metaInvestimento: Math.round(v.metas?.investimento ?? 0),
        serieTrafego,
        pctAtribuido: v.pctAtribuido,
      };
    });
  } catch {
    return null;
  }
}
