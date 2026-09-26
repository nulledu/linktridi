"use client";

import { useState } from "react";
import { resumirMaquinas, type LinhaMaquina, type LinhaProgramacao } from "@/lib/painel-maquinas";
import { CorpoMaquinas } from "@/app/painel/setor/MaquinasPanel";

/**
 * Fixtures — as sete máquinas do galpão com fila de mentira. Os números saem
 * de `resumirMaquinas`, a MESMA conta da parede: se a regra mudar, a prova
 * muda junto (é o ponto de ter banco de provas em vez de tela decorativa).
 */
const AGORA = new Date();
/** Há N minutos, a partir de agora. */
const ha = (min: number) => new Date(AGORA.getTime() - min * 60000).toISOString();

const MAQUINAS: LinhaMaquina[] = [
  { id: "p1", nome: "Laser P1", porte: "P", materiais: "Borracha / Acrílico", ativa: true, ordem: 1, parada_motivo: null, parada_desde: null, parada_previsao: null },
  { id: "p2", nome: "Laser P2", porte: "P", materiais: "Borracha / Acrílico", ativa: true, ordem: 2, parada_motivo: "Falta de material", parada_desde: ha(25), parada_previsao: null },
  { id: "p3", nome: "Laser P3", porte: "P", materiais: "Borracha / Acrílico", ativa: true, ordem: 3, parada_motivo: null, parada_desde: null, parada_previsao: null },
  { id: "p4", nome: "Laser P4", porte: "P", materiais: "Borracha / Acrílico", ativa: true, ordem: 4, parada_motivo: null, parada_desde: null, parada_previsao: null },
  { id: "m1", nome: "Laser M1", porte: "M", materiais: "PS / Papel cartão", ativa: true, ordem: 5, parada_motivo: null, parada_desde: null, parada_previsao: null },
  { id: "g1", nome: "Laser G1", porte: "G", materiais: "Chapas", ativa: true, ordem: 6, parada_motivo: "Manutenção programada", parada_desde: ha(75), parada_previsao: new Date(AGORA.getTime() + 40 * 60000).toISOString() },
  { id: "g2", nome: "Laser G2", porte: "G", materiais: "Chapas", ativa: true, ordem: 7, parada_motivo: null, parada_desde: null, parada_previsao: null },
];

let seq = 0;
const p = (maquina_id: string, extra: Partial<LinhaProgramacao>): LinhaProgramacao => ({
  id: `x${seq++}`, maquina_id, referencia: "Pedido #58291", material: "Acrílico 3 mm",
  minutos_estimados: 105, posicao: 0, status: "fila", iniciada_at: null, concluida_at: null,
  ...extra,
});

const PROGRAMACOES: LinhaProgramacao[] = [
  // P1 — produzindo desde 08:15
  p("p1", { status: "executando", referencia: "Pedido #58291", iniciada_at: ha(140), minutos_estimados: 270 }),
  p("p1", { posicao: 1, referencia: "Pedido #58294", material: "Acrílico 2 mm", minutos_estimados: 105 }),
  p("p1", { posicao: 2, referencia: "Programa AC-067", material: "Acrílico 3 mm", minutos_estimados: 80 }),
  p("p1", { posicao: 3, referencia: "Pedido #58111", material: "MDF 3 mm", minutos_estimados: 140 }),
  // P2
  p("p2", { status: "executando", referencia: "Pedido #58294", material: "Acrílico 2 mm", iniciada_at: ha(58), minutos_estimados: 135 }),
  p("p2", { posicao: 1, referencia: "Programa CH-204", material: "Borracha", minutos_estimados: 75 }),
  p("p2", { posicao: 2, referencia: "Pedido #58301", material: "Acrílico 3 mm", minutos_estimados: 125 }),
  p("p2", { posicao: 3, referencia: "Programa BR-004", material: "Acrílico 2 mm", minutos_estimados: 90 }),
  // P3 — aguardando (fila cheia, nada rodando)
  p("p3", { posicao: 1, referencia: "Pedido #58301", material: "Acrílico 3 mm", minutos_estimados: 70 }),
  p("p3", { posicao: 2, referencia: "Pedido #58318", material: "Chapa PS", minutos_estimados: 110 }),
  p("p3", { posicao: 3, referencia: "Programa AC-067", material: "Acrílico 3 mm", minutos_estimados: 125 }),
  p("p3", { posicao: 4, referencia: "Pedido #58182", material: "MDF 3 mm", minutos_estimados: 150 }),
  // P4
  // P4 — passou da estimativa: acende ATENÇÃO
  p("p4", { status: "executando", referencia: "Programa CH-204", material: "Borracha", iniciada_at: ha(290), minutos_estimados: 260 }),
  p("p4", { posicao: 1, referencia: "Pedido #58318", material: "Acrílico 2 mm", minutos_estimados: 110 }),
  p("p4", { posicao: 2, referencia: "Programa AC-067", material: "MDF 3 mm", minutos_estimados: 95 }),
  p("p4", { posicao: 3, referencia: "Pedido #58182", material: "MDF 3 mm", minutos_estimados: 140 }),
  // M1
  p("m1", { status: "executando", referencia: "Programa PS-112", material: "PS branco", iniciada_at: ha(148), minutos_estimados: 260 }),
  p("m1", { posicao: 1, referencia: "Programa CH-300", material: "Papel cartão", minutos_estimados: 115 }),
  p("m1", { posicao: 2, referencia: "Programa PS-113", material: "PS branco", minutos_estimados: 90 }),
  p("m1", { posicao: 3, referencia: "Pedido #58131", material: "Papel cartão", minutos_estimados: 140 }),
  // G1 — parada, mas a fila continua
  p("g1", { posicao: 1, referencia: "Programa CH-300", material: "Chapa acrílica", minutos_estimados: 150 }),
  p("g1", { posicao: 2, referencia: "Pedido #58112", material: "Chapa PS", minutos_estimados: 165 }),
  p("g1", { posicao: 3, referencia: "Pedido #58128", material: "Chapa acrílica", minutos_estimados: 140 }),
  // G2
  p("g2", { status: "executando", referencia: "Pedido #58318", material: "Chapa acrílica", iniciada_at: ha(172), minutos_estimados: 270 }),
  p("g2", { posicao: 1, referencia: "Pedido #58320", material: "Chapa PS", minutos_estimados: 140 }),
  p("g2", { posicao: 2, referencia: "Programa CH-301", material: "Chapa acrílica", minutos_estimados: 160 }),
  p("g2", { posicao: 3, referencia: "Pedido #58321", material: "Chapa PS", minutos_estimados: 135 }),
  // Concluídas de hoje — alimentam "horas trabalhadas" e "programações feitas"
  p("p1", { status: "concluida", iniciada_at: ha(460), concluida_at: ha(360) }),
  p("p2", { status: "concluida", iniciada_at: ha(450), concluida_at: ha(310) }),
  p("m1", { status: "concluida", iniciada_at: ha(470), concluida_at: ha(365) }),
  p("g2", { status: "concluida", iniciada_at: ha(490), concluida_at: ha(365) }),
];

