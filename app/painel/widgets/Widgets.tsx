"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { PanelConfig, SalesSnapshot, Salesperson } from "@/lib/types";
import { fmtBRL, fmtCurto, fmtNum } from "@/lib/format";
import {
  COLUNAS,
  LINHAS,
  ROTULO_METRICA,
  escalaPorPolegadas,
  faixaPorAlvo,
  faixaPorRitmo,
  ritmoEsperado,
  separarEmBlocos,
  type Faixa,
  type Metrica,
  type Widget,
} from "@/lib/painel-layout";
import { Icon } from "@/app/(plataforma)/Icon";
import { createContext, useContext } from "react";
import { periodosValidos, type PeriodoParede } from "@/lib/painel-frescor";
import { caminhoSuave } from "@/app/(plataforma)/ui/graficos";
import type { ResumoProducao } from "@/lib/painel-producao";
import type { ResumoEstoque } from "@/lib/painel-estoque";
import { RankingSlide } from "../slides/RankingSlide";
import { RocketSlide } from "../slides/RocketSlide";
import { MetricsSlide } from "../slides/MetricsSlide";
import { TrafficSlide } from "../slides/TrafficSlide";
import { ProductsSlide } from "../slides/ProductsSlide";
import "./widgets.css";

/**
 * Os blocos que o editor posiciona e a TV desenha.
 *
 * Regra de ouro daqui: **o widget nunca sabe onde está**. Ele recebe uma caixa
 * (a célula da grade já virou pixel) e se vira dentro dela. É isso que permite
 * arrastar, redimensionar e reaproveitar o mesmo bloco em qualquer slide sem
 * um `if` de layout.
 *
 * Tamanho de fonte é relativo (`em` sobre a altura da caixa) porque o mesmo
 * layout roda numa TV 4K e numa pré-visualização de 380px no admin — número que
 * cabe numa não pode estourar na outra.
 */

/** O que a expedição devolve (`/api/logistica/painel`) — só contagens. */
export interface StatusExpedicao {
  atualizadoEm: string;
  entrada: number;
  logistica: number;
  total: number;
  enviadosHoje: number;
  categorias: { chave: string; rotulo: string; valor: number; anterior: number | null; cor: string }[];
  faltaProducao: { categoria: string; total: number; pedidos: number }[];
}

export interface DadosPainel {
  sales: SalesSnapshot | null;
  config: PanelConfig;
  /**
   * Chão de fábrica. Vem de outra rota (`/api/producao/painel`) e só é buscado
   * quando existe um widget de produção no layout — painel que não usa não paga
   * a requisição. `undefined` = ainda carregando; `null` = rota indisponível.
   */
  producao?: ResumoProducao | null;
  /** Estoque do galpão. Mesma regra do `producao`: só buscado quando usado. */
  estoque?: ResumoEstoque | null;
  /** Expedição. Mesma regra do `producao`: só buscada quando o layout usa. */
  expedicao?: StatusExpedicao | null;
  /**
   * Números curtos na tela inteira (decisão do perfil, não do bloco). Ver
   * `perfilSchema.numeroCurto`.
   */
  curtos?: boolean;
  /**
   * Polegadas da TV do perfil. Os blocos comuns recebem isto como a variável
   * `--esc` do CSS; as telas clássicas, que são pixels fixos escalados por
   * `transform`, precisam do número em si — daí ele viajar também aqui.
   * `GradeSlide` injeta; ninguém precisa passar na mão.
   */
  polegadas?: number;
}

/** Dinheiro, na escala que o perfil pediu. */
export function fmtDinheiro(n: number, curtos?: boolean): string {
  return curtos ? curto(n, true) : fmtBRL(n);
}

function periodoDe(op: Widget["opcoes"]): "daily" | "weekly" | "monthly" {
  const p = String(op.periodo ?? "mes");
  return p === "dia" ? "daily" : p === "semana" ? "weekly" : "monthly";
}

/**
 * Os TRÊS períodos da tela do ranking — dia, semana e mês —, um de cada vez.
 *
 * O telão das vendedoras nunca mostrou um período só: o painel clássico
 * alternava Hoje/Semana/Mês a cada 7s, e isso se perdeu quando a tela virou
 * blocos (cada bloco ganhou um `periodo` fixo). `periodo: "ciclo"` devolve a
 * troca — e devolve para o pódio, a tabela, a faixa da equipe e a liderança ao
 * mesmo tempo.
 *
 * O período sai do RELÓGIO DE PAREDE (`Date.now()`), não de um contador que
 * cada bloco incrementa por conta própria. É o que garante que os quatro
 * blocos concordem: montados em instantes diferentes (a tabela entra no DOM
 * depois do pódio), contadores próprios ficariam defasados e a tela mostraria
 * o pódio da semana ao lado da tabela do mês — dois números diferentes para a
 * mesma pessoa, na mesma tela.
 */
const PERIODOS = ["daily", "weekly", "monthly"] as const;
/*
 * QUINZE segundos, não sete.
 *
 * Sete era o ritmo do painel clássico, e ali a tela inteira trocava junto —
 * dava para pegar o assunto no relance. Com os blocos separados, o que muda são
 * os NÚMEROS dentro do mesmo desenho: três nomes de vendedora, os valores do
 * pódio, sete linhas de tabela e a faixa da equipe. Ler isso leva mais de sete
 * segundos, então a tela trocava no meio da leitura e a pessoa recomeçava —
 * duas vezes seguidas, ela desiste e olha para outro lado.
 */
export const CICLO_PERIODO_MS = 15_000;
export const NOME_PERIODO: Record<(typeof PERIODOS)[number], string> = {
  daily: "Hoje",
  weekly: "Semana",
  monthly: "Mês",
};

function periodoDoRelogio(): (typeof PERIODOS)[number] {
  return PERIODOS[Math.floor(Date.now() / CICLO_PERIODO_MS) % PERIODOS.length];
}

/**
 * Os períodos que o dado na tela ainda cobre (`periodosValidos`). Sem
 * sincronizar hoje, "Hoje" sai do ciclo e o bloco fixo em "dia" mostra a
 * semana — o número de ontem nunca aparece como de hoje. Vem do `RenderWidget`.
 */
const PeriodosValidos = createContext<readonly PeriodoParede[]>(PERIODOS);

/**
 * Só vendedora do COMERCIAL. O servidor já corta; isto é a segunda trava, para
 * snapshot salvo antes do corte (ou servidor antigo) não pôr X1 na parede.
 */
function comerciais(d: DadosPainel) {
  return (d.sales?.salespeople || []).filter((p) => !p.team || p.team === "comercial");
}

function usePeriodoCiclo(): (typeof PERIODOS)[number] {
  // Nasce no MÊS, igual no servidor e no cliente: `Date.now()` no primeiro
  // render daria HTML diferente do que o servidor mandou e o React descartaria
  // a árvore inteira na hidratação.
  const [p, setP] = useState<(typeof PERIODOS)[number]>("monthly");
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    // Acorda na VIRADA do ciclo, não a cada meio segundo: um `setInterval`
    // curto numa TV ligada 24h é o tipo de timer que a trava de orçamento
    // existe para pegar — e aqui ele não daria precisão nenhuma a mais.
    const bater = () => {
      setP(periodoDoRelogio());
      id = setTimeout(bater, CICLO_PERIODO_MS - (Date.now() % CICLO_PERIODO_MS));
    };
    bater();
    return () => clearTimeout(id);
  }, []);
  return p;
}

/** O período do bloco: o fixo que ele pediu, ou o do ciclo comum. */
function usePeriodo(op: Widget["opcoes"]): "daily" | "weekly" | "monthly" {
  const doCiclo = usePeriodoCiclo();
  const validos = useContext(PeriodosValidos);
  if (String(op.periodo ?? "mes") === "ciclo") {
    if (validos.length === PERIODOS.length) return doCiclo;
    // Gira só pelo que vale, no mesmo compasso do relógio.
    return validos[PERIODOS.indexOf(doCiclo) % validos.length];
  }
  const fixo = periodoDe(op);
  return validos.includes(fixo) ? fixo : validos[0];
}

/**
 * O TRÁFEGO recortado no período: hoje, esta semana ou o mês inteiro.
 *
 * A parede do tráfego mostra os três, e o Tridify entrega o MÊS. Recortar aqui,
 * na série diária que ele manda junto, é o que evita três consultas numa rota
 * que a TV bate 24 horas por dia.
 *
 * Duas decisões que fazem os números baterem com o relatório:
 *
 * • No MÊS os totais vêm do próprio resumo, não da soma da série. São a mesma
 *   coisa em teoria; na prática o resumo já arredondou cada dia, e somar 31
 *   arredondamentos dá um total que discorda do cockpit por alguns reais — na
 *   parede, "discorda por pouco" e "está errado" se leem igual.
 * • Dia e semana aplicam ao gasto o MESMO fator de imposto que o mês tem
 *   (`gastoComImposto ÷ gasto`), em vez de repetir a alíquota aqui. Duas cópias
 *   da mesma constante é como o ROAS da TV passou a discordar do relatório uma
 *   vez — e o fator derivado não tem como divergir.
 */
type DiaTrafego = { d: string; receita: number; pedidos: number; gasto: number };

/**
 * A janela do período dentro de uma série diária: hoje, esta semana, ou tudo.
 *
 * Um lugar só faz esse recorte — os cartões do topo e cada canal do rodapé
 * fazem a MESMA pergunta a séries diferentes, e duas cópias da regra de começo
 * de semana é como o total passa a discordar da soma das partes.
 */
