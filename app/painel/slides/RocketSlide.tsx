"use client";

import type { PanelConfig, SalesSnapshot } from "@/lib/types";
import { fmtBRL, fmtCurto } from "@/lib/format";

/**
 * O dinheiro desta tela, na escala que o PERFIL pediu — ver RankingSlide.
 */
const moeda = (curtos?: boolean) => (n: number) => (curtos ? fmtCurto(n, true) : fmtBRL(n));
import { Icon } from "./Icon";

const MKT = "var(--atencao)";
const COM = "var(--azul)";
const GREEN = "var(--ok)";

// Batalha de Vendas — placar Marketing × Comercial estilo telão.
export function RocketSlide({ sales, config, curtos }: { sales: SalesSnapshot; config: PanelConfig; curtos?: boolean }) {
  const dinheiro = moeda(curtos);
  const mkt = sales.teams.find((t) => t.id === "marketing");
  const com = sales.teams.find((t) => t.id === "comercial");
  if (!mkt || !com) return null;

  const total = Math.max(mkt.current + com.current, 1);
  const mktShare = (mkt.current / total) * 100;
  const comShare = 100 - mktShare;
  const mktWins = mkt.current >= com.current;
  const winner = mktWins ? mkt : com;
  const loser = mktWins ? com : mkt;
  const winColor = mktWins ? MKT : COM;
  const diff = Math.abs(mkt.current - com.current);

  // Meta = a definida no dashboard (não soma de times).
  const meta = config.monthlyRevenueGoal || 0;
  const realizado = mkt.current + com.current;
  const atingido = meta > 0 ? (realizado / meta) * 100 : 0;

  return (
    <div style={{ width: "100%", maxWidth: 1180, textAlign: "center" }}>
      <h2 style={{ fontSize: 48, fontWeight: 900, letterSpacing: "-0.01em" }}>BATALHA DE VENDAS</h2>

      {/* Placar — sem VS gigante; a barra conta a história */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginTop: 24 }}>
        <Side name="MARKETING" value={mkt.current} color={MKT} win={mktWins} align="left" dinheiro={dinheiro} />
        <Side name="COMERCIAL" value={com.current} color={COM} win={!mktWins} align="right" dinheiro={dinheiro} />
      </div>

      {/* Barra de disputa */}
      <div style={{ position: "relative", height: 38, borderRadius: 999, overflow: "hidden", display: "flex", marginTop: 14, boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)" }}>
        <div style={{ width: `${mktShare}%`, background: MKT, boxShadow: `0 0 40px -4px ${MKT}`, transition: "width 1s cubic-bezier(.16,1,.3,1)" }} />
        <div style={{ flex: 1, background: COM, boxShadow: `0 0 40px -4px ${COM}` }} />
        <div style={{ position: "absolute", top: -5, bottom: -5, left: `${mktShare}%`, transform: "translateX(-50%)", width: 4, background: "#fff", borderRadius: 999, boxShadow: "0 0 12px rgba(255,255,255,.7)", transition: "left 1s cubic-bezier(.16,1,.3,1)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 22, fontWeight: 800 }}>
        <span style={{ color: MKT }}>{mktShare.toFixed(1).replace(".", ",")}%</span>
        <span style={{ color: COM }}>{comShare.toFixed(1).replace(".", ",")}%</span>
      </div>

      {/* Emoção + diferença (compacto, sem roubar a cena) */}
      <div style={{ marginTop: 22, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: winColor, fontSize: 17, fontWeight: 800, letterSpacing: "0.02em" }}>
          <Icon name="crown" size={20} color={winColor} /> {winner.name} lidera por
        </div>
        <div className="stat" style={{ fontSize: 40, color: GREEN }}>+ {dinheiro(diff)}</div>
      </div>

      {/* Meta geral (limpa) */}
      <div className="glass glass-spec" style={{ marginTop: 22, padding: "18px 28px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", color: "var(--text-dim)" }}>META GERAL</span>
          <span style={{ fontSize: 15, color: "var(--text-dim)" }}>{dinheiro(realizado)} / {dinheiro(meta)}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 10 }}>
          <span className="stat" style={{ fontSize: 40, color: "var(--roxo)" }}>{atingido.toFixed(0)}%</span>
          <div style={{ flex: 1, height: 14, borderRadius: 999, background: "rgba(255,255,255,.1)", overflow: "hidden" }}>
            <div style={{ width: `${Math.min(atingido, 100)}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, var(--primary), var(--roxo))", transition: "width 1s ease" }} />
          </div>
          <span style={{ fontSize: 14, color: "var(--text-dim)" }}>atingido</span>
        </div>
      </div>
    </div>
  );
}

function Side({ name, value, color, win, align, dinheiro }: { name: string; value: number; color: string; win: boolean; align: "left" | "right"; dinheiro: (n: number) => string }) {
  return (
    <div style={{ flex: 1, textAlign: align }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: align === "right" ? "flex-end" : "flex-start" }}>
        {win && <Icon name="crown" size={28} color={color} />}
        <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "0.04em", color }}>{name}</span>
      </div>
      <div className="stat" style={{ fontSize: 78, marginTop: 4, color: "#fff", textShadow: win ? `0 0 50px color-mix(in srgb, ${color} 55%, transparent)` : "0 0 30px rgba(0,0,0,.4)", opacity: win ? 1 : 0.9 }}>
        {dinheiro(value)}
      </div>
    </div>
  );
}
