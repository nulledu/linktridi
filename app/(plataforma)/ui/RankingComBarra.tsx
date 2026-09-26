"use client";

import type { ReactNode } from "react";
import { Icon } from "../Icon";
import { MEDALHA } from "./ChipIcone";

/**
 * Ranking com a barra da proporção atrás de cada linha — "Top estados", "Top
 * produtos". A posição 1–3 ganha medalha (ícone `medal` do Tabler na cor de
 * pódio), da 4ª em diante o número.
 *
 * Nasceu nos widgets da Yampi na Tridify (23/09/2026), que reproduzem o painel
 * da Yampi. Lá as medalhas são EMOJI, e o Gaius não usa emoji como ícone
 * (CLAUDE.md) — esta peça é a tradução.
 *
 * Três decisões:
 * - A barra é o FUNDO da linha, não uma coluna ao lado: numa largura de 320px
 *   não sobra lugar pra nome + barra + número lado a lado, e o nome é o que
 *   não pode sumir.
 * - A largura da barra é relativa ao 1º colocado, não ao total. Com cinco
 *   estados somando 83%, barras relativas ao total deixariam todo mundo curto e
 *   igual; relativas ao 1º, a diferença entre as posições é o que se vê.
 * - Nome longo QUEBRA em quantas linhas precisar, sem reticências e sem limite
 *   de linhas: o nome do produto ("Chancela personalizada com a sua logo -
 *   MDF") É a informação. A primeira versão limitava a duas linhas e, medido a
 *   320px, cortava três de quatro nomes do Top produtos. No computador o nome
 *   cabe numa linha; no celular a altura do card segue o conteúdo.
 */
export function RankingComBarra({ itens, valor, vazio = "Nada no período." }: {
  itens: { chave?: string; nome: string; qtd: number; pct?: number; icone?: string; apoio?: ReactNode }[];
  /** O que aparece à direita. Padrão: a porcentagem, se houver; senão a quantidade. */
  valor?: (item: { qtd: number; pct?: number }) => ReactNode;
  vazio?: ReactNode;
}) {
  if (!itens.length) return <div style={{ fontSize: 13, color: "var(--text-dim)", padding: "12px 0" }}>{vazio}</div>;
  const maior = Math.max(...itens.map((i) => i.qtd), 1);
  const direita = valor ?? ((i: { qtd: number; pct?: number }) => (i.pct != null ? `${Math.round(i.pct * 100)}%` : i.qtd.toLocaleString("pt-BR")));

  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
      {itens.map((it, i) => (
        <li key={it.chave ?? `${i}-${it.nome}`} style={{ display: "grid", gridTemplateColumns: "24px minmax(0, 1fr)", alignItems: "center", gap: 8 }}>
          <span aria-label={`${i + 1}º`} style={{ display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
            {i < 3 ? <Icon name="medal" size={20} color={MEDALHA[i]} /> : i + 1}
          </span>
          <div style={{
            // `flexWrap`: quando nome e número não cabem lado a lado (celular,
            // nome de produto longo), o NÚMERO desce pra baixo do nome em vez de
            // espremer a coluna do nome até 6 linhas — medido a 320px.
            position: "relative", display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 2, minWidth: 0,
            padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden",
          }}>
            {/* A barra: fundo tingido na cor da pessoa, largura relativa ao 1º. */}
            <span aria-hidden style={{
              position: "absolute", inset: 0, width: `${(it.qtd / maior) * 100}%`,
              background: "color-mix(in srgb, var(--graf-1) 16%, transparent)",
            }} />
            {it.icone && <span style={{ position: "relative", flexShrink: 0, display: "grid" }}><Icon name={it.icone} size={16} color="var(--text-dim)" /></span>}
            <span style={{ position: "relative", flex: "1 1 140px", minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text)", lineHeight: 1.25, overflowWrap: "anywhere" }}>{it.nome}</span>
              {it.apoio && <span style={{ display: "block", fontSize: 11.5, fontWeight: 500, color: "var(--text-dim)" }}>{it.apoio}</span>}
            </span>
            <span style={{ position: "relative", flexShrink: 0, marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {direita(it)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}
