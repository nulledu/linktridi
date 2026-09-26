"use client";

// Banco de provas do VisorCriativo: dois alvos, um com criativo (abas
// Biblioteca/Na Meta) e um só com o nome do anúncio (a aba Biblioteca fica
// desativada explicando por quê). Sem sessão as rotas respondem 401 e o
// visor mostra o estado vazio — o que se confere aqui é a folha: abas,
// alvo de toque, portal, 320px.
import { useState } from "react";
import { VisorCriativo, type AlvoDoVisor } from "../(plataforma)/marketing/VisorCriativo";

const COM_CRIATIVO: AlvoDoVisor = { codigo: "JL-041", criativoId: "prova", nome: "Depoimento cliente — corte 15s", metaAdId: null };
const SO_ANUNCIO: AlvoDoVisor = { codigo: null, criativoId: null, nomeAnuncio: "Vídeo carrossel BF sem código", metaAdId: "120200000000000000" };

export function ProvaVisor() {
  const [alvo, setAlvo] = useState<AlvoDoVisor | null>(null);
  const b: React.CSSProperties = { minHeight: "var(--tap)", padding: "0 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontWeight: 700, fontSize: 13.5 };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" style={b} onClick={() => setAlvo(COM_CRIATIVO)}>Abrir JL-041 (com criativo)</button>
      <button type="button" style={b} onClick={() => setAlvo(SO_ANUNCIO)}>Abrir anúncio sem código</button>
      {alvo && <VisorCriativo alvo={alvo} podeEditar onFechar={() => setAlvo(null)} />}
    </div>
  );
}
