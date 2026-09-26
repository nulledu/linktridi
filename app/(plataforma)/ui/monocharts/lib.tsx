"use client";

// ── Monocharts (github.com/Subhan-code/Monocharts) — a casca compartilhada ──
//
// Porte FIEL dos arquivos `src/components/mono-charts/*` do repositório, que é
// a regra visual do app para gráfico/card/botão. O que mudou (e SÓ isso):
//
//  1. Tailwind → estilos inline com os MESMOS valores (o app não tem Tailwind).
//  2. A cor da série: o branco/preto monocromático do repo virou a TINTA DA
//     PESSOA (`--graf-1`, a rampa que o destaque escolhido no painel deriva).
//     Grade, eixos, palco e cartão continuam com os literais do repo.
//
// O recharts escreve `stroke`/`fill` como ATRIBUTO SVG, e `var()` não resolve
// em atributo — por isso a tinta é resolvida em runtime (getComputedStyle) e
// re-lida quando o tema ou o destaque mudam (observer no <html>).

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "../../Icon";

/**
 * O balão de dica do gráfico, ancorado no `<body>`.
 *
 * O recharts desenha a dica DENTRO do `.recharts-wrapper`, e todo gráfico do
 * app mora num `.mc-palco` (`overflow: hidden`, 14px de raio) dentro de um
 * `.mc-card` (`overflow: hidden` + `container-type: inline-size`). O palco da
 * faísca do cartão de vendedora tem 44px de altura: a dica nascia recortada
 * dentro dele e parecia "ficar por baixo do card".
 *
 * Nem `position: fixed` resolve por dentro — `container-type` implica
 * contenção de layout, o que faz do `.mc-card` bloco de contenção até de
 * elemento fixo. Sem ancestral não há recorte pra herdar: o alvo do portal vai
 * pro `<body>`.
 *
 * As coordenadas que o recharts escreve são relativas ao gráfico, então o
 * hospedeiro é um ponto de 0×0 POSICIONADO em cima do gráfico. Ele é remedido
 * ao entrar com o ponteiro e na rolagem em CAPTURA — na plataforma quem rola é
 * a coluna de conteúdo, não a página.
 */
export function useDicaNoBody() {
  const alvo = useRef<HTMLDivElement | null>(null);
  const hospedeiro = useRef<HTMLDivElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  const medir = useCallback(() => {
    const d = hospedeiro.current, r = alvo.current?.getBoundingClientRect();
    if (!d || !r) return;
    d.style.left = `${r.left}px`;
    d.style.top = `${r.top}px`;
  }, []);

  useEffect(() => {
    const d = document.createElement("div");
    d.className = "mc-tooltip-host";
    document.body.appendChild(d);
    hospedeiro.current = d;
    setHost(d);
    medir();
    window.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    if (ro && alvo.current) ro.observe(alvo.current);
    return () => {
      window.removeEventListener("scroll", medir, true);
      window.removeEventListener("resize", medir);
      ro?.disconnect();
      d.remove();
      hospedeiro.current = null;
    };
  }, [medir]);

  return { host, alvo, aoEntrar: medir };
}

/** Tema + tinta resolvidos — os únicos valores que o recharts precisa como
 *  string concreta. `isDark` espelha `html.light` (o app é escuro por padrão). */
export function useMcTema(): { isDark: boolean; tinta: string } {
  const [v, setV] = useState<{ isDark: boolean; tinta: string }>({ isDark: true, tinta: "#8f8f94" });
  useEffect(() => {
    const ler = () => {
      const html = document.documentElement;
      const isDark = !html.classList.contains("light");
      const tinta = getComputedStyle(html).getPropertyValue("--graf-1").trim() || (isDark ? "#FFFFFF" : "#09090B");
      setV((a) => (a.isDark === isDark && a.tinta === tinta ? a : { isDark, tinta }));
    };
    ler();
    // Trocar tema (classe) ou destaque (style do preload) re-lê a tinta.
    const mo = new MutationObserver(ler);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-tema"] });
    return () => mo.disconnect();
  }, []);
  return v;
}

