"use client";

// Tráfego Pago — feed de Vendas recentes (aprovadas), pro Resumo. Dados reais
// do ERP via /api/trafego/eventos.
import { useCallback, useEffect, useState } from "react";
import { useAtualizacao } from "./atualizacao";
import { Icon } from "../Icon";
import { periodQuery, type PeriodState } from "../PeriodPicker";
import { useBuscaAtual } from "../ui/useBuscaAtual";
import type { EventoTrafego } from "@/lib/trafego-vendas";
import { Cartao } from "./TfKit";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
function haQuanto(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "agora"; const m = Math.floor(s / 60); if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} h`; return `${Math.floor(h / 24)} d`;
}

export function VendasRecentes({ period }: { period: PeriodState }) {
  const [vendas, setVendas] = useState<EventoTrafego[] | null>(null);

  const buscaAtual = useBuscaAtual();
  const load = useCallback(() => {
    if (period.key === "custom" && (!period.from || !period.to)) return;
    // Resposta atrasada de outro período não sobrescreve a busca nova.
    const souAtual = buscaAtual();
    fetch(`/api/trafego/eventos?${periodQuery(period)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { if (souAtual()) setVendas(((j.eventos || []) as EventoTrafego[]).filter((e) => e.tipo === "aprovado").slice(0, 8)); })
      .catch(() => { if (souAtual()) setVendas([]); });
  }, [period, buscaAtual]);
  useEffect(() => { load(); }, [load]);
  // Segue o botão "Atualizar" da Tridify (ver `atualizacao.ts`).
  useAtualizacao(load);

  if (vendas != null && vendas.length === 0) return null;   // sem vendas → não ocupa espaço

  return (
    <Cartao style={{ padding: 16, gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <Icon name="shopping-cart" size={15} color="var(--text-dim)" />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text-dim)" }}>Vendas recentes</span>
      </div>
      {vendas == null ? (
        <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Carregando…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {/* Cada venda é o cartão COMPACTO plano do kit — a linha de feed. */}
          {vendas.map((v) => (
            <Cartao key={v.id} compacto proeminencia="plano" style={{ flexDirection: "row", padding: "8px 2px", borderTop: "1px solid var(--tf-line-soft)", borderRadius: 0 }}>
              <span style={{ width: 26, height: 26, borderRadius: 8, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--ok) 14%, transparent)" }}><Icon name="circle-check" size={15} color="var(--ok)" /></span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.fonte}</span>
              <span className="tf-num" style={{ flex: "none", fontSize: 13, fontWeight: 800, color: "var(--ok)" }}>{v.valor != null ? brl(v.valor) : "—"}</span>
              <span style={{ flex: "none", width: 42, textAlign: "right", fontSize: 11, color: "var(--text-dim)" }}>{haQuanto(v.quando)}</span>
            </Cartao>
          ))}
        </div>
      )}
    </Cartao>
  );
}
