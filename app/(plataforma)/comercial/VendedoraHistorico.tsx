"use client";

import { useEffect, useMemo, useState } from "react";
import type { VendedoraMetrics } from "@/lib/vendedoras";
import { fmtBRL2, fmtNum } from "@/lib/format";
import { Kpi, Money } from "../ui/primitives";
import { SkeletonDashboard } from "../Skeleton";
import { AreaChart } from "../Chart";
import { GlassSelect } from "../GlassPicker";
import { PeriodPicker, periodQuery, DEFAULT_PERIOD, type PeriodState } from "../PeriodPicker";
import { Fila, NumeroVivo } from "../ui/micro";
import { FilaViva, Revalidando, Atualizando, Vazio } from "../analytics/movimento";

interface Snap {
  periodLabel: string;
  vendedoras: VendedoraMetrics[];   // comercial
  x1: VendedoraMetrics[];           // marketing X1
  meId: string | null;
  canPick: boolean;
  equipe?: { id: string; nome: string; cargo: string }[];  // comercial + marketing vendas
}

/** Casca que recebe o `--mt-i` da `Fila` — o `Money` não aceita `style`. */
function Cel({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", minWidth: 0 }}>{children}</div>;
}

// Histórico por vendedora: métricas completas de UMA vendedora (vendas c/ e s/
// frete, Marketing X1, soma), com seletor p/ gestão e travado na própria conta
// p/ a vendedora. Mesma base do ranking de Vendedoras (vendas_planilha do ERP).
export function VendedoraHistorico() {
  const [period, setPeriod] = useState<PeriodState>(DEFAULT_PERIOD);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [err, setErr] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);   // feedback ao trocar data

  useEffect(() => {
    if (period.key === "custom" && (!period.from || !period.to)) return;
    let active = true;
    setCarregando(true);
    fetch(`/api/vendedoras?${periodQuery(period)}`, { cache: "no-store" })
      .then((r) => r.json()).then((d: Snap) => { if (!active) return; if (d?.vendedoras) { setSnap(d); setErr(false); } else setErr(true); })
      .catch(() => { if (active) setErr(true); })
      .finally(() => { if (active) setCarregando(false); });
    return () => { active = false; };
  }, [period]);

  // Picker de gestão: quem vendeu (planilha) + a equipe por cargo (Comercial +
  // Marketing vendas/X1) — aparecem mesmo sem venda no período.
  const pessoas = useMemo(() => {
    if (!snap) return [];
    const m = new Map<string, { id: string; nome: string; cargo?: string }>();
    for (const v of [...snap.vendedoras, ...snap.x1]) if (!m.has(v.id)) m.set(v.id, { id: v.id, nome: v.nome });
    for (const e of snap.equipe ?? []) { const ex = m.get(e.id); if (ex) { if (!ex.cargo) ex.cargo = e.cargo; } else m.set(e.id, { id: e.id, nome: e.nome, cargo: e.cargo }); }
    return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  }, [snap]);

  // Quem mostrar: gestão sem seleção → TOTAL (todas); vendedora → ela mesma.
  const alvo = sel ?? (snap?.canPick ? "__todas__" : (snap?.meId ?? pessoas[0]?.id ?? null));
  const ehTodas = alvo === "__todas__";
  // Agrega uma lista de vendedoras num só (soma valores, junta a série por dia).
  const aggList = (list: VendedoraMetrics[]): VendedoraMetrics | null => {
    if (!list.length) return null;
    const dias = new Map<string, number>();
    let liquido = 0, bruto = 0, frete = 0, vendas = 0, clientes = 0;
    for (const v of list) { liquido += v.liquido; bruto += v.bruto; frete += v.frete; vendas += v.vendas; clientes += v.clientes; for (const s of v.series) dias.set(s.day, (dias.get(s.day) || 0) + s.value); }
    const series = [...dias.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, value]) => ({ day, value }));
    return { id: "__todas__", nome: "Todas as vendedoras", foto: null, vendas, bruto, liquido, ticket: vendas ? liquido / vendas : 0, frete, participacao: 100, clientes, pagamentos: [], produtos: [], series };
  };
  const com = ehTodas ? aggList(snap?.vendedoras ?? []) : (snap?.vendedoras.find((v) => v.id === alvo) ?? null);
  const x1 = ehTodas ? aggList(snap?.x1 ?? []) : (snap?.x1.find((v) => v.id === alvo) ?? null);
  const naEquipe = (snap?.equipe ?? []).find((e) => e.id === alvo) ?? null;
  const nome = ehTodas ? "Todas as vendedoras" : (com?.nome ?? x1?.nome ?? naEquipe?.nome ?? "—");
  const foto = ehTodas ? null : (com?.foto ?? x1?.foto ?? null);

  // Série combinada (comercial + X1) por dia. Hook antes de qualquer return.
  const serie = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of com?.series ?? []) m.set(p.day, (m.get(p.day) || 0) + p.value);
    for (const p of x1?.series ?? []) m.set(p.day, (m.get(p.day) || 0) + p.value);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, value]) => ({ day, value }));
  }, [com, x1]);

  if (!snap) {
    if (err) return (
      <div className="glass" style={{ borderRadius: "var(--r-md)", marginTop: 16 }}>
        <Vazio icone="alert-triangle" tom="var(--perigo)" titulo="Não foi possível carregar as métricas" texto="Troque o período ou recarregue a página em instantes." />
      </div>
    );
    return <div style={{ marginTop: 16 }}><SkeletonDashboard /></div>;
  }
  if (pessoas.length === 0) {
    return (
      <div>
        <div style={{ marginBottom: 14 }}><PeriodPicker value={period} onChange={setPeriod} /></div>
        <div className="glass" style={{ borderRadius: "var(--r-md)" }}>
          <Vazio icone="user" tom="var(--atencao)" titulo="Nenhuma vendedora para mostrar"
            texto="Sua conta não está vinculada a uma vendedora do ERP, ou não houve vendas no período. Peça ao admin para vincular em Pessoas." />
        </div>
      </div>
    );
  }

  // Vendas = comercial (planilha) + X1 (pipeline). liquido = sem frete; +frete = com frete.
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const comLiq = com?.liquido ?? 0, comFreteV = com?.frete ?? 0;
  const x1Liq = x1?.liquido ?? 0, x1FreteV = x1?.frete ?? 0;
  const semFrete = r2(comLiq + x1Liq);
  const comFrete = r2(comLiq + comFreteV + x1Liq + x1FreteV);
  const x1Valor = r2(x1Liq);                    // destaque da parte X1
  const total = comFrete;                      // total geral (com frete)
  const freteMov = r2(comFreteV + x1FreteV);
  const pedidos = (com?.vendas ?? 0) + (x1?.vendas ?? 0);
  const ticket = pedidos ? r2(total / pedidos) : 0;
  const clientes = Math.max(com?.clientes ?? 0, x1?.clientes ?? 0);

  return (
    <div className="km-chega" style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <PeriodPicker value={period} onChange={setPeriod} />
        {snap.canPick && (
          <div style={{ minWidth: "min(100%, 220px)" }}>
            <GlassSelect value={alvo ?? ""} onChange={setSel} options={[{ value: "__todas__", label: "Total — todas as vendedoras" }, ...pessoas.map((p) => ({ value: p.id, label: p.cargo ? `${p.nome} · ${p.cargo}` : p.nome }))]} />
          </div>
        )}
        <Atualizando ativo={carregando} />
      </div>

      {/* Troca de data: o dado antigo fica esmaecido até o novo chegar, e os
          números CONTAM do antigo pro novo (Kinetics 100 + 062). Trocar de
          vendedora no seletor faz o mesmo sem requisição nenhuma. */}
      <Revalidando ativo={carregando}>
      {/* Cabeçalho da vendedora */}
      {/* flexWrap: avatar + nome + o total de 30px não cabiam lado a lado a 320px —
          o valor ia pra fora da tela. Agora o total cai pra linha de baixo. */}
      <div className="glass glass-spec" style={{ padding: 18, borderRadius: "var(--r-md)", display: "flex", alignItems: "center", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
        <Avatar foto={foto} nome={nome} size={48} />
        <div style={{ minWidth: 0, flex: "1 1 130px" }}>
          <div style={{ fontSize: 20, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nome}</div>
          <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{snap.periodLabel} · {fmtNum(pedidos)} pedidos{x1 && x1.vendas > 0 ? ` · ${fmtNum(x1.vendas)} via X1` : ""}</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div className="stat" style={{ fontSize: 30, color: "var(--primary-texto, var(--primary))" }}><NumeroVivo valor={total} formatar={fmtBRL2} /></div>
          <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>total geral (c/ frete)</div>
        </div>
      </div>

      {/* Cards principais */}
      <Fila style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 12 }}>
        <Cel><Money label="Vendas s/ frete" value={semFrete} color="var(--primary-texto)" /></Cel>
        <Cel><Money label="Vendas c/ frete" value={comFrete} color="var(--azul)" /></Cel>
        <Cel><Money label="Marketing X1 (s/ frete)" value={x1Valor} color="var(--atencao)" /></Cel>
        <Cel><Money label="Total geral (c/ frete)" value={total} color="var(--ok)" /></Cel>
        <Cel><Money label="Ticket médio" value={ticket} color="var(--text)" /></Cel>
        <Kpi label="Pedidos" value={pedidos} color="var(--text)" size="xs" />
        <Kpi label="Clientes" value={clientes} color="var(--text)" size="xs" />
        <Cel><Money label="Frete movimentado" value={freteMov} color="var(--indigo)" /></Cel>
      </Fila>

      {/* Série por dia */}
      <div className="glass glass-spec" style={{ padding: 18, borderRadius: "var(--r-md)", marginTop: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Faturamento por dia</div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 10 }}>Comercial + X1 no período</div>
        <AreaChart series={serie} color="var(--primary-texto)" money height={150} />
      </div>

      {/* Produtos + pagamentos */}
      <div className="duo duo-eq" style={{ gap: 14, marginTop: 14 }}>
        <AggPanel titulo="Produtos mais vendidos" icone="package" rows={(com?.produtos ?? []).slice(0, 8)} />
        <AggPanel titulo="Formas de pagamento" icone="cash" rows={(com?.pagamentos ?? []).slice(0, 8)} />
      </div>
      </Revalidando>
    </div>
  );
}

