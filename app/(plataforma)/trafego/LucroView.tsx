"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtualizacao } from "./atualizacao";
import type { VendasSnapshot } from "@/lib/trafego-vendas";
import { IMPOSTO_GASTO_PCT } from "@/lib/marketing-const";
import type { CustosConfig } from "@/lib/marketing-config";
import { fmtBRL2, fmtNum } from "@/lib/format";
import { Icon } from "../Icon";
import { Alerta } from "../ui/Alerta";
import { toast } from "../Toast";
import { Panel } from "../ui/primitives";
import { periodQuery, type PeriodState } from "../PeriodPicker";
import { useBuscaAtual } from "../ui/useBuscaAtual";
import { TfChart } from "./TfChart";
import { useIsMobile } from "../ui/useMediaQuery";
import { Botao } from "../ui/controles";

const POS = "var(--tf-pos)";
const NEG = "var(--perigo)";
const WARN = "var(--tf-warn)";
const roasCor = (n: number | null) => (n == null ? "var(--text)" : n >= 2 ? POS : n >= 1 ? WARN : NEG);
const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(n !== 0 && Math.abs(n) < 10 ? 1 : 0)}%`);
const rx = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}x`);
const sinal = (n: number) => (n > 0 ? POS : n < 0 ? NEG : "var(--text)");

// ── Base de MARKETING ────────────────────────────────────────────────────────
// Faturamento do marketing = TRÁFEGO (toda origem marcada como tráfego em
// Fontes: a loja Yampi fonte + Vega Checkout + o que for reclassificado) +
// Marketing X1, com opção de somar o orgânico. NÃO é "pedidos aprovados/todos os
// canais" (que não tem a ver com o retorno do anúncio) — é o mesmo recorte do
// Painel/comissão. Todos os derivados (lucro, MER, margem, ROI, ticket, equilíbrio,
// composição) saem DESTA base.
// Qual receita é medida contra o gasto:
//   "trafego"  = só as origens de tráfego
//   "marketing"= tráfego + Marketing X1  (o marketing todo)
// O orgânico é um ADICIONAL (toggle) que soma sobre qualquer uma das duas — dá
// pra ver "quanto do prejuízo é do tráfego puro" separando dos outros canais.
export type BaseFat = "trafego" | "marketing";

function calcBase(d: VendasSnapshot, base: BaseFat, incluiOrg: boolean) {
  const c = d.custosConfig;
  // A base é `trafegoValor` — TODA origem de tráfego, não a plataforma Yampi.
  // Com `yampiPagasValor` aqui, a migração do checkout pra Vega (24/07/26)
  // derrubou o faturamento medido de R$ 107 mil pra R$ 15 mil sem a loja ter
  // vendido menos: o lucro, o MER e o ROI da tela viraram ficção.
  // O que ficou de fora do dinheiro é o pedido que o ERP ainda não aprovou —
  // medido em `trafegoNaoPagasValor` (quanto está preso), fora do cálculo.
  const trafego = d.trafegoValor;
  const vTraf = d.trafegoN;
  const comX1 = base === "marketing";
  const x1 = comX1 ? d.faturamentoX1 : 0;
  const vX1 = comX1 ? d.pedidosX1 : 0;
  // Orgânico na mesma régua: toda origem marcada como orgânico, não só a loja
  // orgânica da Yampi.
  const org = incluiOrg ? d.organicoValor : 0;
  const vOrg = incluiOrg ? d.organicoN : 0;
  const fat = trafego + x1 + org;
  const vendas = vTraf + vX1 + vOrg;
  const varFrac = (c.produtoPct + c.impostoPct + c.gatewayPct) / 100;
  const custos = fat * varFrac + c.custoFixo * vendas;
  // CUSTO REAL do anúncio: a fatura do Meta + o imposto de importação. O lucro
  // e todo ROAS/ROI saem daqui — medir contra a fatura crua dava um retorno
  // ~14% melhor que o real (é o mesmo `gastoComImposto` do painel).
  const gasto = d.gastoComImposto;
  // LUCRO = faturamento do tráfego − gasto com imposto. Os `custos` seguem
  // apurados (a Composição e o ROAS de equilíbrio os usam), mas ficam FORA
  // desta conta — mesma definição do painel (ver eficienciaTrafego).
  const lucro = fat - gasto;
  return {
    fat, vendas, gasto, gastoBruto: d.gasto, custos, lucro, base,
    margem: fat > 0 ? (lucro / fat) * 100 : null,
    roi: gasto > 0 ? lucro / gasto : null,
    mer: gasto > 0 ? fat / gasto : null,
    ticket: vendas > 0 ? fat / vendas : 0,
    trafego, x1, org, vTraf, vX1, vOrg, incluiOrg,
    // Sempre disponíveis pro detalhamento (independe do que está selecionado).
    x1Total: d.faturamentoX1, orgTotal: d.organicoValor,
  };
}
type Base = ReturnType<typeof calcBase>;

