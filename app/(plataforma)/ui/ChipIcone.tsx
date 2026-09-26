"use client";

import { Icon } from "../Icon";

/**
 * O ícone dentro de um disco, e as três cores de medalha.
 *
 * Vivem num arquivo só porque DUAS telas os usam — a de produtividade e o
 * painel de desempenho embutido nas atividades — e uma importa a outra. Copiar
 * o disco pra segunda tela seria a quinta vez que esta casa reaprende a lição
 * do `Avatar`: a cópia diverge no que ninguém revisa (o tamanho do ícone dentro
 * do disco, a porcentagem da tinta de fundo) e a mesma peça passa a ter duas
 * aparências dependendo da porta por onde se entrou.
 */
export function ChipIcone({ icone, tom, size = 36 }: { icone: string; tom: "ok" | "alerta" | "neutro"; size?: number }) {
  const cor = tom === "alerta" ? "var(--perigo)" : tom === "ok" ? "var(--ok)" : "var(--primary-texto, var(--primary))";
  return (
    <span aria-hidden style={{
      width: size, height: size, flex: "none", borderRadius: 999, display: "grid", placeItems: "center",
      background: `color-mix(in srgb, ${cor} 12%, transparent)`,
    }}>
      <Icon name={icone} size={Math.round(size * 0.45)} color={cor} />
    </span>
  );
}

/**
 * Ouro, prata e bronze — cor de MEDALHA, não token de tema, a mesma exceção da
 * paleta semântica. Fixas por um motivo mecânico além do simbólico: a tinta
 * escrita em cima delas (`TINTA_MEDALHA`) é uma só, e um token que troca de
 * claro pra escuro entre os temas obrigaria a tinta a trocar junto. Estas três
 * são claras nos dois temas.
 *
 * E não use `var(--surface)` como tinta aqui: ele é TRANSLÚCIDO (rgba com 5%
 * de alfa), então o "1º" saiu literalmente invisível sobre o disco dourado —
 * a mesma armadilha do translúcido empilhado que já pegou os cartões.
 */
export const MEDALHA = ["#e0a42b", "#b3b3bd", "#c07c3f"];
export const TINTA_MEDALHA = "#17171c";
