"use client";

import { useMemo, useState } from "react";
import { bestMetricKeys } from "@/lib/creative-intelligence/comparison";
import { METRIC_DEFINITIONS } from "@/lib/creative-intelligence/metrics";
import type { CreativeComparable, CreativeMetricKey, CreativeTagAggregate } from "@/lib/creative-intelligence/types";
import { Icon } from "../../Icon";
import { EmptyState, formatMetric } from "./ui";

const ROWS: CreativeMetricKey[] = ["hookRate", "holdRate", "ctr", "cpm", "initiateCheckout", "cpa", "roas", "purchases", "revenue"];

export function CreativeComparison({ currentId, peers, tags }: { currentId: string; peers: CreativeComparable[]; tags: CreativeTagAggregate[] }) {
  const [mode, setMode] = useState<"creative" | "tags">("creative");
  const firstOther = peers.find((peer) => peer.id !== currentId)?.id;
  const [selected, setSelected] = useState<string[]>([currentId, ...(firstOther ? [firstOther] : [])]);
  const rows = useMemo(() => mode === "tags" ? tags : peers.filter((peer) => selected.includes(peer.id)), [mode, peers, selected, tags]);
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? (current.length > 2 ? current.filter((item) => item !== id) : current) : (current.length < 5 ? [...current, id] : current));

  return (
    <div className="ci-stack">
      <div className="ci-segmented" role="group" aria-label="Tipo de comparação">
        <button data-active={mode === "creative"} onClick={() => setMode("creative")}>Criativos</button>
        <button data-active={mode === "tags"} onClick={() => setMode("tags")}>Tags</button>
      </div>
      {mode === "creative" && (
        <div className="ci-compare-picker">
          {peers.map((peer) => {
            const active = selected.includes(peer.id);
            return <button key={peer.id} data-active={active} onClick={() => toggle(peer.id)}><Icon name={active ? "check" : "plus"} size={13} color="currentColor" />{peer.name}</button>;
          })}
          <span>Selecione de 2 a 5 criativos.</span>
        </div>
      )}
      {rows.length < 2 ? <EmptyState>Escolha pelo menos dois itens para comparar.</EmptyState> : (
        <div className="ci-table-wrap" style={{ overflowX: "auto" }}>
          <table className="ci-table">
            <thead><tr><th>Métrica</th>{rows.map((row) => <th key={row.id}>{row.name}{"creativeCount" in row && typeof row.creativeCount === "number" ? <small>{row.creativeCount} criativos</small> : null}</th>)}</tr></thead>
            <tbody>{ROWS.map((key) => {
              const best = new Set(bestMetricKeys(rows, key));
              return <tr key={key}><th>{METRIC_DEFINITIONS[key].label}</th>{rows.map((row) => <td key={row.id} data-best={best.has(row.id)}>{formatMetric(key, row.metrics[key])}</td>)}</tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
