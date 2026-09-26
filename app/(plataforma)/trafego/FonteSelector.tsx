"use client";

// ── Tridify · Seletor de fonte dos dados (§1) ────────────────────────────────
// BM (conexão) → Conta de anúncios, persistente e por usuário. Várias BMs/contas
// ao mesmo tempo; escolher uma, várias ou todas; buscar por nome/ID; ver o status
// de sync de cada conexão (ok / token expirando / erro); salvar combinações como
// favoritos. A seleção fica ativa ao navegar entre as abas (o filtro aplica na
// Campanhas Pro; KPIs globais dependem de filtro no backend — próximo passo).

import { tfSet } from "./ajustes-na-conta";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { TrocaIcone, useAbrirFechar } from "../ui/micro";
import { Botao } from "../ui/controles";
interface AdAccountLite { id: string; name: string }
interface ConnectionInfo { id: number; name: string; expiresAt: string | null; accounts: AdAccountLite[]; ok: boolean; error?: string }
interface Favorito { nome: string; contas: string[] }

export const normId = (s: string) => s.replace(/^act_/, "");

function statusDa(c: ConnectionInfo): { cor: string; label: string } {
  if (!c.ok) return { cor: "var(--tf-neg)", label: "erro" };
  if (c.expiresAt) { const dias = (new Date(c.expiresAt).getTime() - Date.now()) / 86400000; if (dias < 7) return { cor: "var(--tf-warn)", label: "token expira" }; }
  return { cor: "var(--tf-pos)", label: "conectado" };
}

