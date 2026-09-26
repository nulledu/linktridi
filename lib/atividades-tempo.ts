// ── Quanto tempo leva pra fazer cada coisa ───────────────────────────────────
//
// "No final de tudo ele calcula o tempo médio pra fazer cada produto e coisas
// do tipo."
//
// A conta em si é trivial: `concluida_at - iniciada_at`, dividido pelas peças.
// O trabalho de verdade é decidir O QUE NÃO ENTRA na conta — porque o dado bruto
// da tabela `atividades` tem três venenos conhecidos, e cada um deles sozinho
// já faz o número mentir por um fator de 4:
//
//  1. **A ordem que dormiu.** Ninguém pausa às 18h. A atividade fica aberta a
//     noite inteira e é concluída às 8h do dia seguinte: 14 horas de "trabalho"
//     numa bancada que leva 30 minutos. Uma dessas em dez põe a média em 110
//     min.
//  2. **O toque duplo.** "Iniciar" e "Concluir" no mesmo gesto, porque a pessoa
//     lembrou do tablet só quando já tinha terminado. Dois segundos pra 50
//     peças, puxando a média pra baixo com a mesma força.
//  3. **`iniciada_at` nulo.** Concluída direto no computador, sem nunca passar
//     por "iniciar". Não é rápida: é IMENSURÁVEL. Tratar nulo como zero é a
//     mentira mais fácil de cometer aqui, e não deixa rastro nenhum.
//
// Duas decisões saem daí:
//
//  • **O número da frente é MEDIANA.** A média é o que os três venenos
//    sequestram; a mediana só se move quando a MAIORIA muda. A média continua
//    exposta ao lado, de propósito: quando as duas se afastam, é a distribuição
//    avisando que existe uma cauda — e a cauda é justamente o que a gestão
//    quer investigar.
//  • **Todo descarte é contado com nome.** "12 amostras, 4 descartadas (4 sem
//    início)" é acionável: manda alguém cobrar o "iniciar" no tablet. Descartar
//    em silêncio devolveria um número limpo e sem dono.
//
// Módulo PURO: sem banco, sem React. Quem lê a tabela é a rota; aqui só a regra.
import type { Aberturas } from "@/lib/atividades-aberturas";

/**
 * Piso de duração. Uma ORDEM (não uma peça) que "durou" menos que isto é toque
 * duplo no tablet, não trabalho: a ordem mais curta do catálogo ainda envolve
 * pegar material, montar e contar.
 */
export const PISO_DURACAO_MIN = 1;

/**
 * Teto de duração. A jornada tem ~9h; acima de 10 horas a ordem atravessou o
 * expediente, e o que ela mede é o esquecimento de concluir, não o trabalho.
 *
 * É deliberadamente FOLGADO: preferimos deixar entrar uma ordem legitimamente
 * longa (que a mediana absorve) a cortar trabalho real (que a mediana não tem
 * como recuperar).
 */
export const TETO_DURACAO_MIN = 600;

/** Abaixo disto a mediana é anedota, não medida — a tela precisa avisar. */
export const AMOSTRAS_PARA_CONFIAR = 5;

/** A linha da tabela `atividades` de que esta conta precisa — e só ela. */
export interface AtividadeMedida {
  id: string;
  tarefa: string;
  categoria: string;
  produto_nome: string | null;
  para_id: string | null;
  para_nome: string | null;
  iniciada_at: string | null;
  concluida_at: string | null;
  tempo_estimado_min: number | null;
  quantidade_feita: number;
}

export type MotivoDescarte =
  /** Nunca foi concluída — não há o que medir ainda. */
  | "sem_fim"
  /** `iniciada_at` nulo: imensurável, e o veneno mais silencioso dos três. */
  | "sem_inicio"
  /** Concluída ANTES de iniciada: relógio do tablet fora de hora. */
  | "relogio_invertido"
  /** Abaixo do piso: iniciar e concluir no mesmo toque. */
  | "instantanea"
  /** Acima do teto: ficou aberta a noite inteira. */
  | "esquecida"
  /** Nada foi produzido — dividir por zero peça não produz informação. */
  | "sem_producao";

