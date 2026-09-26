"use client";

import type { SalesSnapshot } from "@/lib/types";
import { fmtNum } from "@/lib/format";
import { Icon } from "./Icon";

// Produtos mais vendidos.
export function ProductsSlide({ sales }: { sales: SalesSnapshot }) {
  const items = [...sales.topProducts].sort((a, b) => b.qty - a.qty).slice(0, 6);
  const max = Math.max(...items.map((p) => p.qty), 1);
  return (
    <div style={{ width: "100%", maxWidth: 1100 }}>
      <h2 style={{ fontSize: 46, fontWeight: 800, marginBottom: 32, letterSpacing: "-0.02em", textAlign: "center" }}>
        Produtos mais vendidos
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((p, i) => (
          <div
            key={p.id}
            className="glass glass-spec"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "14px 24px",
              animation: `popIn .5s cubic-bezier(.16,1,.3,1) ${i * 0.07}s both`,
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 800, color: "var(--text-dim)", width: 32 }}>{i + 1}</span>
            <Thumb name={p.name} url={p.imageUrl} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{p.name}</div>
              <div style={{ marginTop: 10, height: 8, background: "rgba(255,255,255,.1)", borderRadius: 999, overflow: "hidden", maxWidth: 520 }}>
                <div style={{ width: `${(p.qty / max) * 100}%`, height: "100%", background: "linear-gradient(90deg, var(--primary), var(--roxo))", borderRadius: 999, transition: "width .8s ease" }} />
              </div>
            </div>
            <div style={{ textAlign: "right", minWidth: 130 }}>
              <div className="stat" style={{ fontSize: 30 }}>{fmtNum(p.qty)}</div>
              <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}>unidades</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Thumb({ name, url }: { name: string; url: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} style={thumb} />;
  }
  return <div style={{ ...thumb, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-2)" }}><Icon name="package" size={26} color="var(--text-dim)" /></div>;
}

const thumb: React.CSSProperties = { width: 56, height: 56, borderRadius: 14, objectFit: "cover" };
