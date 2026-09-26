"use client";

import { useEffect, useState } from "react";
import { fmtBRL2 as fmtBRL, fmtNum } from "@/lib/format";
import { Icon } from "../Icon";
import { Kpi, Money } from "../ui/primitives";
import { SkeletonDashboard } from "../Skeleton";
import { PeriodPicker, periodQuery, DEFAULT_PERIOD, type PeriodState } from "../PeriodPicker";
import { useIsMobile } from "../ui/useMediaQuery";
import { Fila, NumeroVivo } from "../ui/micro";
import { Abas } from "../ui/Abas";
import { FilaViva, Revalidando, Atualizando, Vazio } from "../analytics/movimento";

interface VendedorX1 {
  user_id: string; nome: string;
  x1Pedidos: number; x1ComFrete: number; x1SemFrete: number;
  normalPedidos: number; normalComFrete: number; normalSemFrete: number;
  totalPedidos: number; totalComFrete: number; totalSemFrete: number;
}
interface X1 {
  periodLabel: string; valorUsado: number; valorGerado: number; compras: number; leads: number;
  ticket: number | null; cpa: number | null; cpl: number | null; marketingPct: number | null; roas: number | null;
  vendedores: VendedorX1[];
}
const pct = (n: number | null) => n == null ? "—" : `${n.toFixed(1).replace(".", ",")}%`;
const x = (n: number | null) => n == null ? "—" : `${n.toFixed(2)}x`;

