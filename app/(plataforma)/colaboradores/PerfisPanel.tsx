"use client";

import { useEffect, useMemo, useState } from "react";
import { MODULES } from "@/lib/rbac";
import { SEMPRE, SETORES_ANALYTICS } from "@/lib/permissions";
import { DEPARTAMENTOS, perfisDe, defaultTemplate } from "@/lib/colaboradores-taxonomia";
import { GlassSelect } from "../GlassPicker";
import { Icon } from "../Icon";
import { Botao } from "../ui/controles";

interface Template { departamento: string; perfil: string; modulos: string[] }

// Configura o acesso de cada (Departamento · Perfil) uma vez. Todos que recebem o
// perfil herdam automaticamente. Módulos "sempre" (Home, Minhas atividades) ficam fixos.
const MODS = MODULES.filter((m) => !SEMPRE.includes(m.key));

export function PerfisPanel() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [dep, setDep] = useState("");
  const [perfil, setPerfil] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() { fetch("/api/perfis", { cache: "no-store" }).then((r) => r.json()).then((d) => setTemplates(d.templates ?? [])).catch(() => {}); }
  useEffect(() => { load(); }, []);

  const atual = useMemo(() => templates.find((t) => t.departamento === dep && t.perfil === perfil), [templates, dep, perfil]);
  // Sem template salvo, pré-carrega o PADRÃO da taxonomia (admin só ajusta).
  useEffect(() => { setSel(new Set(atual?.modulos ?? defaultTemplate(dep, perfil) ?? [])); }, [atual, dep, perfil]);

  const perfis = perfisDe(dep);
  function toggle(k: string) { setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; }); }

  async function salvar() {
    if (!dep || !perfil) return;
    setBusy(true);
    const r = await fetch("/api/perfis", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ departamento: dep, perfil, modulos: [...sel] }) });
    setBusy(false);
    if (r.ok) { setMsg("Perfil salvo. Quem tem esse perfil já herda."); setTimeout(() => setMsg(null), 3000); load(); }
    else setMsg("Falha ao salvar.");
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800 }}>Perfis & permissões</h2>
      <p style={{ color: "var(--text-dim)", fontSize: 13.5, marginTop: 4, marginBottom: 16 }}>
        Configure o acesso por <strong>Departamento ↓ Perfil</strong> uma vez. Todo colaborador com esse perfil herda — sem marcar checkbox por pessoa.
      </p>

      <div className="glass glass-spec" style={{ padding: 20, borderRadius: "var(--r-md)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <Campo label="Departamento">
            <GlassSelect value={dep} onChange={(v) => { setDep(v); setPerfil(""); }} placeholder="Escolha"
              options={[{ value: "", label: "—" }, ...DEPARTAMENTOS.map((d) => ({ value: d, label: d }))]} />
          </Campo>
          <Campo label="Perfil">
            <GlassSelect value={perfil} onChange={setPerfil} placeholder={dep ? "Escolha" : "Departamento antes"}
              options={[{ value: "", label: "—" }, ...perfis.map((p) => ({ value: p, label: p }))]} />
          </Campo>
        </div>

        {dep && perfil ? (
          <>
            <div style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600, marginBottom: 8 }}>Módulos liberados para {dep} · {perfil}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 8 }}>
              {MODS.map((m) => {
                const on = sel.has(m.key);
                return (
                  <button key={m.key} onClick={() => toggle(m.key)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: "var(--r-sm)", background: "var(--surface)", border: "none", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ width: 20, height: 20, borderRadius: "var(--r-xs)", display: "grid", placeItems: "center", flex: "none", background: on ? "var(--primary)" : "transparent", border: on ? "none" : "1.5px solid var(--border)" }}>
                      {on ? <Icon name="check" size={13} color="#fff" /> : null}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: on ? "var(--text)" : "var(--text-dim)" }}>{m.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Setores do Analytics (visão por setor) */}
            <div style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600, margin: "16px 0 8px" }}>Setores do Analytics <span style={{ opacity: .7, fontWeight: 400 }}>(deixe vazio = vê todos)</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 170px), 1fr))", gap: 8 }}>
              {SETORES_ANALYTICS.map((s) => {
                const on = sel.has(s.key);
                return (
                  <button key={s.key} onClick={() => toggle(s.key)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: "var(--r-sm)", background: "var(--surface)", border: "none", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ width: 20, height: 20, borderRadius: "var(--r-xs)", display: "grid", placeItems: "center", flex: "none", background: on ? "var(--primary)" : "transparent", border: on ? "none" : "1.5px solid var(--border)" }}>
                      {on ? <Icon name="check" size={13} color="#fff" /> : null}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: on ? "var(--text)" : "var(--text-dim)" }}>{s.label}</span>
                  </button>
                );
              })}
            </div>
            {/* Salvar + aviso não cabem lado a lado no celular: o aviso desce. */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
              <Botao variante="primario" onClick={salvar} carregando={busy}>Salvar perfil</Botao>
              {msg && <span style={{ fontSize: 13, color: "var(--ok)" }}>{msg}</span>}
              <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-dim)" }}>Home e Minhas atividades são sempre liberados.</span>
            </div>
          </>
        ) : <p style={{ fontSize: 13.5, color: "var(--text-dim)" }}>Escolha departamento e perfil para configurar.</p>}
      </div>

      {/* Perfis já configurados */}
      {templates.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em", margin: "22px 0 10px" }}>Configurados</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {templates.map((t) => (
              <button key={`${t.departamento}|${t.perfil}`} onClick={() => { setDep(t.departamento); setPerfil(t.perfil); }}
                className="glass glass-spec" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: "var(--r-md)", border: "none", cursor: "pointer", textAlign: "left", color: "var(--text)" }}>
                <strong style={{ fontSize: 14 }}>{t.departamento} · {t.perfil}</strong>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-dim)" }}>{t.modulos.length} módulo(s)</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600 }}>{label}</label><div style={{ marginTop: 5 }}>{children}</div></div>;
}