function AggPanel({ titulo, icone, rows }: { titulo: string; icone: string; rows: { nome: string; valor: number; count: number }[] }) {
  return (
    <div className="glass glass-spec" style={{ padding: 18, borderRadius: "var(--r-md)" }}>
      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>{titulo}</div>
      {rows.length === 0 ? <Vazio compacto icone={icone} titulo="Sem dados no período" /> : (
        // `FilaViva`: trocar de vendedora ou de período reordena o ranking, e
        // cada linha desliza pra posição nova em vez de reembaralhar.
        <FilaViva style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {rows.map((r) => (
            <div key={r.nome} className="mt-linha" style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 2px", borderBottom: "1px solid var(--border)", borderRadius: 7 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nome}</span>
              <span className="mt-num" style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{fmtNum(r.count)}x</span>
              <strong className="mt-num" style={{ fontSize: 13, minWidth: 78, textAlign: "right" }}>{fmtBRL2(r.valor)}</strong>
            </div>
          ))}
        </FilaViva>
      )}
    </div>
  );
}


function Avatar({ foto, nome, size = 40 }: { foto: string | null; nome: string; size?: number }) {
  if (foto) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={foto} alt={nome} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "none" }} />;
  }
  const ini = (nome || "?").trim().slice(0, 1).toUpperCase();
  return <span style={{ width: size, height: size, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 22%, transparent)", color: "var(--primary-texto, var(--primary))", fontWeight: 800, fontSize: size * 0.4 }}>{ini}</span>;
}
