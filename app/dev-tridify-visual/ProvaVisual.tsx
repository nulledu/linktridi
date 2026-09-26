"use client";

// A TELA COMPLETA no design de referência do dono: sidebar + cabeçalho com
// filtros + painel real + banner — a composição inteira, não os cards soltos.
// O painel é o de verdade (PainelPersonalizavel com dados de exemplo); a
// sidebar e os controles do cabeçalho são CENOGRAFIA deste banco de provas,
// deixada explícita como tal: servem pra julgar a composição, e o shell real
// do app é outro círculo de trabalho.
//
// O tema CLARO abre primeiro: é o tema primário do design.

import { useEffect, useState } from "react";
import { sampleOverview, sampleVendas } from "@/lib/trafego-sample";
import { PainelPersonalizavel } from "../(plataforma)/trafego/PainelPersonalizavel";
import { DEFAULT_PERIOD } from "../(plataforma)/PeriodPicker";
import { Icon } from "../(plataforma)/Icon";
import { GaiusLogo } from "../GaiusMark";

const USUARIO = "prova-visual";

/**
 * A composição da referência, fileira a fileira, na grade de 4 colunas:
 * 4 KPIs · widget grande de faturamento + rosca · ranking + comparativo ·
 * funil · oportunidades×riscos.
 */
const ORDEM_DA_PROVA = [
  "investimento", "roas", "vendas", "lucro",
  "faturamento_empresa", "distribuicao",
  "ranking", "comparativo",
  "funil",
  "ops_riscos",
];
const TAMANHOS_DA_PROVA = { faturamento_empresa: 2, distribuicao: 2, ranking: 2, comparativo: 2 };

/** Item da navegação cenográfica. */
function ItemNav({ icone, rotulo, ativo = false }: { icone: string; rotulo: string; ativo?: boolean }) {
  return (
    <div aria-current={ativo ? "page" : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10,
        background: ativo ? "color-mix(in srgb, var(--primary) 10%, var(--surface))" : "transparent",
        color: ativo ? "var(--primary-texto, var(--primary))" : "var(--text-dim)",
        fontSize: "var(--tf-fs-realce)", fontWeight: ativo ? 700 : 600, cursor: "default",
      }}>
      <Icon name={icone} size={17} color={ativo ? "var(--primary-texto, var(--primary))" : "var(--text-dim)"} />
      {rotulo}
    </div>
  );
}

function GrupoNav({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ fontSize: "var(--tf-fs-micro)", fontWeight: 700, letterSpacing: ".09em", textTransform: "uppercase", color: "var(--text-dim)", padding: "12px 12px 6px" }}>{titulo}</div>
      {children}
    </div>
  );
}

/** Controle de cabeçalho no formato pill da referência (cenográfico). */
function Pill({ icone, children }: { icone?: string; children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: "var(--tap)", padding: "0 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "var(--tf-fs-corpo)", fontWeight: 600, whiteSpace: "nowrap" }}>
      {icone && <Icon name={icone} size={15} color="var(--text-dim)" />}
      {children}
      <Icon name="chevron-down" size={13} color="var(--text-dim)" />
    </span>
  );
}

