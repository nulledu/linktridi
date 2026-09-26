"use client";

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { toast, confirmar } from "../Toast";
import { Skeleton } from "../Skeleton";
import { TrocaIcone } from "../ui/micro";
import { Botao, BotaoIcone } from "../ui/controles";

// Painel admin: perfis do Facebook conectados (multi-token) + conectar novos.
// O gasto do Marketing/X1 soma as contas de anúncio de TODOS os perfis daqui.

interface AdAccount { id: string; name: string }
interface Connection {
  id: number; name: string; userId: string | null;
  expiresAt: string | null; addedAt: string | null;
  accountCount: number; accounts: AdAccount[]; ok: boolean; error?: string;
  appId?: string | null; canRenew?: boolean;
}

export function MetaAdsPanel() {
  const [conns, setConns] = useState<Connection[] | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [renovando, setRenovando] = useState(false);
  const [aberto, setAberto] = useState<number | null>(null);

  function load() {
    fetch("/api/meta/connections", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setConns(d.connections || []))
      .catch(() => setConns([]));
  }
  useEffect(load, []);

  async function renovar() {
    setRenovando(true);
    try {
      const r = await fetch("/api/meta/connections", { method: "PATCH" });
      const d = await r.json();
      if (!r.ok || !d.ok) { toast.erro(d.error || "Não foi possível renovar."); return; }
      toast.ok(`${d.renovados}/${d.total} token(s) renovado(s) · +60 dias`);
      load();
    } catch {
      toast.erro("Falha ao renovar.");
    } finally {
      setRenovando(false);
    }
  }

  async function conectar() {
    const t = token.trim();
    if (!t) { toast.erro("Cole o token do perfil."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/meta/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: t }) });
      const d = await r.json();
      if (!r.ok || !d.ok) { toast.erro(d.error || "Não foi possível validar o token."); return; }
      const p = d.profile as Connection;
      toast.ok(`Perfil “${p.name}” conectado · ${p.accountCount} conta(s)`);
      setToken("");
      load();
    } catch {
      toast.erro("Falha ao conectar.");
    } finally {
      setBusy(false);
    }
  }

  async function remover(c: Connection) {
    const ok = await confirmar(`Desconectar o perfil “${c.name}”?`, { detalhe: "As contas que só ele enxerga somem do painel de Marketing.", perigo: true });
    if (!ok) return;
    const r = await fetch(`/api/meta/connections?id=${c.id}`, { method: "DELETE" });
    if (r.ok) { toast.ok("Perfil desconectado"); load(); }
    else toast.erro("Não foi possível desconectar.");
  }

  const totalContas = conns ? new Set(conns.flatMap((c) => c.accounts.map((a) => a.id))).size : 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>Facebook Ads</h2>
        {conns && conns.length > 0 && (
          <Botao tamanho="sm" icone="sparkles" onClick={renovar} carregando={renovando} title="Estende a validade de todos os tokens agora">Renovar tokens</Botao>
        )}
        {conns && <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{conns.length} perfil(is) · {totalContas} conta(s) únicas</span>}
      </div>
      <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 18 }}>
        Cada perfil é um login do Facebook. O gasto do Marketing/X1 soma as contas de anúncio de <strong>todos</strong> os perfis (conta repetida entre perfis conta uma vez). Conta nova de um perfil entra sozinha. Os tokens se <strong>renovam sozinhos</strong> antes de vencer — não expiram.
      </p>

      {/* Conectar novo perfil */}
      <div className="glass glass-spec" style={{ padding: 18, borderRadius: 16, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Icon name="sparkles" size={16} color="var(--primary-texto)" />
          <strong style={{ fontSize: 14.5 }}>Conectar outra conta</strong>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 10, lineHeight: 1.5 }}>
          Cole um <strong>token de acesso</strong> do Facebook do perfil que você quer conectar. Basta a permissão <code>ads_read</code> (<code>business_management</code> só ajuda se as contas forem vistas só via Business Manager). Gere com o nosso app pra renovar sozinho. O token é validado antes de salvar e nunca é exibido de volta.
        </p>
        <textarea value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAAB… (token de acesso do Facebook)"
          rows={3} spellCheck={false}
          style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", fontSize: 13, fontFamily: "ui-monospace, monospace", resize: "vertical" }} />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
          <Botao variante="primario" icone="circle-check" onClick={conectar} carregando={busy}>Validar e conectar</Botao>
        </div>
      </div>

      {/* Lista de perfis conectados */}
      {!conns ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1].map((i) => <Skeleton key={i} h={78} r={16} />)}
        </div>
      ) : conns.length === 0 ? (
        <div className="glass" style={{ padding: 24, borderRadius: 16, color: "var(--text-dim)", fontSize: 13.5, textAlign: "center" }}>
          Nenhum perfil conectado ainda. Cole um token acima para conectar o primeiro.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {conns.map((c) => (
            <div key={c.id} className="glass glass-spec" style={{ padding: 16, borderRadius: 16 }}>
              {/* Wrap + flex-basis no bloco de texto: no celular os dois botões
                  descem juntos pra segunda linha em vez de espremerem o nome do
                  perfil em ~90px. No desktop cabe tudo numa linha, igual a antes. */}
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, rowGap: 10 }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", background: c.ok ? "color-mix(in srgb, #1877F2 18%, transparent)" : "color-mix(in srgb, var(--perigo) 18%, transparent)" }}>
                  <TrocaIcone ligado={c.ok} a="alert-triangle" b="user" size={20} corA="var(--perigo)" corB="#1877F2" />
                </span>
                <div style={{ flex: "1 1 150px", minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                    {c.ok
                      ? <>{c.accountCount} conta(s) de anúncio · {expiraLabel(c.expiresAt)}</>
                      : <span style={{ color: "var(--perigo)" }}>{c.error || "Token inválido — reconecte."}</span>}
                  </div>
                  {c.ok && c.appId && (
                    <div style={{ fontSize: 12.5, marginTop: 3, display: "inline-flex", alignItems: "center", gap: 5, color: c.canRenew ? "var(--ok)" : "var(--atencao)" }}>
                      <TrocaIcone ligado={!!c.canRenew} a="alert-triangle" b="circle-check" size={12} corA="var(--atencao)" corB="var(--ok)" />
                      app {c.appId} · {c.canRenew ? "renova sozinho" : "sem secret cadastrado — não renova"}
                    </div>
                  )}
                </div>
                {/* Os dois botões andam juntos: quebram como um bloco só, colados
                    à direita — nunca um em cada linha. */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "none", marginLeft: "auto" }}>
                  {c.accountCount > 0 && (
                    <BotaoIcone icone={aberto === c.id ? "chevron-up" : "chevron-down"} titulo="Ver contas" variante="secundario" aria-expanded={aberto === c.id} onClick={() => setAberto(aberto === c.id ? null : c.id)} style={{ flex: "none" }} />
                  )}
                  <BotaoIcone icone="trash" titulo="Desconectar" variante="perigo" onClick={() => remover(c)} style={{ flex: "none" }} />
                </div>
              </div>
              {aberto === c.id && c.accounts.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 8 }}>
                  {c.accounts.map((a) => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#1877F2", flex: "none" }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                      <span style={{ color: "var(--text-dim)", fontSize: 11, flex: "none" }}>{a.id}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function expiraLabel(iso: string | null): string {
  if (!iso) return "não expira";
  const dias = Math.round((new Date(iso).getTime() - Date.now()) / 864e5);
  if (dias < 0) return "expirado — reconecte";
  if (dias === 0) return "renova hoje";
  if (dias <= 10) return `renova em ${dias} dia${dias === 1 ? "" : "s"}`;
  return `válido +${dias} dias · renova sozinho`;
}
