"use client";

// Tráfego Pago — Atribuição (Fase 3). Modelos de atribuição + janela configurável.
// "Último clique" roda em dados REAIS (canais das vendas por tag_utm). Modelos
// multi-toque (primeiro clique, linear, time-decay) usam a JORNADA do visitante
// (Rastreamento / Fase 2) — ficam prontos e ativam quando o pixel estiver gravando.
import { useCallback, useEffect, useState } from "react";
import { useAtualizacao } from "./atualizacao";
import { Icon } from "../Icon";
import { GlassSelect } from "../GlassPicker";
import { Alerta } from "../ui/Alerta";
import { periodQuery, type PeriodState } from "../PeriodPicker";
import { useBuscaAtual } from "../ui/useBuscaAtual";
import type { VendasSnapshot } from "@/lib/trafego-vendas";
import { FonteVendasSelector } from "./FonteVendasSelector";
import { useIsMobile } from "../ui/useMediaQuery";

const MODELOS: { key: string; nome: string; multi: boolean; desc: string }[] = [
  { key: "ultimo", nome: "Último clique", multi: false, desc: "Crédito 100% pra origem da venda (o que temos hoje pelo tag_utm)." },
  { key: "primeiro", nome: "Primeiro clique", multi: true, desc: "Crédito pra origem do primeiro acesso do cliente." },
  { key: "linear", nome: "Linear", multi: true, desc: "Crédito dividido igualmente entre todos os toques." },
  { key: "decaimento", nome: "Decaimento temporal", multi: true, desc: "Mais crédito pros toques mais próximos da compra." },
  { key: "posicao", nome: "Baseado em posição", multi: true, desc: "40% primeiro, 40% último, 20% no meio." },
];
const JANELAS = [1, 7, 14, 30, 60, 90];
const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function AtribuicaoView({ period }: { period: PeriodState }) {
  const [s, setS] = useState<VendasSnapshot | null>(null);
  const [modelo, setModelo] = useState("ultimo");
  const [janela, setJanela] = useState(30);
  const [loading, setLoading] = useState(true);
  const celular = useIsMobile();

  const buscaAtual = useBuscaAtual();
  const load = useCallback(() => {
    if (period.key === "custom" && (!period.from || !period.to)) return;
    setLoading(true);
    // Resposta atrasada de outro período não sobrescreve a busca nova.
    const souAtual = buscaAtual();
    fetch(`/api/trafego/vendas?${periodQuery(period)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject())).then((d: VendasSnapshot) => { if (souAtual()) setS(d); })
      .catch(() => { if (souAtual()) setS(null); }).finally(() => { if (souAtual()) setLoading(false); });
  }, [period, buscaAtual]);
  useEffect(() => { load(); }, [load]);
  // Segue o botão "Atualizar" da Tridify (ver `atualizacao.ts`).
  useAtualizacao(load);

  const mod = MODELOS.find((m) => m.key === modelo)!;
  const canais = s ? [...s.canais].sort((a, b) => b.faturamento - a.faturamento) : [];

  return (
    <div className="tf-scope" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <FonteVendasSelector />
      {/* Controles */}
      <div className="glass" style={{ borderRadius: 16, padding: 16, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>
          Modelo de atribuição
          <GlassSelect value={modelo} onChange={setModelo} style={{ width: 240 }}
            options={MODELOS.map((m) => ({ value: m.key, label: `${m.nome}${m.multi ? " (multi-toque)" : ""}` }))} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>
          Janela de atribuição
          <GlassSelect value={String(janela)} onChange={(v) => setJanela(Number(v))} style={{ width: 130 }}
            options={JANELAS.map((j) => ({ value: String(j), label: `${j} dias` }))} />
        </label>
        <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: "var(--text-dim)", lineHeight: 1.45 }}>{mod.desc}</div>
      </div>

      {/* Aviso p/ modelos multi-toque */}
      {mod.multi && (
        <Alerta tom="atencao">
          <strong>{mod.nome}</strong> precisa da <strong>jornada do visitante</strong> (vários toques por cliente), que vem do <strong>Rastreamento (Fase 2)</strong>. Rode o SQL das tabelas e instale o pixel para ativar. Enquanto isso, os números abaixo mostram a atribuição por <strong>último clique</strong> (origem real de cada venda).
        </Alerta>
      )}

      {/* Tabela de atribuição (último clique real) */}
      <div className="glass" style={{ borderRadius: 16, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>Faturamento por origem</span>
          <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>último clique (real) · janela {janela}d</span>
        </div>
        {loading && !s ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Carregando…</div>
        ) : canais.length === 0 ? (
          <div style={{ padding: 34, textAlign: "center", color: "var(--text-dim)" }}>
            <Icon name="target-arrow" size={28} color="var(--text-dim)" />
            <p style={{ fontSize: 13, marginTop: 8 }}>Nenhuma venda atribuída no período. Confira as UTMs (tag_utm) dos pedidos.</p>
          </div>
        ) : (
          <div>
            {canais.map((c) => {
              const ponto = <span style={{ width: 8, height: 8, borderRadius: 2, flex: "none", background: c.pago ? "#1877F2" : "var(--neutro)" }} />;
              const nome = <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>{c.label}{c.pago && <span style={{ fontSize: 10, fontWeight: 800, marginLeft: 8, padding: "1px 7px", borderRadius: 999, background: "color-mix(in srgb,#1877F2 15%,transparent)", color: "#1877F2" }}>PAGO</span>}</span>;
              const barra = <div style={{ height: 6, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}><div style={{ width: `${c.pct}%`, height: "100%", background: c.pago ? "#1877F2" : "var(--neutro)", borderRadius: 999 }} /></div>;
              // Celular: a linha do desktop soma 46+60+90 fixos + barra de 90 +
              // gaps (~354px) e não cabe em 320px. Vira duas fileiras — nome e
              // faturamento em cima, barra + % + pedidos embaixo.
              if (celular) {
                return (
                  <div key={c.key} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "12px 14px", borderTop: "1px solid var(--border)" }}>
                    {ponto}
                    {nome}
                    <span style={{ flex: "none", fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{brl0(c.faturamento)}</span>
                    <div style={{ flex: "1 1 100%", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>{barra}</div>
                      <span style={{ flex: "none", fontSize: 12, color: "var(--text-dim)" }}>{c.pct.toFixed(0)}%</span>
                      <span style={{ flex: "none", fontSize: 12, color: "var(--text-dim)" }}>{c.pedidos} ped.</span>
                    </div>
                  </div>
                );
              }
              return (
                <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderTop: "1px solid var(--border)" }}>
                  {ponto}
                  {nome}
                  <div style={{ flex: 1.4, minWidth: 90, maxWidth: 240 }}>{barra}</div>
                  <span style={{ flex: "none", width: 46, textAlign: "right", fontSize: 12.5, color: "var(--text-dim)" }}>{c.pct.toFixed(0)}%</span>
                  <span style={{ flex: "none", width: 60, textAlign: "right", fontSize: 12, color: "var(--text-dim)" }}>{c.pedidos} ped.</span>
                  <span style={{ flex: "none", width: 90, textAlign: "right", fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{brl0(c.faturamento)}</span>
                </div>
              );
            })}
            {s && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 800, color: "var(--text-dim)" }}>{s.pctAtribuido.toFixed(0)}% do faturamento com origem identificada</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{brl0(s.faturamento)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
