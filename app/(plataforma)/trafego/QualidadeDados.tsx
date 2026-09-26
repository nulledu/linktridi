"use client";

// ── Tridify · Central de qualidade dos dados (§5) ────────────────────────────
// Cruza a atribuição real (ERP/tag_utm via /api/trafego/vendas) com o que a Meta
// reporta pra mostrar a saúde do rastreio: cobertura de origem, vendas sem
// origem, divergência Meta × ERP e chargeback. Self-contained; usa d.since/until.

import { useCallback, useEffect, useState } from "react";
import { useAtualizacao } from "./atualizacao";
import type { AdsOverview } from "@/lib/meta-ads";
import { fmtBRL2 } from "@/lib/format";
import { Icon } from "../Icon";
import { Vazio, CardSkeleton } from "./TfKit";

interface Canal { key: string; label: string; faturamento: number; pedidos: number; pct: number }
interface Vendas { faturamento: number; faturamentoPago: number; metaRevenue: number; pctAtribuido: number; taxaChargeback: number; canais: Canal[] }

const cor = (bom: boolean, atencao: boolean) => (bom ? "var(--tf-pos)" : atencao ? "var(--tf-warn)" : "var(--tf-neg)");

export function QualidadeDados({ d }: { d: AdsOverview }) {
  const [v, setV] = useState<Vendas | null>(null);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(() => {
    const from = (d.since || "").slice(0, 10), to = (d.until || "").slice(0, 10);
    let vivo = true;
    fetch(`/api/trafego/vendas?period=custom&from=${from}&to=${to}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (!vivo) return; if (j && typeof j.pctAtribuido === "number") setV(j); else setErro(true); })
      .catch(() => { if (vivo) setErro(true); });
    return () => { vivo = false; };
  }, [d.since, d.until]);

  useEffect(() => carregar(), [carregar]);
  // O widget mede a qualidade do dado — mostrar a medição de dez minutos atrás
  // logo depois de "Atualizar" é justamente o que ele existe pra evitar.
  useAtualizacao(carregar);

  if (erro) return <Vazio icon="alert-triangle">Sem dados de atribuição no período.</Vazio>;
  if (!v) return <CardSkeleton linhas={3} />;

  const cobertura = Math.round(v.pctAtribuido);                   // % faturamento com origem paga
  const semOrigem = v.canais.find((c) => c.key === "sem_origem");
  const divergencia = v.faturamentoPago > 0 ? Math.abs(v.metaRevenue - v.faturamentoPago) / v.faturamentoPago * 100 : null;
  const chargeback = v.taxaChargeback * 100;

  const linhas: { label: string; valor: string; cor: string; detalhe: string }[] = [
    { label: "Cobertura de origem", valor: `${cobertura}%`, cor: cor(cobertura >= 70, cobertura >= 40), detalhe: "faturamento com UTM identificada" },
    { label: "Vendas sem origem", valor: semOrigem ? `${semOrigem.pct.toFixed(0)}%` : `${Math.max(0, 100 - cobertura)}%`, cor: cor((semOrigem?.pct ?? 100 - cobertura) < 20, (semOrigem?.pct ?? 100 - cobertura) < 45), detalhe: semOrigem ? fmtBRL2(semOrigem.faturamento) + " sem rastreio" : "não atribuídas" },
    { label: "Divergência Meta × ERP", valor: divergencia == null ? "—" : `${divergencia.toFixed(0)}%`, cor: cor((divergencia ?? 99) < 20, (divergencia ?? 99) < 45), detalhe: `pixel ${fmtBRL2(v.metaRevenue)} vs real ${fmtBRL2(v.faturamentoPago)}` },
    { label: "Chargeback", valor: `${chargeback.toFixed(1)}%`, cor: cor(chargeback < 1, chargeback < 3), detalhe: "sobre os pedidos" },
  ];

  return (
    // Nas ZONAS do widget (.tf-w topo/corpo): fora delas o conteúdo boiava —
    // a régua interna do painel é uma só e vale pra todo card.
    <div className="tf-w">
      <div className="tf-w-topo">
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="stat tf-w-num" style={{ color: cor(cobertura >= 70, cobertura >= 40) }}>{cobertura}</span>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>de 100 · qualidade do rastreio</span>
        </div>
        <div style={{ height: 7, borderRadius: 4, marginTop: 8, background: "var(--surface-2, var(--border))", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${cobertura}%`, background: cor(cobertura >= 70, cobertura >= 40), borderRadius: 4 }} />
        </div>
      </div>
      <div className="tf-w-corpo tf-w-lista" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {linhas.map((l) => (
          <div key={l.label} style={{ display: "grid", gridTemplateColumns: "9px 1fr auto", gap: 9, alignItems: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: l.cor }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>{l.label}</div>
              <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{l.detalhe}</div>
            </div>
            <span className="stat" style={{ fontSize: 15, fontWeight: 800, color: l.cor }}>{l.valor}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