/** Hoje em São Paulo, `YYYY-MM-DD` — sem depender do relógio do aparelho. */
function hojeISO(): string {
  const s = new Date(Date.now() - 3 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${s.getUTCFullYear()}-${p(s.getUTCMonth() + 1)}-${p(s.getUTCDate())}`;
}

function janelaDaSerie(serie: DiaTrafego[], periodo: "daily" | "weekly" | "monthly"): DiaTrafego[] {
  if (serie.length === 0) return [];
  if (periodo === "monthly") return serie;
  /*
   * "Hoje" é o CALENDÁRIO, não o último dia da série.
   *
   * Lendo o último dia, um dia sem venda nenhuma simplesmente não existe na
   * série — e a parede passava a chamar ONTEM de "hoje", com o número cheio de
   * ontem, sem nada indicando a troca. Zero em "Hoje" às nove da manhã é
   * verdade; o número de ontem no lugar dele é mentira.
   */
  const hoje = hojeISO();
  const [ano, mes, dia] = hoje.split("-").map(Number);
  // Meio-dia UTC: com meia-noite, fuso e horário de verão empurram a data para
  // o dia anterior e a semana começa um dia cedo.
  const dow = new Date(Date.UTC(ano, mes - 1, dia, 12)).getUTCDay();
  const inicio = periodo === "daily"
    ? hoje
    : new Date(Date.UTC(ano, mes - 1, dia - ((dow + 6) % 7), 12)).toISOString().slice(0, 10);
  return serie.filter((x) => x.d >= inicio && x.d <= hoje);
}

/**
 * O que corrige a série diária para ela FECHAR com o total do mês.
 *
 * A série e o total do mês vêm de lugares diferentes, e é assim de propósito:
 * o total é o que o relatório usa (a fatura do Meta, com o imposto de
 * importação), e a série diária é o armazém local, que dá o FORMATO do mês —
 * em que dias se gastou e se vendeu. Os dois nunca batem sozinhos: o armazém
 * pode estar um dia atrás na sincronia, e cada dia dele já vem arredondado.
 *
 * Sem esta correção o defeito aparece na MESMA tela, que é o pior lugar: o
 * cartão "Investimento" dizia R$ 94.806 (o total do mês) e a coluna do Meta,
 * logo abaixo, dizia R$ 46.898 (a soma dos dias). Dois números para a mesma
 * pergunta, um em cima do outro, e nenhum jeito de o gerente saber qual vale.
 *
 * A regra: o TOTAL manda, a série diz a proporção. Cada dia é multiplicado
 * pelo fator que faz a soma do mês cair exatamente no total do relatório —
 * então dia, semana e mês passam a ser fatias da mesma coisa, e a soma dos
 * canais fecha com o total por construção.
 */
function fatoresDoTrafego(d: DadosPainel): { receita: number; pedidos: number; gasto: number } {
  const t = d.sales?.tridify;
  const serie = t?.serieTrafego ?? [];
  const razao = (total: number | undefined, soma: number) =>
    total != null && soma > 0 ? total / soma : 1;
  return {
    receita: razao(t?.faturamentoTrafego, serie.reduce((a, x) => a + x.receita, 0)),
    pedidos: razao(t?.pedidosTrafego, serie.reduce((a, x) => a + x.pedidos, 0)),
    gasto: razao(t?.gastoComImposto, serie.reduce((a, x) => a + x.gasto, 0)),
  };
}

function somaDaJanela(
  serie: DiaTrafego[],
  periodo: "daily" | "weekly" | "monthly",
  f: { receita: number; pedidos: number; gasto: number },
): { receita: number; pedidos: number; gasto: number | null } {
  const dentro = janelaDaSerie(serie, periodo);
  const gastoCru = dentro.reduce((a, x) => a + x.gasto, 0);
  /*
   * Janela SEM gasto nenhum devolve `null`, não zero.
   *
   * O armazém do Meta sincroniza com atraso: às dez da manhã o dia de hoje
   * ainda está vazio nele. Somando cru, a parede anunciava "Investimento:
   * R$ 0" — que não é "não sei ainda", é "não gastamos nada", uma afirmação
   * sobre a operação que ninguém fez. Com `null` o cartão mostra "—" e o ROAS
   * também, que é exatamente o que se sabe.
   *
   * Dia de gasto zero de verdade existe, e nele o traço também aparece; numa
   * operação que anuncia todo dia, confundir os dois custa menos do que afirmar
   * o zero.
   */
  return {
    receita: Math.round(dentro.reduce((a, x) => a + x.receita, 0) * f.receita),
    pedidos: Math.round(dentro.reduce((a, x) => a + x.pedidos, 0) * f.pedidos),
    gasto: gastoCru > 0 ? Math.round(gastoCru * f.gasto) : null,
  };
}

function trafegoNo(
  d: DadosPainel,
  periodo: "daily" | "weekly" | "monthly",
): { receita: number; pedidos: number; gasto: number | null } | null {
  const t = d.sales?.tridify;
  if (!t) return null;
  if (periodo === "monthly") {
    return { receita: t.faturamentoTrafego, pedidos: t.pedidosTrafego, gasto: t.gastoComImposto };
  }
  const serie = t.serieTrafego ?? [];
  if (serie.length === 0) return null;
  return somaDaJanela(serie, periodo, fatoresDoTrafego(d));
}

/**
 * O número de cada métrica: o BRUTO e o formatado.
 *
 * O bruto existe para o semáforo — comparar "R$ 1.607.000" (texto) com um alvo
 * não dá, e formatar duas vezes em lugares diferentes é como um número passa a
 * discordar do outro na mesma tela.
 */
function brutoDaMetrica(
  m: Metrica,
  d: DadosPainel,
  /**
   * O período das métricas de TRÁFEGO. As outras ignoram: "faturamento do mês"
   * já tem o recorte no nome, e um período por fora mudaria o que o rótulo
   * promete.
   */
  periodo: "daily" | "weekly" | "monthly" = "monthly",
): number | null {
  const s = d.sales;
  const mt = s?.metrics;
  // Eficiência SEMPRE do Tridify. Sem ele, `null` → a tela mostra "—" em vez de
  // um número calculado com outra régua, que discordaria do relatório.
  const t = s?.tridify;
  // As quatro do tráfego respondem ao período da tela; no mês caem exatamente
  // nos totais do resumo (ver `trafegoNo`).
  if (m === "gasto_trafego" || m === "receita_paga" || m === "pedidos_trafego" || m === "roas") {
    const r = trafegoNo(d, periodo);
    if (!r) return null;
    if (m === "gasto_trafego") return r.gasto;
    if (m === "receita_paga") return r.receita;
    if (m === "pedidos_trafego") return r.pedidos;
    // ROAS do PERÍODO, não o do mês repetido três vezes: sem gasto não há
    // retorno para dividir, e zero ali seria lido como "o anúncio não devolveu
    // nada" em vez de "não houve anúncio".
    return r.gasto ? r.receita / r.gasto : null;
  }
  // As quatro acima saíram deste `switch`: quem as responde é `trafegoNo`, que
  // sabe o período. No mês ele devolve exatamente estes mesmos campos do
  // resumo — não há dois caminhos para o mesmo número.
  switch (m) {
    case "roi": return t?.roi ?? null;
    case "mer": return t?.mer ?? null;
    case "margem": return t?.margem ?? null;
    case "cpa": return t?.cpa ?? null;
    case "roas_equilibrio": return t?.roasEquilibrio ?? null;
    case "lucro_trafego": return t ? t.lucro : null;
    case "faturamento_empresa": return t ? t.faturamentoEmpresa : null;
    // Fatias abertas. `receita_vega` está DENTRO do tráfego e
    // `receita_marketplace` está FORA do total — os rótulos dizem isso, pra
    // ninguém somar os cards da parede e achar que não fecha.
    case "receita_vega": return t ? t.vega : null;
    case "receita_comercial": return t ? t.comercial : null;
    case "receita_marketplace": return t ? t.marketplace : null;
  }

  // Expedição. `null` (e não zero) quando a rota não respondeu: "0 pedidos no
  // fluxo" numa doca cheia é pior que um traço — manda a equipe para casa.
  const e = d.expedicao;
  switch (m) {
    case "expedicao_entrada": return e ? e.entrada : null;
    case "expedicao_logistica": return e ? e.logistica : null;
    case "expedicao_total": return e ? e.total : null;
    case "expedicao_enviados_hoje": return e ? e.enviadosHoje : null;
    case "expedicao_falta_producao":
      return e ? e.faltaProducao.reduce((s, f) => s + f.total, 0) : null;
  }

  // Produção. Mesma regra do bloco: `undefined` (ainda buscando) e `null` (rota
  // fora) viram "—". Zero aqui seria uma afirmação sobre o turno.
  const pr = d.producao;
  switch (m) {
    case "producao_pecas": return pr ? pr.pecasHoje : null;
    case "producao_concluidas": return pr ? pr.concluidasHoje : null;
    case "producao_andamento": return pr ? pr.emAndamento : null;
    case "producao_fila": return pr ? pr.pendentes : null;
    case "producao_impedidas": return pr ? pr.impedidas : null;
    case "producao_operadores": return pr ? pr.operadoresAtivos : null;
    case "producao_urgentes": return pr ? pr.urgentes : null;
    // TMA sem atividade concluída não é "0 min", é ausência de amostra.
    case "producao_tma": return pr?.tmaMin ?? null;
  }

  // Estoque. Mesma regra: sem a rota, "—". "0 itens abaixo do mínimo" numa
  // parede que não conseguiu ler o catálogo manda o galpão parar de repor.
  const es = d.estoque;
  switch (m) {
    case "estoque_abaixo": return es ? es.abaixo : null;
    case "estoque_zerados": return es ? es.zerados : null;
    case "estoque_conferir": return es ? es.conferir : null;
  }
  // FATURAMENTO também sai do Tridify. A base do ERP (soma de `preco_total`
  // dos pedidos válidos) não é a mesma coisa: deixa de fora a venda lançada
  // pela vendedora que não virou pedido, e ainda soma marketplace, que o
  // Tridify tira de propósito por não ser operação própria. Duas telas, dois
  // "faturamento do mês".
  //
  // Aqui, ao contrário da eficiência, existe FALLBACK pro ERP: sem o Tridify a
  // parede mostra um total de base mais estreita, o que ainda é faturamento.
  // Um ROAS de outra régua, não — aquele vira decisão errada.
  switch (m) {
    case "faturamento_dia": return t?.faturamentoDia ?? s?.revenue.daily ?? 0;
    case "faturamento_semana": return t?.faturamentoSemana ?? s?.revenue.weekly ?? 0;
    case "faturamento_mes": return t?.faturamentoEmpresa ?? s?.revenue.monthly ?? 0;
    case "pedidos_mes": return t?.pedidosEmpresa ?? mt?.totalSales.count ?? 0;
    case "ticket_medio": {
      if (t) return t.ticketMedio;
      const c = mt?.totalSales.count ?? 0;
      return c > 0 ? (mt?.totalSales.revenue ?? 0) / c : 0;
    }
    case "projecao_mes": return t?.projecaoMes ?? mt?.projection ?? 0;
    case "receita_organica": return t?.organico ?? mt?.yampi.organic.revenue ?? 0;
    // Percentual da meta do mês. Sem meta cadastrada não há percentual — a
    // tela mostra "—", nunca "0%" (que é uma afirmação sobre o time).
    case "meta_pct": {
      const meta = d.config.monthlyRevenueGoal || 0;
      if (meta <= 0) return null;
      const fat = t?.faturamentoEmpresa ?? s?.revenue.monthly ?? 0;
      return (fat / meta) * 100;
    }
    // Pedidos de HOJE somados por vendedora: é a única contagem diária que o
    // snapshot traz — `metrics.totalSales` é do mês.
    case "pedidos_dia":
      return (s?.salespeople ?? []).reduce((n, p) => n + Math.round(p.orders?.daily ?? 0), 0);
    default: return null;
  }
}

/** Métricas que não são dinheiro: multiplicador, percentual ou contagem. */
const MULTIPLICADOR = new Set(["roas", "roi", "mer", "roas_equilibrio"]);
const PERCENTUAL = new Set(["margem", "meta_pct"]);
// Contagem, não dinheiro: "R$ 38" de entrada da logística seria absurdo.
const CONTAGEM = new Set([
  "pedidos_mes", "pedidos_dia",
  "pedidos_trafego",
  "expedicao_entrada", "expedicao_logistica", "expedicao_total",
  "expedicao_enviados_hoje", "expedicao_falta_producao",
  "producao_pecas", "producao_concluidas", "producao_andamento",
  "producao_fila", "producao_impedidas", "producao_operadores",
  "producao_urgentes",
  "estoque_abaixo", "estoque_zerados", "estoque_conferir",
]);

/** Métricas em MINUTOS: "36min", não "R$ 36" nem "36". */
const MINUTOS = new Set(["producao_tma"]);

/**
 * Quanta LARGURA por caractere o número pode usar.
 *
 * O teto de largura precisa caber a string inteira, e a string varia muito:
 * "353" tem 3 caracteres e "R$ 1.607.000" tem 12. Com um coeficiente fixo
 * calibrado para o pior caso, todo número curto ficava pequeno no meio de um
 * cartão vazio — o defeito de "não aproveitar o widget".
 *
 * A conta é direta: ~130 unidades de `cqi` divididas pelo comprimento, presa
 * entre 8 (número muito longo continua contido) e 30 (número de um dígito não
 * vira pôster). Quem barra daí em diante é a ALTURA, que é o certo.
 */
function fatorDoNumero(texto: string): number {
  // "%" é largo: "24,9%" com o fator de cinco caracteres estourava a caixa em
  // 13px e virava "24,…". Conta como um e meio.
  const n = Math.max(3, texto.length + 0.6 * (texto.split("%").length - 1));
  return Math.min(30, Math.max(8, Math.round(130 / n)));
}

/**
 * O número CHEGA, em vez de trocar de valor.
 *
 * Numa parede, o ciclo de sincronia é invisível: o faturamento pula de 63 para
 * 64 mil e ninguém sabe se olhou errado ou se a tela mudou. Contar até o valor
 * novo dá causa ao número — é a diferença entre uma tela viva e um cartaz.
 *
 * Três coisas que este hook faz de propósito:
 *
 * • A PRIMEIRA leitura não anima. Contar de zero até o faturamento do mês na
 *   abertura seria teatro; o que interessa animar é a MUDANÇA.
 * • A animação parte do valor QUE ESTÁ NA TELA (`de.current` é atualizado a
 *   cada quadro), então um ciclo que chega no meio do caminho continua de onde
 *   está em vez de saltar para trás — é a regra da interrupção do guia da Apple.
 * • Movimento reduzido troca direto, sem contagem. Continua mudando de valor;
 *   só para de percorrer o caminho.
 */
function useNumeroFluido(alvo: number | null, ms = 520): number | null {
  const [valor, setValor] = useState<number | null>(alvo);
  const de = useRef<number | null>(alvo);
  const quadro = useRef(0);

  useEffect(() => {
    const semAnimar = (v: number | null) => { de.current = v; setValor(v); };
    if (alvo == null) { semAnimar(null); return; }
    const reduzido = typeof window !== "undefined"
      && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // ABA ESCONDIDA NÃO RECEBE QUADRO. `requestAnimationFrame` simplesmente não
    // dispara com a página em segundo plano, e a contagem ficava pendurada no
    // valor ANTIGO — a tela mentia até alguém trazer a aba de volta. Um número
    // que não chega é pior que um número que não anima, então aqui ele troca
    // direto. (Descoberto medindo: o painel embutido reporta `hidden` e o
    // número não saía de 1.607.000.)
    const escondida = typeof document !== "undefined" && document.hidden;
    const inicio = de.current;
    if (reduzido || escondida || inicio == null || inicio === alvo) { semAnimar(alvo); return; }

    const t0 = performance.now();
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      // Desacelera no fim (easeOutCubic): chega rápido e assenta, sem pico no
      // meio. É o comportamento de mola criticamente amortecida, sem repique —
      // um número que passa do valor e volta seria mentira por um instante.
      const e = 1 - Math.pow(1 - p, 3);
      const atual = inicio + (alvo - inicio) * e;
      de.current = atual;
      setValor(atual);
      if (p < 1) quadro.current = requestAnimationFrame(passo);
      else semAnimar(alvo);
    };
    quadro.current = requestAnimationFrame(passo);
    // Rede de segurança: se os quadros pararem no meio do caminho (a aba foi
    // escondida DEPOIS de começar), o valor final entra assim mesmo. O que não
    // pode acontecer nunca é a parede ficar mostrando um número que já venceu.
    const rede = setTimeout(() => semAnimar(alvo), ms + 400);
    return () => { cancelAnimationFrame(quadro.current); clearTimeout(rede); };
  }, [alvo, ms]);

  return valor;
}

/**
 * O número de cada métrica, já formatado. Um lugar só, sobre `brutoDaMetrica`:
 * formatar em dois lugares é como um número passa a discordar do outro na
 * mesma tela.
 *
 * `null` vira "—". Não existe zero de mentira: sem gasto não existe ROAS, e
 * "0,00x" na parede é lido como desempenho péssimo, não como dado ausente.
 */
function valorDaMetrica(m: Metrica, d: DadosPainel): { valor: string; sufixo?: string } {
  return { valor: formatarMetrica(m, brutoDaMetrica(m, d)) };
}

/**
 * A régua de formatação, separada do "de onde vem o número".
 *
 * Existe para o número EM MOVIMENTO poder ser escrito com as mesmas regras do
 * número final (ver `useNumeroFluido`): a contagem passa por aqui a cada
 * quadro, e é isso que garante que "R$ 63.900" a caminho de "R$ 64.100" nunca
 * apareça como "63900" ou "R$ 63.900,42".
 */
function formatarMetrica(m: Metrica, n: number | null): string {
  if (n == null) return "—";
  if (MULTIPLICADOR.has(m)) return `${n.toFixed(2).replace(".", ",")}x`;
  if (PERCENTUAL.has(m)) return `${n.toFixed(1).replace(".", ",")}%`;
  if (CONTAGEM.has(m)) return fmtNum(Math.round(n));
  // Sem espaço antes de "min": numa faixa de 5 cards "36 min" quebrava a linha
  // e saía "36 …" — o mesmo motivo do rótulo curto no bloco de produção.
  if (MINUTOS.has(m)) return `${Math.round(n)}min`;
  return fmtBRL(Math.round(n));
}

/* ─── blocos ──────────────────────────────────────────────────────────────── */

/**
 * Sinal de estado. Cor E ícone, nunca cor sozinha: numa TV vista de longe, em
 * sala clara, verde e vermelho desbotam para o mesmo cinza — e há quem não
 * distinga os dois de perto nenhum.
 */
function Sinal({ faixa, direcao = "maior" }: { faixa: Faixa; direcao?: "maior" | "menor" }) {
  if (faixa === "neutro") return null;
  /*
   * A seta diz para onde o NÚMERO foi, não se a notícia é boa.
   *
   * Ela só olhava a faixa: em "impedidas" (alvo 0, menos é melhor) três peças
   * paradas ficavam vermelhas com a seta CAINDO — ao lado de um número que é
   * ruim justamente por estar alto. Quem lê de longe vê a seta antes de ler o
   * rótulo, e entende o contrário do que aconteceu. Em métrica onde menos é
   * melhor, ruim é subir.
   */
  const subiu = direcao === "menor" ? faixa === "critico" : faixa === "ok";
  const icone = faixa === "atencao" ? "minus" : subiu ? "trendingUp" : "trendingDown";
  return <Icon name={icone} size={22} className={`pw-sinal faixa-${faixa}`} />;
}

/** "R$ 59,9 mil" no lugar de "R$ 59.925" — ver `fmtCurto` em `lib/format`. */
const curto = fmtCurto;

/**
 * A SÉRIE por trás da métrica, quando existe — o "mini-gráfico" do KPI.
 *
 * Só devolve série para métrica cuja evolução o snapshot realmente traz. Não
 * há série de ROAS nem de ticket: desenhar uma linha inventada seria pior que
 * não ter linha nenhuma, porque linha na tela é lida como fato.
 */
/**
 * A série diária de uma métrica.
 *
 * TRÁFEGO sai do Tridify, e só dele. O `trafficSeries` do ERP legado mede outra
 * coisa com o mesmo nome: medido em 27/08/2026, ele somava R$ 37.948 no mês
 * contra os R$ 83.705 do Tridify — 2,2 vezes menos, porque não enxerga X1 nem
 * Vega. Um gráfico com aquela base ao lado de um cartão com esta é a tela
 * discordando de si mesma, que é o defeito que o painel inteiro existe para
 * não ter (ver a nota no topo de `lib/painel-tridify.ts`).
 */
function serieDaMetrica(m: Metrica, d: DadosPainel): number[] | null {
  const mt = d.sales?.metrics;
  const st = d.sales?.tridify?.serieTrafego ?? [];
  if (m === "receita_paga" || m === "roas" || m === "cpa") {
    return st.length ? st.map((x) => x.receita) : null;
  }
  if (m === "gasto_trafego") return st.length ? st.map((x) => x.gasto) : null;
  if (!mt) return null;
  const fat = ["faturamento_dia", "faturamento_semana", "faturamento_mes", "faturamento_empresa", "projecao_mes"];
  if (fat.includes(m)) return mt.revenueSeries?.map((p) => p.value) ?? null;
  return null;
}

/**
 * A VARIAÇÃO contra o período anterior — o que transforma um número em
 * informação. "R$ 59 mil" não diz nada; "R$ 59 mil, 12% acima do mês passado"
 * diz. É a regra que todo guia de wallboard repete, e a que faltava aqui.
 *
 * Cada comparação sai de um número que o servidor JÁ calcula sobre a mesma
 * base — nada é recomputado na tela. Métrica sem comparação honesta devolve
 * `null` e o widget simplesmente não mostra seta.
 */
function variacaoDaMetrica(
  m: Metrica,
  d: DadosPainel,
  periodo: "daily" | "weekly" | "monthly" = "monthly",
): { pct: number; contra: string } | null {
  const mt = d.sales?.metrics;
  const serie = mt?.revenueSeries ?? [];
  /**
   * Acima de 300% a conta deixou de medir desempenho e passou a medir o
   * calendário: base quase zero no começo do período faz qualquer venda virar
   * "+800%". Um número que só assusta é pior que nenhum — a seta some.
   * (Mesma regra do card de tráfego no app.)
   */
  const sensato = (p: number | null) => (p == null || Math.abs(p) > 300 ? null : p);
  const delta = (agora: number, antes: number) =>
    sensato(antes > 0 ? ((agora - antes) / antes) * 100 : null);

  if (m === "faturamento_mes" || m === "faturamento_empresa") {
    const t = sensato(d.sales?.revenue.trendPct ?? null);
    return t == null ? null : { pct: t, contra: "mesmo período do mês passado" };
  }
  /*
   * As quatro do TRÁFEGO comparam a janela atual com a janela IGUAL logo antes,
   * na mesma série diária que já alimenta os cartões: hoje contra ontem, esta
   * semana contra os sete dias anteriores.
   *
   * No MÊS não há comparação: a série começa no dia 1º e o mês passado não vem
   * nesta resposta. O cartão fica sem a linha de variação em vez de comparar um
   * mês inteiro com os dias que couberam — "queda de 60%" no dia 12 seria só o
   * calendário falando, e na parede isso vira reunião.
   */
  const st = d.sales?.tridify?.serieTrafego ?? [];
  if ((m === "receita_paga" || m === "gasto_trafego" || m === "pedidos_trafego" || m === "roas") && periodo !== "monthly") {
    const n = periodo === "daily" ? 1 : 7;
    if (st.length < n * 2) return null;
    const janela = (ini: number, fim: number) => {
      const f = st.slice(ini, fim);
      const receita = f.reduce((a, x) => a + x.receita, 0);
      const gasto = f.reduce((a, x) => a + x.gasto, 0);
      const pedidos = f.reduce((a, x) => a + x.pedidos, 0);
      return m === "receita_paga" ? receita
        : m === "gasto_trafego" ? gasto
        : m === "pedidos_trafego" ? pedidos
        : gasto > 0 ? receita / gasto : 0;
    };
    const p = delta(janela(st.length - n, st.length), janela(st.length - n * 2, st.length - n));
    return p == null ? null : { pct: p, contra: periodo === "daily" ? "ontem" : "7 dias anteriores" };
  }
  /*
   * SEM queda para `paidTrendPct` do ERP legado.
   *
   * Ele compara a receita paga do ERP, que é outra base — medido: 2.106% de
   * variação, um número que só o `sensato` impedia de ir para a parede. No mês
   * o cartão fica sem a linha de variação (não há mês anterior nesta resposta),
   * e é assim que tem de ser: melhor a ausência do que um percentual medido com
   * régua diferente do número logo acima dele.
   */
  if (m === "faturamento_dia" && serie.length >= 2) {
    // Ontem, não "média do mês": o card é do dia, e a comparação tem de ser
    // com a mesma unidade de tempo, senão a seta mente de manhã cedo.
    const p = delta(serie[serie.length - 1].value, serie[serie.length - 2].value);
    return p == null ? null : { pct: p, contra: "ontem" };
  }
  if (m === "faturamento_semana" && serie.length >= 14) {
    const soma = (ini: number, fim: number) => serie.slice(ini, fim).reduce((s, x) => s + x.value, 0);
    const p = delta(soma(serie.length - 7, serie.length), soma(serie.length - 14, serie.length - 7));
    return p == null ? null : { pct: p, contra: "7 dias anteriores" };
  }
  return null;
}

/**
 * Mini-gráfico de linha — contexto sem ocupar espaço de número.
 *
 * A arte é a mono-rounded do ERP (ver `ui/graficos.tsx`): curva monótona e
 * traço de tinta cheia. A três metros o que se lê de um mini-gráfico é a FORMA,
 * e uma polilinha de segmentos retos com 30 pontos vira serrilha; a curva
 * monótona também garante que a linha não passe do ponto e desenhe um vale
 * abaixo de zero entre um dia cheio e um dia parado.
 *
 * Espessura e cor saem de `--mono-traco`/`--mono-tinta`, que o `.pw-grade`
 * engrossa e prende ao contraste da PAREDE (ver widgets.css).
 */
function Faisca({ valores }: { valores: number[] }) {
  if (valores.length < 2) return null;
  const max = Math.max(...valores, 1);
  const passo = 100 / (valores.length - 1);
  const pts = valores.map((v, i) => ({ x: i * passo, y: 100 - (v / max) * 100 }));
  return (
    <svg className="pw-faisca" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <path className="mono-serie" d={caminhoSuave(pts)} />
    </svg>
  );
}

/**
 * O ícone de cada medida.
 *
 * Não é decoração: numa fileira de quatro cartões brancos do mesmo tamanho, a
 * silhueta do selo é o que separa "pedidos" de "ticket médio" antes de a
 * palavra ser lida — e a três metros a palavra chega depois. Métrica sem
 * entrada aqui simplesmente não ganha selo; inventar um ícone genérico para
 * todas seria devolver os quatro cartões iguais.
 */
const ICONE_METRICA: Partial<Record<Metrica, string>> = {
  faturamento_dia: "chart-bar",
  faturamento_semana: "chart-bar",
  faturamento_mes: "chart-bar",
  faturamento_empresa: "chart-bar",
  pedidos_mes: "shopping-bag",
  ticket_medio: "ticket",
  projecao_mes: "trending-up",
  meta_pct: "target",
  pedidos_dia: "shopping-bag",
  gasto_trafego: "wallet",
  receita_paga: "shopping-cart",
  pedidos_trafego: "shopping-bag",
  receita_organica: "world",
  roas: "trending-up",
  roi: "trending-up",
  mer: "chart-line",
  margem: "percentage",
  cpa: "target-arrow",
  lucro_trafego: "cash",
  roas_equilibrio: "target-arrow",
};

function Kpi({ w, d }: { w: Widget; d: DadosPainel }) {
  const periodo = usePeriodo(w.opcoes);
  const metrica = (String(w.opcoes.metrica ?? "faturamento_mes") as Metrica);
  const rotulo = String(w.opcoes.rotulo ?? ROTULO_METRICA[metrica] ?? "");
  /*
   * `icone: false` desliga; `icone: "nome"` troca; sem opção, o padrão da
   * métrica. A parede de produção monta cartão de contagem onde selo nenhum
   * ajuda, e ali um quadradinho lilás só rouba largura do número.
   */
  const icone = w.opcoes.icone === false ? null : String(w.opcoes.icone ?? ICONE_METRICA[metrica] ?? "") || null;

  /*
   * Alvo é opcional: sem alvo, número branco e nenhum alarme — o painel não
   * inventa uma expectativa que ninguém definiu.
   *
   * "Sem alvo" e "alvo zero" são coisas DIFERENTES e antes colapsavam no mesmo
   * número: quem escrevia zero em "impedidas" (a meta óbvia de um contador de
   * problema) ficava sem cor nenhuma, e a opção parecia quebrada.
   */
  const alvoCru = w.opcoes.alvo;
  const temAlvo = alvoCru !== undefined && alvoCru !== "" && Number.isFinite(Number(alvoCru));
  const alvo = temAlvo ? Number(alvoCru) : null;
  // As métricas de tráfego respondem ao período da TELA (`periodo: "ciclo"` na
  // parede do tráfego); as outras ignoram — ver `brutoDaMetrica`.
  const bruto = brutoDaMetrica(metrica, d, periodo);
  // O que aparece é o valor EM MOVIMENTO; a cor e a comparação continuam
  // saindo do valor real, senão a tela mudaria de cor no meio da contagem.
  const emCurso = useNumeroFluido(bruto);
  const valor = formatarMetrica(metrica, emCurso);
  const faixa: Faixa =
    alvo != null && bruto != null
      ? faixaPorAlvo(bruto, alvo, w.opcoes.direcao === "menor" ? "menor" : "maior")
      : "neutro";

  // A escala do número é decisão do PERFIL: a tela inteira abrevia ou nenhuma
  // parte dela abrevia (ver `perfilSchema.numeroCurto`).
  const ehDinheiro = bruto != null && !MULTIPLICADOR.has(metrica) && !PERCENTUAL.has(metrica)
    && !CONTAGEM.has(metrica) && !MINUTOS.has(metrica);
  // A escala curta também acompanha a contagem — trocar de régua no meio do
  // caminho ("R$ 63.900" virando "R$ 64 mil" só no fim) seria um pisca.
  const mostrado = d.curtos && emCurso != null ? curto(emCurso, ehDinheiro) : valor;

  // Contexto: variação e/ou mini-gráfico. Ambos opcionais e ambos silenciosos
  // quando o dado honesto não existe — seta inventada é pior que nenhuma.
  const variacao = w.opcoes.variacao === true ? variacaoDaMetrica(metrica, d, periodo) : null;
  const serie = w.opcoes.faisca === true ? serieDaMetrica(metrica, d) : null;
  // Para custo (CPA, gasto), subir é RUIM: a cor da seta segue a direção do
  // alvo, não o sinal do número.
  const subirEhBom = w.opcoes.direcao !== "menor";
  const bomOuRuim = variacao ? (variacao.pct >= 0) === subirEhBom : true;

  return (
    // `--fator`: quanta largura por caractere este número pode usar. Com um
    // valor fixo, "353" ficava do tamanho de "R$ 1.607.000" e o cartão nascia
    // metade vazio. Ver `fatorDoNumero`.
    <div
      className={`pw-kpi ${icone ? "pw-kpi-selo" : ""}`}
      style={{ ["--fator" as string]: fatorDoNumero(mostrado) }}
    >
      {icone && (
        <span className="pw-selo">
          <Icon name={icone} size={24} />
        </span>
      )}
      {/* O corpo é sempre um invólucro, com selo ou sem: `display: contents`
          resolveria mais limpo, mas o WebView do tablet antigo (Chrome ~51,
          ver o browserslist do package.json) não o implementa e a coluna
          inteira desmoronaria em linha lá. Um flex-column dentro de um
          flex-column é idêntico ao que havia antes. */}
      <div className="pw-kpi-corpo">
        <span className="pw-rotulo">{rotulo}</span>
        <div className="pw-kpi-linha">
          <strong className={`pw-numero faixa-${faixa}`}>{mostrado}</strong>
          <Sinal faixa={faixa} direcao={w.opcoes.direcao === "menor" ? "menor" : "maior"} />
        </div>
        {/*
          A linha da variação é RESERVADA quando o bloco a pediu, mesmo sem
          dado. Com `periodo: "ciclo"`, o mês não tem com o que comparar e a
          semana tem: aparecendo e sumindo, o cartão inteiro subia e descia a
          cada sete segundos — uma parede que se mexe sozinha parece defeito.
        */}
        {w.opcoes.variacao === true && !variacao && <span className="pw-delta pw-delta-vazio" aria-hidden>&nbsp;</span>}
        {variacao && (
          <span className={`pw-delta ${bomOuRuim ? "pw-delta-bom" : "pw-delta-ruim"}`}>
            {/* Tabler, e não os caracteres ▲/▼: glifo tipográfico usado como
                ícone muda de desenho a cada fonte, e a TV da parede resolve a
                fonte com o que o WebView dela tem instalado — o mesmo painel
                desenhava o triângulo cheio num aparelho e um contorno no outro. */}
            <Icon name={variacao.pct >= 0 ? "trending-up" : "trending-down"} size={16} className="pw-seta" />
            {/* Uma casa decimal, a mesma do bloco de canais logo abaixo: o
                cartão dizendo "10%" e a coluna do Meta dizendo "9,6%" para a
                MESMA comparação, na mesma tela, é lido como dois números
                diferentes — e são o mesmo, arredondado de dois jeitos. */}
            {Math.abs(variacao.pct).toFixed(1).replace(".", ",")}%
            <i>{variacao.contra}</i>
          </span>
        )}
        {serie && serie.length >= 2 && <Faisca valores={serie} />}
      </div>
    </div>
  );
}

function Meta({ w, d }: { w: Widget; d: DadosPainel }) {
  /*
   * `base: "trafego"` mede a meta do TRÁFEGO, não a da empresa.
   *
   * A meta vem de `metas.faturamento` do Tridify — a mesma que a equipe de
   * marketing já acompanha no cockpit. Criar uma meta de tráfego própria do
   * painel de TV colocaria dois números oficiais para a mesma pergunta lado a
   * lado na parede, sem ninguém saber qual vale.
   */
  const doTrafego = w.opcoes.base === "trafego";
  const t = d.sales?.tridify;
  const meta = doTrafego ? t?.metaTrafego ?? 0 : d.config.monthlyRevenueGoal || 0;
  // MESMA base do card "Faturamento do mês". Meta medida contra outro total é
  // como o mesmo painel mostra 92% num widget e 87% no de cima.
  const feito = doTrafego
    ? t?.faturamentoTrafego ?? 0
    : brutoDaMetrica("faturamento_mes", d) ?? 0;
  /*
   * Sem meta definida o bloco DIZ isso, em vez de desenhar uma barra vazia.
   *
   * Com `meta = 0` a conta antiga saía em "0%" com a legenda "meta batida" —
   * duas afirmações falsas de uma vez, e as duas sobre o número que a diretoria
   * confere. A meta do tráfego mora no cockpit de marketing e nasce zerada até
   * alguém preencher.
   */
  if (meta <= 0) {
    return (
      <div className="pw-meta pw-meta-vazia">
        <span className="pw-selo pw-selo-min">
          <Icon name={String(w.opcoes.icone ?? "target-arrow")} size={20} />
        </span>
        <span className="pw-vazio">
          {doTrafego ? "defina a meta de vendas do tráfego" : "defina a meta do mês"}
        </span>
      </div>
    );
  }
  const pct = meta > 0 ? Math.min(100, (feito / meta) * 100) : 0;
  const falta = Math.max(0, meta - feito);

  /*
   * O RITMO continua mandando na MARCA da barra — a risca que diz onde o mês
   * deveria estar hoje —, mas não na COR.
   *
   * A barra pintava de amarelo e vermelho conforme o atraso. Era informação
   * real e saiu por decisão de desenho: a parede nova tem uma cor só, e uma
   * barra vermelha de tela cheia domina o painel inteiro a ponto de o
   * faturamento ao lado virar detalhe. O que restou dizendo a mesma coisa é
   * mais preciso, não menos: a risca do ritmo (dá para ver a distância) e a
   * frase "R$ 63.479 atrás do ritmo", escrita com todas as letras.
   *
   * `semaforo: true` no bloco devolve as cores para quem prefere o alarme.
   */
  const porRitmo = w.opcoes.ritmo !== false;
  const comSemaforo = w.opcoes.semaforo === true;
  const faixa: Faixa = !meta || !comSemaforo
    ? "neutro"
    : porRitmo
      ? faixaPorRitmo(feito, meta)
      : faixaPorAlvo(feito, meta);
  const esperado = porRitmo ? ritmoEsperado(meta) : meta;
  const diferenca = feito - esperado;

  return (
    <div className="pw-meta">
      <div className="pw-meta-topo">
        <span className="pw-meta-tit">
          {/* O selo é opcional: na tela da batalha a meta entra sem ele (só
              duas coisas na tela, nada a distinguir), e na financeira entra
              com ele, ao lado de quatro cartões que TÊM selo. */}
          {w.opcoes.icone !== false && (
            <span className="pw-selo pw-selo-min">
              <Icon name={String(w.opcoes.icone ?? "target-arrow")} size={20} />
            </span>
          )}
          <span className="pw-rotulo">{String(w.opcoes.rotulo ?? "Meta do mês")}</span>
        </span>
        <span className="pw-meta-num">
          {fmtDinheiro(feito, d.curtos)} / {fmtDinheiro(meta, d.curtos)}
        </span>
      </div>
      <div className="pw-barra">
        <div className={`pw-barra-fill faixa-fundo-${faixa}`} style={{ width: `${pct}%` }} />
        {/* Onde deveria estar hoje. Sem essa marca, "68%" não diz se está bom. */}
        {porRitmo && meta > 0 && (
          <div className="pw-marca-ritmo" style={{ left: `${Math.min(100, (esperado / meta) * 100)}%` }} />
        )}
      </div>
      <div className="pw-meta-baixo">
        <strong className={`faixa-${faixa}`}>{Math.round(pct)}%</strong>
        <span>
          {porRitmo && meta > 0
            ? diferenca >= 0
              ? `${fmtDinheiro(diferenca, d.curtos)} à frente do ritmo`
              : `${fmtDinheiro(-diferenca, d.curtos)} atrás do ritmo`
            : falta > 0
              ? `faltam ${fmtDinheiro(falta, d.curtos)}`
              : "meta batida"}
        </span>
      </div>
    </div>
  );
}

function vendasNo(p: Salesperson, periodo: "daily" | "weekly" | "monthly") {
  return p.sales[periodo] ?? 0;
}

function Podio({ w, d }: { w: Widget; d: DadosPainel }) {
  const periodo = usePeriodo(w.opcoes);
  const top = [...(comerciais(d))]
    .sort((a, b) => vendasNo(b, periodo) - vendasNo(a, periodo))
    .slice(0, 3);
  const ordem = [top[1], top[0], top[2]].filter(Boolean);   // 2º, 1º, 3º
  /*
   * Altura por COLOCAÇÃO, não pela ordem em que os degraus são desenhados.
   *
   * A tabela vivia na ordem visual (2º, 1º, 3º) e era lida com a colocação
   * real: o campeão recebia os 58% do segundo e o vice recebia os 100%. O
   * degrau do 2º lugar era o mais alto do pódio — e ninguém tinha visto porque
   * `.pw-base` é `flex: 0 1 auto` e, num bloco baixo, os dois encolhem até o
   * mesmo teto (medido: 155/155/136px). Num bloco alto o erro apareceria.
   */
  /*
   * A altura sai da CAIXA (`cqh` cai no slot), não do que sobra na coluna.
   *
   * Com percentagem do degrau, quem tem mais conteúdo em cima — o campeão, que
   * ganha foto maior e troféu — sobrava com menos espaço para a base e o
   * degrau do 1º nascia MENOR que o do 2º (medido: 127px contra 145px). As
   * proporções são as do painel clássico (120/86/68px), em fração da altura do
   * bloco.
   */
  // Três alturas BEM diferentes (14/09/2026): com 27 e 21 o 2º e o 3º liam
  // como o mesmo degrau a três metros.
  const alturas: Record<number, string> = { 1: "33cqh", 2: "22cqh", 3: "12cqh" };
  return (
    <div className="pw-podio">
      {ordem.map((p) => {
        const pos = top.indexOf(p) + 1;
        return (
          <div key={p.id} className={`pw-degrau ${pos === 1 ? "pw-campeao" : ""}`}>
            {/* A coroa é do campeão e de mais ninguém: é o que faz o 1º lugar
                ser achado de longe antes de qualquer número ser lido. */}
            {pos === 1 && (
              <span className="pw-coroa" aria-hidden>
                <Icon name="crown" size={40} color="currentColor" />
              </span>
            )}
            <div className={`pw-avatar pw-pos${pos}`}>
              {p.photoUrl ? (
                <Image src={p.photoUrl} alt={p.name} width={96} height={96} unoptimized />
              ) : (
                <span>{p.name.split(" ").slice(0, 2).map((n) => n[0]).join("")}</span>
              )}
              <b>{pos}</b>
            </div>
            <span className="pw-nome">{p.name}</span>
            <strong className={`pw-valor pw-pos${pos}`}>{fmtDinheiro(vendasNo(p, periodo), d.curtos)}</strong>
            {/* `pedidos: true` — "119 vendas" sob o valor; `degrau: "lugar"` —
                "1º LUGAR" escrito no pedestal. As duas opções do painel comercial. */}
            {w.opcoes.pedidos === true && (
              <span className="pw-podio-vendas">{fmtNum(Math.round(p.orders?.[periodo] ?? 0))} vendas</span>
            )}
            <div className={`pw-base pw-pos${pos}`} style={{ height: alturas[pos] }}>
              {w.opcoes.degrau === "lugar"
                ? <span className="pw-base-rotulo">{pos}º LUGAR</span>
                : <span className="pw-base-num" aria-hidden>{pos}</span>}
            </div>
          </div>
        );
      })}
      {ordem.length === 0 && <span className="pw-vazio">sem vendedores</span>}
    </div>
  );
}

function Ranking({ w, d }: { w: Widget; d: DadosPainel }) {
  const periodo = usePeriodo(w.opcoes);
  const limite = Number(w.opcoes.linhas ?? 6);
  // O painel antigo mostrava a contagem de vendas ao lado do faturamento —
  // é o que diz se o número veio de um pedido grande ou de muitos pedidos.
  // Mantido por padrão para não perder informação em quem migrar de layout.
  const comPedidos = w.opcoes.pedidos !== false;
  /**
   * Quantos colocados PULAR no começo.
   *
   * Existe para a tabela viver ao lado de um pódio sem repetir gente: o painel
   * clássico faz `slice(3, 10)` justamente porque os três primeiros já estão
   * desenhados na coluna da esquerda. Sem isto, montar a mesma tela com blocos
   * soltos punha os três primeiros nomes duas vezes, lado a lado.
   */
  const pular = Math.max(0, Number(w.opcoes.pular ?? 0));
  const ordenados = [...(comerciais(d))]
    .sort((a, b) => vendasNo(b, periodo) - vendasNo(a, periodo));
  const lista = ordenados.slice(pular, pular + limite);
  const pedidosNo = (p: Salesperson) => Math.round(p.orders?.[periodo] ?? 0);
  /**
   * A DISTÂNCIA para quem está logo acima, no lugar da contagem de vendas.
   *
   * Num placar de parede, o total sozinho premia quem já está na frente e não
   * diz nada a quem está atrás. "Faltam R$ 1.200" é a informação que muda o
   * comportamento de quem lê — é a razão de existir um ranking na parede em
   * vez de num relatório. O 1º lugar mostra a vantagem sobre o 2º.
   */
  const gap = w.opcoes.gap === true;
  // A distância olha a lista INTEIRA, não a fatia visível: quem abre a tabela
  // no 4º lugar precisa saber quanto falta para o 3º, que está no pódio ao
  // lado — e não para o 5º, que é quem vem depois dele na tela.
  const distancia = (i: number) => {
    const absoluto = pular + i;
    const meu = vendasNo(ordenados[absoluto], periodo);
    const acima = ordenados[absoluto - 1];
    if (!acima) {
      const abaixo = ordenados[absoluto + 1];
      return abaixo ? `+${fmtDinheiro(meu - vendasNo(abaixo, periodo), d.curtos)}` : "—";
    }
    return fmtDinheiro(vendasNo(acima, periodo) - meu, d.curtos);
  };
  /*
   * Todos no pódio → no lugar do "só 3 no ranking" entram os CANAIS (Yampi,
   * Carrinho Ab, WhatsApp): faturamento e pedidos do mesmo período das abas.
   * Pedido do dono em 14/09/2026. Vem pronto do servidor (`canaisVenda`).
   */
  const canais = d.sales?.tridify?.canaisVenda ?? [];
  const mostraCanais = lista.length === 0 && pular > 0 && canais.length > 0;
  const janela = periodo === "daily" ? "dia" : periodo === "weekly" ? "semana" : "mes";
  const canaisOrdenados = [...canais].sort((a, b) => b[janela].valor - a[janela].valor);
  const quartaColuna = comPedidos || gap || mostraCanais;

  return (
    // Piso de 7 faixas (cabeçalho + 6): com poucos nomes a linha fica do tamanho
    // de sempre, presa no alto, em vez de esticar e deixar um vão no meio.
    <div className="pw-tabela" style={{ "--linhas": Math.max(lista.length + 1, 7) } as React.CSSProperties}>
      <div className={`pw-linha pw-cabecalho ${quartaColuna ? "com-pedidos" : ""}`}>
        <span>#</span>
        {/* "Vendedor" como na TV nativa (a referência, 25/09/2026). */}
        <span>{mostraCanais ? "Canal" : "Vendedor"}</span>
        <span className="pw-dir">Faturamento</span>
        {quartaColuna && <span className="pw-dir">{mostraCanais ? "Pedidos" : gap ? "Falta" : "Vendas"}</span>}
      </div>
      {lista.map((p, i) => (
        <div key={p.id} className={`pw-linha ${quartaColuna ? "com-pedidos" : ""}`}>
          {/* A posição é a REAL, não a da fatia: pulando três, a primeira linha
              é o 4º colocado — numerá-la como 1 seria inventar um campeão. */}
          <span><b className="pw-pos-num">{pular + i + 1}</b></span>
          <span className="pw-trunc">{p.name}</span>
          <span className="pw-dir pw-destaque">{fmtDinheiro(vendasNo(p, periodo), d.curtos)}</span>
          {quartaColuna && (
            <span className={`pw-dir ${gap && i === 0 ? "pw-lider" : ""}`}>
              {gap ? distancia(i) : fmtNum(pedidosNo(p))}
            </span>
          )}
        </div>
      ))}
      {/* Pulando os do pódio, "sem vendedores" seria mentira: existem, e estão
          desenhados no bloco ao lado. A frase muda conforme o motivo do vazio —
          um quadro vazio na parede sempre parece defeito até dizer por quê. */}
      {mostraCanais && canaisOrdenados.map((c, i) => (
        <div key={c.nome} className="pw-linha com-pedidos">
          <span><b className="pw-pos-num">{i + 1}</b></span>
          <span className="pw-trunc">{c.nome}</span>
          <span className="pw-dir pw-destaque">{fmtDinheiro(c[janela].valor, d.curtos)}</span>
          <span className="pw-dir">{fmtNum(c[janela].pedidos)}</span>
        </div>
      ))}
      {lista.length === 0 && !mostraCanais && (
        <span className="pw-vazio">
          {ordenados.length === 0
            ? "sem vendedores"
            : pular > 0
              ? `só ${ordenados.length} no ranking — todos no pódio`
              : "sem vendas no período"}
        </span>
      )}
    </div>
  );
}

/**
 * Batalha Comercial × Marketing — PLACAR (25/09/2026).
 *
 * Placar de dois lados com a diferença no meio, e cada lado é um mini-painel
 * executivo: valor, progresso contra a meta DO TIME (`Team.goal`, quando
 * existe; sem meta, a fatia do total) e pedidos. Quem lidera ganha borda e selo
 * na cor da casa — sem gradiente, sem cara de jogo. Time que bateu a meta ganha
 * o selo "Meta batida" (o estado de vitória); quem está atrás fica neutro, não
 * vermelho — atrás na batalha não é prejuízo.
 *
 * Números contam até o valor novo (`useNumeroFluido`) só quando o dado muda.
 * Espelho: `Batalha` no Widgets.kt da TV.
 */
function Batalha({ d }: { d: DadosPainel }) {
  const mkt = d.sales?.teams.find((t) => t.id === "marketing");
  const com = d.sales?.teams.find((t) => t.id === "comercial");
  const a = mkt?.current ?? 0;
  const b = com?.current ?? 0;
  const total = Math.max(1, a + b);
  const pa = (a / total) * 100;
  const t = d.sales?.tridify;
  const empate = a === b;
  const liderA = a >= b;
  const times = [
    { id: "mkt", nome: mkt?.name ?? "Marketing", icone: "speakerphone" as const, v: a, meta: mkt?.goal ?? 0, ped: t?.pedidosTrafego, fatia: pa, lider: !empate && liderA },
    { id: "com", nome: com?.name ?? "Comercial", icone: "users" as const, v: b, meta: com?.goal ?? 0, ped: t?.comercialPedidos, fatia: 100 - pa, lider: !empate && !liderA },
  ];
  const diff = useNumeroFluido(Math.abs(a - b)) ?? 0;
  const nomeLider = liderA ? times[0].nome : times[1].nome;
  return (
    <div className="pw-batalha pw-placar">
      <div className="pw-placar-lados">
        <LadoDoPlacar x={times[0]} curtos={d.curtos} />
        <div className="pw-placar-meio" aria-hidden={empate}>
          <span className="pw-placar-x">×</span>
          <span className="pw-placar-dif-rot">{empate ? "Empate" : "Diferença"}</span>
          {!empate && <strong className="pw-placar-dif">{fmtDinheiro(diff, d.curtos)}</strong>}
        </div>
        <LadoDoPlacar x={times[1]} curtos={d.curtos} />
      </div>
      {/* Cabo: fatia de cada time no total. `data-lider` diz qual lado é cheio. */}
      <div className="pw-cabo" data-lider={liderA ? "a" : "b"}>
        <div className="pw-cabo-a" style={{ width: `${pa}%` }} />
        <div className="pw-cabo-b" style={{ width: `${100 - pa}%` }} />
      </div>
      <div className="pw-batalha-fim">
        <Icon name="crown" size={18} color="currentColor" />
        {empate ? <span>Empate técnico</span> : (
          <>
            <span>{nomeLider} lidera por</span>
            <strong>+ {fmtDinheiro(diff, d.curtos)}</strong>
          </>
        )}
      </div>
    </div>
  );
}

type LadoPlacar = { id: string; nome: string; icone: "speakerphone" | "users"; v: number; meta: number; ped?: number | null; fatia: number; lider: boolean };

/** Um lado do placar. Com meta do time: barra de progresso; sem: fatia do total. */
function LadoDoPlacar({ x, curtos }: { x: LadoPlacar; curtos?: boolean }) {
  const valor = useNumeroFluido(x.v) ?? x.v;
  const temMeta = x.meta > 0;
  const pctMeta = temMeta ? (x.v / x.meta) * 100 : 0;
  const bateu = temMeta && pctMeta >= 100;
  const p1 = (n: number) => `${n.toFixed(n >= 100 ? 0 : 1).replace(".", ",")}%`;
  return (
    <div className="pw-time" data-lider={x.lider ? "1" : "0"} data-bateu={bateu ? "1" : "0"}>
      <div className="pw-time-topo">
        <span className="pw-selo"><Icon name={x.icone} size={22} color="currentColor" /></span>
        <span className="pw-rotulo pw-trunc">{x.nome}</span>
        {bateu ? (
          <span className="pw-time-pilula" data-tom="ok"><Icon name="circle-check" size={14} color="currentColor" />Meta batida</span>
        ) : x.lider ? (
          <span className="pw-time-pilula"><Icon name="crown" size={14} color="currentColor" />Lidera</span>
        ) : null}
      </div>
      <strong className="pw-numero">{fmtDinheiro(valor, curtos)}</strong>
      <div className="pw-time-meta">
        <div className="pw-time-trilho">
          <div className="pw-time-barra" style={{ transform: `scaleX(${Math.min(1, (temMeta ? pctMeta : x.fatia) / 100)})` }} />
        </div>
        <span className="pw-time-sub">
          {temMeta
            ? <><b>{p1(pctMeta)}</b> da meta · {fmtDinheiro(x.meta, curtos)}</>
            : <><b>{p1(x.fatia)}</b> do total</>}
          {x.ped != null ? ` · ${fmtNum(x.ped)} pedidos` : ""}
        </span>
      </div>
    </div>
  );
}

function Produtos({ w, d }: { w: Widget; d: DadosPainel }) {
  const limite = Number(w.opcoes.linhas ?? 5);
  /**
   * "Mais vendidos" é por QUANTIDADE — é o que o painel sempre mostrou e é o
   * que o título promete. A receita por produto existe no contrato, mas veio
   * zerada por muito tempo (a consulta não trazia o preço do item); por isso o
   * padrão é quantidade e a receita só aparece quando de fato existe.
   *
   * Ordem, barra e número seguem SEMPRE a mesma métrica. Ordenar por uma e
   * medir por outra faz a lista parecer fora de ordem — o segundo item com a
   * barra maior que o primeiro.
   */
  const porReceita = w.opcoes.metrica === "receita";
  const valorDe = (p: { qty: number; revenue: number }) => (porReceita ? p.revenue : p.qty);
  const lista = [...(d.sales?.topProducts ?? [])]
    .sort((a, b) => valorDe(b) - valorDe(a))
    .slice(0, limite);
  const max = Math.max(1, ...lista.map(valorDe));
  // Receita zerada em tudo: mostrar "R$ 0" seis vezes é pior que só a contagem.
  const temReceita = lista.some((p) => p.revenue > 0);

  /*
   * A POSIÇÃO, a FOTO e a unidade voltaram.
   *
   * Quando a tela de produtos virou bloco, ela perdeu as três — e o que sobrou
   * foi uma lista de nomes com uma barrinha do lado, que não é uma tela de
   * parede: ninguém a três metros lê seis nomes de produto em fila. A foto é o
   * que se reconhece de longe (é o produto que a pessoa acabou de embalar), o
   * número da posição é o que faz a lista virar RANKING, e "un." é o que
   * impede "1.240" de ser lido como reais.
   *
   * A segunda linha de cada produto mostra a outra metade do dado: vendeu
   * MUITO ou vendeu CARO. Só aparece quando a receita de fato veio — durante
   * muito tempo ela chegou zerada, e "R$ 0" ao lado de 300 unidades é pior que
   * a ausência.
   */
  return (
    /*
     * `--linhas` deixa o CSS dividir a altura pelo número de produtos.
     *
     * A fonte media a altura do BLOCO inteiro, o que servia quando cada linha
     * era um nome e uma barrinha. Com foto e duas linhas de texto, seis
     * produtos passaram a pedir três vezes mais altura do que havia — as
     * fotos saíram com 166px e a lista transbordou o cartão. Dividindo pelo
     * número de linhas, três produtos ficam grandes e oito ficam compactos,
     * sem nenhum número mágico no meio.
     */
    <div className="pw-produtos" style={{ ["--linhas" as string]: lista.length || 1 }}>
      {lista.map((p, i) => (
        <div key={p.id} className="pw-produto">
          <span className="pw-produto-pos">{i + 1}</span>
          <ProdutoFoto nome={p.name} url={p.imageUrl} />
          <span className="pw-produto-corpo">
            <span className="pw-produto-nome pw-trunc">{p.name}</span>
            <span className="pw-barra pw-barra-fina">
              <span className="pw-barra-fill" style={{ width: `${(valorDe(p) / max) * 100}%` }} />
            </span>
          </span>
          <span className="pw-produto-num">
            <strong>
              {porReceita && temReceita ? fmtDinheiro(p.revenue, d.curtos) : fmtNum(p.qty)}
            </strong>
            <em>
              {porReceita && temReceita
                ? `${fmtNum(p.qty)} un.`
                : temReceita
                  ? fmtDinheiro(p.revenue, d.curtos)
                  : "unidades"}
            </em>
          </span>
        </div>
      ))}
      {lista.length === 0 && <span className="pw-vazio">sem produtos</span>}
    </div>
  );
}

/** A miniatura do produto — ou a caixa, quando o cadastro não tem foto. */
function ProdutoFoto({ nome, url }: { nome: string; url: string | null }) {
  if (url) {
    return (
      <span className="pw-produto-foto">
        <Image src={url} alt={nome} width={96} height={96} unoptimized />
      </span>
    );
  }
  return (
    <span className="pw-produto-foto pw-produto-sem">
      <Icon name="package" size={20} />
    </span>
  );
}

function Trafego({ d }: { d: DadosPainel }) {
  // Os quatro números vêm prontos do Tridify. Recalcular aqui foi o que fez a
  // TV mostrar um ROAS e o relatório outro — mesma palavra, réguas diferentes.
  const cards = (["receita_paga", "gasto_trafego", "roas", "cpa"] as const).map((m, i) => ({
    r: ["Receita", "Investimento", "ROAS", "CPA"][i],
    v: valorDaMetrica(m, d).valor,
  }));
  return (
    <div className="pw-cards">
      {cards.map((c) => (
        <div key={c.r} className="pw-card">
          <span className="pw-rotulo">{c.r}</span>
          <strong className="pw-numero">{c.v}</strong>
        </div>
      ))}
    </div>
  );
}

/**
 * De onde vem o faturamento — as fatias que somam o total do mês.
 *
 * Existe porque a pergunta "a Vega está entrando?" só tinha resposta lendo o
 * código: na parede a Vega vivia somada dentro de "tráfego". Uma fatia que
 * ninguém vê é uma fatia que pode sumir sem ninguém notar.
 *
 * Duas decisões que evitam que este bloco vire mais uma régua:
 *  • as fatias vêm do Tridify e a barra é desenhada sobre a SOMA DELAS, não
 *    sobre o total do mês. Se algum dia divergirem, a barra fica curta e a
 *    diferença aparece — em vez de a tela normalizar o erro para 100%.
 *  • marketplace é uma fatia como as outras: desde 01/09/2026 ele ENTRA no
 *    faturamento da empresa (pedido do dono), e a barra tem que somar o total.
 */
function Composicao({ d }: { d: DadosPainel }) {
  const t = d.sales?.tridify;
  if (!t) return <div className="pw-vazio">sem dados do Tridify</div>;

  /*
   * Os MESMOS CANAIS do cartão "Faturamento total da empresa" do Tridify.
   *
   * A parede agregava a loja Yampi e a Vega numa fatia só chamada "Tráfego", e
   * jogava a Vega num rodapé de nota. Quem confere a TV contra a tela do
   * computador via "Tráfego R$ 88.637" de um lado e "Yampi tráfego R$ 43.053 +
   * Vega R$ 45.583" do outro, sem nada dizendo que são a mesma coisa. Agora a
   * discriminação é a mesma, na mesma ordem, com a contagem de pedidos —
   * inclusive a loja no rótulo ("· Carimbos Tridi"), como no cartão.
   *
   * Os valores vêm PRONTOS do snapshot (`painel-tridify`), já líquidos do
   * upsell que mora dentro do Comercial: somados, dão exatamente o total. A
   * tela não refaz conta nenhuma — era de onde vinham as divergências.
   */
  const trafego = t.yampiTrafego ?? Math.max(0, t.faturamentoEmpresa - t.organico - t.comercial - (t.vega ?? 0) - (t.marketplace ?? 0));
  /*
   * Quatro DEGRAUS DE TINTA, não quatro cores.
   *
   * Azul, roxo e verde numa barra de 14% da altura do bloco é o arco-íris que
   * ninguém separa a três metros — e a cor aqui não carrega dado nenhum: quem
   * diz de quem é cada fatia é a linha embaixo, com nome, valor e percentual.
   * Em tinta, o que o olho lê de longe é a PROPORÇÃO, que é a pergunta do
   * bloco. Cor fica reservada ao que precisa de ação (o semáforo das metas).
   */
  const tinta = (pct: number) => `color-mix(in srgb, var(--p-primaria, #6c4cf0) ${pct}%, var(--p-trilho, #eae8f4))`;
  const loja = t.fonteTrafego ? ` · ${t.fonteTrafego}` : "";
  const fatias = [
    { r: `Yampi tráfego${loja}`, v: trafego, n: t.yampiTrafegoPedidos ?? 0, cor: tinta(100) },
    { r: "Yampi orgânica", v: t.organico, n: t.organicoPedidos ?? 0, cor: tinta(74) },
    { r: "Comercial", v: t.comercial, n: t.comercialPedidos ?? 0, cor: tinta(52) },
    { r: "Vega Checkout", v: t.vega ?? 0, n: t.vegaPedidos ?? 0, cor: tinta(32) },
    // Marketplace entra no total desde 01/09/2026: fatia própria, dentro da barra.
    { r: "Marketplace", v: t.marketplace ?? 0, n: t.marketplacePedidos ?? 0, cor: tinta(24) },
    // Só aparece se alguém reclassificar uma origem na tela de Fontes — sem
    // ela a soma das linhas ficaria menor que o total.
    { r: "Outras origens", v: t.outras ?? 0, n: 0, cor: tinta(14) },
  ].filter((f) => f.v > 0);
  const soma = fatias.reduce((s, f) => s + f.v, 0) || 1;

  return (
    <div className="pw-comp">
      <div className="pw-comp-barra">
        {fatias.map((f) => (
          <span key={f.r} style={{ width: `${(f.v / soma) * 100}%`, background: f.cor }} />
        ))}
      </div>
      <div className="pw-comp-linhas">
        {fatias.map((f) => (
          <div key={f.r} className="pw-comp-item">
            <span className="pw-comp-ponto" style={{ background: f.cor }} />
            <span className="pw-rotulo">{f.r}</span>
            <strong className="pw-numero">{fmtDinheiro(f.v, d.curtos)}</strong>
            {/* A contagem de pedidos, como no cartão: "R$ 43.053 · 267". Sem
                ela, dois canais de valor parecido escondem que um deles fez
                três vezes mais pedidos com ticket menor. */}
            {f.n > 0 && <span className="pw-comp-pct">· {fmtNum(f.n)}</span>}
            <span className="pw-comp-pct">{Math.round((f.v / soma) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "05/ago" a partir de `YYYY-MM-DD`, sem passar por `Date` (fuso não interfere). */
function diaCurto(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${MESES[Number(m) - 1] ?? ""}`;
}

/**
 * O chão de fábrica: peças, fila e quem está produzindo.
 *
 * Duas decisões que vêm de como a parede é lida, não de como o dado é:
 *  • quando o turno ainda não começou, mostra o ÚLTIMO dia com movimento e diz
 *    qual — uma tela de zeros às 6h se lê como "a fábrica parou";
 *  • ordem impedida tem destaque próprio. É o único número aqui que pede ação
 *    de alguém agora; somado a "pendentes" ele desaparece.
 */
function Producao({ w, d }: { w: Widget; d: DadosPainel }) {
  const p = d.producao;
  if (p === undefined) return <div className="pw-vazio">carregando produção…</div>;
  if (p === null) return <div className="pw-vazio">produção indisponível</div>;

  /**
   * `linhas: 0` = só os números, sem a fila de nomes.
   *
   * Serve para o bloco virar a FAIXA de métricas do topo quando quem mostra as
   * pessoas embaixo é o cartão do bloco `pessoas` — repetir os mesmos nomes em
   * dois lugares da mesma tela só rouba altura de ambos.
   */
  const linhas = Number(w.opcoes.linhas ?? 5);
  const cards: { r: string; v: string; alerta?: boolean }[] = [
    { r: "Peças", v: fmtNum(p.pecasHoje) },
    { r: "Concluídas", v: fmtNum(p.concluidasHoje) },
    // Rótulo curto de propósito: são 5 ou 6 cards dividindo a largura, e
    // "Em andamento" virava "EM ANDAME…" — rótulo cortado não informa nada.
    { r: "Andamento", v: fmtNum(p.emAndamento) },
    { r: "Fila", v: fmtNum(p.pendentes) },
    // "36 min" com espaço quebrava o card; o número é o que se lê de longe.
    { r: "TMA", v: p.tmaMin == null ? "—" : `${p.tmaMin}min` },
  ];
  if (p.impedidas > 0) cards.push({ r: "Impedidas", v: fmtNum(p.impedidas), alerta: true });

  return (
    <div className="pw-prod">
      {!p.ehHoje && (
        <span className="pw-prod-dia">
          <Icon name="clock" size={12} /> turno de {diaCurto(p.dia)} — hoje ainda sem movimento
        </span>
      )}
      <div className="pw-prod-cards">
        {cards.map((c) => (
          <div key={c.r} className={`pw-prod-card${c.alerta ? " pw-prod-alerta" : ""}`}>
            <span className="pw-rotulo">{c.r}</span>
            <strong className="pw-numero">{c.v}</strong>
          </div>
        ))}
      </div>
      <div className="pw-prod-time" hidden={linhas <= 0}>
        {p.operadores.slice(0, Math.max(0, linhas)).map((o) => (
          <div key={o.id} className="pw-prod-op">
            {o.fotoUrl ? (
              <Image src={o.fotoUrl} alt="" width={64} height={64} className="pw-prod-foto" unoptimized />
            ) : (
              <span className="pw-prod-foto pw-prod-sem" aria-hidden />
            )}
            <span className="pw-prod-nome">{o.nome}</span>
            <span className="pw-prod-pecas">{fmtNum(o.pecas)} pç</span>
            {/* Produtividade sem alvo é "—", nunca 0%: ver `resumirProducao`. */}
            <span className="pw-prod-pct">{o.produtividade == null ? "—" : `${o.produtividade}%`}</span>
            <span className="pw-prod-tma">{o.tmaMin == null ? "—" : `${o.tmaMin} min`}</span>
          </div>
        ))}
        {p.operadores.length === 0 && <span className="pw-vazio">ninguém produziu ainda</span>}
      </div>
    </div>
  );
}

/** "3h20" ou "45min" — na parede, "200 min" obriga a pessoa a fazer conta. */
function duracao(min: number | null | undefined): string {
  if (min == null) return "—";
  if (min < 60) return `${Math.round(min)}min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

/**
 * O cartão de cada pessoa — foto, o que fez e como usou o tempo.
 *
 * A tela existe para expor o trabalho, então ela precisa ser exata sobre o que
 * cada número é:
 *
 *  • ATIVIDADE é tempo cronometrado dentro de ordem (início → conclusão).
 *  • FORA é presença no ponto menos atividade. Ele NÃO é "tempo perdido":
 *    reunião, limpeza, espera de insumo e — principalmente — trabalho feito sem
 *    abrir a ordem no tablet caem todos aqui. Por isso o rótulo é "fora de
 *    atividade" e não "ocioso": o dado não sabe a diferença entre quem parou e
 *    quem esqueceu de apertar o botão, e a parede não pode fingir que sabe.
 *  • Sem ponto vinculado, os dois tempos somem em vez de virar zero. Zero seria
 *    uma acusação inventada.
 */
function Pessoas({ w, d }: { w: Widget; d: DadosPainel }) {
  const p = d.producao;
  if (p === undefined) return <div className="pw-vazio">carregando pessoas…</div>;
  if (p === null) return <div className="pw-vazio">produção indisponível</div>;
  if (p.operadores.length === 0) return <div className="pw-vazio">ninguém produziu ainda</div>;

  const quantos = Math.max(1, Number(w.opcoes.cartoes) || 4);
  return (
    <div className="pw-pessoas">
      {p.operadores.slice(0, quantos).map((o) => {
        const incompletas = o.emAndamento + o.pendentes;
        return (
          <div key={o.id} className="pw-pessoa">
            <div className="pw-pessoa-topo">
              {o.fotoUrl ? (
                <Image src={o.fotoUrl} alt="" width={96} height={96} className="pw-pessoa-foto" unoptimized />
              ) : (
                <span className="pw-pessoa-foto pw-prod-sem" aria-hidden />
              )}
              <div className="pw-pessoa-id">
                <strong>{o.nome}</strong>
                <span>
                  {fmtNum(o.pecas)} pç · {o.concluidas} {o.concluidas === 1 ? "feita" : "feitas"}
                  {incompletas > 0 && ` · ${incompletas} em aberto`}
                </span>
              </div>
              {/* Produtividade sem alvo é "—", nunca 0%. */}
              <strong className={`pw-pessoa-pct${o.produtividade != null && o.produtividade < 70 ? " pw-pessoa-baixo" : ""}`}>
                {o.produtividade == null ? "—" : `${o.produtividade}%`}
              </strong>
            </div>
            <div className="pw-pessoa-tempos">
              <span><em>atividade</em>{duracao(o.emAtividadeMin)}</span>
              <span><em>fora de atividade</em>{duracao(o.ociosoMin)}</span>
              <span><em>média por ordem</em>{duracao(o.tmaMin)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A fila da expedição — onde os pedidos estão parados AGORA.
 *
 * Faixa e não lista: numa doca, quem passa quer ver de longe qual etapa está
 * inchada, não ler quatro linhas. A largura de cada pedaço é a proporção, e o
 * número vem escrito porque proporção sozinha não diz se são 6 ou 600.
 *
 * As cores vêm da própria rota (`var(--ok)`, `var(--perigo)`…), que é como o
 * ERP já pinta essas etapas — a TV não inventa uma segunda convenção.
 */
function Expedicao({ d }: { d: DadosPainel }) {
  const e = d.expedicao;
  if (e === undefined) return <div className="pw-vazio">carregando expedição…</div>;
  if (e === null) return <div className="pw-vazio">expedição indisponível</div>;

  const cats = e.categorias.filter((c) => c.valor > 0);
  const soma = cats.reduce((s, c) => s + c.valor, 0) || 1;
  if (cats.length === 0) return <div className="pw-vazio">fila vazia — nada parado</div>;

  return (
    <div className="pw-exp">
      <div className="pw-exp-barra">
        {cats.map((c) => (
          <span key={c.chave} style={{ width: `${(c.valor / soma) * 100}%`, background: c.cor }} />
        ))}
      </div>
      <div className="pw-exp-legenda">
        {cats.map((c) => (
          <span key={c.chave} className="pw-exp-item">
            <i style={{ background: c.cor }} />
            {c.rotulo}
            <strong>{fmtNum(c.valor)}</strong>
            {/* Variação só quando existe histórico: seta sem base é adivinhação. */}
            {c.anterior != null && c.anterior !== c.valor && (
              <em className={c.valor > c.anterior ? "pw-exp-sobe" : "pw-exp-desce"}>
                <Icon name={c.valor > c.anterior ? "trending-up" : "trending-down"} size={16} className="pw-seta" />
                {Math.abs(c.valor - c.anterior)}
              </em>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function Relogio({ w }: { w: Widget }) {
  const agora = new Date();
  // `formato: "mes"` — só "Setembro 2026": o selo de período do painel
  // comercial, que não precisa do dia nem da hora.
  const soMes = w.opcoes.formato === "mes";
  const mes = MESES[agora.getMonth()];
  const data = soMes
    ? `${MESES_LONGOS[agora.getMonth()]} ${agora.getFullYear()}`
    : `${String(agora.getDate()).padStart(2, "0")} de ${mes} de ${agora.getFullYear()}`;
  const hora = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  const mostrarHora = w.opcoes.hora !== false && !soMes;
  return (
    <div className="pw-relogio">
      <Icon name="calendar" size={18} />
      <span>{data}</span>
      {mostrarHora && <strong>{hora}</strong>}
    </div>
  );
}

function Logo({ d }: { d: DadosPainel }) {
  const url = d.config.theme.logoUrl;
  return url ? (
    <div className="pw-logo">
      <Image src={url} alt="logo" width={240} height={80} unoptimized />
    </div>
  ) : (
    <div className="pw-logo pw-logo-texto">Tridi</div>
  );
}

function Texto({ w }: { w: Widget }) {
  const t = String(w.opcoes.texto ?? "");
  const tam = String(w.opcoes.tamanho ?? "titulo");
  return <div className={`pw-texto pw-texto-${tam}`}>{t}</div>;
}

/* ── As telas CLÁSSICAS, como bloco ──────────────────────────────────────── */

/**
 * O palco das telas clássicas: a TELA de quiosque inteira, 1280×720, com o
 * mesmo respiro de 48×64 que o `KioskShell` põe em volta do slide.
 *
 * Elas nasceram em pixels fixos para esse palco — e é justamente isso que as
 * deixa bonitas: a proporção entre o título de 38px, a foto do pódio de 104px e
 * o degrau de 120px foi decidida a olho, não emergiu de uma regra. Reescrever
 * cada medida em unidade de container seria refazer a tela e perder no caminho
 * exatamente aquilo que se quer preservar.
 *
 * Então o palco é montado no tamanho de projeto e o conjunto inteiro é escalado
 * por `transform` até caber na célula — que pode ser a TV toda ou o quadradinho
 * de 380px da prévia do editor.
 *
 * É a tela inteira, e não a área útil de 1152×624, porque o slide clássico
 * TRANSBORDA a área útil: o ranking ocupa 689px de altura numa faixa de 624 e
 * invade o respiro em cima e embaixo. Na parede isso nunca incomodou (não há
 * nada ali para recortar), mas dentro de uma célula da grade o rodapé
 * "Faturamento · Pedidos · % da meta" sumia. Adotando a tela como palco, o
 * transbordo mora DENTRO do palco e nada é cortado em lugar nenhum — nem na
 * prévia do editor, que é miniatura da mesma caixa.
 *
 * A medida é FIXA de propósito, por dois motivos. Medir a altura do conteúdo
 * parecia mais esperto e era pior: o ranking clássico troca de período sozinho
 * a cada 7s, a altura mudava junto e a tela inteira dava um pulinho de escala a
 * cada troca. E a altura medida MENTE — o pódio desenha fora da própria caixa,
 * então `offsetHeight` devolve 509 para um slide que ocupa 689.
 */
const PALCO_CLASSICO = { largura: 1280, altura: 720 };

type TipoClassico =
  | "classico-ranking"
  | "classico-batalha"
  | "classico-financeiro"
  | "classico-trafego"
  | "classico-produtos";

function Classico({ tipo, d }: { tipo: TipoClassico; d: DadosPainel }) {
  const fora = useRef<HTMLDivElement>(null);
  // Começa em 0 e só desenha depois de medir: um quadro com a tela em tamanho
  // de projeto dentro de uma célula pequena é um estouro visível.
  const [pos, setPos] = useState({ k: 0, x: 0, y: 0 });

  /**
   * A polegada entra ENCOLHENDO o palco, não multiplicando a escala.
   *
   * Multiplicar `k` faria a tela crescer para fora da célula. Com o palco menor,
   * o mesmo desenho é montado num espaço menor e depois ampliado para a célula
   * toda — o texto fica maior em relação à tela e continua cabendo, que é o que
   * "TV de 65 polegadas" precisa significar. O que sobra para fora nesse caso é
   * a margem do palco, porque o slide clássico é centrado dentro dele.
   */
  const esc = escalaPorPolegadas(d.polegadas ?? 50);
  const largura = Math.round(PALCO_CLASSICO.largura / esc);
  const altura = Math.round(PALCO_CLASSICO.altura / esc);

  useEffect(() => {
    const caixa = fora.current;
    if (!caixa) return;
    const medir = () => {
      // `offsetWidth`/`offsetHeight`, nunca `getBoundingClientRect`: o rect já
      // vem com o `transform` aplicado — o nosso e o da prévia do editor —, e
      // medir por ele realimentaria a própria escala a cada passada.
      const cx = caixa.offsetWidth;
      const cy = caixa.offsetHeight;
      if (!cx || !cy) return;
      const k = Math.min(cx / largura, cy / altura);
      // Centrar é conta nossa, com `translate`.
      //
      // Deixar o CSS centrar não funciona: um item MAIOR que a área (o palco de
      // 1280×720 numa célula de 709×384) cai no "safe alignment" — o navegador
      // desiste de centrar e encosta no início para não esconder o começo do
      // conteúdo. O `scale` depois disso mantinha o centro no lugar errado e o
      // palco nascia 168px abaixo da célula, cortando o rodapé do ranking.
      setPos({ k, x: (cx - largura * k) / 2, y: (cy - altura * k) / 2 });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(caixa);
    return () => ro.disconnect();
  }, [largura, altura]);

  const s = d.sales;
  return (
    <div ref={fora} className="pw-classico">
      <div
        className="pw-classico-palco"
        style={{
          width: largura,
          height: altura,
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${pos.k})`,
        }}
      >
        {!s ? (
          <span className="pw-vazio">sincronizando…</span>
        ) : tipo === "classico-ranking" ? (
          <RankingSlide sales={s} config={d.config} curtos={d.curtos} />
        ) : tipo === "classico-batalha" ? (
          <RocketSlide sales={s} config={d.config} curtos={d.curtos} />
        ) : tipo === "classico-financeiro" ? (
          <MetricsSlide sales={s} config={d.config} curtos={d.curtos} />
        ) : tipo === "classico-trafego" ? (
          <TrafficSlide sales={s} config={d.config} curtos={d.curtos} />
        ) : (
          <ProductsSlide sales={s} />
        )}
      </div>
    </div>
  );
}

/* ── As PEÇAS das telas clássicas, soltas ────────────────────────────────── */

/**
 * "FULANA LIDERA POR + R$ 3.525".
 *
 * O total sozinho premia quem já está na frente; a DISTÂNCIA é o que diz algo a
 * quem está atrás — e é a única frase da tela que muda de dono no meio do mês.
 * Vivia presa dentro do slide de ranking; solta, cabe embaixo de um pódio, ao
 * lado de uma tabela, ou sozinha numa faixa.
 */
function Lidera({ w, d }: { w: Widget; d: DadosPainel }) {
  const periodo = usePeriodo(w.opcoes);
  const lista = [...(comerciais(d))].sort((a, b) => vendasNo(b, periodo) - vendasNo(a, periodo));
  const primeiro = lista[0];
  const segundo = lista[1];
  if (!primeiro) return <div className="pw-vazio">sem vendedores</div>;
  const dif = segundo ? vendasNo(primeiro, periodo) - vendasNo(segundo, periodo) : vendasNo(primeiro, periodo);
  return (
    <div className="pw-lidera">
      <span className="pw-lidera-selo">
        {/* Estrela, e não a seta de tendência: a seta diz "está subindo", que é
            outra afirmação — a liderança pode crescer com o time inteiro caindo.
            A estrela diz DESTAQUE, que é o que a frase ao lado conta. */}
        <Icon name="star" size={22} color="currentColor" />
      </span>
      <span className="pw-lidera-corpo">
        <span className="pw-rotulo pw-trunc">{primeiro.name.toUpperCase()} LIDERA POR</span>
        <span className="pw-lidera-linha">
          <strong className="pw-numero">+ {fmtDinheiro(dif, d.curtos)}</strong>
          {/* Sem segundo colocado a frase "à frente do 2º" seria mentira. */}
          <em>{segundo ? "à frente do 2º colocado" : "sozinho na disputa"}</em>
        </span>
      </span>
    </div>
  );
}

/**
 * A faixa da EQUIPE: faturamento, pedidos e quanto da meta o time já fez.
 *
 * A meta do período sai da mensal pela mesma regra do painel clássico (dia =
 * meta ÷ dias do mês, semana = ×7): inventar meta diária separada seria criar
 * um segundo número oficial para a mesma coisa.
 */
function Equipe({ w, d }: { w: Widget; d: DadosPainel }) {
  const periodo = usePeriodo(w.opcoes);
  const lista = comerciais(d);
  const receita = lista.reduce((s, p) => s + vendasNo(p, periodo), 0);
  const pedidos = lista.reduce((s, p) => s + Math.round(p.orders?.[periodo] ?? 0), 0);

  const metaMes = d.config.monthlyRevenueGoal || 0;
  const agora = new Date(Date.now() - 3 * 3600 * 1000);      // fuso de Brasília
  const diasNoMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 0)).getUTCDate();
  const metaPeriodo = periodo === "monthly" ? metaMes : periodo === "weekly" ? (metaMes * 7) / diasNoMes : metaMes / diasNoMes;
  const pct = metaPeriodo > 0 ? (receita / metaPeriodo) * 100 : 0;

  return (
    <div className="pw-equipe">
      <span className="pw-equipe-item">
        <span className="pw-selo pw-equipe-selo"><Icon name="cash" size={24} color="currentColor" /></span>
        <span className="pw-equipe-num">
          <span className="pw-rotulo">Faturamento</span>
          <strong className="pw-numero">{fmtDinheiro(receita, d.curtos)}</strong>
        </span>
      </span>
      <span className="pw-equipe-fio" />
      {w.opcoes.faltam === true ? (
        // "Faltam R$ X" no lugar dos pedidos: é o número que a equipe olha
        // para saber quanto ainda tem de vender. Meta batida diz isso.
        <span className="pw-equipe-item">
          <span className="pw-selo pw-equipe-selo"><Icon name="target-arrow" size={24} color="currentColor" /></span>
          <span className="pw-equipe-num pw-equipe-faltam">
            <span className="pw-rotulo">{metaPeriodo > 0 && receita >= metaPeriodo ? "Meta batida" : "Faltam"}</span>
            <strong className="pw-numero">{fmtDinheiro(Math.max(0, metaPeriodo - receita), d.curtos)}</strong>
          </span>
        </span>
      ) : (
        <span className="pw-equipe-item">
          <span className="pw-selo pw-equipe-selo"><Icon name="shopping-cart" size={24} color="currentColor" /></span>
          <span className="pw-equipe-num">
            <span className="pw-rotulo">Pedidos</span>
            <strong className="pw-numero">{fmtNum(pedidos)}</strong>
          </span>
        </span>
      )}
      {metaPeriodo > 0 && <span className="pw-equipe-fio" />}
      {/* Sem meta definida a barra não aparece — barra vazia se lê como "0%",
          que é uma afirmação sobre o time que o dado não sustenta. */}
      {metaPeriodo > 0 && (
        <span className="pw-equipe-meta">
          <span className="pw-equipe-topo">
            <strong className="pw-pct pw-destaque">{Math.round(pct)}%</strong>
            <span className="pw-rotulo">da meta da equipe</span>
          </span>
          <span className="pw-barra pw-barra-fina">
            <span className="pw-barra-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * A CURVA do mês — o gráfico de área que só existia dentro da tela de tráfego.
 *
 * Um número diz onde se está; a curva diz para onde se vai, e é o que separa
 * "caiu hoje" de "vem caindo há uma semana". Desenha só a série que o servidor
 * de fato manda: métrica sem série devolve vazio em vez de uma linha inventada,
 * porque linha na parede é lida como fato.
 */
function Curva({ w, d }: { w: Widget; d: DadosPainel }) {
  const metrica = String(w.opcoes.metrica ?? "receita_paga") as Metrica;
  const mt = d.sales?.metrics;
  const daReceita = ["faturamento_dia", "faturamento_semana", "faturamento_mes", "faturamento_empresa", "projecao_mes"];
  /*
   * `comparar: "gasto_trafego"` desenha uma SEGUNDA linha, tracejada: o que o
   * anúncio custou por baixo do que ele trouxe.
   *
   * As duas saem da MESMA série diária do Tridify (`serieTrafego`), e não uma
   * de cada fonte: com dias diferentes em cada lado, o eixo de baixo mentiria
   * sobre uma delas — e a leitura do bloco é justamente comparar o formato das
   * duas no mesmo dia.
   *
   * Cada linha tem a PRÓPRIA escala, como no desenho (dois eixos). Numa escala
   * só, um investimento cinco vezes menor vira uma linha rente ao chão e o
   * bloco deixa de responder "o custo acompanhou a venda?", que é a pergunta.
   */
  const comparar = String(w.opcoes.comparar ?? "");
  // Tráfego sempre do Tridify — com ou sem comparação. Ver `serieDaMetrica`.
  const doTrafego = !daReceita.includes(metrica);
  const st = doTrafego ? d.sales?.tridify?.serieTrafego ?? [] : [];
  const serie = st.length >= 2
    ? st.map((x) => ({ day: x.d, value: metrica === "gasto_trafego" ? x.gasto : x.receita }))
    : ((daReceita.includes(metrica) ? mt?.revenueSeries : mt?.trafficSeries) ?? []);
  const serieB = comparar && st.length >= 2 ? st.map((x) => ({ day: x.d, value: x.gasto })) : [];
  if (serie.length < 2) return <div className="pw-vazio">sem série no período</div>;

  /*
   * As duas linhas dividem a MESMA escala. As duas são reais — o que entrou e
   * o que saiu — e escala própria em cada uma foi o erro: normalizadas em
   * separado, um investimento três vezes menor desenhava exatamente a mesma
   * montanha da receita, e o bloco virava a mesma linha traçada duas vezes.
   *
   * Na mesma régua, a DISTÂNCIA entre elas é o retorno. É a única leitura que
   * o bloco precisa entregar de três metros: linhas afastadas, mês bom; linhas
   * se encostando, o anúncio comendo a venda.
   */
  const temB = serieB.length >= 2 && serieB.some((p) => p.value > 0);
  const max = Math.max(...serie.map((p) => p.value), ...(temB ? serieB.map((p) => p.value) : []), 1);
  const passo = 100 / (serie.length - 1);
  // Curva monótona (a mesma de `ui/graficos.tsx`), não segmentos retos: numa
  // série de 30 dias a polilinha vira serrilha a três metros. Monótona porque
  // spline comum passa do ponto — entre um dia forte e um dia zerado ele
  // desenharia um vale abaixo da linha de base, faturamento negativo na parede.
  const pts = serie.map((p, i) => ({ x: i * passo, y: 100 - (p.value / max) * 100 }));
  const linha = caminhoSuave(pts);
  const area = `${linha} L100,100 L0,100 Z`;
  const ultimo = serie[serie.length - 1];
  // A segunda linha só entra quando houve gasto de fato: sem o armazém do Meta
  // ela seria uma linha rente ao zero dizendo "investimento: nada", que é uma
  // afirmação sobre o mês — ver `serieTrafego` em `painel-tridify.ts`.
  const linhaB = temB
    ? caminhoSuave(serieB.map((p, i) => ({ x: i * passo, y: 100 - (p.value / max) * 100 })))
    : "";
  const rotulo = String(w.opcoes.rotulo ?? "") || ROTULO_METRICA[metrica] || "Curva";
  /*
   * A legenda nomeia a SÉRIE, não o cartão.
   *
   * Ela usava o título do bloco, então a linha cheia se apresentava como
   * "Vendas atribuídas × investimento" — o nome do gráfico inteiro colado numa
   * das duas linhas. Quem lê a legenda fica sem saber qual é qual, que é a
   * única coisa que a legenda existe para dizer.
   */
  const rotuloA = String(w.opcoes.rotuloSerie ?? "") || ROTULO_METRICA[metrica] || "Série";
  const rotuloB = String(w.opcoes.rotuloComparar ?? "Investimento");
  // O `id` do gradiente precisa ser único: dois blocos de curva na mesma tela
  // com o mesmo id fazem o segundo pintar com o degradê do primeiro.
  const gid = `pw-curva-${w.id}`;

  return (
    <div className="pw-curva">
      <span className="pw-curva-topo">
        <span className="pw-rotulo pw-trunc">{rotulo}</span>
        {/* Com DUAS séries o último valor sai: solto no canto, sem dizer de
            qual das duas linhas ele é, vira o maior número da tela sem
            responder a nada. Com uma série só ele continua sendo o "hoje". */}
        {!temB && <strong className="pw-curva-fim">{fmtDinheiro(ultimo.value, d.curtos)}</strong>}
      </span>
      <svg className="pw-curva-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <defs>
          {/* `currentColor` herda a tinta da parede pelo `.pw-grade`. Parada de
              gradiente NÃO enxerga a cor de quem referencia o `fill` — só a que
              ela própria herda —, então o degradê tem de nascer dentro do SVG. */}
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* O preenchimento fica embaixo da linha de CIMA (a receita): é a massa
            que o olho lê como "o quanto entrou". Com a área na linha de baixo,
            o investimento pareceria a coisa maior da tela. */}
        <path d={area} fill={`url(#${gid})`} />
        {/* Sem `data-mt="desenhar"`: `.mono-serie` traça com `non-scaling-stroke`
            e o navegador mede o tracejado em PIXELS DE TELA, não em unidades do
            viewBox. Num viewBox de 100 esticado para 900px de parede, o traço
            ficaria cortado em pedaços de 100px pra sempre (medido no Chrome). */}
        <path className="mono-serie" d={linha} />
        {temB && <path className="mono-serie pw-curva-b" d={linhaB} />}
      </svg>
      {temB && (
        <span className="pw-curva-legenda">
          <span><i className="pw-curva-marca" /> {rotuloA}</span>
          <span><i className="pw-curva-marca pw-curva-marca-b" /> {rotuloB}</span>
        </span>
      )}
      {/* A faixa das datas é RESERVADA embaixo do desenho, nunca por cima dele:
          sobreposta, a data do último dia caía em cima do próprio ponto. */}
      <span className="pw-curva-eixo">
        <span>{diaCurto(serie[0].day)}</span>
        <span>{diaCurto(ultimo.day)}</span>
      </span>
    </div>
  );
}

/* ── Blocos que respondem "e daí?" ───────────────────────────────────────── */

/** Hoje no fuso de Brasília, sem depender do relógio do aparelho na parede. */
function hojeBR(): { dia: number; diasNoMes: number } {
  const t = new Date(Date.now() - 3 * 3600 * 1000);
  return {
    dia: t.getUTCDate(),
    diasNoMes: new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(),
  };
}

/** A meta do mês e o que já foi feito — a MESMA base do bloco `meta`. */
function metaDoMes(d: DadosPainel) {
  const meta = d.config.monthlyRevenueGoal || 0;
  const feito = brutoDaMetrica("faturamento_mes", d) ?? 0;
  return { meta, feito };
}

/**
 * A meta do mês em ANEL.
 *
 * Mesma informação da barra, outra forma: a barra quer largura e o anel quer um
 * quadrado. Num canto de 3×3 a barra vira um risco de 40px que não se lê a três
 * metros; o anel usa a caixa inteira. A cor sai do RITMO, igual à barra — o
 * mesmo painel não pode ter dois critérios de "está bom".
 */
function Anel({ w, d }: { w: Widget; d: DadosPainel }) {
  const { meta, feito } = metaDoMes(d);
  const pctReal = meta > 0 ? (feito / meta) * 100 : 0;
  // O arco e o número percorrem o mesmo caminho: o arco pelo `transition` do
  // CSS, o número pela contagem. Um chegando antes do outro é o tipo de detalhe
  // que a pessoa não sabe nomear, mas percebe.
  const pct = useNumeroFluido(meta > 0 ? pctReal : null) ?? 0;
  const porRitmo = w.opcoes.ritmo !== false;
  const faixa: Faixa = !meta ? "neutro" : porRitmo ? faixaPorRitmo(feito, meta) : faixaPorAlvo(feito, meta);
  // Raio 42 num viewBox de 100: sobra a metade da espessura do traço de cada
  // lado, senão o anel nasce cortado nas quatro pontas.
  const r = 42;
  const volta = 2 * Math.PI * r;
  const preenchido = volta * (1 - Math.min(pct, 100) / 100);

  return (
    <div className="pw-anel">
      <svg viewBox="0 0 100 100" className="pw-anel-svg" aria-hidden>
        <circle cx="50" cy="50" r={r} className="pw-anel-trilho" />
        <circle
          cx="50"
          cy="50"
          r={r}
          className={`pw-anel-arco faixa-${faixa}`}
          strokeDasharray={volta}
          strokeDashoffset={preenchido}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span className="pw-anel-centro">
        <strong className={`faixa-${faixa}`}>{meta > 0 ? `${Math.round(pct)}%` : "—"}</strong>
        <span className="pw-rotulo">{String(w.opcoes.rotulo ?? "") || "da meta"}</span>
      </span>
    </div>
  );
}

/**
 * O RITMO do mês: quanto falta por dia para bater a meta.
 *
 * É a pergunta que o número grande nunca responde. "R$ 64 mil de R$ 350 mil"
 * não diz se dá tempo; "faltam 19 dias, R$ 15 mil por dia" diz — e é o que faz
 * alguém mudar o que vai fazer hoje.
 */
function Ritmo({ d }: { d: DadosPainel }) {
  const { meta, feito } = metaDoMes(d);
  if (meta <= 0) return <div className="pw-vazio">defina a meta do mês</div>;

  const { dia, diasNoMes } = hojeBR();
  // Hoje conta: quem olha a parede às 9h ainda tem o dia inteiro pela frente.
  const restam = Math.max(1, diasNoMes - dia + 1);
  const falta = Math.max(0, meta - feito);
  const precisa = falta / restam;
  const mediaAteAgora = feito / Math.max(1, dia);
  // Verde quando o ritmo já praticado dá conta do que falta.
  const faixa: Faixa = falta === 0 ? "ok" : mediaAteAgora >= precisa ? "ok" : mediaAteAgora >= precisa * 0.85 ? "atencao" : "critico";

  return (
    <div className="pw-ritmo">
      <span className="pw-ritmo-col">
        <span className="pw-rotulo">Faltam</span>
        <strong className="pw-numero">{restam}<em>{restam === 1 ? " dia" : " dias"}</em></strong>
      </span>
      <span className="pw-ritmo-col">
        <span className="pw-rotulo">Precisa por dia</span>
        <strong className={`pw-numero faixa-${faixa}`}>{fmtDinheiro(Math.round(precisa), d.curtos)}</strong>
      </span>
      <span className="pw-ritmo-col pw-ritmo-fraco">
        <span className="pw-rotulo">Média até agora</span>
        <strong className="pw-numero">{fmtDinheiro(Math.round(mediaAteAgora), d.curtos)}</strong>
      </span>
    </div>
  );
}

/**
 * A meta de CADA vendedor, contra a dele — não contra o topo do ranking.
 *
 * O ranking premia quem vende mais; este bloco mostra quem está cumprindo o
 * combinado. São coisas diferentes, e a segunda é a que a pessoa controla:
 * quem tem meta menor pode estar 120% e aparecer em último no ranking.
 */
function MetasTime({ w, d }: { w: Widget; d: DadosPainel }) {
  const periodo = usePeriodo(w.opcoes);
  const limite = Math.max(1, Number(w.opcoes.linhas ?? 5));
  // Sem meta definida não há o que medir — e inventar 0% seria acusar a pessoa
  // de algo que o dado não diz.
  const lista = (comerciais(d))
    .filter((p) => (p.goal?.[periodo] ?? 0) > 0)
    .map((p) => ({ p, pct: (vendasNo(p, periodo) / (p.goal[periodo] || 1)) * 100 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, limite);

  if (lista.length === 0) return <div className="pw-vazio">sem metas definidas</div>;

  return (
    <div className="pw-metas">
      {lista.map(({ p, pct }) => (
        <div key={p.id} className="pw-metas-linha">
          <span className="pw-metas-nome pw-trunc">{p.name}</span>
          <span className="pw-barra pw-barra-fina">
            <span
              className={`pw-barra-fill faixa-fundo-${faixaPorRitmo(vendasNo(p, periodo), p.goal[periodo])}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </span>
          <strong className="pw-metas-pct">{Math.round(pct)}%</strong>
        </div>
      ))}
    </div>
  );
}

/**
 * O MELHOR dia do mês — o teto, e há quantos dias ele resiste.
 *
 * Recorde é a única meta que a equipe inventa sozinha: bater o próprio melhor
 * dia é um alvo que ninguém precisa negociar. E "há 9 dias" é o que transforma
 * o número em provocação.
 */
function Recorde({ w, d }: { w: Widget; d: DadosPainel }) {
  const metrica = String(w.opcoes.metrica ?? "faturamento_mes") as Metrica;
  const mt = d.sales?.metrics;
  const daReceita = ["faturamento_dia", "faturamento_semana", "faturamento_mes", "faturamento_empresa", "projecao_mes"];
  const serie = (daReceita.includes(metrica) ? mt?.revenueSeries : mt?.trafficSeries) ?? [];
  if (serie.length === 0) return <div className="pw-vazio">sem série no período</div>;

  let melhor = serie[0];
  serie.forEach((p) => { if (p.value > melhor.value) melhor = p; });
  const desde = serie.length - 1 - serie.indexOf(melhor);

  return (
    <div className="pw-recorde">
      <span className="pw-rotulo">Melhor dia</span>
      <strong className="pw-numero">{fmtDinheiro(melhor.value, d.curtos)}</strong>
      <span className="pw-recorde-pe">
        {diaCurto(melhor.day)}
        {desde > 0 && <em> · há {desde} {desde === 1 ? "dia" : "dias"}</em>}
        {desde === 0 && <em> · é hoje</em>}
      </span>
    </div>
  );
}

/* ── A doca e o galpão ───────────────────────────────────────────────────── */

/**
 * As ETAPAS da expedição, uma a uma, com a direção de cada fila.
 *
 * A faixa colorida do bloco `expedicao` mostra a proporção; esta lista mostra o
 * NÚMERO e, principalmente, se ele cresceu desde a última leitura. Fila que
 * cresce é o oposto de venda que cresce: aqui vermelho é subir.
 */
function Etapas({ w, d }: { w: Widget; d: DadosPainel }) {
  const e = d.expedicao;
  if (e === undefined) return <div className="pw-vazio">carregando expedição…</div>;
  if (e === null) return <div className="pw-vazio">expedição indisponível</div>;

  const limite = Math.max(1, Number(w.opcoes.linhas ?? 5));
  const linhas = [...e.categorias].sort((a, b) => b.valor - a.valor).slice(0, limite);
  if (linhas.length === 0) return <div className="pw-vazio">nada em fila</div>;

  return (
    <div className="pw-etapas">
      {linhas.map((c) => {
        const delta = c.anterior == null ? null : c.valor - c.anterior;
        return (
          <div key={c.chave} className="pw-etapas-linha">
            <i className="pw-etapas-cor" style={{ background: c.cor }} aria-hidden />
            <span className="pw-etapas-nome pw-trunc">{c.rotulo}</span>
            <strong className="pw-etapas-valor">{fmtNum(c.valor)}</strong>
            {/* Sem histórico não há seta: inventar "0" seria dizer que está
                estável quando ninguém mediu. */}
            {delta != null && delta !== 0 && (
              <span className={delta > 0 ? "pw-exp-sobe" : "pw-exp-desce"}>
                <Icon name={delta > 0 ? "trending-up" : "trending-down"} size={16} className="pw-seta" />
                {fmtNum(Math.abs(delta))}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * O que FALTA produzir para os pedidos saírem, por categoria.
 *
 * É a única tela do galpão que diz o que fazer agora, e não o que aconteceu:
 * cada linha é um lote que está segurando pedidos na doca.
 */
function Falta({ w, d }: { w: Widget; d: DadosPainel }) {
  const e = d.expedicao;
  if (e === undefined) return <div className="pw-vazio">carregando expedição…</div>;
  if (e === null) return <div className="pw-vazio">expedição indisponível</div>;

  const limite = Math.max(1, Number(w.opcoes.linhas ?? 5));
  const itens = [...e.faltaProducao].sort((a, b) => b.total - a.total).slice(0, limite);
  // Nada travado é NOTÍCIA BOA — e merece ser dita, não um bloco em branco.
  if (itens.length === 0) return <div className="pw-vazio">nada travado na produção</div>;

  const maior = Math.max(...itens.map((i) => i.total), 1);
  return (
    <div className="pw-falta">
      {itens.map((i) => (
        <div key={i.categoria} className="pw-falta-linha">
          <span className="pw-falta-nome pw-trunc">{i.categoria}</span>
          <span className="pw-barra pw-barra-fina">
            <span className="pw-barra-fill faixa-fundo-critico" style={{ width: `${(i.total / maior) * 100}%` }} />
          </span>
          <strong className="pw-falta-total">{fmtNum(i.total)}</strong>
          <span className="pw-falta-pedidos">{fmtNum(i.pedidos)} ped.</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Estoque baixo: o que o galpão precisa repor, do mais crítico.
 *
 * A régua da barra é o MÍNIMO do item, não o maior saldo da lista: "9 de 10" e
 * "0 de 50" precisam aparecer como quase-cheio e vazio, e comparar os dois pelo
 * saldo cru inverteria a ordem de gravidade. Item zerado ganha a cor de perigo;
 * o que está no mínimo, a de atenção.
 */
function Estoque({ w, d }: { w: Widget; d: DadosPainel }) {
  const e = d.estoque;
  if (e === undefined) return <div className="pw-vazio">carregando estoque…</div>;
  if (e === null) return <div className="pw-vazio">estoque indisponível</div>;

  const limite = Math.max(1, Number(w.opcoes.linhas ?? 6));
  const itens = e.itens.slice(0, limite);
  // Catálogo inteiro acima do mínimo é a melhor notícia que esta tela pode dar.
  if (itens.length === 0) return <div className="pw-vazio">estoque em dia — nada abaixo do mínimo</div>;

  return (
    <div className="pw-estq">
      {itens.map((i) => {
        const cheio = Math.min(100, (i.quantidade / (i.minimo || 1)) * 100);
        const faixa = i.quantidade <= 0 ? "critico" : "atencao";
        return (
          <div key={i.nome} className="pw-estq-linha">
            <span className="pw-estq-nome pw-trunc">{i.nome}</span>
            <span className="pw-barra pw-barra-fina">
              <span className={`pw-barra-fill faixa-fundo-${faixa}`} style={{ width: `${cheio}%` }} />
            </span>
            <strong className={`pw-estq-saldo faixa-${faixa}`}>{fmtNum(i.quantidade)}</strong>
            <span className="pw-estq-min">de {fmtNum(i.minimo)}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * O 1º colocado em cartaz — foto grande, nome e o que ele fez.
 *
 * O pódio compara três; este bloco existe para a coluna estreita onde só cabe
 * um, e para o momento em que a parede quer dizer uma coisa só: quem está
 * puxando o período.
 */
function Destaque({ w, d }: { w: Widget; d: DadosPainel }) {
  const periodo = usePeriodo(w.opcoes);
  const lista = [...(comerciais(d))].sort((a, b) => vendasNo(b, periodo) - vendasNo(a, periodo));
  const p = lista[0];
  if (!p) return <div className="pw-vazio">sem vendedores</div>;
  const pedidos = Math.round(p.orders?.[periodo] ?? 0);

  return (
    <div className="pw-cartaz">
      <span className="pw-cartaz-foto">
        {p.photoUrl ? (
          <Image src={p.photoUrl} alt="" width={220} height={220} unoptimized />
        ) : (
          <b>{p.name.split(" ").slice(0, 2).map((n) => n[0]).join("")}</b>
        )}
        <i aria-hidden><Icon name="trophy" size={20} color="#1a1300" /></i>
      </span>
      <span className="pw-rotulo">{String(w.opcoes.rotulo ?? "") || "Destaque"}</span>
      <strong className="pw-cartaz-nome pw-trunc">{p.name}</strong>
      <strong className="pw-numero">{fmtDinheiro(vendasNo(p, periodo), d.curtos)}</strong>
      <span className="pw-cartaz-pe">{fmtNum(pedidos)} {pedidos === 1 ? "venda" : "vendas"}</span>
    </div>
  );
}

/**
 * O DIA A DIA em barras.
 *
 * A curva mostra a forma do mês; a barra mostra o DIA. São perguntas
 * diferentes: "está subindo?" contra "quanto foi terça?". Numa parede de
 * equipe, a segunda é a que gera conversa — e comparar altura de barra é a
 * comparação que o olho faz sem esforço.
 */
function Barras({ w, d }: { w: Widget; d: DadosPainel }) {
  const metrica = String(w.opcoes.metrica ?? "faturamento_mes") as Metrica;
  const mt = d.sales?.metrics;
  const daReceita = ["faturamento_dia", "faturamento_semana", "faturamento_mes", "faturamento_empresa", "projecao_mes"];
  // Tráfego SEMPRE do Tridify — o `trafficSeries` do ERP legado mede outra
  // coisa com o mesmo nome. Ver `serieDaMetrica`.
  const st = daReceita.includes(metrica) ? [] : d.sales?.tridify?.serieTrafego ?? [];
  const serie = st.length
    ? st.map((x) => ({ day: x.d, value: metrica === "gasto_trafego" ? x.gasto : x.receita }))
    : ((daReceita.includes(metrica) ? mt?.revenueSeries : mt?.trafficSeries) ?? []);
  if (serie.length === 0) return <div className="pw-vazio">sem série no período</div>;

  // Os ÚLTIMOS N dias: numa parede, o começo do mês já não muda o que se faz
  // hoje, e vinte barras finas viram um borrão.
  const quantos = Math.max(2, Number(w.opcoes.linhas ?? 7));
  const dias = serie.slice(-quantos);
  /*
   * `comparar: "gasto_trafego"` põe uma SEGUNDA barra em cada dia.
   *
   * Duas barras lado a lado no mesmo dia é a comparação que o olho faz sem
   * esforço — e foi o que substituiu as duas linhas sobrepostas do gráfico
   * anterior, que a três metros eram a mesma curva desenhada duas vezes. Aqui a
   * pergunta se responde dia a dia: a barra clara chegando perto da escura é o
   * dia em que o anúncio comeu a venda.
   *
   * Mesma escala nas duas, porque são a mesma unidade — reais.
   */
  const comparar = String(w.opcoes.comparar ?? "") !== "" && st.length > 0;
  const gastoDe = new Map(st.map((x) => [x.d, x.gasto]));
  const max = Math.max(
    ...dias.map((p) => p.value),
    ...(comparar ? dias.map((p) => gastoDe.get(p.day) ?? 0) : []),
    1,
  );
  const melhor = dias.reduce((a, b) => (b.value > a.value ? b : a), dias[0]);
  const rotuloA = String(w.opcoes.rotuloSerie ?? "") || ROTULO_METRICA[metrica] || "Série";
  const rotuloB = String(w.opcoes.rotuloComparar ?? "Investimento");

  return (
    <div className="pw-barras">
      <span className="pw-barras-topo-linha">
        <span className="pw-rotulo pw-trunc">{String(w.opcoes.rotulo ?? "") || ROTULO_METRICA[metrica]}</span>
        {comparar && (
          <span className="pw-barras-legenda">
            <span><i className="pw-barras-marca" /> {rotuloA}</span>
            <span><i className="pw-barras-marca pw-barras-marca-b" /> {rotuloB}</span>
          </span>
        )}
      </span>
      <div className="pw-barras-campo">
        {dias.map((p) => (
          <div key={p.day} className="pw-barras-col" title={p.day}>
            {/*
              O valor aparece SÓ no melhor dia.
              Doze barras com o valor em cima de cada uma viram uma linha de
              texto contínua — medido: "R$ 2,3R$i5 9,2R$ 3, 2R$i2…", os rótulos
              montados uns nos outros até virar ruído. A altura das barras já dá
              a comparação; o número serve para ancorar a escala, e um ancora
              tanto quanto doze.
            */}
            <span className="pw-barras-valor">{p === melhor ? fmtDinheiro(p.value, true) : ""}</span>
            <span className="pw-barras-par">
              {/* O melhor dia da janela fica aceso: sem isso, oito barras
                  parecidas não dizem qual foi a boa. */}
              <span
                className={`pw-barras-barra ${p === melhor ? "pw-barras-topo" : ""}`}
                style={{ height: `${Math.max(2, (p.value / max) * 100)}%` }}
              />
              {comparar && (
                <span
                  className="pw-barras-barra pw-barras-barra-b"
                  style={{ height: `${Math.max(2, ((gastoDe.get(p.day) ?? 0) / max) * 100)}%` }}
                />
              )}
            </span>
            <span className="pw-barras-dia">{diaCurto(p.day).split("/")[0]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * O que PRECISA DE ATENÇÃO agora — e silêncio quando não há nada.
 *
 * Todo o resto da parede conta o que aconteceu. Este bloco é o único que junta
 * as coisas que pedem alguém de pé: peça impedida, lote travando pedido, meta
 * fora do ritmo, painel sem sincronizar. Quando não há nada, ele DIZ que não há
 * — bloco em branco numa parede se lê como defeito, não como paz.
 */
function Alertas({ d }: { d: DadosPainel }) {
  const itens: { texto: string; grave: boolean }[] = [];

  const p = d.producao;
  if (p && p.impedidas > 0) {
    itens.push({ texto: `${fmtNum(p.impedidas)} ${p.impedidas === 1 ? "peça impedida" : "peças impedidas"}`, grave: true });
  }
  const e = d.expedicao;
  if (e) {
    const falta = e.faltaProducao.reduce((s, f) => s + f.total, 0);
    if (falta > 0) {
      const pedidos = e.faltaProducao.reduce((s, f) => s + f.pedidos, 0);
      itens.push({ texto: `${fmtNum(falta)} para produzir · segura ${fmtNum(pedidos)} ${pedidos === 1 ? "pedido" : "pedidos"}`, grave: true });
    }
  }
  // Estoque: só o que pede alguém de pé. "12 itens abaixo do mínimo" é rotina
  // do galpão e mora no bloco de estoque; ZERADO para a fila, e peça pronta
  // esperando conferência é produção que já foi feita e não conta pra ninguém.
  const es = d.estoque;
  if (es) {
    if (es.zerados > 0) {
      itens.push({ texto: `${fmtNum(es.zerados)} ${es.zerados === 1 ? "item zerado" : "itens zerados"} no estoque`, grave: true });
    }
    if (es.conferir > 0) {
      itens.push({ texto: `${fmtNum(es.conferir)} ${es.conferir === 1 ? "atividade espera" : "atividades esperam"} conferência`, grave: false });
    }
  }
  const { meta, feito } = metaDoMes(d);
  if (meta > 0) {
    const esperado = ritmoEsperado(meta);
    if (feito < esperado * 0.85) {
      itens.push({ texto: `${fmtDinheiro(esperado - feito, d.curtos)} atrás do ritmo do mês`, grave: false });
    }
  }

  return (
    <div className="pw-alertas">
      <span className="pw-rotulo">Precisa de atenção</span>
      {itens.length === 0 ? (
        <span className="pw-alertas-paz">
          <Icon name="circle-check" size={18} color="var(--p-secundaria)" /> nada pendente
        </span>
      ) : (
        <div className="pw-alertas-lista">
          {itens.slice(0, 4).map((i) => (
            <span key={i.texto} className={`pw-alertas-item ${i.grave ? "pw-alertas-grave" : ""}`}>
              {/* A cor vem da classe, e não de um hex aqui: cor de status
                  escrita na mão não muda de tema (trava em `paleta-por-tema`). */}
              <Icon name="alert-triangle" size={16} color="currentColor" />
              {i.texto}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Uma IMAGEM por endereço — cartaz de campanha, foto do time, aviso.
 *
 * É a única peça que não vem de dado nenhum, e é justamente por isso que
 * existe: a parede é da empresa, não do sistema. Sem endereço, o bloco explica
 * o que fazer em vez de mostrar um retângulo quebrado.
 */
function Imagem({ w }: { w: Widget }) {
  const url = String(w.opcoes.url ?? "").trim();
  if (!url) return <div className="pw-vazio">cole o endereço de uma imagem</div>;
  const preencher = w.opcoes.preencher !== false;
  return (
    <div className="pw-imagem">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" style={{ objectFit: preencher ? "cover" : "contain" }} />
    </div>
  );
}

/**
 * As ABAS de período: Hoje · Semana · Mês, com a que está no ar acesa.
 *
 * Existe por um motivo só, e é grande: a tela do ranking troca de período
 * sozinha a cada sete segundos. Sem esta fileira, o mesmo cartão mostra
 * "R$ 19.808" três vezes seguidas querendo dizer três coisas diferentes — e
 * quem passa na frente da parede lê o número do dia como se fosse o do mês.
 *
 * Ela não CONTROLA nada (não há onde clicar numa parede): é um mostrador. Por
 * isso lê o mesmo relógio que os blocos de vendedor leem, em vez de mandar
 * neles.
 */
function Abas({ w }: { w: Widget }) {
  const atual = usePeriodo({ ...w.opcoes, periodo: w.opcoes.periodo ?? "ciclo" });
  const validos = useContext(PeriodosValidos);
  return (
    <div className="pw-abas">
      {PERIODOS.map((p) => (
        <span key={p} className="pw-aba" data-on={p === atual ? "1" : "0"} data-off={validos.includes(p) ? undefined : "1"}>
          {NOME_PERIODO[p]}
        </span>
      ))}
    </div>
  );
}

/**
 * O DESEMPENHO POR CANAL: o que cada plataforma de anúncio custou e trouxe.
 *
 * Hoje desenha uma coluna — o Meta —, porque é a única plataforma com gasto no
 * armazém. Google e TikTok aparecem na tela de conexões do ERP e nunca foram
 * ligados; enquanto não forem, um cartão "Google Ads · R$ 0" na parede seria
 * lido como "a conta parou", que é uma afirmação sobre o negócio que o dado não
 * sustenta.
 *
 * O bloco lê uma LISTA, então a segunda plataforma vira dado no
 * `canaisTrafego` e a coluna nasce sozinha — sem bloco novo, sem deploy do
 * renderizador, sem ninguém lembrar de mexer aqui.
 */
function Canais({ w, d }: { w: Widget; d: DadosPainel }) {
  const periodo = usePeriodo({ ...w.opcoes, periodo: w.opcoes.periodo ?? "ciclo" });
  const canais = d.sales?.tridify?.canaisTrafego ?? [];
  if (canais.length === 0) return <div className="pw-vazio">sem gasto por canal no período</div>;
  const fator = fatoresDoTrafego(d);

  return (
    <div className="pw-canais">
      {/* O bloco se NOMEIA. Sem o título, uma faixa com "Meta Ads" e três
          números soltos, embaixo de quatro cartões que já falam de tráfego,
          não diz que ali começa outro recorte — e o número do Meta seria lido
          como repetição do cartão de cima. */}
      <span className="pw-rotulo">{String(w.opcoes.rotulo ?? "Desempenho por canal")}</span>
      <div className="pw-canais-linha">
      {canais.map((c, i) => {
        const agora = somaDaJanela(c.serie, periodo, fator);
        // A comparação é com a janela IGUAL logo antes, na mesma série — a
        // mesma regra dos cartões de cima (ver `variacaoDaMetrica`).
        const n = periodo === "daily" ? 1 : periodo === "weekly" ? 7 : 0;
        const antes = n > 0 && c.serie.length >= n * 2
          ? somaDaJanela(c.serie.slice(c.serie.length - n * 2, c.serie.length - n), "monthly", fator)
          : null;
        const variacao = antes && antes.receita > 0
          ? ((agora.receita - antes.receita) / antes.receita) * 100
          : null;
        // Acima de 300% a conta mede o calendário, não o desempenho — a mesma
        // trava dos cartões.
        const mostraVar = variacao != null && Math.abs(variacao) <= 300;
        const roas = agora.gasto ? agora.receita / agora.gasto : null;
        return (
          <div key={c.id} className="pw-canal">
            {i > 0 && <span className="pw-canal-fio" />}
            <span className="pw-selo pw-selo-min">
              <Icon name={ICONE_CANAL[c.id] ?? "speakerphone"} size={20} />
            </span>
            <span className="pw-canal-corpo">
              <span className="pw-rotulo pw-trunc">{c.nome}</span>
              <span className="pw-canal-nums">
                <span>
                  <em>Investimento</em>
                  <strong>{agora.gasto == null ? "—" : fmtDinheiro(agora.gasto, d.curtos)}</strong>
                </span>
                <span>
                  <em>Vendas</em>
                  <strong>{fmtDinheiro(agora.receita, d.curtos)}</strong>
                </span>
                <span>
                  <em>ROAS</em>
                  {/* Sem gasto não há retorno para dividir: zero ali seria lido
                      como "o anúncio não devolveu nada" em vez de "não houve
                      anúncio nesta janela". */}
                  <strong className="pw-destaque">
                    {roas == null ? "—" : `${roas.toFixed(2).replace(".", ",")}x`}
                  </strong>
                </span>
              </span>
              {mostraVar && (
                <span className={`pw-delta ${variacao >= 0 ? "pw-delta-bom" : "pw-delta-ruim"}`}>
                  <Icon name={variacao >= 0 ? "trending-up" : "trending-down"} size={14} className="pw-seta" />
                  {Math.abs(variacao).toFixed(1).replace(".", ",")}%
                  <i>{periodo === "daily" ? "ontem" : "período anterior"}</i>
                </span>
              )}
            </span>
          </div>
        );
      })}
      </div>
    </div>
  );
}

/**
 * A marca de cada plataforma. As três já existem no mapa de ícones porque a
 * tela de conexões do ERP as usa — o bloco só precisa saber qual é de quem.
 */
const ICONE_CANAL: Record<string, string> = {
  meta: "brand-meta",
  google: "brand-google",
  tiktok: "brand-tiktok",
};

/**
 * O INSIGHT do período: a frase que lê dois números JUNTOS.
 *
 * "Aumento de 21,7% nas vendas com apenas 18,6% a mais de investimento" é a
 * leitura que ninguém faz de cabeça olhando dois cartões separados na parede —
 * e é a única que responde se o mês está indo bem ou só está caro.
 *
 * Fala apenas o que os dois números sustentam. Sem variação nos dois lados,
 * cala: uma frase de rodapé inventada é lida como conclusão da empresa.
 */
function Insight({ w, d }: { w: Widget; d: DadosPainel }) {
  // Mesmo período dos cartões acima: a frase compara o que eles mostram, e no
  // mês ela cala (não há mês anterior nesta resposta — ver `variacaoDaMetrica`).
  const periodo = usePeriodo({ ...w.opcoes, periodo: w.opcoes.periodo ?? "ciclo" });
  const vendas = variacaoDaMetrica("receita_paga", d, periodo);
  const gasto = variacaoDaMetrica("gasto_trafego", d, periodo);
  if (!vendas || !gasto) return <div className="pw-vazio">sem período anterior para comparar</div>;
  const p = (n: number) => `${Math.abs(n).toFixed(1).replace(".", ",")}%`;
  // "com apenas" só quando o custo cresceu MENOS que a venda; caso contrário a
  // frase elogiaria um mês em que o anúncio ficou mais caro que o resultado.
  const frase = vendas.pct >= 0 && gasto.pct < vendas.pct
    ? `Aumento de ${p(vendas.pct)} nas vendas com ${gasto.pct < 0 ? "queda de" : "apenas"} ${p(gasto.pct)} ${gasto.pct < 0 ? "no" : "a mais de"} investimento.`
    : vendas.pct < 0
      ? `Queda de ${p(vendas.pct)} nas vendas com ${gasto.pct >= 0 ? "alta de" : "queda de"} ${p(gasto.pct)} no investimento.`
      : `Aumento de ${p(vendas.pct)} nas vendas, com ${p(gasto.pct)} a mais de investimento.`;
  return (
    <div className="pw-insight">
      <span className="pw-selo pw-selo-min">
        <Icon name="bulb" size={20} />
      </span>
      <span className="pw-rotulo pw-trunc">Principal insight do período</span>
      <span className="pw-insight-fio" />
      <span className="pw-insight-frase pw-trunc">{frase}</span>
    </div>
  );
}

/** Desenha um widget qualquer. É o ponto único que o editor e a TV chamam. */
export function RenderWidget({ w, d }: { w: Widget; d: DadosPainel }) {
  return (
    <PeriodosValidos.Provider value={periodosValidos(d.sales?.updatedAt)}>
      <RenderWidgetInterno w={w} d={d} />
    </PeriodosValidos.Provider>
  );
}

function RenderWidgetInterno({ w, d }: { w: Widget; d: DadosPainel }) {
  switch (w.tipo) {
    case "classico-ranking":
    case "classico-batalha":
    case "classico-financeiro":
    case "classico-trafego":
    case "classico-produtos":
      return <Classico tipo={w.tipo} d={d} />;
    // Tela cheia que já é feita de blocos: desenha a própria grade dentro da
    // célula. É o que faz o bloco da paleta e o perfil de fábrica serem a
    // MESMA coisa — uma receita só, em `RECEITA_CLASSICA`.
    case "comercial-simples": {
      let n = 0;
      return (
        <GradeSlide
          widgets={separarEmBlocos(w, () => `${w.id}-${n++}`)}
          dados={d}
          polegadas={d.polegadas ?? 50}
        />
      );
    }
    case "kpi": return <Kpi w={w} d={d} />;
    case "meta": return <Meta w={w} d={d} />;
    case "podio": return <Podio w={w} d={d} />;
    case "ranking": return <Ranking w={w} d={d} />;
    case "batalha": return <Batalha d={d} />;
    case "abas": return <Abas w={w} />;
    case "insight": return <Insight w={w} d={d} />;
    case "canais": return <Canais w={w} d={d} />;
    case "produtos": return <Produtos w={w} d={d} />;
    case "trafego": return <Trafego d={d} />;
    case "composicao": return <Composicao d={d} />;
    case "producao": return <Producao w={w} d={d} />;
    case "pessoas": return <Pessoas w={w} d={d} />;
    case "expedicao": return <Expedicao d={d} />;
    case "lidera": return <Lidera w={w} d={d} />;
    case "equipe": return <Equipe w={w} d={d} />;
    case "curva": return <Curva w={w} d={d} />;
    case "anel": return <Anel w={w} d={d} />;
    case "ritmo": return <Ritmo d={d} />;
    case "metas-time": return <MetasTime w={w} d={d} />;
    case "recorde": return <Recorde w={w} d={d} />;
    case "etapas": return <Etapas w={w} d={d} />;
    case "falta": return <Falta w={w} d={d} />;
    case "estoque": return <Estoque w={w} d={d} />;
    case "destaque": return <Destaque w={w} d={d} />;
    case "barras": return <Barras w={w} d={d} />;
    case "alertas": return <Alertas d={d} />;
    case "imagem": return <Imagem w={w} />;
    case "relogio": return <Relogio w={w} />;
    case "logo": return <Logo d={d} />;
    case "texto": return <Texto w={w} />;
    default: return null;
  }
}

/**
 * A grade. Recebe os widgets em células e devolve o slide desenhado.
 *
 * `container-type: size` + unidades `cq` fazem o conteúdo escalar junto com a
 * caixa: a mesma definição de layout serve para a TV de 55" e para o quadradinho
 * de pré-visualização, sem duas folhas de estilo.
 */
export function GradeSlide({
  widgets,
  dados,
  className = "",
  polegadas = 50,
}: {
  widgets: Widget[];
  dados: DadosPainel;
  className?: string;
  /**
   * Polegadas da TV do perfil. Viram `--esc`, que multiplica todo tamanho de
   * texto (ver o topo do widgets.css). Sem isto o editor prometia "texto 113%"
   * e desenhava 100% — a prévia dizendo uma coisa e a parede fazendo outra, que
   * é o defeito que o editor existe para não ter.
   */
  polegadas?: number;
}) {
  return (
    <div
      className={`pw-grade ${className}`}
      style={{ ["--esc" as string]: escalaPorPolegadas(polegadas) }}
    >
      {widgets.map((w) => (
        <div
          key={w.id}
          className="pw-slot"
          style={{
            gridColumn: `${w.x + 1} / span ${Math.min(w.w, COLUNAS - w.x)}`,
            gridRow: `${w.y + 1} / span ${Math.min(w.h, LINHAS - w.y)}`,
          }}
        >
          <RenderWidget w={w} d={{ ...dados, polegadas }} />
        </div>
      ))}
    </div>
  );
}
