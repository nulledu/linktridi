// Code128-B — gerador de código de barras em SVG, sem depender de pacote externo.
//
// Por quê não um pacote (jsbarcode, bwip-js, etc.): a "biblioteca" inteira do
// Code128 é uma tabela fixa de 107 larguras — trazer uma dependência pra isso é
// peso morto. E SVG sai nítido em qualquer tamanho de impressão; um <canvas>
// rasterizado embaça ao redimensionar pra etiqueta.
//
// A tabela abaixo é a tabela padrão do Code128 (os valores 0-102 são
// compartilhados pelas Code Sets A/B/C; 103/104/105 são START A/B/C; 106 é
// STOP). Foi extraída da tabela "Bar code widths" de
// https://en.wikipedia.org/wiki/Code_128 (seção "Specification") — a mesma
// página confirma, com um exemplo trabalhado (checksum de "PJJ123C" = 54), a
// fórmula de checksum usada abaixo. A entrada 106 (STOP) tem 7 dígitos em vez
// de 6: a Wikipedia documenta o símbolo de parada como 11 módulos ("233111"),
// sempre seguido por uma barra de terminação de 2 módulos que fecha em 13
// módulos — "2331112" já inclui essa barra final, porque é isso que o
// desenhista de barras (code128Svg) precisa emitir.
//
// NÃO mexa nesta tabela sem reconferir os 5 invariantes testados em
// `code128.test.ts`: uma tabela errada gera um código de barras que PARECE
// perfeito e não passa em leitor nenhum.
const TABELA_LARGURAS_CODE128: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

/** Exportada só pra o teste de invariantes conferir a tabela inteira (107 valores) — não é API de consumo. */
export const TABELA_LARGURAS_CODE128_PARA_TESTE = TABELA_LARGURAS_CODE128;

const START_B = 104;
const STOP = 106;

/** Valor do símbolo (0..94) de um caractere ASCII 32..126 na Code Set B. */
function valorDoSimbolo(char: string): number {
  const codigo = char.charCodeAt(0);
  if (codigo < 32 || codigo > 126) {
    throw new Error(
      `Code128: caractere "${char}" fora do intervalo suportado (Code128-B só cobre ASCII 32-126) — ` +
        `um código de barras gerado calado com esse caractere sairia ilegível pro leitor.`
    );
  }
  return codigo - 32;
}

/**
 * Checksum de módulo 103.
 *
 * Fórmula (confirmada contra o exemplo trabalhado da Wikipedia, que calcula o
 * checksum de "PJJ123C" em Code Set A passo a passo e chega em 54): soma o
 * valor do símbolo START (104) — que entra com peso 1, a MESMA posição do
 * primeiro caractere de dado — a peso(posição 1-based) × valor de cada símbolo
 * de dado, depois reduz mod 103.
 */
export function checksum128(texto: string): number {
  let soma = START_B;
  for (let i = 0; i < texto.length; i++) {
    soma += (i + 1) * valorDoSimbolo(texto[i]);
  }
  return soma % 103;
}

/** Larguras (1..4 módulos) de um símbolo, dado seu valor 0..106 na tabela. */
function largurasDoSimbolo(valor: number): number[] {
  return TABELA_LARGURAS_CODE128[valor].split("").map(Number);
}

/**
 * Sequência completa de larguras: START-B, cada símbolo de dado, o símbolo de
 * checksum e o STOP (que sai com 7 larguras — ver comentário da tabela).
 *
 * Valida TODOS os caracteres antes de montar qualquer coisa: melhor recusar de
 * cara do que devolver metade de um código de barras ilegível.
 */
export function code128Larguras(texto: string): number[] {
  for (const char of texto) valorDoSimbolo(char);

  const checksum = checksum128(texto);
  const simbolos = [START_B, ...Array.from(texto, (c) => valorDoSimbolo(c)), checksum, STOP];
  return simbolos.flatMap(largurasDoSimbolo);
}

