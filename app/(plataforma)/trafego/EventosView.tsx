"use client";

// Tráfego Pago — Eventos. Feed em tempo quase-real dos eventos do período
// (pedidos criados/aprovados/chargeback), vindos do ERP real. Filtro por tipo,
// valor, origem e horário. (Eventos de pixel — PageView/Lead — entram quando o
// rastreamento estiver gravando.)
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtualizacao } from "./atualizacao";
import { Icon } from "../Icon";
import { periodQuery, type PeriodState } from "../PeriodPicker";
import { useBuscaAtual } from "../ui/useBuscaAtual";
import type { EventoTrafego } from "@/lib/trafego-vendas";
import { Botao } from "../ui/controles";

const COR = { verde: "var(--ok)", amarelo: "var(--atencao)", vermelho: "var(--perigo)", azul: "var(--azul)", cinza: "var(--neutro)" } as const;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
function haQuanto(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "agora";
  const m = Math.floor(s / 60); if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}
const ICONE: Record<string, string> = { aprovado: "circle-check", chargeback: "alert-triangle", criado: "shopping-cart", pendente: "clock" };

const FILTROS: { key: string; label: string }[] = [
  { key: "", label: "Todos" }, { key: "aprovado", label: "Aprovados" }, { key: "criado", label: "Pedidos" }, { key: "pendente", label: "Pendentes" }, { key: "chargeback", label: "Chargeback" },
];

export function EventosView({ period }: { period: PeriodState }) {
  const [ev, setEv] = useState<EventoTrafego[] | null>(null);
  const [erro, setErro] = useState(false);
  const [filtro, setFiltro] = useState("");

  const buscaAtual = useBuscaAtual();
  const load = useCallback(() => {
    if (period.key === "custom" && (!period.from || !period.to)) return;
    setErro(false);
    // Resposta atrasada de outro período não sobrescreve a busca nova.
    const souAtual = buscaAtual();
    fetch(`/api/trafego/eventos?${periodQuery(period)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => { if (souAtual()) setEv(j.eventos || []); }).catch(() => { if (souAtual()) setErro(true); });
  }, [period, buscaAtual]);
  useEffect(() => { load(); }, [load]);
  // Segue o botão "Atualizar" da Tridify (ver `atualizacao.ts`).
  useAtualizacao(load);

  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of ev || []) c[e.tipo] = (c[e.tipo] || 0) + 1;
    return c;
  }, [ev]);
  const lista = (ev || []).filter((e) => !filtro || e.tipo === filtro);

  return (
    <div className="tf-scope" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>Eventos</h2>
          <p style={{ color: "var(--text-dim)", fontSize: 13.5, marginTop: 2 }}>Tudo o que aconteceu no período — pedidos, aprovações e chargebacks, em ordem cronológica.</p>
        </div>
        <Botao variante="secundario" icone="refresh" onClick={load} style={{ marginLeft: "auto" }}>Atualizar</Botao>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTROS.map((ff) => {
          const on = filtro === ff.key;
          const n = ff.key === "" ? (ev || []).length : contagem[ff.key] || 0;
          return (
            <button key={ff.key} onClick={() => setFiltro(ff.key)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? "transparent" : "var(--tf-line)"}`, background: on ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: on ? "var(--on-primary, #fff)" : "var(--text)" }}>
              {ff.label} <span className="tf-num" style={{ fontSize: 11, opacity: 0.75 }}>{n}</span>
            </button>
          );
        })}
      </div>

      <div className="tf-panel" style={{ padding: 0, overflow: "hidden" }}>
        {erro ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Não foi possível carregar os eventos.</div>
        ) : ev == null ? (
          <div style={{ padding: 30, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Carregando eventos…</div>
        ) : lista.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text-dim)" }}>
            <Icon name="activity" size={28} color="var(--text-dim)" />
            <p style={{ fontSize: 13, marginTop: 8 }}>Nenhum evento no período com esse filtro.</p>
          </div>
        ) : (
          lista.map((e) => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderTop: "1px solid var(--tf-line-soft)" }}>
              <span style={{ width: 32, height: 32, borderRadius: 9, flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${COR[e.cor]} 14%, transparent)` }}>
                <Icon name={ICONE[e.tipo] || "activity"} size={16} color={COR[e.cor]} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>{e.rotulo}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>origem: {e.fonte}</div>
              </div>
              {e.valor != null && e.valor > 0 && <span className="tf-num" style={{ flex: "none", fontSize: 13.5, fontWeight: 800, color: e.cor === "vermelho" ? COR.vermelho : "var(--text)" }}>{brl(e.valor)}</span>}
              <span style={{ flex: "none", width: 68, textAlign: "right", fontSize: 11.5, color: "var(--text-dim)" }}>{haQuanto(e.quando)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
