"use client";

import type { PanelConfig, SalesSnapshot } from "@/lib/types";
import { fmtBRL, fmtCurto, fmtNum } from "@/lib/format";
import { corDaSerie } from "@/app/(plataforma)/ui/graficos";
import { NumeroVivo } from "@/app/(plataforma)/ui/micro";

/** O dinheiro desta tela, na escala que o PERFIL pediu — ver RankingSlide. */
const moeda = (curtos?: boolean) => (n: number) => (curtos ? fmtCurto(n, true) : fmtBRL(n));
import { Icon } from "./Icon";
import { PAREDE_MONO } from "./parede";

// Resumo financeiro do negócio — KPI gigante + projeção + breakdown.
// A tinta é a da RAMPA (`corDaSerie(0)`), que deriva do destaque escolhido pela
// empresa: antes era `var(--roxo)` fixo, então trocar o destaque repintava o ERP
// inteiro e deixava a parede roxa.
export function MetricsSlide({ sales, config, curtos }: { sales: SalesSnapshot; config: PanelConfig; curtos?: boolean }) {
  const dinheiro = moeda(curtos);
  const m = sales.metrics;
  if (!m) return null;
  const tinta = corDaSerie(0);

  // Base do Tridify (ver MonthGoalSlide) com queda pro ERP.
  const t = sales.tridify;
  const fat = t?.faturamentoEmpresa ?? m.totalSales.revenue;
  const pedidos = t?.pedidosEmpresa ?? m.totalSales.count;
  const ticket = pedidos > 0 ? Math.round(fat / pedidos) : 0;
  const projecao = t?.projecaoMes ?? m.projection;
  const goal = config.monthlyRevenueGoal || 0;
  const pct = goal > 0 ? (fat / goal) * 100 : 0;
  const projPct = goal > 0 ? (projecao / goal) * 100 : 0;

  return (
    <div style={{ width: "100%", maxWidth: 1200, ...PAREDE_MONO }}>
      {/* Faturamento + pedidos/ticket */}
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <div style={{ flex: 1 }}>
          <div style={label}>FATURAMENTO TOTAL</div>
          {/* Tipografia grande quer tracking NEGATIVO e leading apertado — é o
              que `.stat` já faz. O número CONTA porque a parede se atualiza
              sozinha: sem o movimento ninguém percebe que o valor mudou. */}
          <div className="stat" style={{ fontSize: 132, lineHeight: 1, marginTop: 2, textShadow: `0 0 70px color-mix(in srgb, ${tinta} 28%, transparent)` }}>
            <NumeroVivo valor={fat} formatar={dinheiro} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 22 }}>
            <Anel pct={pct} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: pct >= 100 ? "var(--ok)" : tinta }}>da meta</div>
              <div style={{ fontSize: 16, color: "var(--text-dim)", marginTop: 2 }}>Meta: {dinheiro(goal)}</div>
            </div>
          </div>
        </div>

        <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />

        <div style={{ flex: "0 0 300px", display: "flex", flexDirection: "column", gap: 22 }}>
          {/* `fmtNum` cru não serve num número que CONTA: no meio da contagem
              o valor é fracionário e o `toLocaleString` padrão mostraria
              "1.234,567". Arredonda antes de formatar. */}
          <MiniKpi icon="shopping-cart" valor={pedidos} formatar={inteiro} label="pedidos" cor={tinta} />
          <MiniKpi icon="target" valor={ticket} formatar={dinheiro} label="ticket médio" cor={tinta} />
        </div>
      </div>

      <div style={{ height: 1, background: "var(--border)", margin: "30px 0" }} />

      {/* Projeção */}
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <div>
          <div style={label}>PROJEÇÃO DO MÊS</div>
          <div className="stat" style={{ fontSize: 96, lineHeight: 1, marginTop: 2 }}>
            <NumeroVivo valor={projecao} formatar={dinheiro} />
          </div>
        </div>
        <div className="glass glass-spec" style={{ padding: "14px 26px", textAlign: "center" }}>
          {/* Bater a meta é ESTADO, e estado sai da paleta semântica: verde
              significa uma coisa e não pode virar rosa porque alguém trocou o
              destaque da empresa. */}
          <div className="stat" style={{ fontSize: 40, color: projPct >= 100 ? "var(--ok)" : tinta }}>
            <NumeroVivo valor={projPct} formatar={(n) => `${n.toFixed(0)}%`} />
          </div>
          <div style={{ fontSize: 14, color: "var(--text-dim)" }}>da meta</div>
        </div>
      </div>

      {/* Breakdown discreto */}
      <div className="glass glass-spec" style={{ marginTop: 26, padding: "16px 26px", display: "flex", justifyContent: "space-between", gap: 20 }}>
        <Break label="Vendas Yampi" valor={m.yampi.total.revenue} formatar={dinheiro} sub={`${fmtNum(m.yampi.total.count)} pedidos`} />
        <Break label="Yampi — Tráfego Pago" valor={m.yampi.paid.revenue} formatar={dinheiro} sub={`${fmtNum(m.yampi.paid.count)} pedidos`} />
        <Break label="Yampi — Orgânico" valor={m.yampi.organic.revenue} formatar={dinheiro} sub={`${fmtNum(m.yampi.organic.count)} pedidos`} />
        <Break label="Vendas Comercial" valor={m.comercial.revenue} formatar={dinheiro} sub={`${fmtNum(m.comercial.count)} pedidos`} />
        <Break label="Gastos com Tráfego" valor={m.trafficSpend} formatar={dinheiro} sub="aguardando Meta Ads" />
      </div>
    </div>
  );
}

