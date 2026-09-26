"use client";

// Banco de provas do "Subir criativo": o formulário como editora (quem fez
// travado na própria conta) e como admin (escolhe quem fez, inclusive Outros).
// Sem sessão o /proximo responde 401 e o número fica no 01 — o que se confere
// aqui é a folha, a prévia do nome e os alvos de toque a 320px.
import { useState } from "react";
import { CriativoModal, type Eu } from "../(plataforma)/marketing/CriativoModal";
import { PRODUTOS, type ProdutoCriativo } from "@/lib/marketing-criativos-const";

const EDITORES = [
  { id: "u-leticia", nome: "Letícia Souza", departamento: "Marketing" },
  { id: "u-bruno", nome: "Bruno Alves", departamento: "Marketing" },
];

export function ProvaSubir() {
  const [eu, setEu] = useState<Eu | null>(null);
  const [produtos, setProdutos] = useState<ProdutoCriativo[]>(PRODUTOS);
  const b: React.CSSProperties = { minHeight: "var(--tap)", padding: "0 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontWeight: 700, fontSize: 13.5 };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" style={b} onClick={() => setEu({ id: "u-leticia", nome: "Letícia Souza", admin: false })}>Subir como editora</button>
      <button type="button" style={b} onClick={() => setEu({ id: "u-caio", nome: "Caio Martins", admin: true })}>Subir como admin</button>
      {eu && <CriativoModal modo="novo" editores={EDITORES} produtos={produtos} eu={eu}
        onProdutoCriado={(p) => setProdutos((l) => [...l, p])}
        onFechar={() => setEu(null)} onSalvo={() => setEu(null)} />}
    </div>
  );
}