// Literais do repo, por tema — grade/eixo/apoio ficam como lá.
export const mcGrade = (isDark: boolean) => (isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)");
export const mcTick = (isDark: boolean) => (isDark ? "#71717A" : "#A1A1AA");
export const mcApoio = (isDark: boolean) => (isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)");

/** Cartão do Monocharts: raio 24, `#181818`/branco, brilho inset em cima.
 *  Fundo/hover/sombra moram no `.mc-card` do globals.css (hover é CSS). */
export function McCard({ compact, children, style, onClick, className = "" }: {
  compact?: boolean; children: ReactNode; style?: CSSProperties; onClick?: () => void; className?: string;
}) {
  const Tag: "button" | "div" = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`mc-card${onClick ? " ui-card-alvo" : ""}${className ? ` ${className}` : ""}`}
      style={{ ...(compact ? { minHeight: 200 } : { minHeight: 290 }), ...(onClick ? { cursor: "pointer", textAlign: "left", font: "inherit", color: "var(--text)" } : null), ...style }}
    >
      {children}
    </Tag>
  );
}

/** Cabeçalho do cartão: rótulo pequeno em CAPS + selo mono + valor grande
 *  `tabular-nums` — a tipografia exata dos arquivos do repo. */
export function McCab({ rotulo, selo, valor, sufixo, delta, deltaBom, acoes }: {
  rotulo: string; selo?: string; valor?: ReactNode; sufixo?: string;
  /** Texto de variação ("+14,2%") no estilo do KPI card do repo. */
  delta?: string | null; deltaBom?: boolean | null; acoes?: ReactNode;
}) {
  return (
    // `.mc-cab` / `.mc-cab-acoes`: num cartão estreito os controles descem pra
    // linha de baixo em vez de espremerem o título até a inicial. A regra é uma
    // consulta de contêiner no globals.css — quem aperta é a largura do CARTÃO.
    <div className="mc-cab" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, minWidth: 0 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span className="mc-rot">{rotulo}</span>
          {selo && <span className="mc-selo">{selo}</span>}
        </div>
        {valor !== undefined && (
          <div className="mc-valor">
            {valor}
            {sufixo && <span className="mc-valor-sufixo">{sufixo}</span>}
            {delta != null && (
              <span className="mc-delta" style={{ color: deltaBom == null ? "var(--text-dim)" : deltaBom ? "var(--ok)" : "var(--perigo)" }}> {delta}</span>
            )}
          </div>
        )}
      </div>
      {acoes && <div className="mc-cab-acoes" style={{ flex: "none" }}>{acoes}</div>}
    </div>
  );
}

/** O palco interno raio 14 (`#131313` / `#f4f4f6`) com o anel inset de 1px.
 *
 *  `resumo` é o que o leitor de tela anuncia. O recharts marca o próprio SVG
 *  como `role="application"` e NÃO lhe dá nome: sem isto o gráfico é um nó mudo
 *  no meio da página — o kit SVG antigo daqui tinha `role="img"` com a série
 *  escrita, e a conversão pro recharts tinha perdido isso. */
export function McPalco({ children, style, centro = false, resumo, oculto }: {
  children: ReactNode; style?: CSSProperties; centro?: boolean; resumo?: string;
  /** Desenho puramente ilustrativo (a faísca ao lado do número que ela ilustra):
   *  sai da árvore de acessibilidade em vez de virar ruído. */
  oculto?: boolean;
}) {
  return (
    <div className="mc-palco" role={resumo ? "img" : undefined} aria-label={resumo} aria-hidden={oculto || undefined}
      style={{ ...(centro ? { display: "flex", alignItems: "center", justifyContent: "center" } : null), ...style }}>
      <div className="mc-palco-anel" aria-hidden="true" />
      {children}
    </div>
  );
}

/** Rodapé do cartão: linha fina em cima, mono 11px, muted × forte. */
export function McRodape({ esq, dir }: { esq: ReactNode; dir?: ReactNode }) {
  return (
    <div className="mc-rodape">
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{esq}</span>
      {dir != null && <span className="mc-rodape-forte">{dir}</span>}
    </div>
  );
}