/** Tokens da pele clara que o KioskShell escreveria (widgets.css). */
const PELE: React.CSSProperties = {
  ["--bg" as string]: "#f5f4fa",
  ["--text" as string]: "#14142e",
  ["--text-dim" as string]: "#5d5e7a",
  ["--p-fundo" as string]: "#f5f4fa",
  ["--p-cartao" as string]: "#ffffff",
  ["--p-texto" as string]: "#14142e",
  ["--p-primaria" as string]: "#6c4cf0",
  ["--p-selo" as string]: "#ece7fe",
  ["--p-trilho" as string]: "#eae8f4",
  ["--p-ok" as string]: "#17a34a",
  ["--p-atencao" as string]: "#c2830b",
  ["--p-perigo" as string]: "var(--perigo)",
};

const PALCOS = [{ w: 1920, h: 1080 }, { w: 1280, h: 720 }] as const;

export function ProvaMaquinas() {
  const [tela, setTela] = useState(0);
  const [palco, setPalco] = useState(1);
  const dados = resumirMaquinas(MAQUINAS, PROGRAMACOES, AGORA);
  const { w, h } = PALCOS[palco];

  const botao = (ativo: boolean): React.CSSProperties => ({
    padding: "8px 14px", minHeight: 44, borderRadius: 12, cursor: "pointer", fontSize: 13.5, fontWeight: 700,
    border: "1px solid rgba(20,20,46,.14)", background: ativo ? "#fff" : "transparent", color: "inherit",
  });

  return (
    <main style={{ minHeight: "100dvh", background: "#e9e7f3", padding: "18px min(3vw, 28px) 60px", color: "#14142e" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Prova · painel de Máquinas</h1>
        <span style={{ fontSize: 13.5, opacity: 0.7 }}>dados de mentira · palco {w}×{h}</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["Monitor", "Setor", "Filas"].map((rot, i) => (
            <button key={rot} onClick={() => setTela(i)} style={botao(tela === i)}>{rot}</button>
          ))}
          {PALCOS.map((p, i) => (
            <button key={p.w} onClick={() => setPalco(i)} style={botao(palco === i)}>{p.w}×{p.h}</button>
          ))}
        </div>
      </div>

      {/* O palco real da TV, sem escala. Maior que a janela, rola DENTRO do
          bloco — a página nunca rola de lado. */}
      <div style={{ maxWidth: "100%", overflowX: "auto" }}>
        <div className="pele-clara" data-palco={`${w}x${h}`}
          style={{ ...PELE, width: w, height: h, flex: "none", background: "var(--bg)", color: "var(--text)", borderRadius: 20, overflow: "hidden", padding: "24px 28px", boxSizing: "border-box", boxShadow: "0 20px 60px rgb(20 20 46 / .18)" }}>
          <CorpoMaquinas dados={dados} offline={false} grupo={tela} />
        </div>
      </div>
    </main>
  );
}