export const ROTULO_DESCARTE: Record<MotivoDescarte, string> = {
  sem_fim: "não concluída",
  sem_inicio: "ninguém apertou “iniciar”",
  relogio_invertido: "relógio invertido",
  instantanea: "iniciar e concluir no mesmo toque",
  esquecida: "ficou aberta fora do expediente",
  sem_producao: "concluída sem nenhuma peça",
};

export interface Amostra {
  atividade: AtividadeMedida;
  duracaoMin: number;
  minPorPeca: number;
}

export type Classificacao =
  | { ok: true; amostra: Amostra }
  | { ok: false; motivo: MotivoDescarte };

/**
 * Uma atividade vira amostra — ou vira descarte COM NOME. Nunca vira zero.
 *
 * A ordem das perguntas importa: "sem início" é checado antes de qualquer conta
 * porque sem ele não existe duração, e "sem produção" por último porque é o
 * único motivo que fala do resultado e não do relógio.
 */
export function classificarAmostra(a: AtividadeMedida): Classificacao {
  if (!a.concluida_at) return { ok: false, motivo: "sem_fim" };
  if (!a.iniciada_at) return { ok: false, motivo: "sem_inicio" };

  const ini = Date.parse(a.iniciada_at);
  const fim = Date.parse(a.concluida_at);
  if (!Number.isFinite(ini) || !Number.isFinite(fim)) return { ok: false, motivo: "sem_inicio" };

  const duracaoMin = (fim - ini) / 60000;
  if (duracaoMin < 0) return { ok: false, motivo: "relogio_invertido" };
  if (duracaoMin < PISO_DURACAO_MIN) return { ok: false, motivo: "instantanea" };
  if (duracaoMin > TETO_DURACAO_MIN) return { ok: false, motivo: "esquecida" };

  const feito = Number(a.quantidade_feita) || 0;
  if (feito <= 0) return { ok: false, motivo: "sem_producao" };

  return { ok: true, amostra: { atividade: a, duracaoMin, minPorPeca: duracaoMin / feito } };
}

export interface TempoDoProduto {
  /** Chave de agrupamento (produto quando existe, senão a tarefa). */
  chave: string;
  rotulo: string;
  categoria: string;
  /** `true` = o grupo é um PRODUTO; `false` = é uma tarefa avulsa. */
  ehProduto: boolean;

  /** Quantas ordens entraram na conta. */
  amostras: number;
  /** Quantas ficaram de fora, e por quê. */
  descartadas: number;
  descartes: Record<MotivoDescarte, number>;
  /** `amostras < AMOSTRAS_PARA_CONFIAR` — a tela precisa dizer isso em voz alta. */
  poucosDados: boolean;

  /** Peças produzidas nas amostras válidas (nunca no total bruto). */
  pecas: number;
  /** Minutos somados das amostras válidas — o "onde o tempo vai". */
  totalMin: number;

  /** O NÚMERO DA FRENTE. */
  medianaMinPorPeca: number;
  /** Ao lado da mediana de propósito: quando se afastam, há cauda. */
  mediaMinPorPeca: number;
  /** A cauda lenta, pra quem foi investigar. */
  p90MinPorPeca: number;
  /** Quanto dura UMA ordem, mediana — é assim que se planeja o dia. */
  medianaOrdemMin: number;

  /** Mediana do que estava previsto por ordem. Null = ninguém estimou. */
  estimadoMin: number | null;
  /**
   * `medianaOrdemMin / estimadoMin`. Acima de 1 demora mais do que devia;
   * abaixo, a estimativa está frouxa. Null quando não há estimativa — inventar
   * 1 aqui faria a tela dizer "no ponto" pro que ninguém mediu.
   */
  aderencia: number | null;

  /** Conclusão mais recente do grupo — pra saber se o número é de hoje ou de abril. */
  ultima: string | null;
}

export function mediana(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const meio = s.length >> 1;
  return s.length % 2 ? s[meio] : (s[meio - 1] + s[meio]) / 2;
}

/** Percentil por interpolação linear (o mesmo que `numpy.percentile` faz). */
export function percentil(nums: number[], p: number): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const pos = ((s.length - 1) * Math.min(100, Math.max(0, p))) / 100;
  const baixo = Math.floor(pos);
  const alto = Math.ceil(pos);
  if (baixo === alto) return s[baixo];
  return s[baixo] + (s[alto] - s[baixo]) * (pos - baixo);
}