// ── Lucro real (base de marketing, dados do ERP) ─────────────────────────────
export function LucroView({ period }: { period: PeriodState }) {
  const [d, setD] = useState<VendasSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);
  const [base, setBase] = useState<BaseFat>("marketing");
  const [incluiOrg, setIncluiOrg] = useState(false);

  const buscaAtual = useBuscaAtual();
  const load = useCallback(() => {
    if (period.key === "custom" && (!period.from || !period.to)) return;
    setLoading(true); setErr(false);
    // Resposta atrasada de outro período não sobrescreve a busca nova.
    const souAtual = buscaAtual();
    fetch(`/api/trafego/vendas?${periodQuery(period)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (!souAtual()) return; if (j?.faturamento !== undefined) setD(j); else setErr(true); })
      .catch(() => { if (souAtual()) setErr(true); })
      .finally(() => { if (souAtual()) setLoading(false); });
  }, [period, buscaAtual]);
  useEffect(() => { load(); }, [load]);
  // Segue o botão "Atualizar" da Tridify (ver `atualizacao.ts`).
  useAtualizacao(load);

  const b = useMemo(() => (d ? calcBase(d, base, incluiOrg) : null), [d, base, incluiOrg]);

  if (loading && !d) return <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Cruzando as vendas do ERP com o gasto…</p>;
  if (err || !d || !b) return <Alerta tom="perigo">Não foi possível carregar as vendas reais.</Alerta>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SeletorBase d={d} base={base} setBase={setBase} incluiOrg={incluiOrg} setIncluiOrg={setIncluiOrg} b={b} />

      <ResumoTopo d={d} b={b} />
      <PorQueAssim d={d} b={b} incluiOrg={incluiOrg} />
      <Composicao d={d} b={b} />
      <EquilibrioMetas d={d} b={b} />
      <RealxPixel d={d} b={b} />
      <VendasCanal d={d} />
      <Evolucao d={d} incluiOrg={incluiOrg} />
      <CustosEditor inicial={d.custosConfig} b={b} onSalvo={load} />
    </div>
  );
}

// Seletor de BASE: escolhe qual receita entra no lucro e mostra os 3 baldes
// explícitos (tráfego / marketing X1 / orgânico) pra ver qual parte pesa. É a
// resposta ao "o prejuízo é do tráfego ou do marketing todo?": o gasto é o
// mesmo, muda a receita medida contra ele.
function SeletorBase({ d, base, setBase, incluiOrg, setIncluiOrg, b }: {
  d: VendasSnapshot; base: BaseFat; setBase: (b: BaseFat) => void;
  incluiOrg: boolean; setIncluiOrg: (v: boolean) => void; b: Base;
}) {
  const trafegoFat = d.trafegoValor;   // toda origem de tráfego (ver calcBase)
  const x1Zero = d.faturamentoX1 <= 0;
  const chip = (v: BaseFat, label: string, hint: string) => {
    const on = base === v;
    return (
      <button key={v} onClick={() => setBase(v)} title={hint}
        style={{ padding: "7px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
          border: "1px solid " + (on ? "transparent" : "var(--border)"),
          background: on ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: on ? "var(--on-primary, #fff)" : "var(--text)" }}>{label}</button>
    );
  };
  const balde = (label: string, valor: number, ativo: boolean) => (
    <div style={{ padding: "8px 11px", borderRadius: 10, border: "1px solid " + (ativo ? "color-mix(in srgb, var(--primary) 34%, transparent)" : "var(--tf-line-soft, var(--border))"), background: ativo ? "color-mix(in srgb, var(--primary) 9%, transparent)" : "transparent", minWidth: 130 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".03em" }}>{label}</div>
      <div className="stat" style={{ fontSize: 15, fontWeight: 800, color: ativo ? "var(--text)" : "var(--text-dim)" }}>{fmtBRL2(valor)}</div>
    </div>
  );
  return (
    <div className="tf-panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12, borderRadius: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)" }}>Medir o lucro sobre:</span>
        {chip("trafego", "Só tráfego", "Só as origens de tráfego (loja + checkout) contra o gasto")}
        {chip("marketing", "Marketing todo", "Tráfego + Marketing X1 contra o gasto")}
        <span style={{ width: 1, height: 20, background: "var(--border)", margin: "0 2px" }} />
        <button onClick={() => setIncluiOrg(!incluiOrg)}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 13px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
            border: "1px solid " + (incluiOrg ? "transparent" : "var(--border)"),
            background: incluiOrg ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: incluiOrg ? "var(--on-primary, #fff)" : "var(--text)" }}>
          {incluiOrg ? "− " : "+ "}Orgânico
        </button>
      </div>

      {/* Os três baldes: o ativo (que entra no lucro) fica destacado. */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {balde("Faturamento tráfego", trafegoFat, true)}
        {balde("Marketing X1", d.faturamentoX1, base === "marketing")}
        {balde("Orgânico", d.organicoValor, incluiOrg)}
        {d.comercialUpsellValor > 0 && balde("Upsell pós-venda", d.comercialUpsellValor, false)}
      </div>

      <p style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.5, margin: 0 }}>
        O <strong>gasto é o mesmo</strong> ({fmtBRL2(b.gasto)}, já com imposto) nas duas opções — muda só a receita comparada a ele.
        {d.comercialUpsellValor > 0 && (
          <> Por que o tráfego aqui dá <strong>menos que o ERP</strong>: o pedido de checkout continua crescendo depois da venda
            (a vendedora acrescenta almofada, tinta, chancela). Esses <strong>{fmtBRL2(d.comercialUpsellValor)}</strong> em {fmtNum(d.comercialUpsellN)} pedidos
            são o que os pedidos viraram <em>além</em> do que o cliente fechou no site — dinheiro que entrou, mas que o anúncio não trouxe, então conta no
            <strong> Comercial</strong> e não no ROAS. Somando os dois você chega no total do ERP.</>
        )}
        {base === "marketing" && x1Zero && (
          <> <span style={{ color: "var(--tf-warn)" }}>Neste período o <strong>Marketing X1 está em R$ 0</strong> (as vendas de marketing X1 estão contabilizadas dentro do Comercial), então &quot;Marketing todo&quot; e &quot;Só tráfego&quot; dão o mesmo número. Pra separar de verdade, o X1 precisa voltar a ser medido à parte.</span></>
        )}
      </p>
    </div>
  );
}

// ── Bloco 1 — Herói (Lucro) + KPIs com ícone ────────────────────────────────
function ResumoTopo({ d, b }: { d: VendasSnapshot; b: Base }) {
  const lucroCor = sinal(b.lucro);
  const merEq = merEquilibrio(b, d.custosConfig);
  const partes = [
    { l: "Tráfego", v: b.trafego },
    { l: "Marketing X1", v: b.x1 },
    ...(b.incluiOrg ? [{ l: "Orgânico", v: b.org }] : []),
  ].filter((x) => x.v > 0);
  const tiles: TileProps[] = [
    { icon: "receipt", label: `Faturamento (${b.base === "marketing" ? "marketing" : "tráfego"}${b.incluiOrg ? " + org." : ""})`, value: fmtBRL2(b.fat), cor: POS, sub: `${fmtNum(b.vendas)} vendas` },
    { icon: "speakerphone", label: "Gasto com anúncio", value: fmtBRL2(b.gasto), cor: NEG, sub: `Meta + imposto (${fmtBRL2(b.gastoBruto)} de fatura)` },
    { icon: "target", label: "MER (ROAS geral)", value: rx(b.mer), cor: roasCor(b.mer), sub: "faturamento ÷ gasto + imposto",
      pill: merEq ? { txt: `equilíbrio ${rx(merEq)}`, cor: (b.mer ?? 0) >= merEq ? POS : NEG } : undefined },
    { icon: "percentage", label: "Margem", value: pct(b.margem), cor: lucroCor, sub: "lucro ÷ faturamento" },
    { icon: "trending-up", label: "ROI do anúncio", value: rx(b.roi), cor: roasCor(b.roi), sub: "lucro por R$ de anúncio" },
    { icon: "tag", label: "Ticket médio", value: fmtBRL2(b.ticket), cor: "var(--tf-info)", sub: "faturamento ÷ vendas" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(min(100%, 260px), 1.15fr) minmax(0, 2fr)", gap: 12 }} className="lucro-topo">
      {/* Herói: Lucro da operação */}
      <div className="glass glass-spec" style={{ padding: "20px 22px", borderRadius: 18, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", gap: 6, background: "linear-gradient(150deg, color-mix(in srgb, var(--primary) 12%, var(--surface)), var(--surface) 62%)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 20%, transparent)" }}>
            <Icon name="trending-up" size={17} color="var(--primary-texto)" />
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)" }}>Lucro da operação</span>
        </div>
        <div className="stat" style={{ fontSize: 40, fontWeight: 800, color: lucroCor, letterSpacing: "-0.02em", lineHeight: 1.02 }}>{fmtBRL2(b.lucro)}</div>
        <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>faturamento − custos − gasto</div>
        <div style={{ marginTop: "auto", paddingTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Badge icon="percentage" txt={`margem ${pct(b.margem)}`} cor={lucroCor} />
          <Badge icon="target" txt={`MER ${rx(b.mer)}`} cor={roasCor(b.mer)} />
        </div>
      </div>
      {/* Grade de KPIs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 158px), 1fr))", gap: 12 }}>
          {tiles.map((t) => <Tile key={t.label} {...t} />)}
        </div>
        {/* Composição da base (tráfego + X1 [+ org]) */}
        {partes.length > 1 && (
          <div className="glass glass-spec" style={{ padding: "10px 14px", borderRadius: 12, display: "flex", flexWrap: "wrap", gap: "6px 18px", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 700 }}>Base:</span>
            {partes.map((p) => (
              <span key={p.l} style={{ display: "inline-flex", alignItems: "baseline", gap: 6, fontSize: 12 }}>
                <span style={{ color: "var(--text-dim)" }}>{p.l}</span>
                <span className="stat" style={{ fontWeight: 700, color: "var(--text)" }}>{fmtBRL2(p.v)}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface TileProps { icon: string; label: string; value: string; cor: string; sub: string; pill?: { txt: string; cor: string } }
function Tile({ icon, label, value, cor, sub, pill }: TileProps) {
  return (
    <div className="glass glass-spec" style={{ padding: "13px 15px", borderRadius: 14, display: "flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 24, height: 24, borderRadius: 7, display: "grid", placeItems: "center", background: "color-mix(in srgb, " + cor + " 15%, transparent)", flex: "none" }}>
          <Icon name={icon} size={13.5} color={cor} />
        </span>
        <span style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      </div>
      <div className="stat" style={{ fontSize: 22, color: cor, lineHeight: 1.12, marginTop: 1 }}>{value}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{sub}</span>
        {pill && <span style={{ fontSize: 9.5, fontWeight: 800, color: pill.cor, background: "color-mix(in srgb, " + pill.cor + " 14%, transparent)", borderRadius: 999, padding: "1px 7px" }}>{pill.txt}</span>}
      </div>
    </div>
  );
}
function Badge({ icon, txt, cor }: { icon: string; txt: string; cor: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: cor, background: "color-mix(in srgb, " + cor + " 13%, transparent)", borderRadius: 999, padding: "4px 10px" }}>
      <Icon name={icon} size={12} color={cor} /> {txt}
    </span>
  );
}

// ── Bloco 2 — Composição do faturamento (pra onde vai cada real) ─────────────
function Composicao({ d, b }: { d: VendasSnapshot; b: Base }) {
  const c = d.custosConfig;
  const varPct = c.produtoPct + c.impostoPct + c.gatewayPct;
  const partes = useMemo(() => {
    const produto = b.fat * (c.produtoPct / 100);
    const imposto = b.fat * (c.impostoPct / 100);
    const gateway = b.fat * (c.gatewayPct / 100);
    const fixo = Math.max(0, b.custos - (produto + imposto + gateway));
    return [
      { key: "produto", label: "Custo do produto", val: produto, cor: "#e8833a" },
      { key: "imposto", label: "Imposto", val: imposto, cor: "#e8b93e" },
      { key: "gateway", label: "Gateway/checkout", val: gateway, cor: "#5aa7e8" },
      { key: "fixo", label: "Custo fixo", val: fixo, cor: "#9aa3b8" },
      { key: "ads", label: "Gasto em anúncios", val: b.gasto, cor: NEG },
    ].filter((p) => p.val > 0);
  }, [b, c]);

  const saidas = partes.reduce((s, p) => s + p.val, 0);
  // A barra soma TODAS as saídas (custos + anúncio), então o que resta é a
  // SOBRA, não o lucro do painel — que por definição só desconta o anúncio.
  // Usar b.lucro aqui deixava a barra sem fechar por exatamente os custos.
  const lucro = b.fat - saidas;
  const denom = Math.max(b.fat, saidas, 1);
  const seg = (v: number) => `${(v / denom) * 100}%`;
  const semCustos = varPct === 0 && c.custoFixo === 0;

  return (
    <Panel title="Composição do faturamento" subtitle="Pra onde vai cada real que entra — do produto à sobra">
      {semCustos && (
        <Alerta tom="atencao" style={{ marginBottom: 12 }}>
          Você ainda não preencheu o modelo de custos — a barra só mostra o gasto de anúncio. Preencha abaixo pra ver pra onde vai o resto.
        </Alerta>
      )}
      {/* Barra empilhada */}
      <div style={{ display: "flex", height: 34, borderRadius: 10, overflow: "hidden", background: "var(--surface-2)", position: "relative" }}>
        {partes.map((p) => (
          <div key={p.key} title={`${p.label}: ${fmtBRL2(p.val)}`} style={{ width: seg(p.val), background: p.cor, minWidth: p.val > 0 ? 2 : 0 }} />
        ))}
        {lucro > 0 && <div title={`Sobra: ${fmtBRL2(lucro)}`} style={{ width: seg(lucro), background: POS }} />}
        {lucro < 0 && <div title={`Prejuízo: ${fmtBRL2(lucro)}`} style={{ width: seg(-lucro), background: "repeating-linear-gradient(45deg, " + NEG + ", " + NEG + " 6px, color-mix(in srgb, " + NEG + " 60%, #000) 6px, color-mix(in srgb, " + NEG + " 60%, #000) 12px)" }} />}
        {saidas > b.fat && (
          <div style={{ position: "absolute", top: -3, bottom: -3, left: seg(b.fat), width: 2, background: "var(--text)", boxShadow: "0 0 0 1px var(--surface)" }} title={`Faturamento: ${fmtBRL2(b.fat)}`} />
        )}
      </div>
      {/* Legenda */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 14 }}>
        {partes.map((p) => <LegItem key={p.key} cor={p.cor} label={p.label} val={p.val} tot={b.fat} />)}
        <LegItem cor={lucro >= 0 ? POS : NEG} label={lucro >= 0 ? "Sobra" : "Prejuízo"} val={Math.abs(lucro)} tot={b.fat} forte />
      </div>
    </Panel>
  );
}
function LegItem({ cor, label, val, tot, forte }: { cor: string; label: string; val: number; tot: number; forte?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: cor, flex: "none" }} />
      <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: forte ? 800 : 500 }}>{label}</span>
      <span className="stat" style={{ fontSize: 12.5, fontWeight: 700, color: forte ? cor : "var(--text)" }}>{fmtBRL2(val)}</span>
      {tot > 0 && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>· {((val / tot) * 100).toFixed(0)}%</span>}
    </div>
  );
}

// ── Bloco 3 — Ponto de equilíbrio + metas ───────────────────────────────────
function EquilibrioMetas({ d, b }: { d: VendasSnapshot; b: Base }) {
  const eq = faturamentoEquilibrio(b, d.custosConfig);
  const folga = eq == null ? null : b.fat - eq;
  const metas: Array<{ label: string; atual: number; meta: number; fmt: (n: number) => string }> = [];
  if (d.metas.faturamento > 0) metas.push({ label: "Meta de faturamento", atual: b.fat, meta: d.metas.faturamento, fmt: fmtBRL2 });
  if (d.metas.lucro > 0) metas.push({ label: "Meta de lucro", atual: b.lucro, meta: d.metas.lucro, fmt: fmtBRL2 });
  if (d.metas.vendas > 0) metas.push({ label: "Meta de vendas", atual: b.vendas, meta: d.metas.vendas, fmt: (n) => fmtNum(n) });

  return (
    <div style={{ display: "grid", gridTemplateColumns: metas.length ? "minmax(min(100%, 240px), 1fr) minmax(0, 1.4fr)" : "1fr", gap: 12 }} className="lucro-eq">
      <Panel title="Ponto de equilíbrio" subtitle="Quanto precisa faturar pra não ter prejuízo" size="sm">
        {eq == null ? (
          <p style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Custos variáveis ≥ 100% — ajuste o modelo de custos.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 600 }}>Faturamento de equilíbrio</div>
              <div className="stat" style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.02em" }}>{fmtBRL2(eq)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700, color: sinal(folga ?? 0) }}>
              <Icon name={(folga ?? 0) >= 0 ? "trending-up" : "trending-down"} size={15} color={sinal(folga ?? 0)} />
              {(folga ?? 0) >= 0
                ? `Faturou ${fmtBRL2(folga ?? 0)} acima do equilíbrio`
                : `Faltam ${fmtBRL2(-(folga ?? 0))} pra empatar`}
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, (b.fat / eq) * 100)}%`, background: (folga ?? 0) >= 0 ? POS : WARN, borderRadius: 999 }} />
            </div>
          </div>
        )}
      </Panel>
      {metas.length > 0 && (
        <Panel title="Metas do período" subtitle="Configuradas em Regras & metas" size="sm">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {metas.map((m) => <MetaBar key={m.label} {...m} />)}
          </div>
        </Panel>
      )}
    </div>
  );
}
function MetaBar({ label, atual, meta, fmt }: { label: string; atual: number; meta: number; fmt: (n: number) => string }) {
  const p = meta > 0 ? (atual / meta) * 100 : 0;
  const cor = p >= 100 ? POS : p >= 70 ? WARN : "var(--primary-texto)";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{label}</span>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
          <strong className="stat" style={{ color: "var(--text)" }}>{fmt(atual)}</strong> / {fmt(meta)} · <span style={{ color: cor, fontWeight: 800 }}>{p.toFixed(0)}%</span>
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, p))}%`, background: cor, borderRadius: 999, transition: "width .3s ease" }} />
      </div>
    </div>
  );
}

// ── Bloco 4 — Real x Pixel ──────────────────────────────────────────────────
function RealxPixel({ d, b }: { d: VendasSnapshot; b: Base }) {
  return (
    <Panel title="Retorno real x pixel" subtitle="O ERP mostra o dinheiro que entrou de verdade; o pixel só estima">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))", gap: 12 }}>
        <CompareCard titulo="MER — ROAS geral" valor={rx(b.mer)} sub="faturamento marketing ÷ gasto + imposto" cor={roasCor(b.mer)} destaque />
        <CompareCard titulo="ROAS pela Meta (pixel)" valor={rx(d.roasMeta)} sub={`receita Meta ${fmtBRL2(d.metaRevenue)}`} cor={roasCor(d.roasMeta)} />
        <CompareCard titulo="ROAS atribuído (tag_utm)" valor={rx(d.roasReal)} sub={`origem paga ${fmtBRL2(d.faturamentoPago)}`} cor={roasCor(d.roasReal)} />
        <CompareCard titulo="Faturamento rastreado" valor={pct(d.pctAtribuido)} sub="tem origem no tag_utm" cor={d.pctAtribuido >= 60 ? POS : d.pctAtribuido >= 30 ? WARN : NEG} />
      </div>
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 12, lineHeight: 1.5 }}>
        Só <strong>{pct(d.pctAtribuido)}</strong> das vendas do ERP têm origem marcada (<code>tag_utm</code>). Por isso o <strong>MER</strong> (faturamento do
        marketing ÷ gasto + imposto) é o número mais confiável de retorno — quanto melhor o rastreio (UTM no checkout), mais preciso fica o ROAS por canal.
      </p>
    </Panel>
  );
}
function CompareCard({ titulo, valor, sub, cor, destaque }: { titulo: string; valor: string; sub: string; cor: string; destaque?: boolean }) {
  return (
    <div className="glass" style={{ padding: 14, borderRadius: 12, border: destaque ? "1px solid var(--primary)" : "1px solid var(--border)" }}>
      <div style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 700 }}>{titulo}</div>
      <div className="stat" style={{ fontSize: 26, color: cor, marginTop: 2 }}>{valor}</div>
      <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ── Bloco 5 — Vendas por canal (atribuição por tag_utm dos pedidos do ERP) ───
function VendasCanal({ d }: { d: VendasSnapshot }) {
  // No celular a barra (a coluna 3fr) some: ela é ilustrativa e, dividindo 6,1fr
  // em ~280px, espremia rótulo e faturamento a ponto de nenhum dos dois caber.
  const celular = useIsMobile();
  const cols = celular ? "minmax(0,1.4fr) auto 0.7fr" : "1.4fr 3fr 1fr 0.7fr";
  return (
    <Panel title="Vendas por canal" subtitle="Atribuição por tag_utm dos pedidos aprovados do ERP — qualidade do rastreio">
      {d.canais.length === 0 ? <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Sem vendas no período.</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {d.canais.map((c) => (
            <div key={c.key} style={{ display: "grid", gridTemplateColumns: cols, gap: 10, alignItems: "center", padding: "8px 4px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, fontWeight: 600, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 3, background: c.pago ? "var(--primary)" : "var(--text-dim)", flex: "none" }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                {c.pago && <span style={{ fontSize: 9.5, fontWeight: 800, color: "var(--primary-texto, var(--primary))", border: "1px solid var(--primary)", borderRadius: 999, padding: "0 6px" }}>PAGO</span>}
              </span>
              {!celular && (
                <span style={{ position: "relative", height: 8, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}>
                  <span style={{ position: "absolute", inset: 0, width: `${Math.max(2, c.pct)}%`, background: c.pago ? "var(--primary)" : "var(--text-dim)", borderRadius: 999 }} />
                </span>
              )}
              <span className="stat" style={{ fontSize: 13, textAlign: "right" }}>{fmtBRL2(c.faturamento)}</span>
              <span style={{ fontSize: 12, color: "var(--text-dim)", textAlign: "right" }}>{c.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ── Bloco 6 — Evolução diária (base de marketing) ───────────────────────────
function Evolucao({ d, incluiOrg }: { d: VendasSnapshot; incluiOrg: boolean }) {
  const dias = d.serieDia || [];
  if (dias.length < 2) return null;
  const labels = dias.map((x) => {
    const [, m, dd] = x.d.split("-");
    return dd && m ? `${dd}/${m}` : x.d;
  });
  const fatDia = dias.map((x) => x.trafego + (incluiOrg ? x.organico : 0));
  return (
    <Panel title="Evolução diária" subtitle={`Faturamento do tráfego${incluiOrg ? " + orgânico" : ""} e vendas por dia`}>
      <TfChart
        titulo="lucro-evolucao-diaria"
        labels={labels}
        height={210}
        series={[
          { key: "fat", label: "Faturamento", cor: "var(--tf-pos)", vals: fatDia, axis: "left", fmt: fmtBRL2 },
          { key: "vendas", label: "Vendas", cor: "var(--primary-texto)", vals: dias.map((x) => x.vendas), axis: "right", fmt: (v) => fmtNum(v) },
        ]}
      />
    </Panel>
  );
}

// ── Bloco 7 — Modelo de custos (com prévia ao vivo) ─────────────────────────
function CustosEditor({ inicial, b, onSalvo }: { inicial: CustosConfig; b: Base; onSalvo: () => void }) {
  const [c, setC] = useState<CustosConfig>(inicial);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setC(inicial); }, [inicial]);
  const set = (k: keyof CustosConfig, v: string) => setC((s) => ({ ...s, [k]: Number(v) || 0 }));
  const alterado = JSON.stringify(c) !== JSON.stringify(inicial);

  // Prévia com os custos digitados. NÃO é o lucro: o lucro do painel é
  // faturamento do tráfego − gasto com imposto e não olha pra estes custos.
  // O que eles mexem é a SOBRA (o que resta depois de produto/imposto/gateway
  // e do anúncio) e, por consequência, o ROAS de equilíbrio. Mostrar "lucro"
  // aqui seria um número que nenhum outro card da tela repete.
  const prev = useMemo(() => {
    const custos = b.fat * ((c.produtoPct + c.impostoPct + c.gatewayPct) / 100) + c.custoFixo * b.vendas;
    const sobra = b.fat - custos - b.gasto;
    const margem = b.fat > 0 ? (sobra / b.fat) * 100 : null;
    return { custos, sobra, margem };
  }, [c, b]);

  async function salvar() {
    setBusy(true);
    try {
      const r = await fetch("/api/trafego/vendas", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
      if (r.ok) { toast.ok("Custos salvos — sobra e equilíbrio recalculados."); onSalvo(); } else toast.erro("Não deu pra salvar.");
    } finally { setBusy(false); }
  }
  const inp = { width: "100%", padding: "9px 11px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 14 } as const;
  const campos: { k: keyof CustosConfig; label: string; suf: string }[] = [
    { k: "produtoPct", label: "Custo do produto", suf: "%" },
    { k: "impostoPct", label: "Imposto", suf: "%" },
    { k: "gatewayPct", label: "Taxa gateway/checkout", suf: "%" },
    { k: "custoFixo", label: "Custo fixo por venda", suf: "R$" },
  ];
  return (
    <Panel title="Modelo de custos" subtitle="Não entra no lucro (que é faturamento do tráfego − anúncio) — define a sobra e o ROAS de equilíbrio. Salvo pra todos os períodos.">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: 12, alignItems: "end" }}>
        {campos.map((f) => (
          <label key={f.k} style={{ display: "block" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", display: "block", marginBottom: 4 }}>{f.label} <span style={{ opacity: .7 }}>({f.suf})</span></span>
            <input style={inp} type="number" min={0} step="0.1" value={c[f.k] || ""} onChange={(e) => set(f.k, e.target.value)} />
          </label>
        ))}
        <Botao variante="primario" onClick={salvar} disabled={!alterado} carregando={busy}>
          {alterado ? "Salvar custos" : "Salvo"}
        </Botao>
      </div>

      {/* Prévia ao vivo — impacto ANTES de salvar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--tf-panel-line, var(--border))" }}>
        <PreviaChip label="Custos totais" val={fmtBRL2(prev.custos)} cor="var(--text)" sub={`${(c.produtoPct + c.impostoPct + c.gatewayPct).toFixed(1)}%${c.custoFixo > 0 ? ` + ${fmtBRL2(c.custoFixo)}/venda` : ""}`} />
        <PreviaChip label={alterado ? "Sobra (prévia)" : "Sobra"} val={fmtBRL2(prev.sobra)} cor={sinal(prev.sobra)} sub={alterado ? "após custos e anúncio" : "após custos e anúncio"} destaque={alterado} />
        <PreviaChip label={alterado ? "Margem da sobra (prévia)" : "Margem da sobra"} val={prev.margem == null ? "—" : pct(prev.margem)} cor={sinal(prev.sobra)} sub="sobra ÷ faturamento" />
      </div>
      {alterado && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, fontSize: 11.5, color: "var(--tf-warn)" }}>
          <Icon name="alert-triangle" size={13} color="var(--tf-warn)" />
          Prévia não salva — clique em “Salvar custos” pra aplicar a todos os períodos.
        </div>
      )}
    </Panel>
  );
}
function PreviaChip({ label, val, cor, sub, destaque }: { label: string; val: string; cor: string; sub: string; destaque?: boolean }) {
  return (
    <div style={{ flex: "1 1 150px", padding: "10px 13px", borderRadius: 12, background: destaque ? "color-mix(in srgb, var(--primary) 8%, var(--surface-2))" : "var(--surface-2)", border: destaque ? "1px solid color-mix(in srgb, var(--primary) 30%, transparent)" : "1px solid transparent" }}>
      <div style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: 600 }}>{label}</div>
      <div className="stat" style={{ fontSize: 20, fontWeight: 800, color: cor, marginTop: 2 }}>{val}</div>
      <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 1 }}>{sub}</div>
    </div>
  );
}

// ── Cálculos de equilíbrio (base de marketing) ──────────────────────────────
// Faturamento onde o lucro zera: fat*(1−var%) = gasto + fixo*vendas.
function faturamentoEquilibrio(b: Base, c: CustosConfig): number | null {
  const varFrac = (c.produtoPct + c.impostoPct + c.gatewayPct) / 100;
  if (varFrac >= 1) return null;
  const fixoTotal = c.custoFixo * b.vendas;
  return (b.gasto + fixoTotal) / (1 - varFrac);
}
// MER (faturamento/gasto) mínimo pra empatar.
function merEquilibrio(b: Base, c: CustosConfig): number | null {
  const eq = faturamentoEquilibrio(b, c);
  if (eq == null || b.gasto <= 0) return null;
  return eq / b.gasto;
}

// ── "Por que os números estão assim" ────────────────────────────────────────
// Diagnóstico HONESTO do que está mexendo no lucro deste período. Só lista o que
// REALMENTE se aplica (nada de texto genérico), com o impacto em R$ quando dá
// pra calcular. Existe porque o número herói sozinho engana: com o modelo de
// custos zerado ele é só "faturamento − anúncio", e o gasto mostrado é a fatura
// do Meta SEM o imposto de importação.
interface Achado { tom: "alerta" | "info"; titulo: string; texto: React.ReactNode }

function PorQueAssim({ d, b, incluiOrg }: { d: VendasSnapshot; b: Base; incluiOrg: boolean }) {
  const c = d.custosConfig;
  const varPct = c.produtoPct + c.impostoPct + c.gatewayPct;
  const semCustos = varPct === 0 && c.custoFixo === 0;

  // Imposto de importação sobre o GASTO — JÁ está dentro de b.gasto e do lucro.
  const impostoGasto = b.gasto - b.gastoBruto;

  const achados: Achado[] = [];

  if (semCustos) {
    achados.push({
      tom: "alerta",
      titulo: "O modelo de custos está zerado",
      texto: <>Produto, imposto e gateway estão todos em <b>0%</b>. O lucro aqui em cima é, por definição,
        <b> faturamento do tráfego − anúncio</b> e não muda com estes campos — mas a <b>sobra</b> e o
        <b> ROAS de equilíbrio</b> dependem deles, e sem preencher não dá pra saber a partir de que ROAS a
        venda se paga. Preencha o <b>Modelo de custos</b> no fim desta página.</>,
    });
  } else if (c.produtoPct === 0) {
    achados.push({
      tom: "alerta",
      titulo: "Custo do produto está em 0%",
      texto: <>É normalmente a maior fatia do faturamento. Com ele zerado o ROAS de equilíbrio sai baixo demais
        e a operação parece se pagar antes do que se paga.</>,
    });
  }

  if (b.gasto > 0) {
    achados.push({
      tom: "info",
      titulo: `O gasto já inclui o imposto de importação (${IMPOSTO_GASTO_PCT.toString().replace(".", ",")}%)`,
      texto: <>A fatura do Meta foi <b>{fmtBRL2(b.gastoBruto)}</b> e o imposto de importação somou <b>{fmtBRL2(impostoGasto)}</b>.
        {" "}O que entra no lucro e em todo ROAS/ROI é o custo real: <b>{fmtBRL2(b.gasto)}</b>.</>,
    });
  }

  if (!incluiOrg && d.organicoValor > 0) {
    achados.push({
      tom: "info",
      titulo: "O faturamento orgânico está fora da conta",
      texto: <><b>{fmtBRL2(d.organicoValor)}</b> de venda orgânica não entram na base (ela é só tráfego + X1). É de
        propósito — mede o retorno do anúncio. Ligue <b>Incluir orgânico</b> se quiser ver a operação inteira.</>,
    });
  }

  if (d.pctAtribuido < 60) {
    achados.push({
      tom: "info",
      titulo: `Só ${pct(d.pctAtribuido)} das vendas têm origem rastreada`,
      texto: <>Sem <code>tag_utm</code> no pedido, o ROAS por canal fica subestimado. Por isso o <b>MER</b> (faturamento
        do marketing ÷ gasto + imposto) é o número confiável aqui — ele não depende de rastreio.</>,
    });
  }

  if (b.lucro < 0) {
    achados.push({
      tom: "alerta",
      titulo: "Prejuízo no período: o anúncio custou mais do que entrou",
      texto: <>Entrou {fmtBRL2(b.fat)} de faturamento do tráfego e saíram {fmtBRL2(b.gasto)} de anúncio (já com o
        imposto). {semCustos ? "" : `Somando os ${fmtBRL2(b.custos)} de custos da operação, o buraco é maior ainda.`}</>,
    });
  }

  if (b.vendas === 0 && b.gasto > 0) {
    achados.push({
      tom: "alerta",
      titulo: "Gastou sem nenhuma venda registrada no ERP",
      texto: <>Se houve venda, ela pode ter caído numa origem que ainda não está marcada como tráfego — confira
        as <b>Fontes de venda</b> na Atribuição (hoje a loja de tráfego é <b>{d.fonteTrafego}</b>).</>,
    });
  }

  if (!achados.length) return null;

  return (
    <Panel title="Por que os números estão assim" subtitle="O que está mexendo no lucro deste período">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {achados.map((a, i) => (
          <Alerta key={i} tom={a.tom === "alerta" ? "atencao" : "info"} titulo={a.titulo}>
            {a.texto}
          </Alerta>
        ))}
      </div>
    </Panel>
  );
}
