"use client";

import type { PanelConfig, SalesSnapshot } from "@/lib/types";
import { fmtBRL, fmtCurto } from "@/lib/format";
import { caminhoSuave, comprimento, corDaSerie, tetoRedondo } from "@/app/(plataforma)/ui/graficos";
import { NumeroVivo } from "@/app/(plataforma)/ui/micro";
import { Icon } from "./Icon";
import { PAREDE_EIXO, PAREDE_MONO } from "./parede";

/** O dinheiro desta tela, na escala que o PERFIL pediu — ver RankingSlide. */
const moeda = (curtos?: boolean) => (n: number) => (curtos ? fmtCurto(n, true) : fmtBRL(n));
import { gastoComImposto } from "@/lib/marketing-const";

// Slide exclusivo de Tráfego Pago — estilo "Visão geral": 4 cards grandes + gráfico.
// Receita vem do ERP (Carimbos Tridi). Investimento/ROAS/CPA aguardam Meta Ads.
export function TrafficSlide({ sales, config, curtos }: { sales: SalesSnapshot; config?: PanelConfig; curtos?: boolean }) {
  const dinheiro = moeda(curtos);
  const m = sales.metrics;
  if (!m) return null;

  // Tudo PRONTO do Tridify. Aqui ainda se dividia receita por investimento na
  // mão e, mesmo com o imposto corrigido, o numerador era outro: só a loja
  // Yampi de tráfego, enquanto o Tridify conta Yampi + X1 + Vega. Mesma
  // palavra, réguas diferentes — este slide mostrava ROAS ~0,36x enquanto o
  // relatório mostrava 0,65x. Ver `lib/painel-tridify.ts`.
  const t = sales.tridify;
  const receita = t?.faturamentoTrafego ?? m.yampi.paid.revenue;
  const conv = t?.pedidosTrafego ?? m.yampi.paid.count;
  // Sem o Tridify: a conta antiga, que ao menos respeita o imposto.
  const invest = t
    ? t.gastoComImposto
    : m.trafficSpend != null ? gastoComImposto(m.trafficSpend, config?.trafficTaxPct) : null;
  const roas = t ? t.roas : invest && invest > 0 ? receita / invest : null;
  const cpa = t ? t.cpa : invest && invest > 0 && conv > 0 ? invest / conv : null;

  return (
    <div style={{ width: "100%", maxWidth: 1220, ...PAREDE_MONO }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div style={{ textAlign: "left" }}>
          <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em" }}>Tráfego Pago</h2>
          <p style={{ color: "var(--text-dim)", fontSize: 16, marginTop: 4 }}>Desempenho das campanhas</p>
        </div>
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-dim)", border: "1px solid var(--border)", borderRadius: 999, padding: "8px 16px" }}>
          Este mês
        </span>
      </div>

      {/* 4 cards principais. A cor sai da RAMPA (`corDaSerie`), não de hex
          escolhido aqui: a parede também segue o destaque da empresa, e as
          quatro cores antigas (roxo fixo, azul, âmbar) não significavam nada —
          âmbar em CPA ainda lia como alarme de um número que estava normal. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginBottom: 26 }}>
        <Card rotulo="Receita" valor={receita} formatar={dinheiro} cor={corDaSerie(0)} trend={m.paidTrendPct} />
        <Card rotulo="Investimento" valor={invest} formatar={dinheiro} cor={corDaSerie(1)}
          sub={invest == null ? "aguardando Meta Ads" : "com imposto de importação"} vazio="R$ --" />
        <Card rotulo="ROAS" valor={roas} formatar={(n) => `${n.toFixed(2)}x`} cor={corDaSerie(2)} sub="retorno sobre anúncio" />
        <Card rotulo="CPA" valor={cpa} formatar={dinheiro} cor={corDaSerie(3)} sub="custo por aquisição" />
      </div>

      {/* Gráfico de receita ao longo do tempo */}
      <div className="glass glass-spec" style={{ padding: "22px 26px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>Receita por tráfego pago</span>
          <span style={{ fontSize: 13, color: "var(--text-dim)" }}>diário · este mês</span>
        </div>
        <Curva series={m.trafficSeries} dinheiro={dinheiro} />
      </div>
    </div>
  );
}

/**
 * Cartão de número. `valor` nulo é "ainda não temos este dado" e vira o traço
 * apagado — o cartão continua ocupando a coluna para a fileira não dançar
 * quando o Meta Ads voltar.
 */
function Card({ rotulo, valor, formatar, cor, sub, trend, vazio = "—" }: {
  rotulo: string;
  valor: number | null;
  formatar: (n: number) => string;
  cor: string;
  sub?: string;
  trend?: number;
  vazio?: string;
}) {
  const sobe = (trend ?? 0) >= 0;
  const cheio = valor != null;
  return (
    <div className="glass glass-spec" style={{ padding: "20px 24px", opacity: cheio ? 1 : 0.6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-dim)" }}>{rotulo}</span>
        {trend !== undefined && (
          // Subir/cair é ESTADO, então a cor vem da paleta semântica e não da
          // rampa — verde significa uma coisa e não pode virar rosa porque
          // alguém trocou o destaque. A seta é ícone Tabler: "↑" é glifo de
          // texto, some no fallback de fonte da TV e não tem espessura própria.
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 800, color: sobe ? "var(--ok)" : "var(--perigo)", background: `color-mix(in srgb, ${sobe ? "var(--ok)" : "var(--perigo)"} 16%, transparent)`, padding: "3px 9px", borderRadius: 999 }}>
            <Icon name={sobe ? "trending-up" : "trending-down"} size={15} color={sobe ? "var(--ok)" : "var(--perigo)"} />
            {Math.abs(trend).toFixed(0)}%
          </span>
        )}
      </div>
      {/* Numa parede que se atualiza sozinha, o número que CONTA é o único
          jeito de a pessoa perceber que o dado mudou — não há recarregar
          página nem cursor piscando. */}
      <div className="stat" style={{ fontSize: 46, color: cor, marginTop: 12, textShadow: `0 0 34px color-mix(in srgb, ${cor} 35%, transparent)` }}>
        {cheio ? <NumeroVivo valor={valor} formatar={formatar} /> : vazio}
      </div>
      {sub && <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

/**
 * A curva do mês, na arte mono-rounded.
 *
 * Três trocas em relação ao desenho antigo, todas por causa da distância de
 * leitura: a polilinha de segmentos retos virou curva MONÓTONA (`caminhoSuave`,
 * que também impede o vale abaixo de zero entre um dia forte e um dia parado);
 * o traço roxo fixo virou tinta da rampa; e a grade de `rgba(255,255,255,.07)`
 * — invisível a três metros e branca no tema claro — virou `.mono-grade-linha`,
 * que sai do texto do tema.
 */
function Curva({ series, dinheiro }: {
  series: { day: string; value: number }[];
  dinheiro: (n: number) => string;
}) {
  const W = 1140, H = 230, padE = 86, padD = 14, padT = 18, padB = 28;
  const data = series.length ? series : [{ day: "", value: 0 }];
  const n = data.length;
  // Teto redondo em vez do próprio máximo: uma linha de grade em 8.437 ninguém
  // lê de longe.
  const teto = tetoRedondo(Math.max(...data.map((d) => d.value), 1));
  const x = (i: number) => padE + (n <= 1 ? (W - padE - padD) / 2 : (i / (n - 1)) * (W - padE - padD));
  const y = (v: number) => padT + (1 - v / teto) * (H - padT - padB);

  const pts = data.map((d, i) => ({ x: x(i), y: y(d.value) }));
  const linha = caminhoSuave(pts);
  const base = H - padB;
  const area = `${linha} L${pts[n - 1].x.toFixed(1)},${base} L${pts[0].x.toFixed(1)},${base} Z`;
  const ultimo = data[n - 1];
  const tinta = corDaSerie(0);
  const grade = [0, 1, 2, 3, 4].map((k) => (teto / 4) * k);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 230, display: "block" }} role="img"
      aria-label={`Receita por tráfego pago: ${n} dias, máximo ${dinheiro(Math.max(...data.map((d) => d.value)))}`}>
      <defs>
        {/* A parada de gradiente não enxerga a cor de quem referencia o `fill`,
            só a que ela própria herda — por isso a tinta vai escrita nela. */}
        <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tinta} stopOpacity="0.26" />
          <stop offset="100%" stopColor={tinta} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grade só HORIZONTAL: linha vertical num gráfico de tempo compete com o
          traço e não ajuda a ler nenhum valor. */}
      {grade.map((v, i) => (
        <g key={i}>
          <line className="mono-grade-linha" x1={padE} x2={W - padD} y1={y(v)} y2={y(v)} />
          <text className="mono-eixo-txt" style={PAREDE_EIXO} x={padE - 10} y={y(v) + 5} textAnchor="end">
            {fmtCurto(v, true)}
          </text>
        </g>
      ))}

      <path d={area} fill="url(#tg)" />
      {/* `data-mt="desenhar"` sobrevive na parede porque roda UMA vez, na
          montagem do slide — não depende de rolagem nem de ponteiro. O viewBox
          tem a largura real do desenho, então o tracejado do `non-scaling-stroke`
          não sai picotado. */}
      {/* A tinta vai por `style` e não por atributo `stroke`: `.mono-serie`
          declara `stroke` no CSS, e regra de classe vence atributo de
          apresentação — a linha sairia na cor padrão da rampa. */}
      <path className="mono-serie" data-mt="desenhar" d={linha}
        style={{ stroke: tinta, ["--mono-comp" as string]: comprimento(pts) }} />

      {n > 1 && (
        <>
          <circle className="mono-ponto" cx={x(n - 1)} cy={y(ultimo.value)} r="8" style={{ fill: tinta }} />
          <g transform={`translate(${Math.min(x(n - 1), W - 140)}, ${Math.max(y(ultimo.value) - 46, 4)})`}>
            <rect width="132" height="34" rx="17" fill={tinta} />
            {/* Texto na cor do FUNDO da parede, não `#fff`: com um destaque
                claro (jade, âmbar) branco sobre branco some. */}
            <text x="66" y="23" textAnchor="middle" fill="var(--bg)" fontSize="17" fontWeight="700">
              {dinheiro(ultimo.value)}
            </text>
          </g>
        </>
      )}

      {/* Rótulos de data nas extremidades. */}
      <text className="mono-eixo-txt" style={PAREDE_EIXO} x={padE} y={H - 6}>{fmtDay(data[0]?.day)}</text>
      <text className="mono-eixo-txt" style={PAREDE_EIXO} x={W - padD} y={H - 6} textAnchor="end">{fmtDay(ultimo?.day)}</text>
    </svg>
  );
}

function fmtDay(iso?: string) {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  const mes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"][Number(m) - 1];
  return `${d}/${mes}`;
}
