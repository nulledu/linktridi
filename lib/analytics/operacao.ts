// ── Analytics › Operação — o dado que a central de inteligência lê ─────────
//
// Uma leitura só do ERP monta as cinco perguntas da tela:
//
//   1. o que mudou      → `resumo` (cada número com o seu período anterior)
//   2. onde estreita    → `fluxo` (passagem por etapa + fila parada nela)
//   3. o que está preso → `parados` (fila, espera média, nível de atenção)
//   4. pra onde vai     → `series` (dia a dia, com o período anterior alinhado)
//   5. o que fazer      → `insights` (frases escritas a partir dos quatro)
//
// Por que aqui e não na tela: comparação com período anterior exige uma
// SEGUNDA janela de consulta. Feita no cliente, ela vira uma segunda ida à
// rede por aba aberta — a conta que já derrubou o projeto duas vezes. Feita
// aqui, o cliente faz UMA busca e o servidor cacheia a montagem inteira.

import { previousRange, type Range } from "@/lib/period";
import { countErp, fetchAllErp } from "@/lib/producao";
import { gerarInsights } from "./insights";
import type {
  AnalyticsOperacao, Comparacao, EtapaFluxo, Nivel, ParadoEtapa, PontoSerie, SerieAnalitica,
} from "./tipos";

const SP_OFFSET_MS = 3 * 3600 * 1000;
const spDayKey = (d: Date) => new Date(d.getTime() - SP_OFFSET_MS).toISOString().slice(0, 10);
const DIA_MS = 86_400_000;
/** "2026-09-01" → "01/09". */
const brData = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Prazo de entrega contra o qual o SLA é medido, em dias corridos entre a
 * entrada do pedido e o envio.
 *
 * Cinco dias porque é o prazo que o comercial promete. Se um dia isso virar
 * configuração por produto, o lugar de mudar é AQUI e no rótulo da tela junto
 * — um SLA cuja régua não está escrita na tela é um número que ninguém sabe
 * interpretar.
 */
export const SLA_META_DIAS = 5;

/** Etapas canceladas/estornadas — nunca entram em fila nem em vazão. */
const EXCLUIR = new Set([6, 14]);

/**
 * As oito caixas do fluxo, na ORDEM DO PROCESSO.
 *
 * `col` é a coluna de data do ERP que marca a passagem (ou a tabela satélite,
 * no caso de vetor e contorno); `etapas` são os ids em que um pedido fica
 * PARADO esperando aquela caixa. As duas coisas não são a mesma: um pedido na
 * etapa 5 ("arte pronta, aguardando cliente") está parado na Aprovação, mas
 * quem marca a passagem é `data_aprovado`, que só é gravada quando ele sai.
 *
 * Ordenar por tamanho em vez de por processo transformaria o fluxo numa lista
 * de recordes — e a leitura que interessa ("onde estreita") só existe se a
 * ordem for a real.
 */
const FLUXO: { key: string; nome: string; icon: string; tabela: string; col: string; etapas: number[] }[] = [
  { key: "pedidos", nome: "Pedidos", icon: "shopping-bag", tabela: "pedidos", col: "created_at", etapas: [1] },
  { key: "vetores", nome: "Vetores", icon: "vector-bezier", tabela: "dash_vetor", col: "data_vetor", etapas: [2] },
  { key: "contornos", nome: "Contornos", icon: "scissors", tabela: "dash_contorno", col: "data_contorno", etapas: [3] },
  { key: "aprovacao", nome: "Aprovação", icon: "send", tabela: "pedidos", col: "data_aprovado", etapas: [4, 5] },
  { key: "programacao", nome: "Programação", icon: "calendar-event", tabela: "pedidos", col: "data_prog_maquina", etapas: [7, 16] },
  { key: "producao", nome: "Produção", icon: "tools", tabela: "pedidos", col: "data_producao", etapas: [9] },
  { key: "fabricados", nome: "Fabricados", icon: "settings", tabela: "pedidos", col: "data_fabricado", etapas: [10] },
  { key: "enviados", nome: "Enviados", icon: "truck-loading", tabela: "pedidos", col: "data_envio", etapas: [11] },
];

