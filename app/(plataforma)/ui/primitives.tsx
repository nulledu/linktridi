"use client";

import type { CSSProperties, ReactNode } from "react";
import { fmtBRL2 } from "@/lib/format";
import { Icon } from "../Icon";
import { NumeroVivo, Revelar } from "./micro";
import { MonoFaisca } from "./graficos";

// ── Primitivos de UI compartilhados (antes duplicados em 6+ telas) ──
// Kpi / KpiDelta / Money (cards de número) e Panel (card de vidro com título).
// Objetivo: consistência visual e menos código. Tamanhos padronizados em presets.

/**
 * Formata como o antigo `toLocaleString`, mas FIXANDO as casas decimais do
 * valor final. Enquanto o `NumeroVivo` conta, o número passa por frações — sem
 * isto um KPI de "3,5 dias" contaria em "3,482" e assentaria em "4" (o padrão
 * do contador arredonda). Com as casas do destino, o fim da contagem é
 * exatamente o texto que a tela mostrava antes.
 */
function comoOValor(valor: number) {
  const casas = Math.min(3, (String(valor).split(".")[1] ?? "").length);
  return (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Número do card: conta até o valor quando é número, texto pronto quando é string. */
function Valor({ value }: { value: number | string }) {
  return typeof value === "number" ? <NumeroVivo valor={value} formatar={comoOValor(value)} /> : <>{value}</>;
}

// ── Panel: card de vidro com título + subtítulo (+ ação opcional à direita). ──
// size "md" (padrão dos dashboards) · "sm" (listas compactas, ex.: Comercial).
export function Panel({ title, subtitle, right, size = "md", revelar = true, indice = 0, children, style }: {
  title: string; subtitle?: string; right?: ReactNode; size?: "md" | "sm";
  revelar?: boolean; indice?: number; children: ReactNode; style?: CSSProperties;
}) {
  const md = size === "md";
  const painel = (
    // Casca Monocharts: cartão sólido raio 24, com o brilho inset do repo.
    <div className="mc-card mt-eleva" style={{ minHeight: 0, padding: md ? 20 : 16, justifyContent: "flex-start", ...style }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: md ? 14 : 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {md
            ? <h2 style={{ fontSize: 17, fontWeight: 800 }}>{title}</h2>
            : <h3 style={{ fontSize: 14.5, fontWeight: 700 }}>{title}</h3>}
          {subtitle && <p style={{ fontSize: md ? 12.5 : 12, color: "var(--text-dim)", marginTop: 2 }}>{subtitle}</p>}
        </div>
        {right && <div style={{ flex: "none" }}>{right}</div>}
      </div>
      {children}
    </div>
  );
  if (!revelar) return painel;
  // A entrada mora num ENVELOPE, não no próprio vidro: `transform` sobre
  // `backdrop-filter` deixa rastro branco no Chrome. `display: grid` no
  // envelope porque sem ele o painel deixa de esticar até a altura da linha —
  // um par lado a lado (`.duo`) passaria a ter dois cartões de alturas
  // diferentes onde hoje eles terminam juntos.
  return <Revelar indice={indice} style={{ display: "grid" }}>{painel}</Revelar>;
}

// Presets de tamanho do número do Kpi.
const KPI_SIZE = {
  lg: { stat: 40, pad: "18px 20px", radius: 18 },
  md: { stat: 32, pad: "16px 18px", radius: 16 },
  sm: { stat: 26, pad: "15px 17px", radius: 16 },
  xs: { stat: 23, pad: "14px 16px", radius: 16 },
} as const;

// ── Kpi: rótulo (+ ícone opcional) + número grande. onClick torna clicável
// (mostra seta de "abrir"). glow adiciona o brilho do número (dashboards hero). ──
export function Kpi({ label, value, color, icon, onClick, size = "sm", glow = false, style }: {
  label: string; value: number | string; color: string; icon?: string; onClick?: () => void;
  size?: keyof typeof KPI_SIZE; glow?: boolean; style?: CSSProperties;
}) {
  const s = KPI_SIZE[size];
  const dentro = (
    <>
      <div className="mc-rot" style={{ display: "flex", alignItems: "center", gap: icon ? 7 : 0 }}>
        {icon && <Icon name={icon} size={14} color={color} style={{ flex: "none" }} />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </div>
      <div className="stat" style={{ fontSize: s.stat, marginTop: 5, color, fontVariantNumeric: "tabular-nums", ...(glow ? { textShadow: `0 0 36px color-mix(in srgb, ${color} 32%, transparent)` } : null) }}><Valor value={value} /></div>
    </>
  );
  // `flex-start` porque `.mc-card` traz `space-between`, que é o certo para um
  // cartão de GRÁFICO (cabeçalho em cima, palco no meio, rodapé embaixo). Um
  // cartão de número tem só rótulo e valor: com dois filhos, `space-between`
  // empurra o número para o rodapé, e numa fileira onde os vizinhos têm faísca
  // os números saem desalinhados em ~100px. O `Panel` já fazia este override.
  const base: CSSProperties = { minHeight: 0, gap: 0, justifyContent: "flex-start", padding: s.pad, ...style };
  if (!onClick) return <div className="mc-card mt-eleva" style={base}>{dentro}</div>;
  // Clicável é `<button>`, não `<div>` com `onClick`: em `<div>` o cartão não é
  // focável, não abre por teclado e no celular não tem resposta nenhuma ao
  // toque — um bloco que troca de tela sem nunca dizer que é um alvo.
  // Só o que o navegador impõe ao botão é zerado; a superfície continua vindo
  // do `.glass` (por isso fundo e borda não aparecem aqui).
  return (
    <button type="button" onClick={onClick} className="mc-card mt-eleva ui-card-alvo"
      style={{ display: "block", width: "100%", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", position: "relative", ...base }}>
      {dentro}
      <span style={{ position: "absolute", top: 12, right: 12 }}><Icon name="external-link" size={14} color="var(--text-dim)" /></span>
    </button>
  );
}

// ── KpiDelta: Kpi com linha de variação (ícone de tendência vs período anterior). ──
export function KpiDelta({ label, value, delta, color, invert }: {
  label: string; value: number | string; delta: number; color: string; invert?: boolean;
}) {
  const good = invert ? delta < 0 : delta > 0;
  const dc = delta === 0 ? "var(--text-dim)" : good ? "var(--ok)" : "var(--perigo)";
  // Antes eram os caracteres ▲/▼/→. Glifo tipográfico usado como ícone é
  // exatamente o que a regra "nada de emoji, tudo Tabler" existe para tirar da
  // interface: ele muda de desenho e de peso a cada fonte do sistema.
  const seta = delta === 0 ? "minus" : delta > 0 ? "trending-up" : "trending-down";
  return (
    <div className="mc-card mt-eleva" style={{ minHeight: 0, gap: 0, justifyContent: "flex-start", padding: "18px 20px" }}>
      <div className="mc-rot">{label}</div>
      <div className="stat" style={{ fontSize: 38, color, marginTop: 6, fontVariantNumeric: "tabular-nums" }}><Valor value={value} /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: dc, marginTop: 4 }}>
        <Icon name={seta} size={14} color={dc} style={{ flex: "none" }} />
        <span>{Math.abs(delta)}% vs período anterior</span>
      </div>
    </div>
  );
}

// Número grande que encolhe pra caber (container query) — evita "vazar" em cards estreitos.
const statFit: CSSProperties = { fontSize: "clamp(18px, 11.5cqi, 30px)", whiteSpace: "nowrap", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" };

// ── Money: Kpi de valor em R$ (fmtBRL2) com auto-fit. muted esconde o valor. ──
// Casca Monocharts (mc-card): rótulo em CAPS, número tabular, cartão sólido —
// a cor continua sendo a do CANAL/estado que o chamador escolheu.
export function Money({ label, value, sub, color, muted }: {
  label: string; value: number; sub?: string; color: string; muted?: boolean;
}) {
  return (
    <div className="mc-card mt-eleva" style={{ minHeight: 0, gap: 4, justifyContent: "flex-start", opacity: muted ? 0.6 : 1 }}>
      <div className="mc-rot">{label}</div>
      <div className="stat" style={{ ...statFit, color, marginTop: 2 }}>{muted ? "R$ --" : <NumeroVivo valor={value} formatar={fmtBRL2} />}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--mc-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Plain: Kpi de valor já formatado (string) com auto-fit. ──
// `sub` existe pelo mesmo motivo do `Money`: um número sem a linha de contexto
// embaixo vira adivinhação ("2,29x" de quê? contra qual gasto?). Sem ela, quem
// precisava explicar o número empilhava um `Plain` e um parágrafo solto, e os
// dois desalinhavam na fileira.
export function Plain({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="mc-card mt-eleva" style={{ minHeight: 0, gap: 4, justifyContent: "flex-start" }}>
      <div className="mc-rot">{label}</div>
      <div className="stat" style={{ ...statFit, color, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--mc-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── KpiIcone: número com ícone em ladrilho e comparação "vs. ontem". ──
// Nasceu na Visão geral da Operação. Dois tamanhos: `lg` é o cartão solto do
// topo da tela (ladrilho 44, número 34); `sm` é a célula dentro de um Panel
// (ladrilho 26, número 24, borda fina em vez de cartão).
//
// A comparação só aparece quando existe um ONTEM de verdade (`anterior` não
// nulo). Seta sobe/desce pelo sinal; a COR diz se é bom — `invert` pra métrica
// em que subir é ruim (atrasados, estoque baixo). Sem base (ontem 0) mostra o
// traço: "+∞%" não informa nada.
export function variacao(atual: number, anterior: number | null | undefined): number | null {
  if (anterior == null) return null;
  if (anterior === 0) return atual === 0 ? 0 : null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

export function KpiIcone({ label, value, icon, cor = "var(--primary)", anterior, atual, invert, rodape = "vs. ontem", size = "lg", onClick, style, sub, faisca, selo, ajuda, acao }: {
  label: string; value: number | string; icon: string; cor?: string;
  /** Valor de ontem. Omitido/null = sem linha de comparação. */
  anterior?: number | null;
  /** Número usado na conta quando `value` é texto formatado ("45 min"). */
  atual?: number;
  invert?: boolean; rodape?: string; size?: "lg" | "sm";
  onClick?: () => void; style?: CSSProperties;
  /** Linha de contexto embaixo do número ("12 no parque · 0 em uso"). */
  sub?: ReactNode;
  /** Série dos últimos dias: a faísca mora AO LADO do número. Liga o desenho
   *  "painel" (ladrilho pequeno, rótulo, número + faísca, sub, rodapé). */
  faisca?: number[];
  /** Estado no rodapé no lugar da comparação ("Todos online", "Estável"). */
  selo?: ReactNode;
  /** De onde o número sai — vira o "i" ao lado do rótulo (Dica). */
  ajuda?: string;
  /** Ícone no canto do cabeçalho dizendo o que o clique faz ("edit"). Só no
   *  desenho painel e só com `onClick` — sem clique, o ícone mentiria. */
  acao?: string;
}) {
  if (size === "lg" && (faisca || sub !== undefined || selo)) {
    return <KpiPainel {...{ label, value, icon, cor, anterior, atual, invert, rodape, onClick, style, sub, faisca, selo, ajuda, acao }} />;
  }
  const lg = size === "lg";
  const base = typeof value === "number" ? value : atual ?? 0;
  const d = variacao(base, anterior);
  const bom = d == null || d === 0 ? null : invert ? d < 0 : d > 0;
  const dc = bom == null ? "var(--text-dim)" : bom ? "var(--ok)" : "var(--perigo)";
  const seta = d == null || d === 0 ? "arrows-horizontal" : d > 0 ? "arrow-up" : "arrow-down";
  const ladrilho = lg ? 44 : 26;
  const dentro = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: lg ? 12 : 8, minWidth: 0 }}>
        <span aria-hidden style={{ width: ladrilho, height: ladrilho, flex: "none", display: "grid", placeItems: "center", borderRadius: lg ? 14 : 8, background: `color-mix(in srgb, ${cor} 14%, transparent)` }}>
          <Icon name={icon} size={lg ? 22 : 15} color={cor} />
        </span>
        {/* O rótulo QUEBRA em vez de cortar: no carrossel do celular e na
            grade estreita das células, "Tarefas pe…" não diz nada. */}
        <span style={lg
          ? { fontSize: 14, fontWeight: 600, lineHeight: 1.25 }
          : { fontSize: 12, fontWeight: 600, color: "var(--text-dim)", lineHeight: 1.25 }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginTop: lg ? 18 : 12, minWidth: 0 }}>
        <span className="stat" style={{ fontSize: lg ? 34 : 24, lineHeight: 1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}><Valor value={value} /></span>
        {anterior !== undefined && (
          <span style={{ display: "grid", gap: 1, fontSize: 11.5, minWidth: 0 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontWeight: 700, color: dc }}>
              <Icon name={seta} size={12} color={dc} style={{ flex: "none" }} />{d == null ? "—" : `${Math.abs(d)}%`}
            </span>
            <span style={{ color: "var(--text-dim)", whiteSpace: "nowrap" }}>{rodape}</span>
          </span>
        )}
      </div>
    </>
  );
  const caixa: CSSProperties = lg
    ? { minHeight: 0, gap: 0, justifyContent: "flex-start", padding: "20px 22px", ...style }
    : { display: "block", padding: "14px 14px 12px", borderRadius: 14, border: "1px solid var(--border)", minWidth: 0, ...style };
  const classe = lg ? "mc-card mt-eleva" : "";
  if (!onClick) return <div className={classe} style={caixa}>{dentro}</div>;
  return (
    <button type="button" onClick={onClick} className={`${classe} ui-card-alvo`}
      style={{ width: "100%", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", background: lg ? undefined : "transparent", ...caixa }}>
      {dentro}
    </button>
  );
}

// Desenho "painel" do KpiIcone (cartões do topo da Contingência): ladrilho de
// 32, rótulo com o "i" da origem, número com a faísca à direita, uma linha de
// contexto e, no rodapé, OU o estado (selo) OU a comparação com ontem — os
// dois juntos disputam a mesma leitura. Faísca com menos de dois pontos não
// desenha: uma reta de um ponto só parece defeito.
function KpiPainel({ label, value, icon, cor, anterior, atual, invert, rodape, onClick, style, sub, faisca, selo, ajuda, acao }: {
  label: string; value: number | string; icon: string; cor: string; anterior?: number | null; atual?: number;
  invert?: boolean; rodape: string; onClick?: () => void; style?: CSSProperties;
  sub?: ReactNode; faisca?: number[]; selo?: ReactNode; ajuda?: string; acao?: string;
}) {
  const base = typeof value === "number" ? value : atual ?? 0;
  const d = variacao(base, anterior);
  const bom = d == null || d === 0 ? null : invert ? d < 0 : d > 0;
  const dc = bom == null ? "var(--text-dim)" : bom ? "var(--ok)" : "var(--perigo)";
  const seta = d == null || d === 0 ? "arrows-horizontal" : d > 0 ? "arrow-up" : "arrow-down";
  const dentro = (
    <>
      <div className="kpi-painel-cab">
        <span aria-hidden className="kpi-painel-ladrilho" style={{ background: `color-mix(in srgb, ${cor} 12%, transparent)` }}>
          <Icon name={icon} size={16} color={cor} />
        </span>
        <span className="kpi-painel-rot">{label}</span>
        {ajuda && (
          <span className="kpi-painel-ajuda" data-dica={ajuda} aria-label={ajuda} role="img">
            <Icon name="info-circle" size={13} color="currentColor" />
          </span>
        )}
        {acao && onClick && <span aria-hidden className="kpi-painel-acao"><Icon name={acao} size={15} color="currentColor" /></span>}
      </div>
      <div className="kpi-painel-meio">
        <span className="stat kpi-painel-valor"><Valor value={value} /></span>
        {faisca && faisca.length > 1 && <span className="kpi-painel-faisca"><MonoFaisca valores={faisca} cor={cor} altura={34} /></span>}
      </div>
      {sub !== undefined && <div className="kpi-painel-sub">{sub}</div>}
      {selo ? <div className="kpi-painel-pe">{selo}</div>
        : anterior !== undefined && anterior !== null ? (
          <div className="kpi-painel-pe" style={{ color: "var(--text-dim)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontWeight: 700, color: dc }}>
              <Icon name={seta} size={12} color={dc} style={{ flex: "none" }} />{d == null ? "—" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)}%`}
            </span>
            {rodape}
          </div>
        ) : null}
    </>
  );
  if (!onClick) return <div className="mc-card mt-eleva kpi-painel" style={style}>{dentro}</div>;
  return (
    <button type="button" onClick={onClick} className="mc-card mt-eleva kpi-painel ui-card-alvo"
      style={{ width: "100%", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", ...style }}>
      {dentro}
    </button>
  );
}

// ── Selo: etiqueta curta de estado (Alta/Média/Baixa, Concluída, Em andamento). ──
// Fundo 14% + texto na cor do tom, da paleta SEMÂNTICA (não a do destaque):
// "concluída" é verde em qualquer tema que a pessoa escolher.
export function Selo({ tom, children }: { tom: "ok" | "atencao" | "perigo" | "info" | "neutro" | "destaque"; children: ReactNode }) {
  const cor = tom === "neutro" ? "var(--text-dim)" : tom === "destaque" ? "var(--primary)" : `var(--${tom})`;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", flex: "none", padding: "3px 9px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap", color: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)` }}>
      {children}
    </span>
  );
}