/**
 * O anel da meta, na arte mono-rounded: trilho na cor da grade, ponta
 * arredondada, tinta da rampa — verde quando a meta cai.
 *
 * O anel se DESENHA na montagem, e o truque para isso é o tracejado: um traço
 * do tamanho exato do preenchimento seguido de um vão do anel inteiro, com o
 * deslocamento partindo do próprio traço. Assim `monoDesenhar` (que só sabe
 * levar o `stroke-dashoffset` a zero) revela exatamente a fração certa. Marcar
 * `data-mt="desenhar"` em cima do par dasharray/dashoffset de progresso
 * clássico faria o anel encher até 100% e FICAR lá — a parede mostraria meta
 * batida todo dia.
 */
function Anel({ pct }: { pct: number }) {
  const r = 30, c = 2 * Math.PI * r;
  const cheio = c * (Math.min(Math.max(pct, 0), 100) / 100);
  const cor = pct >= 100 ? "var(--ok)" : corDaSerie(0);
  return (
    <svg width="78" height="78" viewBox="0 0 78 78" role="img" aria-label={`${pct.toFixed(0)}% da meta`}>
      <circle cx="39" cy="39" r={r} fill="none" stroke="var(--mono-grade)" strokeWidth="7" />
      <circle
        className="mono-arco"
        data-mt="desenhar"
        cx="39" cy="39" r={r}
        fill="none" stroke={cor} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${cheio.toFixed(2)} ${c.toFixed(2)}`}
        strokeDashoffset={cheio.toFixed(2)}
        transform="rotate(-90 39 39)"
      />
      {/* `#fff` fixo sumia no tema claro do painel — a cor do texto é do tema. */}
      <text x="39" y="44" textAnchor="middle" fill="var(--text)" fontSize="22" fontWeight="800">{pct.toFixed(0)}%</text>
    </svg>
  );
}

function MiniKpi({ icon, valor, formatar, label, cor }: {
  icon: string; valor: number; formatar: (n: number) => string; label: string; cor: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: `color-mix(in srgb, ${cor} 16%, transparent)`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        <Icon name={icon} size={26} color={cor} />
      </div>
      <div>
        <div className="stat" style={{ fontSize: 40 }}><NumeroVivo valor={valor} formatar={formatar} /></div>
        <div style={{ fontSize: 15, color: "var(--text-dim)" }}>{label}</div>
      </div>
    </div>
  );
}

/** Linha do rodapé. `valor` nulo é dado que ainda não chegou — apaga em vez de
 *  inventar um zero, que na parede seria lido como fato. */
function Break({ label, valor, formatar, sub }: {
  label: string; valor: number | null; formatar: (n: number) => string; sub: string;
}) {
  return (
    <div style={{ opacity: valor == null ? 0.55 : 1 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-dim)", textTransform: "uppercase" }}>{label}</div>
      <div className="stat" style={{ fontSize: 26, marginTop: 8 }}>
        {valor == null ? "—" : <NumeroVivo valor={valor} formatar={formatar} />}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>{sub}</div>
    </div>
  );
}

/** Contagem inteira — ver a nota no `MiniKpi` de pedidos. */
const inteiro = (n: number) => fmtNum(Math.round(n));

const label: React.CSSProperties = { fontSize: 22, fontWeight: 800, letterSpacing: "0.08em", color: "var(--text-dim)" };