/**
 * Variação percentual honesta.
 *
 * Anterior zero devolve `null`, não "+100%": a métrica não subiu, é que não
 * havia com o que comparar. Um painel que escreve "+100%" toda vez que algo
 * estreia ensina a pessoa a não acreditar em nenhum dos outros números.
 */
function comparar(atual: number, anterior: number): Comparacao {
  const deltaPct = anterior > 0 ? Math.round(((atual - anterior) / anterior) * 1000) / 10 : null;
  return { atual, anterior, deltaPct };
}

/** Conta quantas linhas da tabela têm a coluna dentro da janela. */
const contarJanela = (tabela: string, col: string, r: Range) =>
  countErp(tabela, `select=id&${col}=gte.${r.fromIso}&${col}=lt.${r.toIso}`);

/** Uma série diária a partir de timestamps soltos, na grade de dias do range. */
function serieDe(isos: (string | null | undefined)[], dias: string[]): number[] {
  const mapa = new Map(dias.map((d) => [d, 0]));
  for (const iso of isos) {
    if (!iso) continue;
    const k = spDayKey(new Date(iso));
    const v = mapa.get(k);
    if (v !== undefined) mapa.set(k, v + 1);
  }
  return dias.map((d) => mapa.get(d) ?? 0);
}

/**
 * Junta atual e anterior numa série só.
 *
 * O alinhamento é por POSIÇÃO (1º dia com 1º dia), não por data — é o que
 * permite comparar um mês de 30 dias com um de 31 sem o último dia ficar órfão.
 * Quando o anterior é mais curto, o excedente vem `null` e a linha de apoio
 * simplesmente termina antes, em vez de despencar até zero e inventar uma
 * queda que não houve.
 */
function montarSerie(nome: string, atual: number[], anterior: number[], dias: string[]): SerieAnalitica {
  const pontos: PontoSerie[] = dias.map((day, i) => ({
    day, atual: atual[i] ?? 0, anterior: i < anterior.length ? anterior[i] : null,
  }));
  const total = atual.reduce((s, v) => s + v, 0);
  return {
    nome, pontos, total,
    totalAnterior: anterior.reduce((s, v) => s + v, 0),
    media: dias.length > 0 ? Math.round(total / dias.length) : 0,
  };
}

/** Linha de pedido em aberto, com todas as marcas de passagem. */
type PedAberto = {
  etapa_id: number | null;
  created_at: string | null;
  data_arte_enviada: string | null;
  data_aprovado: string | null;
  data_prog_maquina: string | null;
  data_producao: string | null;
  data_fabricado: string | null;
};

/**
 * Há quanto tempo o pedido está parado: o instante da ÚLTIMA marca que ele
 * recebeu. Sem nenhuma, vale o nascimento.
 *
 * Não é `created_at` sempre: um pedido criado há 40 dias que entrou em produção
 * ontem não está parado há 40 dias, e contá-lo assim jogaria a média da etapa
 * pro teto e mataria a utilidade da coluna inteira.
 */
function paradoDesde(p: PedAberto): number | null {
  const marcas = [p.data_fabricado, p.data_producao, p.data_prog_maquina, p.data_aprovado, p.data_arte_enviada, p.created_at];
  for (const m of marcas) if (m) return Date.parse(m);
  return null;
}

/**
 * Nível de atenção de uma fila.
 *
 * Duas dimensões multiplicadas, e não uma: uma fila de 200 que gira no mesmo
 * dia é saudável, e uma de 12 parada há uma semana é grave. Só o tamanho, que
 * é o que a maioria dos painéis mostra, acende alarme na etapa mais movimentada
 * da casa todo santo dia.
 */
function nivelDe(parados: number, diasMedio: number, filaTotal: number): Nivel {
  const fatia = filaTotal > 0 ? parados / filaTotal : 0;
  const peso = diasMedio * (0.5 + fatia);
  if (peso >= 3 && parados >= 10) return "alta";
  if (peso >= 1.2 && parados >= 5) return "media";
  return "baixa";
}

