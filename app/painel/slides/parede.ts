import type { CSSProperties } from "react";

/**
 * Os tokens da arte mono-rounded, recalibrados para a PAREDE.
 *
 * Os padrões do `globals.css` são feitos para um monitor a 60 cm: traço de 3px,
 * grade a 7% do texto e eixo a 46%. A três metros isso some — a grade vira
 * papel em branco e o rótulo do eixo vira uma mancha cinza. É o mesmo ajuste
 * que o `.pw-grade` já faz para a grade de blocos (ver `widgets.css`); as telas
 * clássicas montadas dentro do `KioskShell` ficavam de fora dele e herdavam a
 * medida de mesa.
 *
 * Mora num arquivo só porque as quatro telas clássicas e o painel de produção
 * usam. Duas cópias divergiriam na primeira correção — foi o que aconteceu com
 * a cor dos gráficos antes da rampa.
 */
export const PAREDE_MONO: CSSProperties = {
  ["--mono-traco" as string]: "5px",
  ["--mono-traco-2" as string]: "3px",
  ["--mono-grade" as string]: "color-mix(in srgb, var(--text) 16%, transparent)",
  ["--mono-eixo" as string]: "color-mix(in srgb, var(--text) 72%, transparent)",
  ["--mono-apoio" as string]: "color-mix(in srgb, var(--text) 58%, transparent)",
};

/**
 * Texto de eixo na parede. `.mono-eixo-txt` fixa `font-size: 10px` no CSS, e
 * atributo `font-size` do SVG perde para a classe — então o tamanho de parede
 * tem de vir por `style`, não por atributo.
 */
export const PAREDE_EIXO: CSSProperties = { fontSize: 15 };