export function FonteSelector({ userId, value, onChange }: { userId: string; value: string[]; onChange: (ids: string[]) => void }) {
  const [conns, setConns] = useState<ConnectionInfo[]>([]);
  const [aberto, setAberto] = useState(false);
  // Receita t-dropdown (transitions.dev): abre crescendo do gatilho, fecha
  // mais rápido; antes o painel aparecia e sumia em corte seco.
  const pop = useAbrirFechar(aberto, "--dropdown-close-dur");
  const [q, setQ] = useState("");
  const [favs, setFavs] = useState<Favorito[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const favKey = `trafego.fontes.favoritos.${userId}`;

  useEffect(() => {
    fetch("/api/meta/connections").then((r) => r.json()).then((j) => { if (Array.isArray(j?.connections)) setConns(j.connections); }).catch(() => {});
    try { const s = localStorage.getItem(favKey); if (s) setFavs(JSON.parse(s)); } catch { /* */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora); return () => document.removeEventListener("mousedown", fora);
  }, []);

  const todasContas = useMemo(() => conns.flatMap((c) => c.accounts.map((a) => normId(a.id))), [conns]);
  const sel = new Set(value.map(normId));
  const nSel = sel.size === 0 ? todasContas.length : sel.size;
  const rotulo = sel.size === 0 ? "Todas as contas" : sel.size === 1 ? (conns.flatMap((c) => c.accounts).find((a) => sel.has(normId(a.id)))?.name ?? "1 conta") : `${sel.size} contas`;

  function toggleConta(id: string) {
    const n = normId(id); const novo = new Set(sel);
    if (novo.has(n)) novo.delete(n); else novo.add(n);
    onChange([...novo]);
  }
  function todas() { onChange([]); }
  function toggleBM(c: ConnectionInfo) {
    const ids = c.accounts.map((a) => normId(a.id)); const todosOn = ids.every((i) => sel.has(i));
    const novo = new Set(sel); ids.forEach((i) => (todosOn ? novo.delete(i) : novo.add(i))); onChange([...novo]);
  }
  function salvarFav() {
    const nome = prompt("Nome desta visualização (ex.: Meta principal):"); if (!nome) return;
    const novo = [...favs.filter((f) => f.nome !== nome), { nome, contas: [...sel] }]; setFavs(novo);
    try { tfSet(favKey, JSON.stringify(novo)); } catch { /* */ }
  }
  function removerFav(nome: string) { const novo = favs.filter((f) => f.nome !== nome); setFavs(novo); try { tfSet(favKey, JSON.stringify(novo)); } catch { /* */ } }

  const filtro = q.trim().toLowerCase();
  const connsFiltradas = conns.map((c) => ({ ...c, accounts: c.accounts.filter((a) => !filtro || a.name.toLowerCase().includes(filtro) || normId(a.id).includes(filtro)) })).filter((c) => !filtro || c.accounts.length || c.name.toLowerCase().includes(filtro));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setAberto((v) => !v)} title="Fonte dos dados (BM e contas)"
        style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "8px 13px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", color: "var(--text)", fontSize: 12.5, fontWeight: 700, maxWidth: 260 }}>
        <Icon name="building-warehouse" size={15} color="var(--primary-texto)" />
        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rotulo}</span>
        <span style={{ fontSize: 10.5, color: "var(--text-dim)", fontWeight: 600 }}>{nSel}/{todasContas.length}</span>
        <TrocaIcone ligado={aberto} a="chevron-down" b="chevron-up" size={14} corA="var(--text-dim)" corB="var(--text-dim)" />
      </button>

      {pop.montado && (
        // .gp-pop: no desktop é o mesmo popover ancorado; abaixo de 700px a
        // fundação transforma em folha presa embaixo (os 340px fixos com right:0
        // estouravam a tela de 320px e metade do menu ficava fora).
        <div className={`gp-pop t-dropdown ${pop.classe}`.trim()} data-origin="top-right" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50, width: 340, maxHeight: "70dvh", overflowY: "auto", borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface)", boxShadow: "0 20px 50px -18px rgba(0,0,0,.55)", padding: 12 }}>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }}><Icon name="search" size={13} color="var(--text-dim)" /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar conta por nome ou ID…" style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px 7px 28px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface-2, transparent)", color: "var(--text)", fontSize: 12.5 }} />
          </div>

          {favs.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 5 }}>Favoritos</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {favs.map((f) => (
                  <span key={f.nome} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 9px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-2, transparent)", fontSize: 11.5, fontWeight: 700, color: "var(--text)" }}>
                    <button onClick={() => onChange(f.contas)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "inherit", font: "inherit", padding: 0 }}>{f.nome}</button>
                    <button onClick={() => removerFav(f.nome)} style={{ border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center" }}><Icon name="x" size={11} color="var(--text-dim)" /></button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <button onClick={todas} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 9px", borderRadius: 9, border: "none", cursor: "pointer", background: sel.size === 0 ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "transparent", color: "var(--text)", fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>
            <span style={{ width: 16, height: 16, borderRadius: 5, display: "grid", placeItems: "center", background: sel.size === 0 ? "var(--primary)" : "transparent", border: sel.size === 0 ? "none" : "1.5px solid var(--border)" }}>{sel.size === 0 && <Icon name="check" size={11} color="var(--on-primary)" />}</span>
            Todas as contas
          </button>

          {connsFiltradas.length === 0 && <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "10px 6px" }}>Nenhuma conexão. Conecte uma BM em Contas de anúncio.</div>}
          {connsFiltradas.map((c) => {
            const st = statusDa(c); const ids = c.accounts.map((a) => normId(a.id)); const todosOn = ids.length > 0 && ids.every((i) => sel.has(i));
            return (
              <div key={c.id} style={{ marginTop: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.cor, flex: "none" }} title={st.label} />
                  <button onClick={() => toggleBM(c)} style={{ flex: 1, textAlign: "left", border: "none", background: "transparent", cursor: "pointer", color: "var(--text)", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</button>
                  <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{todosOn ? "tirar todas" : "todas"}</span>
                </div>
                {c.accounts.map((a) => {
                  const on = sel.size === 0 || sel.has(normId(a.id));
                  return (
                    <button key={a.id} onClick={() => toggleConta(a.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 9px 7px 20px", borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", color: "var(--text)", fontSize: 12.5 }}>
                      <span style={{ width: 15, height: 15, borderRadius: 5, flex: "none", display: "grid", placeItems: "center", background: sel.has(normId(a.id)) ? "var(--primary)" : "transparent", border: sel.has(normId(a.id)) ? "none" : "1.5px solid var(--border)", opacity: sel.size === 0 ? 0.5 : 1 }}>{sel.has(normId(a.id)) && <Icon name="check" size={10} color="var(--on-primary)" />}</span>
                      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: on ? "var(--text)" : "var(--text-dim)" }}>{a.name}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}

          {sel.size > 0 && (
            <Botao variante="secundario" bloco icone="star" onClick={salvarFav} style={{ marginTop: 12 }}>Salvar como favorito</Botao>
          )}
        </div>
      )}
    </div>
  );
}
