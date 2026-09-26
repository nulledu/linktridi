// ── O que o gerente precisa saber ANTES de dizer certo ou errado ─────────────
//
// Módulo puro (sem React, sem Supabase) porque as mesmas três contas são feitas
// em quatro lugares — a fila do computador, a ficha do computador, a rota do
// tablet e a tela do tablet — e uma conta feita quatro vezes é uma conta que
// diverge em três.
//
// O que mora aqui:
//
//  1. A DIFERENÇA ENTRE PEDIDO E FEITO. A tela mostrava "19" e o alvo escondido
//     atrás de uma condição; quem lê "19" não sabe que faltaram onze. Fazer a
//     subtração de cabeça, trinta vezes por dia, com uma caixa na mão, é
//     exatamente onde a decisão erra.
//  2. O TEMPO que a atividade levou, contra o que se esperava. É APOIO, não
//     acusação: explica um número baixo sem transformar cada caixa num
//     julgamento.
//  3. Como falar de duração pra quem está de pé no galpão ("1 h 12 min", nunca
//     "72 min" nem "0.8 h").

/** Além disto, não é tempo de trabalho: é atividade que ficou aberta. */
export const TETO_DE_DURACAO_MIN = 12 * 60;

export type EstadoDaQuantidade =
  /** Saiu exatamente o que foi pedido. */
  | "bateu"
  /** Saiu menos. É o caso que muda a decisão, e o que a tela escondia. */
  | "faltou"
  /** Saiu mais do que o pedido. */
  | "passou"
  /** A atividade nasceu sem alvo — não há o que comparar. */
  | "sem_alvo"
  /** Ninguém registrou quantas fez. Diferente de "fez zero". */
  | "nao_informada";

export interface DiferencaDeQuantidade {
  estado: EstadoDaQuantidade;
  feita: number;
  alvo: number;
  /** Quantas peças faltaram. 0 em todos os outros estados. */
  faltaram: number;
  /** Quantas saíram a mais. 0 em todos os outros estados. */
  sobraram: number;
  /** O número principal: "19 de 30", "30 peças". */
  texto: string;
  /**
   * A frase da diferença: "faltaram 11", "5 a mais", "ninguém contou".
   * `null` quando não há diferença nenhuma a contar — e aí a tela não desenha
   * nada, em vez de escrever "faltaram 0".
   */
  diferenca: string | null;
  /**
   * Pinta de atenção? Só a FALTA e a contagem ausente: são os dois estados que
   * pedem uma pergunta antes de aprovar. Produzir a mais não é defeito, e
   * pintar tudo de amarelo é como o amarelo deixa de ser lido.
   */
  atencao: boolean;
}

function pecas(n: number): string {
  return `${n} peça${n === 1 ? "" : "s"}`;
}

/**
 * "19 de 30 — faltaram 11", sem ninguém subtrair.
 *
 * `feita <= 0` com alvo é tratado como NÃO INFORMADA, não como zero: é a mesma
 * leitura do servidor (`registrarConferencia` cai no alvo quando a pessoa não
 * informou) e a diferença é acusatória — "faltaram 30" culpa alguém que
 * provavelmente só esqueceu de digitar ao concluir.
 */
export function diferencaDeQuantidade(feitaCrua: number, alvoCru: number): DiferencaDeQuantidade {
  const feita = Number.isFinite(feitaCrua) ? Math.max(0, Math.trunc(feitaCrua)) : 0;
  const alvo = Number.isFinite(alvoCru) ? Math.max(0, Math.trunc(alvoCru)) : 0;
  const base = { feita, alvo, faltaram: 0, sobraram: 0 };

  if (alvo <= 0) {
    // Sem alvo não existe falta: a atividade nunca pediu um número. Dizer "19
    // de 0" seria inventar uma cobrança que ninguém fez.
    return { ...base, estado: "sem_alvo", texto: pecas(feita), diferenca: null, atencao: false };
  }
  if (feita <= 0) {
    return {
      ...base, estado: "nao_informada",
      texto: `— de ${alvo}`,
      diferenca: "ninguém contou",
      atencao: true,
    };
  }
  if (feita < alvo) {
    const faltaram = alvo - feita;
    return {
      ...base, estado: "faltou", faltaram,
      texto: `${feita} de ${alvo}`,
      diferenca: faltaram === 1 ? "faltou 1" : `faltaram ${faltaram}`,
      atencao: true,
    };
  }
  if (feita > alvo) {
    const sobraram = feita - alvo;
    return {
      ...base, estado: "passou", sobraram,
      texto: `${feita} de ${alvo}`,
      diferenca: `${sobraram} a mais`,
      atencao: false,
    };
  }
  return { ...base, estado: "bateu", texto: `${feita} de ${alvo}`, diferenca: null, atencao: false };
}