const zerado = (): Record<MotivoDescarte, number> => ({
  sem_fim: 0, sem_inicio: 0, relogio_invertido: 0, instantanea: 0, esquecida: 0, sem_producao: 0,
});

const arredondar = (n: number, casas = 2) => {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
};

/**
 * Agrupa por PRODUTO quando a ordem tem produto, e pela TAREFA quando não tem.
 *
 * Por que não só produto: metade da produção do galpão são etapas de insumo
 * ("pintar chapa 3 mm", "lavar borrachas") que não têm produto associado — e é
 * exatamente onde o tempo se esconde. Agrupar só por produto deixaria essas
 * horas fora da tela inteira.
 *
 * Grupo que só tem descarte CONTINUA aparecendo, com zero amostras. Sumir seria
 * o pior desfecho: quem procura "cadê a chancela" nunca descobriria que o
 * problema é ninguém apertar "iniciar" no tablet.
 *
 * Ordenado por TEMPO TOTAL: a decisão mora onde as horas estão, não onde a
 * razão por peça é mais feia. Uma tarefa lentíssima feita uma vez por mês não
 * é onde se ganha o dia.
 */
export function tempoPorProduto(lista: AtividadeMedida[]): TempoDoProduto[] {
  interface Acc {
    chave: string; rotulo: string; categoria: string; ehProduto: boolean;
    porPeca: number[]; porOrdem: number[]; estimados: number[];
    pecas: number; totalMin: number; descartes: Record<MotivoDescarte, number>;
    ultima: string | null;
  }
  const grupos = new Map<string, Acc>();

  for (const a of lista) {
    const produto = (a.produto_nome || "").trim();
    const rotulo = produto || (a.tarefa || "").trim() || "—";
    const chave = produto ? `p:${produto}` : `t:${rotulo}`;
    let g = grupos.get(chave);
    if (!g) {
      g = {
        chave, rotulo, categoria: a.categoria || "", ehProduto: !!produto,
        porPeca: [], porOrdem: [], estimados: [], pecas: 0, totalMin: 0,
        descartes: zerado(), ultima: null,
      };
      grupos.set(chave, g);
    }
    if (a.concluida_at && (!g.ultima || a.concluida_at > g.ultima)) g.ultima = a.concluida_at;

    const c = classificarAmostra(a);
    if (!c.ok) { g.descartes[c.motivo]++; continue; }

    g.porPeca.push(c.amostra.minPorPeca);
    g.porOrdem.push(c.amostra.duracaoMin);
    g.pecas += Number(a.quantidade_feita) || 0;
    g.totalMin += c.amostra.duracaoMin;
    const est = Number(a.tempo_estimado_min);
    if (Number.isFinite(est) && est > 0) g.estimados.push(est);
  }

  const out: TempoDoProduto[] = [];
  for (const g of grupos.values()) {
    const amostras = g.porPeca.length;
    const descartadas = Object.values(g.descartes).reduce((s, n) => s + n, 0);
    const medianaOrdemMin = arredondar(mediana(g.porOrdem), 1);
    const estimadoMin = g.estimados.length ? arredondar(mediana(g.estimados), 1) : null;
    out.push({
      chave: g.chave, rotulo: g.rotulo, categoria: g.categoria, ehProduto: g.ehProduto,
      amostras, descartadas, descartes: g.descartes,
      poucosDados: amostras < AMOSTRAS_PARA_CONFIAR,
      pecas: g.pecas,
      totalMin: arredondar(g.totalMin, 1),
      medianaMinPorPeca: arredondar(mediana(g.porPeca)),
      mediaMinPorPeca: arredondar(amostras ? g.porPeca.reduce((s, n) => s + n, 0) / amostras : 0),
      p90MinPorPeca: arredondar(percentil(g.porPeca, 90)),
      medianaOrdemMin,
      estimadoMin,
      aderencia: estimadoMin && medianaOrdemMin ? arredondar(medianaOrdemMin / estimadoMin) : null,
      ultima: g.ultima,
    });
  }

  return out.sort((a, b) => b.totalMin - a.totalMin || b.amostras - a.amostras || a.rotulo.localeCompare(b.rotulo));
}

