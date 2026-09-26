"use client";

// ── Banco de provas das peças que só existem atrás do login ──────────────────
//
// O `/dev-micro` prova o VOCABULÁRIO (as classes e os componentes do kit). Aqui
// ficam as peças REAIS das telas — o mesmo `AreaChart` que o dash de vendas
// desenha, o mesmo `Barras` do Financeiro, o mesmo `MetricCard` da Tridify —
// alimentadas com dado de mentira.
//
// Existe porque a repaginação tocou ~40 arquivos e a maioria mora em rota que
// exige sessão, e credencial não se digita. Sem isto, essas peças ficavam
// cobertas só por `tsc` e por teste — nada que provasse que elas DESENHAM.
// Todas as importadas aqui são puras (recebem dado por prop, não buscam nada),
// então montá-las fora da tela real não muda o que elas mostram.
import { AreaChart } from "../(plataforma)/Chart";
import { Barras } from "../(plataforma)/financeiro/ui";
import { DeltaChip, Sparkline } from "../(plataforma)/producao/parts";
import { ComparisonIndicator, MetricCard, MiniSpark } from "../(plataforma)/trafego/TfKit";
import { Kpi, KpiDelta, Money, Panel, Plain } from "../(plataforma)/ui/primitives";

// Mesma forma do dado real: 21 dias com fim de semana afundado. Dado uniforme
// esconderia justamente o que a curva monótona resolve (não descer abaixo de
// zero entre dois pontos distantes).
const DIAS = Array.from({ length: 21 }, (_, i) => {
  const d = new Date(2026, 6, i + 1);
  const fds = d.getDay() === 0 || d.getDay() === 6;
  return {
    day: `2026-07-${String(i + 1).padStart(2, "0")}`,
    value: Math.round((fds ? 700 : 3800) + Math.sin(i / 2.2) * 1400 + (i % 4) * 240),
  };
});
const VALORES = DIAS.map((d) => d.value);

const FATIAS = [
  { id: "1", label: "Fornecedores", cor: "var(--graf-1)", valor: 48200, proporcao: 0.42 },
  { id: "2", label: "Folha", cor: "var(--graf-2)", valor: 33100, proporcao: 0.29 },
  { id: "3", label: "Impostos", cor: "var(--graf-3)", valor: 19400, proporcao: 0.17 },
  { id: "4", label: "Marketing", cor: "var(--graf-4)", valor: 13800, proporcao: 0.12 },
];

function Grupo({ titulo, origem, children }: { titulo: string; origem: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "grid", gap: 10, minWidth: 0 }}>
      <div>
        <h3 style={{ fontSize: 15, fontWeight: 800 }}>{titulo}</h3>
        <code style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{origem}</code>
      </div>
      {children}
    </section>
  );
}

export function ProvaTelas() {
  return (
    <section style={{ display: "grid", gap: 26, minWidth: 0 }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em" }}>Peças das telas reais</h2>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 2, maxWidth: "62ch" }}>
          Os mesmos componentes que o dash de vendas, o Financeiro, a Produção e a
          Tridify desenham — com dado de mentira, pra dar pra conferir sem login.
          Trocar o destaque lá em cima repinta tudo isto junto.
        </p>
      </div>

      <Grupo titulo="Gráfico de área do dash de vendas" origem="AreaChart · app/(plataforma)/Chart.tsx">
        <div className="glass glass-spec" style={{ padding: 16, borderRadius: 18, minWidth: 0 }}>
          <AreaChart series={DIAS} color="var(--graf-1)" money height={170} />
        </div>
      </Grupo>

      <Grupo titulo="Fileira de números" origem="Kpi · KpiDelta · Money · Plain · app/(plataforma)/ui/primitives.tsx">
        <div className="kpi-row" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))" }}>
          <Kpi label="Pedidos hoje" value={128} color="var(--graf-1)" icon="shopping-cart" size="md" />
          <Money label="Faturamento" value={168430.55} color="var(--ok)" sub="21 dias" />
          <Plain label="Ticket médio" value="R$ 1.316" color="var(--graf-3)" />
          <KpiDelta label="Conversão" value="7,8%" delta={12} color="var(--graf-2)" />
          <KpiDelta label="Custo por venda" value="R$ 58" delta={9} color="var(--graf-4)" invert />
        </div>
      </Grupo>

      <Grupo titulo="Painel de vidro" origem="Panel · app/(plataforma)/ui/primitives.tsx">
        <div className="duo">
          <Panel title="Por canal" subtitle="participação no período" indice={0}>
            <Barras fatias={FATIAS} />
          </Panel>
          <Panel title="Produção por dia" subtitle="peças concluídas" indice={1}>
            <Sparkline days={DIAS} color="var(--graf-2)" height={64} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <DeltaChip pct={18} />
              <DeltaChip pct={-7} />
              <DeltaChip pct={0} />
            </div>
          </Panel>
        </div>
      </Grupo>

      <Grupo titulo="Cartões da Tridify" origem="MetricCard · MiniSpark · ComparisonIndicator · app/(plataforma)/trafego/TfKit.tsx">
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))" }}>
          <MetricCard
            label="Investimento" valor="R$ 7.334,00" cor="var(--text)" sub="gasto em anúncios"
            dl={{ txt: "22%", cor: "var(--tf-neg)", rumo: "sobe" }}
            spark={{ vals: VALORES.slice(0, 12), cor: "var(--tf-neutral)" }}
          />
          <MetricCard
            label="Faturamento" valor="R$ 16.830,00" cor="var(--tf-pos)" sub="128 vendas"
            dl={{ txt: "35%", cor: "var(--tf-pos)", rumo: "sobe" }}
            spark={{ vals: VALORES.slice(4, 16), cor: "var(--tf-pos)" }}
          />
          <MetricCard
            label="CPA" valor="R$ 57,30" cor="var(--tf-accent)" sub="custo por venda"
            dl={{ txt: "11%", cor: "var(--tf-pos)", rumo: "desce" }}
          />
        </div>
        <div className="glass glass-spec" style={{ padding: 14, borderRadius: 16, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ width: 130, flex: "none" }}><MiniSpark vals={VALORES.slice(0, 14)} cor="var(--graf-1)" alt={34} /></span>
          <ComparisonIndicator now={16830} prev={12470} />
          <ComparisonIndicator now={57.3} prev={64.1} invert />
          {/* Sem variação: o terceiro rumo, que só duas das quatro cópias
              antigas da conta tratavam. */}
          <ComparisonIndicator dl={{ txt: "0%", cor: "var(--text-dim)", rumo: "igual" }} />
        </div>
      </Grupo>
    </section>
  );
}