/** Casca que recebe o `--mt-i` da `Fila` — o `Money` não aceita `style`. */
function Cel({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", minWidth: 0 }}>{children}</div>;
}

// Marketing X1 — só conta venda com Fonte = Facebook (Venda X1) contra o gasto {MKT}.
//
// `periodo` vindo de fora não é conveniência: dentro do Analytics esta peça
// mora numa tela que JÁ tem seletor de período no topo. Com o seletor próprio
// eram dois na mesma tela — trocar o de cima não mexia nos números daqui, e a
// pessoa lia dois períodos diferentes empilhados sem nenhum aviso. Quando o pai
// manda o período, o seletor local nem é desenhado.
export function MarketingX1({ periodo }: { periodo?: PeriodState } = {}) {
  const [periodoLocal, setPeriodoLocal] = useState<PeriodState>(DEFAULT_PERIOD);
  const period = periodo ?? periodoLocal;
  const setPeriod = setPeriodoLocal;
  const [d, setD] = useState<X1 | null>(null);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (period.key === "custom" && (!period.from || !period.to)) return;
    let active = true; setLoading(true);
    fetch(`/api/comercial/marketing-x1?${periodQuery(period)}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (!active) return; if (j.valorUsado !== undefined) { setD(j); setErr(false); } else setErr(true); setLoading(false); })
      .catch(() => { if (active) { setErr(true); setLoading(false); } });
    return () => { active = false; };
  }, [period]);

  return (
    <div>
      <div style={{ marginBottom: periodo ? 0 : 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {!periodo && <PeriodPicker value={period} onChange={setPeriod} />}
        <Atualizando ativo={loading && !!d} />
      </div>

      {loading && !d ? <SkeletonDashboard /> : err && !d ? (
        <div className="glass" style={{ borderRadius: "var(--r-md)" }}>
          <Vazio icone="alert-triangle" tom="var(--perigo)" titulo="Não foi possível carregar o Marketing X1" texto="Troque o período ou recarregue a página em instantes." />
        </div>
      ) : d && (
        // Troca de período: o número antigo fica esmaecido e CONTA até o novo
        // quando ele chega (Kinetics 100 + 062), sem voltar ao esqueleto.
        <Revalidando ativo={loading} className="km-chega">
          <Fila style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 12, marginBottom: 16 }}>
            <Cel><Money label="Gasto {MKT}" value={d.valorUsado} color="var(--perigo)" /></Cel>
            <Cel><Money label="Venda X1 (s/ frete)" value={d.valorGerado} color="var(--ok)" /></Cel>
            <Kpi label="Compras X1" value={d.compras} color="var(--primary-texto)" />
            <Kpi label="Leads" value={d.leads} color="var(--info)" />
          </Fila>
          <Fila style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 12 }}>
            <Kpi label="ROAS" value={x(d.roas)} color={d.roas != null && d.roas >= 1 ? "var(--ok)" : "var(--perigo)"} />
            <Kpi label="CPA" value={d.cpa == null ? "—" : fmtBRL(d.cpa)} color="var(--atencao)" />
            <Kpi label="CPL" value={d.cpl == null ? "—" : fmtBRL(d.cpl)} color="var(--atencao)" />
            <Kpi label="Ticket X1" value={d.ticket == null ? "—" : fmtBRL(d.ticket)} color="var(--roxo)" />
            <Kpi label="% Gasto / venda" value={pct(d.marketingPct)} color="var(--atencao)" />
          </Fila>
          <p style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="alert-triangle" size={13} color="var(--text-dim)" />
            Regra: a venda só conta como <strong>&nbsp;Venda X1&nbsp;</strong> se a <strong>&nbsp;Fonte do lead = Facebook&nbsp;</strong>. Gasto = campanhas com {"{MKT}"} no nome. ROAS = venda X1 / gasto.
          </p>

          {/* Vendas totais por pessoa: X1 + normais, com e sem frete */}
          <VendedoresX1 lista={d.vendedores ?? []} />
        </Revalidando>
      )}
    </div>
  );
}

// Tabela de vendas totais por pessoa do Marketing/Vendas: X1 + normais,
// somando com e sem frete.
function VendedoresX1({ lista }: { lista: VendedorX1[] }) {
  const [semFrete, setSemFrete] = useState(false);
  const celular = useIsMobile();
  if (lista.length === 0) return null;
  const get = (v: VendedorX1, tipo: "x1" | "normal" | "total") =>
    semFrete ? v[`${tipo}SemFrete`] : v[`${tipo}ComFrete`];
  const totGeral = lista.reduce((s, v) => s + get(v, "total"), 0);
  // Quatro colunas dão ~55px cada a 320px — valor em BRL não cabe. No celular a
  // linha vira um bloco por pessoa com os pares rótulo→valor.
  const cols = celular ? "minmax(0, 1fr)" : "1.4fr 1fr 1fr 1fr";
  return (
    <div className="glass glass-spec" style={{ padding: 18, borderRadius: "var(--r-md)", marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 15, fontWeight: 800 }}>Vendas por pessoa (X1 + normais)</h3>
        <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>soma do que cada um vendeu no período</span>
        {/* A `Abas` do kit (degrau de baixo): a pílula DESLIZA entre "com" e
            "sem" frete (Kinetics 005) e os valores da tabela CONTAM até a nova
            soma — o par de botões pintados trocava tudo num quadro só. */}
        <div style={{ marginLeft: "auto", minWidth: 0, maxWidth: "100%" }}>
          <Abas className="ui-abas--sub" ariaLabel="Frete na soma" valor={semFrete ? "sem" : "com"} onMuda={(v) => setSemFrete(v === "sem")}
            itens={[{ valor: "com", rotulo: "Com frete" }, { valor: "sem", rotulo: "Sem frete" }]} />
        </div>
      </div>
      {/* Cabeçalho — some quando a linha empilha (não teria com o que se alinhar) */}
      {!celular && (
        <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8, padding: "0 4px 8px", fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>
          <span>Pessoa</span><span style={{ textAlign: "right" }}>X1 (Facebook)</span><span style={{ textAlign: "right" }}>Normais</span><span style={{ textAlign: "right" }}>Total</span>
        </div>
      )}
      <FilaViva style={{ display: "flex", flexDirection: "column" }}>
        {lista.map((v) => (
          <div key={v.user_id || v.nome} className="mt-linha" style={{ display: "grid", gridTemplateColumns: cols, gap: celular ? 4 : 8, padding: "10px 4px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.nome}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{fmtNum(v.totalPedidos)} pedidos</div>
            </div>
            <Celula celular={celular} rotulo="X1 (Facebook)" valor={<NumeroVivo valor={get(v, "x1")} formatar={fmtBRL} />} cor="var(--atencao)" nota={`${fmtNum(v.x1Pedidos)}x`} />
            <Celula celular={celular} rotulo="Normais" valor={<NumeroVivo valor={get(v, "normal")} formatar={fmtBRL} />} cor="var(--primary-texto)" nota={`${fmtNum(v.normalPedidos)}x`} />
            <Celula celular={celular} rotulo="Total" valor={<NumeroVivo valor={get(v, "total")} formatar={fmtBRL} />} cor="var(--ok)" destaque />
          </div>
        ))}
      </FilaViva>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10, fontSize: 13, color: "var(--text-dim)", flexWrap: "wrap" }}>
        Total geral {semFrete ? "(sem frete)" : "(com frete)"}: <strong style={{ color: "var(--ok)" }}><NumeroVivo valor={totGeral} formatar={fmtBRL} /></strong>
      </div>
    </div>
  );
}

// Uma célula de valor da tabela: coluna alinhada à direita no desktop; no celular
// vira o par rótulo→valor da linha empilhada (é o rótulo que substitui o cabeçalho).
function Celula({ celular, rotulo, valor, cor, nota, destaque }: { celular: boolean; rotulo: string; valor: React.ReactNode; cor: string; nota?: string; destaque?: boolean }) {
  return (
    <div style={celular
      ? { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }
      : { textAlign: "right" }}>
      {celular && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", flex: "none" }}>{rotulo}</span>}
      <div style={{ textAlign: "right", minWidth: 0, display: celular ? "flex" : "block", alignItems: "baseline", gap: 6 }}>
        <div className={destaque ? "stat" : undefined} style={{ fontSize: destaque ? 15 : 13.5, fontWeight: destaque ? undefined : 700, color: cor }}>{valor}</div>
        {nota && <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{nota}</div>}
      </div>
    </div>
  );
}
