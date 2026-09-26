// ── "Quantas peças saem de UMA chapa" ────────────────────────────────────────
//
// A ficha técnica guarda CONSUMO POR PEÇA: quanto de cada componente entra em
// uma unidade do produto. É o formato certo pra multiplicar (10 peças × 0,125
// chapa = 1,25 chapa) e é o que o resto do sistema já usa.
//
// Mas não é como o galpão pensa. Ninguém corta "0,125 de uma chapa" — corta uma
// chapa INTEIRA e sai com oito peças. Perguntar "quanto de chapa vai numa peça?"
// obriga a pessoa a fazer a divisão de cabeça e digitar 0,125; e se ela errar a
// conta, o custo e a necessidade de compra saem errados sem ninguém notar.
//
// Este arquivo é só a conversão entre as duas formas de dizer a mesma coisa:
//
//     consumo por peça  =  1 / rendimento
//     rendimento        =  1 / consumo por peça
//
// O que MUDA é a pergunta na tela; o que se GRAVA continua sendo o consumo.
// Nenhuma coluna nova, nenhum SQL.

/**
 * Casas decimais do consumo gravado.
 *
 * Eram TRÊS — o limite antigo da coluna (`numeric(12,3)`) e do campo da ficha —
 * e três casas impedem exatamente o caso deste arquivo, o rendimento ALTO:
 *
 *   rende  8 → 0,125     exato
 *   rende 16 → 0,0625    virava 0,063  → voltava 15,87 peças
 *   rende 24 → 0,041667  virava 0,042  → voltava 23,8  peças
 *
 * Seis casas deixam 1/16 e 1/64 exatos e cobrem rendimento até a casa do
 * milhar. A coluna acompanha em supabase/ficha_tecnica_rendimento.sql — e sem
 * esse SQL nada quebra: o Postgres só arredonda na gravação, que é o
 * comportamento de hoje.
 */
const CASAS = 6;

const arredondar = (n: number) => Math.round(n * 10 ** CASAS) / 10 ** CASAS;

/**
 * De "1 chapa rende 8 peças" para o consumo por peça (0,125).
 *
 * Rendimento zero ou negativo devolve 0 — "não consome" —, nunca Infinity: um
 * Infinity gravado envenena toda multiplicação de custo depois.
 */
export function consumoPorPeca(rendimento: number): number {
  const r = Number(rendimento);
  if (!Number.isFinite(r) || r <= 0) return 0;
  return arredondar(1 / r);
}

/**
 * De volta: do consumo gravado para o rendimento legível.
 *
 * ── POR QUE ELE VOLTA REDONDO ────────────────────────────────────────────────
 *
 * A ida perde precisão: 1/6 = 0,1666… e o campo guarda 0,167. A volta crua daria
 * 5,988 — e "5,988 peças por chapa" na tela lê como defeito, não como
 * arredondamento. Então a volta encosta no inteiro quando está perto dele
 * (tolerância de meio por cento, folgada o bastante para as três casas e
 * apertada o bastante para não mentir sobre um rendimento de verdade
 * fracionário).
 */
export function rendimentoDe(consumo: number): number {
  const c = Number(consumo);
  if (!Number.isFinite(c) || c <= 0) return 0;
  const bruto = 1 / c;
  const perto = Math.round(bruto);
  if (perto > 0 && Math.abs(bruto - perto) / perto < 0.005) return perto;
  return Math.round(bruto * 100) / 100;
}

// Houve aqui um `rendimentoEhLimpo`, para a tela decidir quando NÃO oferecer o
// modo rendimento. Ele saiu: com seis casas a conversão é fiel para qualquer
// consumo positivo — 0,167 vira "rende 6" e 0,13 vira "rende 7,69", os dois
// certos —, então a função respondia `true` praticamente sempre. Guarda que não
// barra nada é pior que guarda nenhum: ele sugere uma proteção que não existe.
// Os dois modos são sempre oferecidos, e a frase de confirmação mostra o que
// foi entendido antes de gravar.

/** "1 chapa faz 8 peças" — a frase que confirma o que foi entendido. */
export function fraseDoRendimento(rendimento: number, unidadeDoComponente = "un"): string {
  const r = Number(rendimento);
  if (!Number.isFinite(r) || r <= 0) return "Diga quantas peças saem de uma.";
  const n = Number.isInteger(r) ? String(r) : String(r).replace(".", ",");
  return `1 ${unidadeDoComponente} rende ${n} ${r === 1 ? "peça" : "peças"}.`;
}

/** "cada peça consome 0,125 ch" — o espelho, pra quem confere a conta. */
export function fraseDoConsumo(consumo: number, unidadeDoComponente = "un"): string {
  const c = arredondar(Number(consumo) || 0);
  if (c <= 0) return "Nada consumido.";
  return `cada peça consome ${String(c).replace(".", ",")} ${unidadeDoComponente}`;
}