/** Números do topo da tela — a leitura de uma linha só. */
export interface ResumoTempos {
  ordensMedidas: number;
  ordensDescartadas: number;
  /** A fração descartada. Acima de ~30% a tela inteira precisa relativizar. */
  fracaoDescartada: number;
  pecas: number;
  horas: number;
  /** Quantos grupos demoram mais que o previsto (aderência > 1,15). */
  acimaDoPrevisto: number;
  /** O descarte mais comum — é o que dá pra mandar consertar amanhã. */
  maiorDescarte: { motivo: MotivoDescarte; n: number } | null;
}

/** Acima disto a diferença já não é ruído de medição, é a tarefa mesmo. */
export const FOLGA_ADERENCIA = 1.15;

export function resumirTempos(grupos: TempoDoProduto[]): ResumoTempos {
  let ordensMedidas = 0, ordensDescartadas = 0, pecas = 0, minutos = 0, acimaDoPrevisto = 0;
  const porMotivo = zerado();
  for (const g of grupos) {
    ordensMedidas += g.amostras;
    ordensDescartadas += g.descartadas;
    pecas += g.pecas;
    minutos += g.totalMin;
    if (g.aderencia !== null && g.aderencia > FOLGA_ADERENCIA && !g.poucosDados) acimaDoPrevisto++;
    for (const [m, n] of Object.entries(g.descartes)) porMotivo[m as MotivoDescarte] += n;
  }
  const pior = (Object.entries(porMotivo) as [MotivoDescarte, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])[0];
  const total = ordensMedidas + ordensDescartadas;
  return {
    ordensMedidas, ordensDescartadas,
    fracaoDescartada: total ? arredondar(ordensDescartadas / total) : 0,
    pecas,
    horas: arredondar(minutos / 60, 1),
    acimaDoPrevisto,
    maiorDescarte: pior ? { motivo: pior[0], n: pior[1] } : null,
  };
}

// ── O que a TELA também precisa ──────────────────────────────────────────────
//
// Estas quatro coisas moravam em `lib/atividades-tempo-consulta.ts`, junto da
// leitura. Parece o lugar certo — são o contrato da rota — mas
// `atividades-tempo-consulta` importa `createSupabaseAdminClient`, que importa
// `next/headers`. Um `"use client"` que peça `PERIODOS` de lá arrasta o cliente
// do Supabase inteiro pro pacote do NAVEGADOR e o build morre com "You're
// importing a module that depends on next/headers".
//
// `tsc --noEmit` e o `npm test` passam os dois: a regra é do empacotador, não do
// tipo. Por isso o que a tela usa mora AQUI, no módulo puro — e a fronteira
// deixa de depender de alguém lembrar.

/** Além de 180 dias o número deixa de descrever a produção de hoje. */
export const MAX_DIAS = 180;
export const DIAS_PADRAO = 30;
/** Períodos oferecidos na tela — a mesma lista aqui e lá. */
export const PERIODOS = [7, 30, 90] as const;

/**
 * Teto de ordens lidas numa consulta. Colunas nomeadas e estreitas de propósito:
 * `select("*")` arrastaria `detalhe`, `instrucoes` e `foto_url` — texto longo
 * que esta conta não usa — em duas mil linhas.
 */
export const TETO_ORDENS = 2000;

/** O que a rota devolve e o que a página recebe pronto do servidor. */
export interface Tempos {
  dias: number;
  grupos: TempoDoProduto[];
  resumo: ResumoTempos;
  /**
   * Bateu no teto: a amostra é das ordens MAIS RECENTES da janela, não da
   * janela inteira. A tela precisa dizer isso — senão "últimos 90 dias" vira
   * uma promessa que os números não cumprem.
   */
  truncado: boolean;
  escopo: "minhas" | "equipe";
  /**
   * Como as ordens foram ABERTAS: com bipe do material, ou pela saída de
   * emergência. `null` = não consultado (escopo "minhas") ou o livro não
   * respondeu — nunca zeros calados, que leriam como "ninguém usou a saída".
   */
  aberturas?: Aberturas | null;
}

export function diasValidos(bruto: unknown): number {
  const n = Math.round(Number(bruto) || 0);
  if (!n) return DIAS_PADRAO;
  return Math.min(MAX_DIAS, Math.max(1, n));
}

/** "1 h 12 min" / "12 min" / "45 s" — o mesmo texto na tela e no teste. */
export function textoDuracao(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "—";
  if (min < 1) return `${Math.round(min * 60)} s`;
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}