/** O trilho de pílulas do repo: borda sutil, ativa INVERTIDA (branca no escuro,
 *  preta no claro), inativa muted. */
export function McPills<T extends string>({ itens, valor, onMuda, ariaLabel }: {
  itens: { valor: T; rotulo: ReactNode }[]; valor: T; onMuda: (v: T) => void; ariaLabel?: string;
}) {
  return (
    <div className="mc-pillrail" role="tablist" aria-label={ariaLabel}>
      {itens.map((it) => (
        <button key={it.valor} type="button" role="tab" aria-selected={valor === it.valor}
          className="mc-pill" data-on={valor === it.valor ? "1" : undefined}
          onClick={() => onMuda(it.valor)}>
          {it.rotulo}
        </button>
      ))}
    </div>
  );
}

/** Frase que o leitor de tela anuncia no lugar do desenho. Corta em 12 pontos
 *  porque ninguém ouve trinta valores seguidos — o resto está na dica e na
 *  tabela de números ao lado do gráfico. */
export function resumoDaSerie(tipo: string, nome: string, pontos: { rotulo: string; valor: number }[], formatar: (n: number) => string): string {
  const amostra = pontos.length > 12
    ? pontos.filter((_, i) => i % Math.ceil(pontos.length / 12) === 0)
    : pontos;
  const corpo = amostra.map((p) => `${p.rotulo}: ${formatar(p.valor)}`).join(", ");
  return `${tipo} — ${nome}. ${pontos.length} pontos. ${corpo}${amostra.length < pontos.length ? ", …" : ""}`;
}

// ── Tabela-gêmea ─────────────────────────────────────────────────────────────
//
// Todo gráfico precisa de um par em NÚMEROS. Sem ele, o único jeito de ler um
// valor exato é acertar o ponteiro no ponto — o que exclui quem usa teclado ou
// leitor de tela, e irrita quem só queria copiar a coluna. A dica ao passar o
// mouse ENRIQUECE a leitura; ela não pode ser a única porta.

export interface McLinhaTabela { rotulo: string; valor: number; apoio?: number }

/** Alterna gráfico × números. Vive no rodapé do cartão: no cabeçalho ele
 *  disputaria espaço com as pílulas que trocam a forma do próprio gráfico, e
 *  isto aqui não é uma variação do desenho — é a saída dele. */
export function McBotaoNumeros({ ver, onMuda }: { ver: boolean; onMuda: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onMuda(!ver)} className="mc-num-btn"
      aria-pressed={ver} title={ver ? "Ver o gráfico" : "Ver os números exatos"}>
      <Icon name={ver ? "chart-line" : "checklist"} size={13} color="currentColor" />
      {ver ? "gráfico" : "números"}
    </button>
  );
}

/** Os mesmos dados do desenho, em tabela. `tabular-nums` aqui SIM: é onde os
 *  números se alinham em coluna e a largura igual dos dígitos ajuda. */
export function McTabela({ linhas, formatar, nome, nomeApoio, rotuloCol = "Quando" }: {
  linhas: McLinhaTabela[];
  formatar: (n: number) => string;
  nome: string;
  nomeApoio?: string;
  rotuloCol?: string;
}) {
  const temApoio = linhas.some((l) => l.apoio != null);
  return (
    // `overflowX` explícito, não o `overflow` abreviado: o que precisa rolar
    // DENTRO do bloco é a largura — tabela larga que empurra a página é o
    // defeito que a fundação existe pra impedir. O `overflowY` vem junto por
    // causa do teto de altura.
    <div className="mc-palco" style={{ flex: 1, padding: 0, overflowX: "auto", overflowY: "auto", maxHeight: 260 }}>
      <div className="mc-palco-anel" aria-hidden="true" />
      <table className="mc-tabela">
        <thead>
          <tr>
            <th scope="col">{rotuloCol}</th>
            <th scope="col">{nome}</th>
            {temApoio && <th scope="col">{nomeApoio}</th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={l.rotulo + i}>
              <th scope="row">{l.rotulo}</th>
              <td>{formatar(l.valor)}</td>
              {temApoio && <td>{l.apoio == null ? "—" : formatar(l.apoio)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