/**
 * Minutos entre começar e concluir, ou `null`.
 *
 * O teto de 12 h é o mesmo do painel de produção, e existe porque a atividade
 * esquecida aberta na sexta e fechada na segunda não é "72 h de trabalho": é um
 * dado que, mostrado cru, faz o gerente desconfiar de quem trabalhou certo.
 * Aqui ela vira `null` — o bloco simplesmente não aparece.
 */
export function minutosDaAtividade(iniciadaEm: string | null | undefined, concluidaEm: string | null | undefined): number | null {
  if (!iniciadaEm || !concluidaEm) return null;
  const ini = Date.parse(iniciadaEm);
  const fim = Date.parse(concluidaEm);
  if (!Number.isFinite(ini) || !Number.isFinite(fim)) return null;
  const min = (fim - ini) / 60_000;
  if (min <= 0 || min > TETO_DE_DURACAO_MIN) return null;
  return Math.round(min);
}

/** "45 min", "1 h", "1 h 12 min" — nunca "72 min" nem "0,8 h". */
export function duracaoEmPortugues(min: number | null | undefined): string | null {
  if (min == null || !Number.isFinite(min) || min <= 0) return null;
  const total = Math.round(min);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export interface TempoDaAtividade {
  realMin: number | null;
  estimadoMin: number | null;
  /** "34 min" — quanto levou de verdade. `null` quando não dá pra saber. */
  texto: string | null;
  /** "estimado 40 min" — a referência, e só quando ela existe. */
  referencia: string | null;
  /**
   * Levou mais da metade a mais do que o estimado. NÃO é alarme: é o que
   * explica um número baixo de peças sem ninguém acusar ninguém — quem levou o
   * dobro do tempo provavelmente lutou com o material, não enrolou.
   */
  demorou: boolean;
  /**
   * A FRASE INTEIRA, pronta pra desenhar: "Levou 34 min · estimado 40 min".
   *
   * Existe porque montar essa frase na tela é como ela divergiu. O tablet
   * juntava os pedaços à mão e, sem `iniciada_at` (atividade concluída sem
   * nunca ter sido iniciada), escrevia **"Levou estimado 40 min"** — a
   * estimativa vestida de fato, sobre uma caixa em que ninguém sabe quanto
   * tempo levou. O computador, na mesma caixa, não escrevia nada.
   *
   * `null` quando não se sabe a duração real. A estimativa SOZINHA não vira
   * frase: ela é o plano, não o que aconteceu, e "o previsto era 40 min" não
   * ajuda a entender um número baixo de peças — que é a única razão de este
   * bloco existir.
   */
  fraseDeApoio: string | null;
}

/**
 * O tempo, dito como APOIO.
 *
 * Sem cor, sem alerta, sem "produtividade": o pedido do dono foi "ajuda a
 * entender um número baixo sem acusar ninguém". Um cronômetro pintado de
 * vermelho na tela de conferência viraria outra coisa em uma semana.
 */
export function tempoDaAtividade(realMin: number | null | undefined, estimadoMin: number | null | undefined): TempoDaAtividade {
  const real = realMin != null && Number.isFinite(realMin) && realMin > 0 ? Math.round(realMin) : null;
  const estimado = estimadoMin != null && Number.isFinite(estimadoMin) && estimadoMin > 0 ? Math.round(estimadoMin) : null;
  const texto = duracaoEmPortugues(real);
  const refTexto = duracaoEmPortugues(estimado);
  const referencia = refTexto ? `estimado ${refTexto}` : null;
  const demorou = real != null && estimado != null && real > estimado * 1.5;
  return {
    realMin: real,
    estimadoMin: estimado,
    texto,
    referencia,
    demorou,
    // Sem duração real não há frase — ver `fraseDeApoio`.
    fraseDeApoio: texto
      ? `Levou ${texto}${referencia ? ` · ${referencia}` : ""}${demorou ? " — bem mais que o previsto" : ""}`
      : null,
  };
}
