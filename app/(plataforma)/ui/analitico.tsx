"use client";

/**
 * Kit · bloco analítico e célula de métrica.
 *
 * Nasceram na central do Analytics e subiram pro kit porque não são de lá:
 * qualquer tela que mostre número com comparação precisa das duas, e a
 * alternativa era cada módulo desenhar o próprio cartão de título com um
 * parágrafo explicativo embaixo — que foi exatamente o que a reforma do
 * Analytics veio desfazer.
 *
 * Duas decisões que valem pra quem usar:
 *
 *  1. **A explicação é `Dica`, não parágrafo.** Três linhas de 80 caracteres
 *     entre a manchete e o gráfico empurram o dado pra baixo da dobra, e
 *     ninguém lê. O "?" ao lado do título guarda o "como interpretar" pra quem
 *     perguntar.
 *  2. **Seta pelo sinal, COR pelo que é bom.** Em tempo médio, custo e
 *     investimento, subir é a má notícia — daí o `invertido`. Um painel que
 *     pinta de verde o mês em que o prazo dobrou ensina a pessoa a ignorar a
 *     cor, e cor que não significa nada é pior que cor nenhuma.
 */

import type { ReactNode } from "react";
import { Icon } from "../Icon";
import { NumeroVivo } from "./micro";
import "./analitico.css";

const fmtPadrao = (n: number) => Math.round(n).toLocaleString("pt-BR");

/** Um número com a sua comparação. `deltaPct` nulo = não havia base anterior —
 *  e isso NÃO é o mesmo que 0%. */
export interface Comparacao {
  atual: number;
  anterior: number;
  deltaPct: number | null;
}

/**
 * O cartão de uma faixa de análise.
 *
 * `id` vai no `<section>`, não num invólucro: envolver o bloco num `<span>` só
 * pra carregar a âncora transformaria um item de grade num elemento inline, e
 * a largura passaria a sair do conteúdo.
 */
export function BlocoAnalitico({ id, icone, titulo, dica, direita, children, style, className }: {
  id?: string;
  icone: string;
  titulo: string;
  /** "Como interpretar" — vira o tooltip do kit no "?" ao lado do título. */
  dica?: string;
  /** Ações do cabeçalho (abas de modo, selo de estado). */
  direita?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <section id={id} className={className ? `an-bloco ${className}` : "an-bloco"} style={style}>
      <header className="an-bloco-cab">
        <span className="an-bloco-icone"><Icon name={icone} size={17} color="var(--primary-texto, var(--primary))" /></span>
        <h2 className="an-bloco-titulo">{titulo}</h2>
        {/* `data-dica` é o tooltip do kit (`DicaHost`), não o `title` nativo:
            no celular o `title` simplesmente não existe. */}
        {dica && (
          <span data-dica={dica} tabIndex={0} aria-label={dica}
            style={{ display: "grid", placeItems: "center", flex: "none", cursor: "help" }}>
            <Icon name="info-circle" size={15} color="var(--text-dim)" />
          </span>
        )}
        {direita && <div className="an-bloco-dir">{direita}</div>}
      </header>
      {children}
    </section>
  );
}

/**
 * Uma célula de indicador, pra viver numa faixa `.an-resumo` dentro do bloco.
 *
 * Densidade equilibrada de propósito: cada número é uma CÉLULA separada por
 * fio, não um cartão grande. Cartão grande pra tudo faz com que nada seja
 * manchete.
 */
export function Metrica({ icone, rotulo, valor, formatar = fmtPadrao, cmp, invertido, base = "vs. período anterior", cor }: {
  icone: string;
  rotulo: string;
  valor: number;
  formatar?: (n: number) => string;
  /** Sem comparação, a célula DIZ isso em vez de mostrar "0%" — que é um
   *  número, e seria lido como "não mudou". */
  cmp?: Comparacao | null;
  /** Métrica em que SUBIR é ruim (tempo, custo, investimento). */
  invertido?: boolean;
  /** A linha de apoio embaixo da variação. */
  base?: string;
  /** Só quando a cor SIGNIFICA estado (ROAS abaixo de 1, atrasado > 0). */
  cor?: string;
}) {
  const d = cmp?.deltaPct ?? null;
  const bom = d == null || d === 0 ? null : invertido ? d < 0 : d > 0;
  const corDelta = bom == null ? "var(--text-dim)" : bom ? "var(--ok)" : "var(--perigo)";
  const seta = d == null || d === 0 ? "arrows-horizontal" : d > 0 ? "arrow-up" : "arrow-down";
  return (
    <div className="an-metrica">
      <div className="an-metrica-topo">
        <span className="an-metrica-ladrilho"><Icon name={icone} size={14} color={cor ?? "var(--primary-texto, var(--primary))"} /></span>
        <span className="an-metrica-rot">{rotulo}</span>
      </div>
      <span className="an-metrica-num" style={cor ? { color: cor } : undefined}>
        <NumeroVivo valor={valor} formatar={formatar} />
      </span>
      {d != null ? (
        <>
          <span className="an-metrica-delta" style={{ color: corDelta }}>
            <Icon name={seta} size={13} color={corDelta} />
            {d > 0 ? "+" : ""}{d.toFixed(1).replace(".", ",")}%
          </span>
          <span className="an-metrica-base">{base}</span>
        </>
      ) : (
        <span className="an-metrica-base" style={{ marginTop: 4 }}>{cmp ? "sem base anterior" : base}</span>
      )}
    </div>
  );
}

/** A faixa que segura as células — vira carrossel com encaixe no celular. */
export function FaixaDeMetricas({ children, style }: { children: ReactNode; style?: React.CSSProperties }) {
  return <div className="an-resumo" style={style}>{children}</div>;
}
