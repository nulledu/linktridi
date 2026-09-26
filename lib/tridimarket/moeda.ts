import { formatMarketCurrency } from "./view";

// Campo de dinheiro no jeito que se digita no Brasil.
//
// O `<input type="number">` que havia antes obrigava a pessoa a pensar em
// separador decimal — e cada teclado resolve isso de um jeito. Digitar "12,50"
// num campo numérico dá vazio em boa parte dos navegadores, e "12.5" aparece
// como "12.5" em vez de R$ 12,50. Num lançamento de pagamento, digitar errado
// e não perceber é a pior falha possível.
//
// O modelo aqui é o de terminal de cartão: só existem DÍGITOS, e eles entram
// pela direita em centavos. Digitar 1 → R$ 0,01; 12 → R$ 0,12; 1250 → R$ 12,50.
// Não há como produzir um valor ambíguo, e o que está na tela é exatamente o
// que vai ser cobrado.
//
// O valor é guardado em CENTAVOS (inteiro). Dinheiro em ponto flutuante acumula
// erro: 0.1 + 0.2 não dá 0.3, e num total de carteira isso vira centavo fantasma.

// Teto de segurança: 12 dígitos = R$ 9.999.999.999,99. Sem isso, segurar uma
// tecla gera um número que estoura o inteiro seguro do JS.
const MAX_DIGITOS = 12;

// Extrai só os dígitos do que a pessoa digitou e devolve os centavos.
// Zeros à esquerda somem ("007" → 7 centavos), senão o campo enche de zero.
export function centavosDoTexto(texto: string): number {
  const digitos = (texto ?? "").replace(/\D/g, "").slice(0, MAX_DIGITOS);
  if (!digitos) return 0;
  return Number(digitos);
}

// Centavos → o que aparece no campo. Zero mostra vazio, não "R$ 0,00": um campo
// que já vem preenchido com zero faz a pessoa apagar antes de digitar.
export function textoDeCentavos(centavos: number): string {
  if (!Number.isFinite(centavos) || centavos <= 0) return "";
  return formatMarketCurrency(centavos / 100);
}

// Centavos → reais, para mandar pra API. Arredonda de propósito: o resto da
// divisão por 100 nunca deve virar dízima.
export function reaisDeCentavos(centavos: number): number {
  return Math.round(centavos) / 100;
}

// Reais → centavos, para preencher o campo a partir de um valor que já existe
// (ex.: o botão "quitar tudo" traz o saldo da carteira).
export function centavosDeReais(reais: number): number {
  if (!Number.isFinite(reais) || reais <= 0) return 0;
  return Math.round(reais * 100);
}

// ── Limite: reais inteiros, sem centavo ─────────────────────────────────────
//
// Limite de crédito não é preço. Ninguém libera R$ 137,42 pra alguém comprar:
// é 50, 100, 150, 500. Reaproveitar a máscara de centavos aqui obrigava a
// digitar 10000 pra dizer "cem reais" — e quem digitava 100, o número que a
// pessoa tem na cabeça, saía com limite de R$ 1,00 sem perceber.
//
// Aqui cada dígito vale UM REAL: 100 é cem reais. Não existe casa decimal pra
// errar, e o campo mostra "R$ 100" — sem ",00" fingindo precisão que o limite
// nunca teve.

// Teto de segurança, como no campo de dinheiro: 9 dígitos = R$ 999.999.999.
const MAX_DIGITOS_LIMITE = 9;

export function reaisInteirosDoTexto(texto: string): number {
  const digitos = (texto ?? "").replace(/\D/g, "").slice(0, MAX_DIGITOS_LIMITE);
  if (!digitos) return 0;
  return Number(digitos);
}

// Zero mostra vazio pelo mesmo motivo do campo de dinheiro: campo que já nasce
// com "R$ 0" faz a pessoa apagar antes de digitar. Valor legado com centavo
// (veio do ERP antigo) arredonda pro real mais próximo em vez de sumir.
export function textoDeReaisInteiros(reais: number): string {
  if (!Number.isFinite(reais) || reais <= 0) return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", maximumFractionDigits: 0,
  }).format(Math.round(reais));
}
