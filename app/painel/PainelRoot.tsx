"use client";

import { useEffect, useState } from "react";
import "./tv-tokens.css";
import { Panel } from "./Panel";
import { ProducaoPanel } from "./setor/ProducaoPanel";
import { LogisticaPanel } from "./setor/LogisticaPanel";
import { MaquinasPanel } from "./setor/MaquinasPanel";
import { Icon } from "./slides/Icon";
import { getDeviceTipo, setDeviceTipo, type PainelTipo } from "./cache";

// Decide qual painel este APARELHO exibe. Na 1ª vez pergunta (Vendas/Produção/
// Logística), salva no aparelho e nas próximas vezes abre direto no escolhido.
export function PainelRoot() {
  const [tipo, setTipo] = useState<PainelTipo | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => { setTipo(getDeviceTipo()); setPronto(true); }, []);

  function escolher(t: PainelTipo) { setDeviceTipo(t); setTipo(t); }

  if (!pronto) return <div style={{ width: "100%", height: "100dvh", background: "#f5f4fa" }} />;
  if (tipo === "vendas") return <Panel />;
  if (tipo === "producao") return <ProducaoPanel />;
  if (tipo === "logistica") return <LogisticaPanel />;
  if (tipo === "maquinas") return <MaquinasPanel />;
  return <Chooser onPick={escolher} />;
}

function Chooser({ onPick }: { onPick: (t: PainelTipo) => void }) {
  return (
    <main style={{ width: "100%", height: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40, background: "var(--bg,#000)", color: "var(--text,#fff)", padding: 24 }}>
      <div style={{ textAlign: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-tridi.png" alt="Tridi" style={{ height: 60, width: 60, borderRadius: 16, objectFit: "cover", margin: "0 auto 16px" }} />
        <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em" }}>Qual painel exibir nesta TV?</h1>
        <p style={{ color: "var(--text-dim,#aaa)", fontSize: 17, marginTop: 8 }}>A escolha fica salva neste aparelho. Você pode trocar depois.</p>
      </div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center" }}>
        <Opcao tipo="vendas" icon="trending-up" titulo="Painel de Vendas" desc="Ranking, metas, faturamento e tráfego" cor="var(--azul)" onPick={onPick} />
        <Opcao tipo="producao" icon="tools" titulo="Painel de Produção" desc="Equipe, urgências, fila e aceite de atividades" cor="var(--ok)" onPick={onPick} />
        <Opcao tipo="logistica" icon="truck-delivery" titulo="Painel de Logística" desc="Envios, pedidos críticos e aceite — TV em pé (9:16)" cor="var(--info)" onPick={onPick} />
        <Opcao tipo="maquinas" icon="printer" titulo="Painel de Máquinas" desc="Cada laser: o que corta agora, horas do dia e a fila" cor="var(--azul)" onPick={onPick} />
      </div>
    </main>
  );
}

function Opcao({ tipo, icon, titulo, desc, cor, onPick }: { tipo: PainelTipo; icon: string; titulo: string; desc: string; cor: string; onPick: (t: PainelTipo) => void }) {
  return (
    <button onClick={() => onPick(tipo)} className="glass glass-spec"
      // `min(340px, 100%)` e não 340 secos: a TV é o destino, mas quem ESCOLHE o
      // painel costuma estar com o celular na mão, e a 320px os dois cartões
      // nasciam 10px pra fora de cada lado — cortados, porque o kiosk esconde o
      // excedente em vez de rolar.
      style={{ width: "min(340px, 100%)", padding: 32, borderRadius: 24, cursor: "pointer", border: "none", color: "var(--text,#fff)", textAlign: "left", display: "flex", flexDirection: "column", gap: 14 }}>
      <span style={{ width: 72, height: 72, borderRadius: 20, display: "grid", placeItems: "center", background: `color-mix(in srgb,${cor} 18%,transparent)` }}>
        <Icon name={icon} size={38} color={cor} />
      </span>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800 }}>{titulo}</div>
        <div style={{ fontSize: 15, color: "var(--text-dim,#aaa)", marginTop: 4 }}>{desc}</div>
      </div>
      <span style={{ marginTop: 6, fontSize: 15, fontWeight: 700, color: cor, display: "inline-flex", alignItems: "center", gap: 5 }}>Selecionar <Icon name="chevron-right" size={16} color="currentColor" /></span>
    </button>
  );
}
