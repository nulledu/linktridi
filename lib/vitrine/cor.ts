// ── Cor, do jeito que o Liquid faz ───────────────────────────────────────────
// O `css-variables.liquid` do tema deriva meia dúzia de variáveis das cores
// escolhidas: `color_darken`, `color_modify: 'alpha'`, `color_extract: 'red'` e
// a decisão preto-ou-branco por `color_extract: 'lightness'`.
//
// Reimplementar isto é obrigatório pra cópia ser fiel: as bordas de formulário
// são a cor da borda 5% mais escura, o fundo de destaque é o destaque a 8% de
// alfa, e o texto do selo de promoção é branco ou preto conforme a luminosidade
// do fundo. Chutar essas quatro coisas já muda a cara da loja inteira.
//
// O Shopify trabalha em HSL, com luminosidade em porcentagem — é por isso que
// isto converte pra HSL em vez de mexer no RGB direto.

export interface RGB { r: number; g: number; b: number }

const limita = (n: number, min = 0, max = 255) => Math.max(min, Math.min(max, n));

/** Aceita `#rgb`, `#rrggbb` e `rgb()/rgba()`. Fora disso devolve preto. */
export function paraRGB(cor: string): RGB {
  const c = (cor || "").trim();
  const hex = c.replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  const m = c.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (m) return { r: limita(+m[1]), g: limita(+m[2]), b: limita(+m[3]) };
  return { r: 0, g: 0, b: 0 };
}

export const rgbTexto = (cor: string): string => {
  const { r, g, b } = paraRGB(cor);
  return `${r}, ${g}, ${b}`;
};

interface HSL { h: number; s: number; l: number }

function paraHSL(cor: string): HSL {
  const { r, g, b } = paraRGB(cor);
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
  else if (max === gg) h = ((bb - rr) / d + 2) / 6;
  else h = ((rr - gg) / d + 4) / 6;
  return { h, s, l };
}

function deHSL({ h, s, l }: HSL): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(limita(v * 255));
  };
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}

/** `color_darken: n` — n pontos percentuais a menos de luminosidade. */
export function escurecer(cor: string, pontos: number): string {
  const hsl = paraHSL(cor);
  return deHSL({ ...hsl, l: Math.max(0, hsl.l - pontos / 100) });
}

/** `color_lighten: n`. */
export function clarear(cor: string, pontos: number): string {
  const hsl = paraHSL(cor);
  return deHSL({ ...hsl, l: Math.min(1, hsl.l + pontos / 100) });
}

/** `color_modify: 'alpha', n` — vira `rgba()`, porque o tema usa assim. */
export function comAlfa(cor: string, alfa: number): string {
  const { r, g, b } = paraRGB(cor);
  return `rgba(${r}, ${g}, ${b}, ${alfa})`;
}

/** `color_extract: 'lightness'` — em pontos percentuais, como o Liquid devolve. */
export const luminosidade = (cor: string): number => Math.round(paraHSL(cor).l * 100);

/**
 * A regra do tema para texto sobre fundo colorido: abaixo de 65 de
 * luminosidade escreve em branco, acima escreve em preto. Não é contraste
 * calculado — é o que o Liquid faz, e copiar o comportamento é o ponto.
 */
export const textoSobre = (fundo: string): string => (luminosidade(fundo) < 65 ? "#ffffff" : "#000000");

// ── Legibilidade sobre fundo escolhido pelo lojista ──────────────────────────
//
// `textoSobre` acima é o porte fiel do Liquid (corte em 65 de luminosidade) e
// serve pro selo de promoção — mexer nele mudaria a cara da cópia. O que segue
// é outra coisa, pra outro problema.
//
// O problema: cabeçalho e rodapé aceitam um DEGRADÊ de duas pontas, mas a cor
// do texto é um valor global, escolhido uma vez. Um degradê de roxo pra BRANCO
// com texto branco — exatamente o que o modelo importado trazia — deixa a
// metade direita ilegível: "Carrinho" existe, é branco, e está sobre branco.
// Nada no editor avisava, porque cada valor sozinho é válido.
//
// A regra aqui: a cor escolhida VENCE quando dá pra ler. Quando não dá em
// alguma das pontas, entra a que dá. Escolha impossível é consertada; escolha
// legível é respeitada.

/** Luminância relativa da WCAG (não é a luminosidade do HSL). */
function luminanciaRelativa(cor: string): number {
  const { r, g, b } = paraRGB(cor);
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Razão de contraste da WCAG, de 1 (igual) a 21 (preto no branco). */
export function contrasteEntre(a: string, b: string): number {
  const la = luminanciaRelativa(a), lb = luminanciaRelativa(b);
  const claro = Math.max(la, lb), escuro = Math.min(la, lb);
  return (claro + 0.05) / (escuro + 0.05);
}

/** O contraste da PIOR ponta — é ela que decide se dá pra ler o bloco inteiro. */
export const piorContraste = (texto: string, fundos: string[]): number =>
  fundos.filter(Boolean).reduce((pior, f) => Math.min(pior, contrasteEntre(texto, f)), Infinity);

/**
 * A cor do texto que sobrevive a TODAS as pontas do fundo.
 *
 * Devolve `escolhida` quando ela passa do mínimo em todas; senão devolve preto
 * ou branco, o que for melhor no pior caso. `minimo` é 4.5 (AA para texto
 * normal) porque cabeçalho e rodapé escrevem em 12–14px.
 */
export function legivelSobre(escolhida: string, fundos: string[], minimo = 4.5): string {
  const validos = fundos.filter(Boolean).filter((f) => !f.includes("var("));
  if (!validos.length) return escolhida;
  if (escolhida && !escolhida.includes("var(") && piorContraste(escolhida, validos) >= minimo) return escolhida;
  // `#111` e não `#000`: preto puro sobre cor saturada vibra. A diferença de
  // contraste é de 0.6 e nenhum caso real depende dela.
  const escuro = "#111111", claro = "#ffffff";
  return piorContraste(claro, validos) >= piorContraste(escuro, validos) ? claro : escuro;
}
