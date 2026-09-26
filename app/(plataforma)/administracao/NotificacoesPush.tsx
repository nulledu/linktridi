"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { GlassSelect } from "../GlassPicker";
import { TrocaIcone } from "../ui/micro";
import { Botao } from "../ui/controles";

interface Pessoa { id: string; name: string }

export function NotificacoesPush() {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [titulo, setTitulo] = useState("");
  const [corpo, setCorpo] = useState("");
  const [link, setLink] = useState("");
  const [para, setPara] = useState("todos");
  const [busy, setBusy] = useState(false);
  // O "ok" é um campo próprio: antes o resultado era deduzido de um "✓" grudado
  // no texto — e caractere pictográfico não é ícone (vale <Icon> do Tabler).
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => { fetch("/api/central/pessoas").then((r) => r.json()).then((d) => setPessoas(d.pessoas ?? [])).catch(() => {}); }, []);

  async function enviar() {
    if (!titulo.trim()) { setMsg({ ok: false, texto: "Escreva um título." }); return; }
    setBusy(true); setMsg(null);
    const r = await fetch("/api/notificacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titulo, corpo: corpo || null, link: link || null, para, tipo: "admin" }) });
    const d = await r.json(); setBusy(false);
    if (d.ok) { setMsg({ ok: true, texto: `Enviada para ${d.enviadas} pessoa(s).` }); setTitulo(""); setCorpo(""); setLink(""); }
    else setMsg({ ok: false, texto: "Falha ao enviar." });
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
        <Icon name="bell" size={18} color="var(--primary-texto)" />
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>Enviar notificação</h2>
      </div>
      <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 18 }}>Dispara um push pro sininho de quem você escolher. As notificações automáticas (mensagens, tarefas, solicitações) já acontecem sozinhas.</p>

      <div className="glass glass-spec" style={{ padding: 20, borderRadius: 18, display: "grid", gap: 14 }}>
        <Campo label="Título"><input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Reunião às 15h" style={inp} /></Campo>
        <Campo label="Mensagem (opcional)"><textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={3} placeholder="Detalhe…" style={{ ...inp, resize: "vertical" }} /></Campo>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Campo label="Destinatário">
            <GlassSelect value={para} onChange={setPara}
              options={[{ value: "todos", label: "Todos" }, ...pessoas.map((p) => ({ value: p.id, label: p.name }))]} />
          </Campo>
          <Campo label="Link (opcional)"><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/central/mensagens" style={inp} /></Campo>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Botao variante="primario" onClick={enviar} carregando={busy}>Enviar notificação</Botao>
          {msg && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "1 1 160px", minWidth: 0, fontSize: 13, color: msg.ok ? "var(--ok)" : "var(--perigo)", fontWeight: 600 }}>
              <TrocaIcone ligado={msg.ok} a="alert-triangle" b="circle-check" size={15} corA="var(--perigo)" corB="var(--ok)" />
              {msg.texto}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "block" }}><span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: "var(--text-dim)", marginBottom: 6 }}>{label}</span>{children}</label>;
}
const inp: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 11, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14, boxShadow: "none" };