function escaparAtributo(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * SVG do código de barras. Usa `viewBox` (em módulos) e não define `width`/
 * `height` fixos em pixel — quem posiciona o tamanho é a CSS da etiqueta, não
 * este gerador. `shape-rendering="crispEdges"` evita que o navegador
 * antialiase a borda das barras: sem isso a impressora borra a borda e
 * leitores baratos perdem a leitura.
 */
/**
 * Zona quieta: módulos em branco antes e depois das barras. Sem ela o leitor
 * confunde a borda do papel com mais uma barra larga e desiste. Dez módulos é o
 * mínimo da especificação — e o mesmo número do lado Kotlin
 * (`Code128.ZONA_QUIETA`).
 */
export const ZONA_QUIETA_MODULOS = 10;

/**
 * Quantos módulos este código ocupa, zonas quietas incluídas.
 *
 * É a conta que decide se um código CABE numa largura de etiqueta: módulos ×
 * (menor traço que a impressora sabe queimar). Exportada porque quem precisa
 * dela não desenha SVG nenhum — é a tela de impressão avisando antes de gastar
 * rolo, e uma segunda implementação da conta divergiria no dia em que alguém
 * mexesse na tabela.
 */
export function code128Modulos(texto: string): number {
  return code128Larguras(texto).reduce((s, n) => s + n, 0) + 2 * ZONA_QUIETA_MODULOS;
}

export function code128Svg(texto: string, opcoes?: { altura?: number; esticar?: boolean }): string {
  const altura = opcoes?.altura ?? 60;
  const larguras = code128Larguras(texto);
  const zonaQuieta = ZONA_QUIETA_MODULOS;

  let x = zonaQuieta;
  const barras: string[] = [];
  larguras.forEach((largura, i) => {
    // Todo símbolo começa em barra e alterna barra/espaço; como cada símbolo
    // (exceto o STOP, que é sempre o último) contribui uma quantidade PAR de
    // larguras (6), a paridade do índice na sequência achatada inteira ainda
    // diz "é barra" — não precisa rastrear limite de símbolo.
    const ehBarra = i % 2 === 0;
    if (ehBarra) {
      barras.push(`<rect x="${x}" y="0" width="${largura}" height="${altura}" fill="#000" />`);
    }
    x += largura;
  });
  const larguraTotal = x + zonaQuieta;

  // `esticar` faz o símbolo preencher a caixa nos DOIS eixos em vez de caber
  // dentro dela mantendo a proporção do `viewBox`.
  //
  // Para um código de barras isso é seguro, e é a diferença entre um desenho
  // certo e um desenho pequeno: a escala horizontal é a MESMA para todas as
  // barras, então a proporção entre elas — que é o único que o leitor mede —
  // continua exata; a escala vertical não significa nada, barra alta e barra
  // baixa leem igual.
  //
  // Sem isto, um código CURTO numa caixa larga (o caso da etiqueta escrita à
  // mão: "A3" tem 2 caracteres numa tira de 80mm) sairia miniaturizado e
  // centrado, com papel em branco dos dois lados. A etiqueta de produto não
  // passa por aqui: lá a caixa foi desenhada na proporção do código, e mexer
  // nela agora seria mudar uma tira que já foi impressa e conferida.
  // `width`/`height` em 100% vêm JUNTO, e não são um detalhe: um `<svg>` com
  // `viewBox` e sem dimensão nenhuma NÃO herda o tamanho do pai — ele se
  // dimensiona pela proporção do próprio `viewBox` e transborda a caixa, onde é
  // recortado em silêncio. Medido: um código de 8 caracteres numa caixa de
  // 53px saía com 110px de altura e metade das barras cortada pelo
  // `overflow: hidden` da etiqueta.
  //
  // 100% continua sendo "quem manda no tamanho é a CSS" — o que este gerador
  // recusa é dimensão em PIXEL, que amarraria a etiqueta a uma resolução.
  const proporcao = opcoes?.esticar
    ? ' preserveAspectRatio="none" width="100%" height="100%" style="display:block"'
    : "";

  return (
    `<svg viewBox="0 0 ${larguraTotal} ${altura}"${proporcao} xmlns="http://www.w3.org/2000/svg" ` +
    `shape-rendering="crispEdges" role="img" aria-label="${escaparAtributo(texto)}">` +
    `${barras.join("")}</svg>`
  );
}
