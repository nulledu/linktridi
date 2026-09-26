"use client";

import { useEffect, useMemo, useState } from "react";
import { FUNCOES, FUNCAO_LABEL, type ErpUser, type Funcao } from "@/lib/funcoes-catalog";
import { GlassSelect } from "../GlassPicker";
import { confirmar } from "../Toast";
import { Icon } from "../Icon";
import { Botao } from "../ui/controles";
import { Alerta } from "../ui/Alerta";
import { Avatar as AvatarBase } from "../ui/Avatar";
import { atributosDe } from "../ui/campos";
import { TrocaIcone } from "../ui/micro";

// Painel de Funções: escolhe alguém do ERP e atribui uma função (sem criar
// login). Quem não tem função aqui não aparece nos dashboards.
export function FuncoesPanel() {
  const [users, setUsers] = useState<ErpUser[]>([]);
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [q, setQ] = useState("");
  const [erroRemover, setErroRemover] = useState<string | null>(null);
  const [sel, setSel] = useState<ErpUser | null>(null);
  const [funcao, setFuncao] = useState(FUNCOES[0].key);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");                      // busca na lista de atribuídos
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());

  async function loadFuncoes() {
    const r = await fetch("/api/funcoes", { cache: "no-store" });
    if (r.ok) setFuncoes((await r.json()).funcoes ?? []);
  }
  useEffect(() => {
    fetch("/api/erp-users", { cache: "no-store" }).then((r) => r.ok && r.json()).then((d) => d && setUsers(d.users ?? []));
    loadFuncoes();
  }, []);

  const assignedIds = useMemo(() => new Set(funcoes.map((f) => f.erp_user_id)), [funcoes]);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return users.filter((u) => (u.nome + " " + (u.apelido ?? "")).toLowerCase().includes(t)).slice(0, 8);
  }, [q, users]);

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(null), 2500); }

  async function assign() {
    if (!sel) return;
    setBusy(true);
    const r = await fetch("/api/funcoes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ erp_user_id: sel.id, nome: sel.apelido || sel.nome, foto_url: sel.foto_url, funcao }),
    });
    setBusy(false);
    if (!r.ok) return flash("Falha ao atribuir (tabela criada?).");
    setSel(null); setQ("");
    await loadFuncoes();
    flash("Função atribuída.");
  }

  async function remove(id: string) {
    setErroRemover(null);
    const r = await fetch(`/api/funcoes?id=${id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) setErroRemover("Não foi possível remover a função. Ela continua atribuída — tente de novo.");
    await loadFuncoes();
  }

  const ft = filtro.trim().toLowerCase();
  const buscando = ft.length > 0;
  const grouped = FUNCOES.map((f) => {
    const labelMatch = FUNCAO_LABEL[f.key].toLowerCase().includes(ft);
    const pessoas = funcoes.filter((x) => x.funcao === f.key && (!buscando || labelMatch || x.nome.toLowerCase().includes(ft)));
    return { ...f, pessoas };
  }).filter((g) => g.pessoas.length);
  const totalAtribuidos = funcoes.length;
  function toggle(key: string) {
    setColapsados((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  return (
    <div className="glass glass-spec" style={{ padding: 24, borderRadius: "var(--r-lg)", marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>Funções no dashboard</h2>
          <p style={{ color: "var(--text-dim)", fontSize: 13.5, marginTop: 4, marginBottom: 18 }}>
            Atribua uma função a alguém do ERP (não precisa de login). Quem não tem função não aparece nos dashboards.
          </p>
        </div>
        <ImportarLogins />
      </div>

      {erroRemover && (
        <Alerta tom="perigo" aoFechar={() => setErroRemover(null)} style={{ marginBottom: 12 }}>{erroRemover}</Alerta>
      )}

      {/* Atribuir */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ position: "relative", flex: "1 1 280px", minWidth: "min(100%, 240px)" }}>
          <input {...atributosDe("busca")}
            value={sel ? (sel.apelido || sel.nome) : q}
            onChange={(e) => { setSel(null); setQ(e.target.value); }}
            placeholder="Buscar pessoa do ERP…"
            style={inp}
          />
          {!sel && results.length > 0 && (
            <div className="glass pop-solid" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 5, borderRadius: "var(--r-sm)", padding: 6, maxHeight: 280, overflow: "auto" }}>
              {results.map((u) => (
                <button key={u.id} onClick={() => { setSel(u); setQ(""); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", borderRadius: "var(--r-xs)", cursor: "pointer", background: "transparent", border: "none", color: "var(--text)", textAlign: "left" }}>
                  <Avatar foto={u.foto_url} nome={u.nome} />
                  <span style={{ flex: 1, fontSize: 14 }}>{u.apelido || u.nome}</span>
                  {assignedIds.has(u.id) && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>já tem função</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* 0 1: no desktop continua com 230px; em 320px pode encolher em vez de
            empurrar a linha pra fora. */}
        <div style={{ flex: "0 1 230px", minWidth: 0 }}>
          <GlassSelect value={funcao} onChange={(v) => setFuncao(v as typeof funcao)} options={FUNCOES.map((f) => ({ value: f.key, label: f.label }))} />
        </div>
        <Botao variante="primario" onClick={assign} disabled={!sel} carregando={busy} style={{ flex: "none" }}>Atribuir</Botao>
      </div>
      {msg && <p style={{ marginTop: 10, fontSize: 13, color: "var(--text-dim)" }}>{msg}</p>}

      {/* Atribuídos: cabeçalho + busca */}
      <div style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 14, fontWeight: 800 }}>Pessoas com função <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>· {totalAtribuidos}</span></h3>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 360, marginLeft: "auto" }}>
          <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}><Icon name="search" size={15} color="var(--text-dim)" /></span>
          <input {...atributosDe("busca")} value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar por nome ou função…"
            style={{ ...inp, padding: "9px 11px 9px 34px", fontSize: 13.5 }} />
          {buscando && <button onClick={() => setFiltro("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex" }}><Icon name="x" size={14} /></button>}
        </div>
      </div>

      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        {grouped.length === 0 && <p style={{ color: "var(--text-dim)", fontSize: 14 }}>{totalAtribuidos === 0 ? "Nenhuma função atribuída ainda." : "Nada encontrado para esse filtro."}</p>}
        {grouped.map((g) => {
          const aberto = buscando || !colapsados.has(g.key);
          return (
            <div key={g.key} className="glass" style={{ borderRadius: "var(--r-md)", overflow: "hidden" }}>
              <button onClick={() => !buscando && toggle(g.key)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: "transparent", border: "none", cursor: buscando ? "default" : "pointer", color: "var(--text)", textAlign: "left" }}>
                <TrocaIcone ligado={aberto} a="chevron-down" b="chevron-up" size={16} corA="var(--text-dim)" corB="var(--text-dim)" />
                <span style={{ fontSize: 12.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em" }}>{FUNCAO_LABEL[g.key]}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--primary-texto, var(--primary))", background: "color-mix(in srgb,var(--primary) 14%,transparent)", padding: "1px 9px", borderRadius: 999 }}>{g.pessoas.length}</span>
              </button>
              {aberto && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 14px 14px" }}>
                  {g.pessoas.map((p) => (
                    <span key={p.erp_user_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px 5px 5px", borderRadius: 999, fontSize: 13.5, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                      <Avatar foto={p.foto_url} nome={p.nome} />
                      {p.nome}
                      <button onClick={() => remove(p.erp_user_id)} title="Remover" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "flex", padding: "0 2px" }}><Icon name="x" size={13} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Botão admin: cria contas de login (por e-mail) p/ os usuários do ERP, e mostra
// a lista de e-mails de acesso.
interface Conta { name: string; username: string; email: string | null; active: boolean; password_set: boolean; role: string }
function ImportarLogins() {
  const [busy, setBusy] = useState(false);
  // Guarda o resultado como {ok, texto}: o "✓" ficava DENTRO do texto e servia
  // de flag (startsWith) — ícone de UI é <Icon>, e o estado diz o que houve.
  const [res, setRes] = useState<{ ok: boolean; texto: string } | null>(null);
  const [contas, setContas] = useState<Conta[]>([]);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");

  async function load() {
    try { const r = await fetch("/api/colaboradores/import-erp", { cache: "no-store" }); const d = await r.json(); setContas(d.contas ?? []); } catch { /* ok */ }
  }
  useEffect(() => { load(); }, []);

  async function run() {
    if (!(await confirmar("Criar contas de login para todos os usuários ativos?", { detalhe: "Por e-mail, para quem tem @tridixp.com.br. Quem já tem conta é ignorado." }))) return;
    setBusy(true); setRes(null);
    try {
      const r = await fetch("/api/colaboradores/import-erp", { method: "POST" });
      const d = await r.json();
      if (r.ok) setRes({ ok: true, texto: `${d.created} conta(s) criada(s)${d.skipped ? ` · ${d.skipped} já existiam` : ""}` });
      else setRes({ ok: false, texto: d.detail || "Falha ao importar." });
      load();
    } finally { setBusy(false); }
  }

  const comEmail = contas.filter((c) => c.email);
  const filtradas = comEmail.filter((c) => !busca || `${c.name} ${c.email}`.toLowerCase().includes(busca.toLowerCase()));

  return (
    <div style={{ flex: "0 0 auto", maxWidth: 420, width: "100%" }}>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Botao icone="user" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>E-mails de acesso ({comEmail.length})</Botao>
        <Botao variante="primario" icone="users" onClick={run} carregando={busy}>Criar logins por e-mail</Botao>
      </div>
      {res && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, fontSize: 12, color: res.ok ? "var(--ok)" : "var(--perigo)", marginTop: 6 }}>
          <Icon name={res.ok ? "check" : "alert-triangle"} size={13} color={res.ok ? "var(--ok)" : "var(--perigo)"} />
          <span>{res.texto}</span>
        </div>
      )}

      {aberto && (
        <div className="glass" style={{ marginTop: 10, padding: 12, borderRadius: "var(--r-md)", maxHeight: 360, overflowY: "auto" }}>
          <input {...atributosDe("busca")} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou e-mail…"
            style={{ ...inp, marginBottom: 8, padding: "8px 11px" }} />
          {filtradas.length === 0 ? <div style={{ fontSize: 13, color: "var(--text-dim)" }}>Nenhuma conta com e-mail. Clique em &quot;Criar logins&quot;.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {filtradas.map((c) => (
                <div key={c.email} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: "var(--r-xs)", background: "var(--surface)" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.email}</div>
                  </div>
                  {!c.password_set && <span style={{ fontSize: 10, fontWeight: 700, color: "var(--atencao)", flex: "none" }}>1º acesso</span>}
                  <button onClick={() => navigator.clipboard?.writeText(c.email || "")} title="Copiar e-mail" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", flex: "none" }}><Icon name="external-link" size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Avatar({ foto, nome }: { foto: string | null; nome: string }) {
  return <AvatarBase url={foto} nome={nome} size={26} formato="redondo" />;
}

const inp: React.CSSProperties = {
  padding: "11px 13px", borderRadius: "var(--r-sm)", fontSize: 14, width: "100%",
  background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)",
};
