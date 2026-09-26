// ── Analytics · o vocabulário da central de inteligência ────────────────────
//
// Arquivo SÓ de tipos, separado do `operacao.ts` de propósito: quem monta o
// dado fala com o ERP e com o Supabase, e a tela é um componente de cliente.
// Um `import type` some na compilação, mas o caminho do módulo não: importar
// direto do arquivo que puxa `createSupabaseAdminClient` arrasta o cliente de
// servidor pro bundle na primeira vez que alguém esquecer o `type`.

/** Nível de atenção de uma fila. Vira `Selo` na tela, na paleta semântica. */
export type Nivel = "alta" | "media" | "baixa";

/** Tom de um insight. "ruim" e "atencao" diferem em urgência, não em assunto. */
export type TomInsight = "bom" | "atencao" | "ruim" | "neutro";

/**
 * Um número com a sua comparação.
 *
 * `deltaPct` é `null` quando o período anterior foi ZERO — e isso não é o
 * mesmo que 0%. Dividir por zero devolvia "+100%" pra toda métrica que estreou
 * no período, e a tela dizia "dobrou" onde a verdade é "não havia com o que
 * comparar".
 */
export interface Comparacao {
  atual: number;
  anterior: number;
  deltaPct: number | null;
}

/**
 * Uma etapa do fluxo operacional: o que PASSOU por ela no período (`total`) e
 * o que está PARADO nela agora (`parados`). São perguntas diferentes e a tela
 * mostra as duas lado a lado porque a leitura que importa é a relação entre
 * elas — muita passagem com fila baixa é etapa saudável; pouca passagem com
 * fila alta é gargalo.
 */
export interface EtapaFluxo {
  key: string;
  nome: string;
  icon: string;
  total: number;
  deltaPct: number | null;
  parados: number;
  /** Etapas do ERP que compõem a fila desta caixa — é por onde o drill abre. */
  etapas: number[];
}

/** Uma fila parada, com há quanto tempo e o quanto isso é grave. */
export interface ParadoEtapa {
  id: number;
  nome: string;
  parados: number;
  /** Média de dias que os pedidos desta fila estão esperando AGORA. */
  diasMedio: number;
  /** Variação da VAZÃO da etapa contra o período anterior — não da fila.
   *  Fila não tem histórico no ERP; vazão tem. */
  deltaPct: number | null;
  nivel: Nivel;
}

export interface PontoSerie {
  day: string;
  atual: number;
  /** Mesmo dia-a-dia do período anterior, alinhado por posição. */
  anterior: number | null;
}

export interface SerieAnalitica {
  nome: string;
  pontos: PontoSerie[];
  total: number;
  totalAnterior: number;
  /** Média por dia do período — a régua de "ritmo". */
  media: number;
}

export interface ResumoOperacao {
  /** Pedidos que ENTRARAM no período (nascimento no ERP). */
  pedidos: Comparacao;
  produzidos: Comparacao;
  enviados: Comparacao;
  /** Dias entre a entrada do pedido e o envio, dos que saíram no período. */
  tempoMedioDias: Comparacao;
  /** Pedidos em aberto vencidos AGORA. Não tem "período anterior": é um
   *  retrato do presente, e inventar comparação pra ele seria mentira. */
  atrasados: number;
  /** % dos enviados no período que saíram dentro do prazo. */
  slaPct: Comparacao;
  slaMetaDias: number;
}

export interface Insight {
  id: string;
  tom: TomInsight;
  icon: string;
  titulo: string;
  texto: string;
  /** Âncora da análise relacionada — é pra onde o "Ver análise" rola. */
  alvo: string;
}

export interface AnalyticsOperacao {
  updatedAt: string;
  periodLabel: string;
  periodoAnteriorLabel: string;
  resumo: ResumoOperacao;
  fluxo: EtapaFluxo[];
  parados: ParadoEtapa[];
  series: { fabricados: SerieAnalitica; enviados: SerieAnalitica };
  insights: Insight[];
}