export function ProvaVisual() {
  const d = sampleOverview();
  const v = sampleVendas();
  const [claro, setClaro] = useState(true);
  const [pronto, setPronto] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle("light", claro); }, [claro]);
  useEffect(() => {
    try { localStorage.setItem(`trafego.painel.${USUARIO}`, JSON.stringify({ order: ORDEM_DA_PROVA, hidden: [], sizes: TAMANHOS_DA_PROVA })); } catch { /* sem localStorage: cai no padrão */ }
    setPronto(true);
  }, []);

  return (
    <div className="tf-scope" style={{ display: "flex", alignItems: "stretch", minHeight: "100dvh", background: "var(--bg)" }}>
      {/* ── Sidebar (cenografia da prova; some no estreito, onde manda a regra
          dos 320px — a tela útil é o painel) ──────────────────────────────── */}
      <aside className="desk-only" style={{ width: 236, flex: "none", display: "flex", flexDirection: "column", gap: 4, padding: "18px 14px", borderRight: "1px solid var(--tf-panel-line)", background: "var(--surface)" }}>
        <div style={{ padding: "0 6px 10px" }}><GaiusLogo size={26} /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", color: "var(--text-dim)", fontSize: "var(--tf-fs-corpo)" }}>
          Buscar…
          <span className="stat" style={{ marginLeft: "auto", fontSize: "var(--tf-fs-micro)", border: "1px solid var(--border)", borderRadius: 5, padding: "1px 5px" }}>⌘K</span>
        </div>
        <GrupoNav titulo="Início">
          <ItemNav icone="layout-grid" rotulo="Central" />
          <ItemNav icone="message-circle" rotulo="Mensagens" />
        </GrupoNav>
        <GrupoNav titulo="Análise">
          <ItemNav icone="chart-line" rotulo="Analytics" />
          <ItemNav icone="trending-up" rotulo="Tridify" ativo />
          <ItemNav icone="building-bank" rotulo="Financeiro" />
        </GrupoNav>
        <GrupoNav titulo="Operação">
          <ItemNav icone="clipboard-list" rotulo="Atividades" />
          <ItemNav icone="building-warehouse" rotulo="Estoque" />
          <ItemNav icone="shopping-cart" rotulo="Comercial" />
        </GrupoNav>
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderTop: "1px solid var(--tf-panel-line)" }}>
          <span aria-hidden style={{ width: 32, height: 32, borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 14%, var(--surface-2))", color: "var(--primary-texto, var(--primary))", fontWeight: 800, fontSize: "var(--tf-fs-realce)" }}>C</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: "var(--tf-fs-corpo)", fontWeight: 700, color: "var(--text)" }}>Caio</span>
            <span style={{ display: "block", fontSize: "var(--tf-fs-micro)", color: "var(--text-dim)" }}>Administrador</span>
          </span>
        </div>
      </aside>

      {/* ── Área principal ────────────────────────────────────────────────── */}
      <main style={{ flex: 1, minWidth: 0, padding: "24px 28px 40px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: "1 1 320px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--tf-fs-detalhe)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--primary-texto, var(--primary))" }}>
              Analytics <Icon name="chevron-right" size={12} color="var(--primary-texto, var(--primary))" />
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: "var(--text)", margin: "2px 0 0", letterSpacing: "var(--tf-track-display)" }}>Tridify</h1>
            <p style={{ fontSize: "var(--tf-fs-realce)", color: "var(--text-dim)", margin: "6px 0 0" }}>
              Veja de onde veio o dinheiro e como cada canal está performando.
            </p>
          </div>
          {/* Controles (cenografia): período, contas, exportar — e o toggle de
              tema, que é o único vivo. */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Pill icone="calendar-event">17 de setembro – 23 de setembro</Pill>
            <Pill icone="brand-meta">Todas as contas</Pill>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: "var(--tap)", padding: "0 16px", borderRadius: 10, background: "var(--primary-acao, var(--primary))", color: "var(--on-primary, #fff)", fontSize: "var(--tf-fs-corpo)", fontWeight: 700, whiteSpace: "nowrap" }}>
              <Icon name="file-text" size={15} color="var(--on-primary, #fff)" /> Exportar relatório
            </span>
            <button onClick={() => setClaro(!claro)} title={claro ? "Ver no escuro" : "Ver no claro"}
              style={{ minWidth: "var(--tap)", minHeight: "var(--tap)", borderRadius: 10, cursor: "pointer", border: "1px solid var(--border)", background: "var(--surface)", display: "grid", placeItems: "center" }}>
              <Icon name={claro ? "moon" : "sun"} size={16} color="var(--text-dim)" />
            </button>
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          {pronto && <PainelPersonalizavel d={d} userId={USUARIO} period={DEFAULT_PERIOD} vendasPreview={v} />}
        </div>

        {/* ── Banner de fechamento, como na referência ─────────────────────── */}
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "16px 20px", borderRadius: 14, background: "var(--primary-acao, var(--primary))", color: "var(--on-primary, #fff)" }}>
          <Icon name="sparkles" size={20} color="var(--on-primary, #fff)" style={{ flex: "none" }} />
          <span style={{ minWidth: 0, flex: "1 1 260px" }}>
            <strong style={{ display: "block", fontSize: "var(--tf-fs-realce)", fontWeight: 800 }}>Seu tráfego está performando bem</strong>
            <span style={{ fontSize: "var(--tf-fs-corpo)", opacity: 0.85 }}>ROAS de 4,54× no período, com margem de 78% — acima da meta configurada.</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minHeight: 38, padding: "0 14px", borderRadius: 10, background: "color-mix(in srgb, #fff 18%, transparent)", fontSize: "var(--tf-fs-corpo)", fontWeight: 700, whiteSpace: "nowrap" }}>
            Ver relatório completo <Icon name="arrow-right" size={14} color="var(--on-primary, #fff)" />
          </span>
        </div>
      </main>
    </div>
  );
}
