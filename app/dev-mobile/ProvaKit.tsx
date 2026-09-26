"use client";

// TEMPORÁRIO — prova do "KIT MOBILE": as peças que as telas redesenhadas usam
// (duo, kpi-row, tab-strip, Ver mais, folha). Serve pra medir a 320px sem login.
import { useState } from "react";
import { PageHead, VerMais, TabelaOuCards, CardLinha } from "../(plataforma)/ui/mobile";

const bloco = { padding: 16, borderRadius: 16 } as const;

export function ProvaKit() {
  const [folha, setFolha] = useState(false);
  return (
    <div id="prova-kit" style={{ marginBottom: 20 }}>
      <PageHead title="Prova do kit" sub="cabeçalho compacto no celular" right={<span className="desk-only">direita</span>} />

      <div className="tab-strip" style={{ gap: 8, marginBottom: 14, padding: 0 }}>
        {["Visão geral", "Pedidos", "Vendedoras", "Marketing", "Marketplace", "Outros"].map((t) => (
          <button key={t} className="glass tap-m" style={{ padding: "9px 15px", borderRadius: 13, fontSize: 14, fontWeight: 600 }}>{t}</button>
        ))}
      </div>

      <div className="kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 14 }}>
        {["R$ 128.400,00", "R$ 42.100,00", "R$ 9.870,00"].map((v) => (
          <div key={v} className="glass" style={{ ...bloco }}>
            <div className="stat" style={{ fontSize: 22 }}>{v}</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)" }}>rótulo</div>
          </div>
        ))}
      </div>

      <div className="duo" style={{ marginBottom: 14 }}>
        <div className="glass" style={bloco}>coluna larga</div>
        <div className="glass" style={bloco}>coluna estreita</div>
      </div>

      <VerMais label="Ver mais métricas">
        <div className="glass" style={bloco}>conteúdo secundário</div>
      </VerMais>

      <div style={{ marginTop: 14 }}>
        <TabelaOuCards
          tabela={
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody><tr><td style={{ padding: 8 }}>Conta X</td><td style={{ padding: 8 }}>R$ 1.000,00</td></tr></tbody>
            </table>
          }
          cards={<CardLinha titulo="Conta X" campos={[{ label: "Gasto", value: "R$ 1.000,00" }, { label: "ROAS", value: "2,10x", forte: true }]} />}
        />
      </div>

      {/* "Tabela" feita de grid: cabeçalho some e a linha vira card com rótulo */}
      <div id="prova-linha" style={{ marginTop: 14 }}>
        <div className="tab-linha-head" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, padding: "8px 4px", fontSize: 11, color: "var(--text-dim)" }}>
          <span>Campanha</span><span>Gasto</span><span>ROAS</span>
        </div>
        {["Campanha A", "Campanha B"].map((n) => (
          <div key={n} className="tab-linha" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, padding: "10px 4px" }}>
            <span className="tl-titulo">{n}</span>
            <span data-l="Gasto">R$ 1.200</span>
            <span data-l="ROAS">2,10x</span>
          </div>
        ))}
      </div>

      <button className="vermais-btn" onClick={() => setFolha(true)}>Abrir folha</button>
      {folha && (
        <div className="apple-backdrop sheet-host" onClick={() => setFolha(false)}>
          <div className="apple-modal glass sheet" onClick={(e) => e.stopPropagation()}
            style={{ width: "min(560px, 100%)", maxHeight: "88dvh", overflowY: "auto", borderRadius: 24, padding: "clamp(16px, 5vw, 24px)" }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Folha</h2>
            <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Presa embaixo no celular, centrada no desktop.</p>
            <button className="vermais-btn" onClick={() => setFolha(false)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
