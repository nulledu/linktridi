"use client";

import { useEffect, useState } from "react";
import { fmtBRL2 as fmtBRL, fmtNum } from "@/lib/format";
import { Icon } from "../Icon";
import { Panel } from "../ui/primitives";
import { MonoRoundedAreaChart } from "../ui/monocharts/MonoRoundedAreaChart";
import { MonoRoundedKpiCardChart } from "../ui/monocharts/MonoRoundedKpiCardChart";
import { Fila, NumeroVivo } from "../ui/micro";
import { SkeletonDashboard } from "../Skeleton";
import { PeriodPicker, periodQuery, DEFAULT_PERIOD, type PeriodState } from "../PeriodPicker";
import { grade } from "../ui/grade";
import { FilaViva, BarraElastica, Revalidando, Atualizando, Vazio } from "../analytics/movimento";

// Rótulo do eixo X: o dia chega do ERP como "2026-08-18" e cabe no eixo como
// "18/08". Semana ("2026-S33") e mês ("2026-08") passam inteiros — quem monta a
// série é a API, e ela troca de granularidade sozinha em período longo.
const diaCurto = (r: string) => {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(r);
  return m ? `${m[2]}/${m[1]}` : r;
};

interface VendaPorVendedor { user_id: string; nome: string; faturamento: number; pedidos: number; ticket: number }
interface TopProduto { nome: string; qtd: number; valor: number }
interface Geral {
  periodLabel: string; faturamento: number; pedidos: number; ticket: number;
  perVendedor: VendaPorVendedor[]; topProdutos: TopProduto[]; serie: { day: string; value: number }[];
}

// Dashboard GERAL de vendas — o Comercial com os números da Tridify
// (faturamento, ticket, vendas, série) e o ranking/produtos do livro do
// comercial. Ver lib/comercial-geral.ts.
export function VendasGeral() {
  const [period, setPeriod] = useState<PeriodState>(DEFAULT_PERIOD);
  const [d, setD] = useState<Geral | null>(null);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (period.key === "custom" && (!period.from || !period.to)) return;
    let active = true;
    setLoading(true);
    fetch(`/api/comercial/geral?${periodQuery(period)}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (!active) return; if (j.faturamento !== undefined) { setD(j); setErr(false); } else setErr(true); setLoading(false); })
      .catch(() => { if (active) { setErr(true); setLoading(false); } });
    return () => { active = false; };
  }, [period]);

  return (
    <div>
      <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <PeriodPicker value={period} onChange={setPeriod} />
        <Atualizando ativo={loading && !!d} />
      </div>

      {/* Esqueleto com a FORMA da tela (três KPIs + gráfico) no primeiro
          carregamento; depois disso o dado antigo fica, esmaecido, até o novo
          chegar — trocar o período não devolve o esqueleto nem salta a altura. */}
      {loading && !d ? <SkeletonDashboard kpis={3} /> : err && !d ? (
        <div className="glass" style={{ borderRadius: "var(--r-md)" }}>
          <Vazio icone="alert-triangle" tom="var(--perigo)" titulo="Não foi possível carregar as vendas" texto="Troque o período ou recarregue a página em instantes." />
        </div>
      ) : d && (
        <Revalidando ativo={loading} className="km-chega">
          {/* KPIs. O invólucro por cartão existe porque é NELE que a `Fila`
              carimba o `--mt-i` — o `MonoKpi` não recebe `style`, e sem o
              invólucro os três entrariam no mesmo instante. */}
          <Fila className="kpi-row" style={{ display: "grid", gridTemplateColumns: grade(250, 3, 12), gap: 12, marginBottom: 16 }}>
            <div style={{ display: "grid", minWidth: 0 }}>
              <MonoRoundedKpiCardChart rotulo="Faturamento" valor={<NumeroVivo valor={d.faturamento} formatar={fmtBRL} />} historico={d.serie.map((s) => s.value)} rodapeEsq={d.periodLabel} />
            </div>
            <div style={{ display: "grid", minWidth: 0 }}>
              <MonoRoundedKpiCardChart rotulo="Pedidos" valor={<NumeroVivo valor={d.pedidos} formatar={fmtNum} />} rodapeEsq="no período" />
            </div>
            <div style={{ display: "grid", minWidth: 0 }}>
              <MonoRoundedKpiCardChart rotulo="Ticket médio" valor={<NumeroVivo valor={d.ticket} formatar={fmtBRL} />} rodapeEsq="por pedido" />
            </div>
          </Fila>

          {/* Faturamento por dia */}
          {d.serie.some((s) => s.value > 0) && (
            <div style={{ marginBottom: 16 }}>
              <MonoRoundedAreaChart
                rotulo="Faturamento por dia"
                selo="Área"
                valor={fmtBRL(d.faturamento)}
                pontos={d.serie.map((s) => ({ rotulo: s.day, valor: s.value }))}
                nome="Faturamento"
                formatar={fmtBRL}
                rotuloDe={diaCurto}
                rodapeEsq={d.periodLabel}
              />
            </div>
          )}

          <div className="duo duo-eq" style={{ gap: 16 }}>
            {/* Por vendedor. `FilaViva`: quando o período muda e a líder cai
                pra segundo, cada linha desliza pra posição nova em vez de o
                ranking reembaralhar num quadro só. */}
            <Panel size="sm" title="Por vendedor" subtitle="Faturamento no período" indice={0}>
              {d.perVendedor.length === 0 ? <Empty /> : <FilaViva>{d.perVendedor.map((v) => {
                const max = d.perVendedor[0]?.faturamento || 1;
                return (
                  <div key={v.user_id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <Icon name="user" size={14} color="var(--text-dim)" />
                      <strong style={{ fontSize: 13.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.nome}</strong>
                      <span className="stat" style={{ fontSize: 15, color: "var(--ok)" }}><NumeroVivo valor={v.faturamento} formatar={fmtBRL} /></span>
                    </div>
                    {/* Barra-pílula do Monocharts, agora elástica: cresce ao
                        entrar na tela e anda até o valor novo na troca de
                        período (Kinetics 057). */}
                    <BarraElastica frac={v.faturamento / max} trilho="var(--mc-palco)" />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--text-dim)", marginTop: 4 }}>
                      <span>{fmtNum(v.pedidos)} pedidos</span><span>ticket {fmtBRL(v.ticket)}</span>
                    </div>
                  </div>
                );
              })}</FilaViva>}
            </Panel>

            {/* Produtos mais vendidos. Chave pelo NOME (era o índice): é a
                identidade que o FLIP segue quando a ordem muda. */}
            <Panel size="sm" title="Produtos mais vendidos" subtitle="Por faturamento no período" indice={1}>
              {d.topProdutos.length === 0 ? <Empty /> : <FilaViva>{d.topProdutos.map((p, i) => (
                <div key={p.nome} className="mt-linha" style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 4px", borderBottom: "1px solid var(--border)", borderRadius: 8 }}>
                  <span className="mt-num" style={{ fontSize: 12, color: "var(--text-dim)", width: 18 }}>{i + 1}º</span>
                  <span style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</span>
                  <span className="mt-num" style={{ fontSize: 12, color: "var(--text-dim)" }}>{fmtNum(p.qtd)}x</span>
                  <strong className="mt-num" style={{ fontSize: 13 }}>{fmtBRL(p.valor)}</strong>
                </div>
              ))}</FilaViva>}
            </Panel>
          </div>
        </Revalidando>
      )}
    </div>
  );
}

function Empty() { return <Vazio compacto icone="chart-bar" titulo="Sem vendas no período" texto="Escolha outro período no seletor acima." />; }