export async function montarAnalyticsOperacao(range: Range, now = new Date()): Promise<AnalyticsOperacao> {
  const prev = previousRange(range);
  const agora = now.getTime();

  // Tudo em paralelo. São muitas idas, mas quase todas são `count` (corpo
  // vazio) e a rota inteira sai cacheada por 60s — cinco pessoas abrindo a tela
  // no mesmo minuto dividem UMA montagem (ver `cached`).
  const [
    totaisAtual, totaisAnterior,
    fabAtual, fabAnterior, envAtual, envAnterior,
    ciclosAtual, ciclosAnterior,
    abertos, etapas,
  ] = await Promise.all([
    Promise.all(FLUXO.map((f) => contarJanela(f.tabela, f.col, range))),
    Promise.all(FLUXO.map((f) => contarJanela(f.tabela, f.col, prev))),
    fetchAllErp<{ data_fabricado: string }>("pedidos", `select=data_fabricado&data_fabricado=gte.${range.fromIso}&data_fabricado=lt.${range.toIso}`),
    fetchAllErp<{ data_fabricado: string }>("pedidos", `select=data_fabricado&data_fabricado=gte.${prev.fromIso}&data_fabricado=lt.${prev.toIso}`),
    fetchAllErp<{ data_envio: string }>("pedidos", `select=data_envio&data_envio=gte.${range.fromIso}&data_envio=lt.${range.toIso}`),
    fetchAllErp<{ data_envio: string }>("pedidos", `select=data_envio&data_envio=gte.${prev.fromIso}&data_envio=lt.${prev.toIso}`),
    // Ciclo: só quem SAIU no período, com a data de entrada junto.
    fetchAllErp<{ created_at: string | null; data_envio: string }>("pedidos", `select=created_at,data_envio&data_envio=gte.${range.fromIso}&data_envio=lt.${range.toIso}`),
    fetchAllErp<{ created_at: string | null; data_envio: string }>("pedidos", `select=created_at,data_envio&data_envio=gte.${prev.fromIso}&data_envio=lt.${prev.toIso}`),
    fetchAllErp<PedAberto>("pedidos", "select=etapa_id,created_at,data_arte_enviada,data_aprovado,data_prog_maquina,data_producao,data_fabricado&arquivado=eq.false&concluido=eq.false"),
    fetchAllErp<{ id: number; nome: string; ordem: number | null }>("etapas_pedidos", "select=id,nome,ordem&order=ordem.asc"),
  ]);

  // ── Fila parada, por etapa do ERP ────────────────────────────────────────
  const porEtapa = new Map<number, { parados: number; esperas: number[] }>();
  for (const p of abertos) {
    const id = p.etapa_id;
    if (id == null || EXCLUIR.has(id)) continue;
    const bucket = porEtapa.get(id) ?? { parados: 0, esperas: [] };
    bucket.parados++;
    const desde = paradoDesde(p);
    if (desde != null) bucket.esperas.push(Math.max(0, (agora - desde) / DIA_MS));
    porEtapa.set(id, bucket);
  }
  const filaTotal = [...porEtapa.values()].reduce((s, b) => s + b.parados, 0);
  const nomeEtapa = new Map(etapas.map((e) => [e.id, e.nome]));

  // ── Fluxo: passagem no período + fila parada na caixa ────────────────────
  const fluxo: EtapaFluxo[] = FLUXO.map((f, i) => ({
    key: f.key, nome: f.nome, icon: f.icon, etapas: f.etapas,
    total: totaisAtual[i],
    deltaPct: comparar(totaisAtual[i], totaisAnterior[i]).deltaPct,
    parados: f.etapas.reduce((s, id) => s + (porEtapa.get(id)?.parados ?? 0), 0),
  }));

  // ── Onde o trabalho está parado ──────────────────────────────────────────
  // A variação da linha é a da VAZÃO da caixa a que a etapa pertence, não a da
  // fila: o ERP não guarda histórico de fila, e inventar um número pra encher
  // a coluna seria pior que deixá-la vazia.
  const vazaoDaEtapa = new Map<number, number | null>();
  for (const [i, f] of FLUXO.entries()) {
    for (const id of f.etapas) vazaoDaEtapa.set(id, comparar(totaisAtual[i], totaisAnterior[i]).deltaPct);
  }
  const parados: ParadoEtapa[] = [...porEtapa.entries()]
    .map(([id, b]) => {
      const diasMedio = b.esperas.length > 0
        ? Math.round((b.esperas.reduce((s, v) => s + v, 0) / b.esperas.length) * 10) / 10
        : 0;
      return {
        id, nome: nomeEtapa.get(id) ?? `Etapa ${id}`,
        parados: b.parados, diasMedio,
        deltaPct: vazaoDaEtapa.get(id) ?? null,
        nivel: nivelDe(b.parados, diasMedio, filaTotal),
      };
    })
    // Pelo PESO (fila × espera), não pelo tamanho: a linha de cima tem que ser a
    // que mais dói, e a maior fila nem sempre é ela.
    .sort((a, b) => b.parados * (b.diasMedio + 0.5) - a.parados * (a.diasMedio + 0.5));

  // ── Tempo de ciclo e SLA ─────────────────────────────────────────────────
  const ciclo = (linhas: { created_at: string | null; data_envio: string }[]) => {
    const dias = linhas
      .filter((l) => l.created_at)
      .map((l) => (Date.parse(l.data_envio) - Date.parse(l.created_at!)) / DIA_MS)
      // Ciclo negativo é pedido com data importada torta na migração do ERP;
      // um só deles de −900 dias derruba a média da casa inteira.
      .filter((d) => d >= 0 && Number.isFinite(d));
    if (dias.length === 0) return { medio: 0, noPrazo: 0, total: 0 };
    const medio = dias.reduce((s, d) => s + d, 0) / dias.length;
    return {
      medio: Math.round(medio * 10) / 10,
      noPrazo: dias.filter((d) => d <= SLA_META_DIAS).length,
      total: dias.length,
    };
  };
  const cAtual = ciclo(ciclosAtual);
  const cAnterior = ciclo(ciclosAnterior);
  const pctPrazo = (c: { noPrazo: number; total: number }) => (c.total > 0 ? Math.round((c.noPrazo / c.total) * 1000) / 10 : 0);

  // Atrasado = em aberto, já aprovado, esperando há mais que o prazo. É retrato
  // do AGORA: não existe "atrasados do mês passado" pra comparar, e a tela diz
  // isso em vez de forjar uma seta.
  const atrasados = abertos.filter((p) => {
    if (p.etapa_id == null || EXCLUIR.has(p.etapa_id)) return false;
    const desde = paradoDesde(p);
    return desde != null && (agora - desde) / DIA_MS > SLA_META_DIAS;
  }).length;

  const resumo = {
    pedidos: comparar(totaisAtual[0], totaisAnterior[0]),
    produzidos: comparar(totaisAtual[6], totaisAnterior[6]),
    enviados: comparar(totaisAtual[7], totaisAnterior[7]),
    tempoMedioDias: comparar(cAtual.medio, cAnterior.medio),
    atrasados,
    slaPct: comparar(pctPrazo(cAtual), pctPrazo(cAnterior)),
    slaMetaDias: SLA_META_DIAS,
  };

  const series = {
    fabricados: montarSerie("Fabricado", serieDe(fabAtual.map((x) => x.data_fabricado), range.days), serieDe(fabAnterior.map((x) => x.data_fabricado), prev.days), range.days),
    enviados: montarSerie("Enviado", serieDe(envAtual.map((x) => x.data_envio), range.days), serieDe(envAnterior.map((x) => x.data_envio), prev.days), range.days),
  };

  return {
    updatedAt: now.toISOString(),
    periodLabel: range.label,
    // `prev.label` é sempre a string fixa "Período anterior" — inútil no
    // rodapé de um gráfico, onde a pergunta é "anterior a quê, exatamente?".
    periodoAnteriorLabel: `${brData(prev.fromDate)} – ${brData(prev.toDate)}`,
    resumo, fluxo, parados, series,
    insights: gerarInsights({ resumo, fluxo, parados, series }),
  };
}
