// ── Geometria do funil clássico ─────────────────────────────────────────────
// Faixas em trapézio empilhadas, laterais RETAS e contínuas (o fundo de uma
// faixa é o topo da de baixo), cor escura em cima clareando pra baixo, texto
// branco dentro, cantos arredondados. A forma é só a forma: a largura segue a
// POSIÇÃO da etapa, não o valor — com impressão → clique perdendo 98%, largura
// por valor deixava o resto do funil num fio. Os números vão escritos dentro.

/** Altura da faixa na tela, em px. O CSS usa o MESMO número (.funil-faixa). */
export const ALTURA_FAIXA = 64;

/** Topo e fundo (0–1) de cada faixa: afina em linha reta de 1 até `piso`. */
export function trapeziosDoFunil(n: number, piso = 0.34): { topo: number; fundo: number }[] {
  const passo = n > 0 ? (1 - piso) / n : 0;
  return Array.from({ length: n }, (_, i) => ({ topo: 1 - i * passo, fundo: 1 - (i + 1) * passo }));
}

const p = (v: number) => `${(v * 100).toFixed(2)}%`;
const px = (v: number) => `${v >= 0 ? "+" : "-"} ${Math.abs(v).toFixed(2)}px`;
const T = [0, 0.25, 0.5, 0.75, 1];

/**
 * Um canto arredondado: quadrática com o próprio canto de controle, do ponto
 * no LADO inclinado (t=0, `r` px acima/abaixo) até o ponto na BORDA (t=1, `r` px
 * pra dentro). Escrito em `calc(% ± px)` — por isso a altura em px precisa ser
 * conhecida: é ela que diz onde o lado inclinado está a `r` px da borda.
 */
function canto(cantoX: number, ladoX: number, sinal: 1 | -1, borda: "topo" | "fundo", r: number, t: number): string {
  const u = (1 - t) * (1 - t);
  const x = `calc(${p(u * ladoX + (1 - u) * cantoX)} ${px(sinal * t * t * r)})`;
  const y = borda === "topo" ? `${(u * r).toFixed(2)}px` : `calc(100% - ${(u * r).toFixed(2)}px)`;
  return `${x} ${y}`;
}

/**
 * `clip-path` da faixa. Sem `cantos`, o trapézio seco (a apresentação usa assim).
 * Com `cantos`, os quatro arredondam; o fundo pode ter raio próprio (o bico).
 */
export function clipDoTrapezio(topo: number, fundo: number, cantos?: { raio: number; raioFundo?: number; alturaPx: number }): string {
  const l0 = (1 - topo) / 2, r0 = (1 + topo) / 2, l1 = (1 - fundo) / 2, r1 = (1 + fundo) / 2;
  if (!cantos) return `polygon(${p(l0)} 0, ${p(r0)} 0, ${p(r1)} 100%, ${p(l1)} 100%)`;
  const { raio: rt, raioFundo: rb = cantos.raio, alturaPx: h } = cantos;
  const kt = Math.min(1, rt / h), kb = Math.min(1, rb / h);
  const pontos = [
    ...T.map((t) => canto(l0, l0 + (l1 - l0) * kt, 1, "topo", rt, t)),                // ↖ sobe pelo lado e vira pro topo
    ...[...T].reverse().map((t) => canto(r0, r0 + (r1 - r0) * kt, -1, "topo", rt, t)), // ↗ sai do topo e desce pelo lado
    ...T.map((t) => canto(r1, r1 + (r0 - r1) * kb, -1, "fundo", rb, t)),              // ↘ desce pelo lado e vira pro fundo
    ...[...T].reverse().map((t) => canto(l1, l1 + (l0 - l1) * kb, 1, "fundo", rb, t)), // ↙ sai do fundo e sobe pelo lado
  ];
  return `polygon(${pontos.join(", ")})`;
}

/**
 * Cor da faixa: a cor do gráfico da pessoa escurecida em cima e cada vez menos
 * embaixo. Nunca clareia até o branco — o texto é branco em todas as faixas.
 */
export function corDaFaixa(i: number, n: number): string {
  const t = n > 1 ? i / (n - 1) : 0;
  return `color-mix(in srgb, var(--graf-1, var(--primary)), #000 ${Math.round(60 - 46 * t)}%)`;
}

/**
 * Recuo lateral do conteúdo da faixa, em `padding-inline`.
 *
 * Tem que medir pela ARESTA MAIS ESTREITA (o fundo), não pelo meio da altura.
 * O conteúdo são DUAS linhas — nome em cima, número e pílula embaixo — e a
 * linha de baixo fica abaixo do meio, onde o trapézio já afinou: recuando pelo
 * meio, a pílula da última faixa saía pela lateral inclinada e o `clip-path`
 * a cortava no ar (era assim que "19%" virava "19" e o nome ganhava reticências).
 */
export function recuoDaFaixa(topo: number, fundo: number, folgaPx = 10): string {
  const estreita = Math.min(topo, fundo);
  return `calc(${(((1 - estreita) / 2) * 100).toFixed(2)}% + ${folgaPx}px)`;
}
