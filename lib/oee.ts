/**
 * OEE — Efetividade Global do Equipamento (Overall Equipment Effectiveness).
 *
 * O indicador de Seiichi Nakajima (pai da TPM): quanto do potencial máximo da
 * máquina virou peça boa. É o produto de três pilares, e é PRODUTO de
 * propósito — 90% em cada um dá 73% de OEE, que é o que faz o número doer.
 *
 *   OEE = Disponibilidade × Desempenho × Qualidade
 *
 *  · Disponibilidade — do tempo PLANEJADO pra produzir, quanto a máquina
 *    ficou de fato cortando. Perde tempo quem quebra, quem espera peça e
 *    quem fica sem programação na fila (fila vazia é perda de disponibilidade,
 *    não "tudo certo").
 *  · Desempenho — rodou na velocidade esperada? Compara o tempo PADRÃO das
 *    programações fechadas (a estimativa que o programador deu) com o tempo
 *    real que elas levaram. Levou mais que o padrão: caiu o ritmo.
 *  · Qualidade — das peças apontadas, quantas saíram boas. Refugo e
 *    retrabalho descontam.
 *
 * 85% é o patamar de classe mundial. A referência de mercado (Nakajima) é
 * 90% de disponibilidade × 95% de desempenho × 99% de qualidade.
 *
 * Este arquivo é PURO — nenhum import de servidor, igual ao
 * `lib/painel-maquinas.ts`, porque quem desenha o OEE é componente de cliente.
 *
 * ── O que a conta NÃO inventa ────────────────────────────────────────────────
 * Qualidade só existe com apontamento de peças (`pecas`/`refugos` em
 * `maquina_programacoes`, ver `supabase/maquinas_oee.sql`). Sem apontamento
 * nenhum, `qualidadeApontada` é `false` e a qualidade entra como 100% — mas a
 * tela precisa DIZER isso, senão o OEE vira propaganda: um número que só sobe
 * porque ninguém contou o refugo.
 */

/** Patamar de classe mundial. Acima disso o setor está no topo do benchmark. */
export const OEE_CLASSE_MUNDIAL = 85;

/** Referência Nakajima de cada pilar, pra tela mostrar a meta ao lado do real. */
export const OEE_META = { disponibilidade: 90, desempenho: 95, qualidade: 99 } as const;

export type FaixaOEE = "mundial" | "bom" | "aceitavel" | "baixo";

export interface EntradaOEE {
  /** Minutos de turno já decorridos hoje (janela planejada pra produzir). */
  minutosPlanejados: number;
  /** Paradas PLANEJADAS (manutenção preventiva, setup combinado): saem do planejado. */
  minutosParadaPlanejada?: number;
  /** Minutos em que a máquina esteve de fato cortando hoje. */
  minutosOperando: number;
  /** Soma das estimativas das programações fechadas hoje (tempo padrão). */
  minutosPadraoProduzidos: number;
  /** Tempo real que essas mesmas programações levaram. */
  minutosRealProduzidos: number;
  /** Peças apontadas hoje (total produzido, boas + refugo). */
  pecas?: number;
  /** Refugo e retrabalho apontados hoje. */
  refugos?: number;
}

export interface ResultadoOEE {
  /** 0–100, uma casa decimal. */
  disponibilidade: number;
  desempenho: number;
  qualidade: number;
  oee: number;
  faixa: FaixaOEE;
  /** `false` quando ninguém apontou peça: a qualidade é suposição, não medida. */
  qualidadeApontada: boolean;
  /** Minutos de turno que a máquina ficou sem produzir. */
  minutosPerdidos: number;
  pecas: number;
  refugos: number;
}

const arred = (n: number) => Math.round(n * 10) / 10;
/** Limita a 0–100: estimativa generosa não pode virar 130% de desempenho. */
const teto = (n: number) => Math.max(0, Math.min(100, n));

export function faixaDoOEE(oee: number): FaixaOEE {
  if (oee >= OEE_CLASSE_MUNDIAL) return "mundial";
  if (oee >= 60) return "bom";
  if (oee >= 40) return "aceitavel";
  return "baixo";
}

/** A cor do número na parede. Semântica (estado), nunca a rampa de gráfico. */
export function corDoOEE(faixa: FaixaOEE): string {
  return faixa === "mundial" || faixa === "bom" ? "var(--ok)" : faixa === "aceitavel" ? "var(--atencao)" : "var(--perigo)";
}

export const ROTULO_FAIXA: Record<FaixaOEE, string> = {
  mundial: "Classe mundial",
  bom: "Bom",
  aceitavel: "Aceitável",
  baixo: "Abaixo do esperado",
};

/**
 * A conta. Cada pilar é uma divisão que pode ter denominador zero — e zero
 * aqui não é "0%", é "ainda não dá pra dizer": turno que não começou tem 100%
 * de disponibilidade, não 0. Pintar de vermelho às 7h50 ensina o galpão a
 * ignorar o painel.
 */
export function calcularOEE(e: EntradaOEE): ResultadoOEE {
  const planejado = Math.max(0, e.minutosPlanejados - Math.max(0, e.minutosParadaPlanejada ?? 0));
  const operando = Math.max(0, Math.min(e.minutosOperando, planejado || e.minutosOperando));

  const disponibilidade = planejado > 0 ? teto((operando / planejado) * 100) : 100;

  const real = Math.max(0, e.minutosRealProduzidos);
  const padrao = Math.max(0, e.minutosPadraoProduzidos);
  const desempenho = real > 0 ? teto((padrao / real) * 100) : 100;

  const pecas = Math.max(0, Math.round(e.pecas ?? 0));
  const refugos = Math.max(0, Math.min(Math.round(e.refugos ?? 0), pecas));
  const qualidadeApontada = pecas > 0;
  const qualidade = qualidadeApontada ? teto(((pecas - refugos) / pecas) * 100) : 100;

  const oee = (disponibilidade / 100) * (desempenho / 100) * (qualidade / 100) * 100;

  return {
    disponibilidade: arred(disponibilidade),
    desempenho: arred(desempenho),
    qualidade: arred(qualidade),
    oee: arred(oee),
    faixa: faixaDoOEE(oee),
    qualidadeApontada,
    minutosPerdidos: Math.max(0, Math.round(planejado - operando)),
    pecas,
    refugos,
  };
}

/**
 * O OEE do SETOR não é a média dos OEEs — é a conta refeita com a soma dos
 * tempos. Média de porcentagem dá peso igual a uma máquina que rodou 8h e a
 * uma que rodou 20min, e a parede passa a mentir sempre que alguém liga um
 * laser pequeno no fim do dia.
 */
export function somarOEE(entradas: EntradaOEE[]): ResultadoOEE {
  const soma = entradas.reduce<Required<EntradaOEE>>((a, e) => ({
    minutosPlanejados: a.minutosPlanejados + Math.max(0, e.minutosPlanejados),
    minutosParadaPlanejada: a.minutosParadaPlanejada + Math.max(0, e.minutosParadaPlanejada ?? 0),
    minutosOperando: a.minutosOperando + Math.max(0, e.minutosOperando),
    minutosPadraoProduzidos: a.minutosPadraoProduzidos + Math.max(0, e.minutosPadraoProduzidos),
    minutosRealProduzidos: a.minutosRealProduzidos + Math.max(0, e.minutosRealProduzidos),
    pecas: a.pecas + Math.max(0, e.pecas ?? 0),
    refugos: a.refugos + Math.max(0, e.refugos ?? 0),
  }), {
    minutosPlanejados: 0, minutosParadaPlanejada: 0, minutosOperando: 0,
    minutosPadraoProduzidos: 0, minutosRealProduzidos: 0, pecas: 0, refugos: 0,
  });
  return calcularOEE(soma);
}

/**
 * Minutos de turno já decorridos hoje, no fuso de São Paulo.
 *
 * `agoraMin` e a janela vêm em minutos desde a meia-noite. Turno que vira o
 * dia (22:00 → 06:00) conta desde a virada: às 02:00 já rodaram quatro horas.
 */
export function minutosDeTurnoDecorridos(agoraMin: number, inicioMin: number, fimMin: number): number {
  if (fimMin > inicioMin) return Math.max(0, Math.min(agoraMin, fimMin) - inicioMin);
  // Turno noturno (22:00 → 06:00): às 02:00 já rodaram QUATRO horas de turno,
  // não duas — ele começou ontem. Fora da janela, o turno inteiro já passou.
  const duracao = 24 * 60 - inicioMin + fimMin;
  if (agoraMin >= inicioMin) return agoraMin - inicioMin;
  if (agoraMin < fimMin) return 24 * 60 - inicioMin + agoraMin;
  return duracao;
}

/** "08:00" / "08:00:00" → 480. Vazio ou torto cai no padrão. */
export function minutosDoRelogio(hhmm: string | null | undefined, padrao: number): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? "").trim());
  if (!m) return padrao;
  const h = Number(m[1]), min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return padrao;
  return h * 60 + min;
}

/** Turno padrão do galpão quando a máquina não tem janela própria. */
export const TURNO_PADRAO = { inicio: 8 * 60, fim: 18 * 60 } as const;
