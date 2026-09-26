"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Atividade } from "@/lib/atividades-catalog";
import { uploadFotoComprimida } from "@/lib/img";
import { Icon } from "../(plataforma)/Icon";
import { GaiusMark } from "../GaiusMark";

type Tab = "atividades" | "metricas" | "insumos";

function saudacao() { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; }

export function AppClient({ nome, atividades: inicial }: { nome: string; atividades: Atividade[] }) {
  const [tab, setTab] = useState<Tab>("atividades");
  const [lista, setLista] = useState<Atividade[]>(inicial);

  async function recarregar() {
    try {
      const r = await fetch("/api/atividades?mine=1", { cache: "no-store" });
      const d = await r.json();
      if (Array.isArray(d.atividades)) setLista(d.atividades);
    } catch { /* mantém */ }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setLista((l) => l.map((a) => (a.id === id ? { ...a, ...body } as Atividade : a)));
    await fetch("/api/atividades", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    recarregar();
  }

  const pendentes = lista.filter((a) => a.status !== "concluida").length;

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "14px 14px 96px", color: "var(--text)" }}>
      {/* Header */}
      <header className="glass glass-spec" style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 16px", borderRadius: 20, marginBottom: 16 }}>
        <GaiusMark size={40} style={{ flex: "none" }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 600 }}>{saudacao()},</div>
          <div style={{ fontSize: 20, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nome}</div>
        </div>
        {tab === "atividades" && pendentes > 0 && (
          <div style={{ textAlign: "center", flex: "none" }}>
            <div className="stat" style={{ fontSize: 26, color: "var(--primary-texto, var(--primary))" }}>{pendentes}</div>
            <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600 }}>a fazer</div>
          </div>
        )}
      </header>

      {tab === "atividades" && <Atividades lista={lista} patch={patch} />}
      {tab === "metricas" && <Metricas lista={lista} />}
      {tab === "insumos" && <Insumos />}

      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}

// ── Atividades ───────────────────────────────────────────────────────────────
function Atividades({ lista, patch }: { lista: Atividade[]; patch: (id: string, b: Record<string, unknown>) => void }) {
  const ativas = lista.filter((a) => a.status !== "concluida");
  const feitas = lista.filter((a) => a.status === "concluida");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {ativas.length === 0 && feitas.length === 0 && (
        <div className="glass" style={{ padding: 36, borderRadius: 20, textAlign: "center" }}>
          <div style={{ marginBottom: 6, display: "flex", justifyContent: "center" }}><Icon name="confetti" size={40} color="var(--text-dim)" /></div>
          <div style={{ color: "var(--text-dim)", fontSize: 15 }}>Nenhuma atividade atribuída.</div>
        </div>
      )}
      {ativas.length > 0 && <SectionLabel>Para fazer · {ativas.length}</SectionLabel>}
      {ativas.map((a) => <Card key={a.id} a={a} patch={patch} />)}
      {feitas.length > 0 && (
        <>
          <SectionLabel>Concluídas hoje · {feitas.length}</SectionLabel>
          {feitas.map((a) => <Card key={a.id} a={a} patch={patch} />)}
        </>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em", margin: "6px 2px 0" }}>{children}</div>;
}

function Card({ a, patch }: { a: Atividade; patch: (id: string, b: Record<string, unknown>) => void }) {
  const [busy, setBusy] = useState(false);
  const [qtd, setQtd] = useState<number>(a.quantidade_alvo || 1);
  const fileRef = useRef<HTMLInputElement>(null);
  const emAndamento = a.status === "em_andamento";
  const concluida = a.status === "concluida";
  const cor = concluida ? "var(--ok)" : emAndamento ? "var(--primary-texto)" : "var(--atencao)";

  function iniciar() { patch(a.id, { status: "em_andamento", iniciada_at: a.iniciada_at || new Date().toISOString() }); }
  async function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadFotoComprimida(file);
      patch(a.id, { status: "concluida", quantidade_feita: qtd, foto_url: url });
    } finally { setBusy(false); }
  }

  return (
    <div className="glass glass-spec" style={{ padding: 16, borderRadius: 20, borderLeft: `4px solid ${cor}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "inline-block", fontSize: 10.5, fontWeight: 800, color: cor, background: `color-mix(in srgb, ${cor} 15%, transparent)`, padding: "2px 9px", borderRadius: 999, textTransform: "uppercase", letterSpacing: ".04em" }}>{a.categoria}</span>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6 }}>{a.tarefa}</div>
          {a.detalhe && <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}>{a.detalhe}</div>}
          {a.quantidade_alvo > 1 && <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 4 }}>Meta: <strong style={{ color: "var(--text)" }}>{a.quantidade_alvo}</strong> un</div>}
        </div>
        {emAndamento && <Timer iniciada={a.iniciada_at} estimado={a.tempo_estimado_min} />}
        {concluida && <Icon name="circle-check" size={28} color="var(--ok)" />}
      </div>

      {concluida ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          {a.foto_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.foto_url} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 12, flex: "none" }} />
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13.5, color: "var(--ok)", fontWeight: 700 }}><Icon name="circle-check" size={15} color="currentColor" /> {a.quantidade_feita || a.quantidade_alvo || 1} produzido(s)</div>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          {a.status === "pendente" ? (
            <button onClick={iniciar} style={{ width: "100%", padding: "16px 0", borderRadius: 14, background: "var(--primary-acao, var(--primary))", color: "var(--on-primary, #fff)", border: "none", fontWeight: 800, fontSize: 16, cursor: "pointer" }}>▶ Iniciar</button>
          ) : (
            <>
              {/* Stepper de quantidade */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 12 }}>
                <StepBtn onClick={() => setQtd((q) => Math.max(1, q - 1))}>−</StepBtn>
                <div style={{ textAlign: "center", minWidth: 70 }}>
                  <div className="stat" style={{ fontSize: 30 }}>{qtd}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>quantidade feita</div>
                </div>
                <StepBtn onClick={() => setQtd((q) => q + 1)}>+</StepBtn>
              </div>
              <button onClick={() => fileRef.current?.click()} disabled={busy}
                style={{ width: "100%", padding: "16px 0", borderRadius: 14, background: "var(--ok)", color: "#06270f", border: "none", fontWeight: 800, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: busy ? 0.6 : 1 }}>
                <Icon name="circle-check" size={20} color="#06270f" /> {busy ? "Enviando…" : "Concluir com foto"}
              </button>
              <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 8, textAlign: "center" }}>Ajuste a quantidade e tire uma foto do que você fez.</div>
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFoto} style={{ display: "none" }} />
        </div>
      )}
    </div>
  );
}

function StepBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ width: 52, height: 52, borderRadius: 14, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 26, fontWeight: 700, cursor: "pointer", flex: "none" }}>{children}</button>;
}

function Timer({ iniciada, estimado }: { iniciada: string | null; estimado: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  if (!iniciada) return null;
  const sec = Math.max(0, Math.floor((now - Date.parse(iniciada)) / 1000));
  const mm = Math.floor(sec / 60), ss = sec % 60;
  const estourou = estimado != null && sec > estimado * 60;
  return (
    <div style={{ textAlign: "right", flex: "none" }}>
      <div className="stat" style={{ fontSize: 22, color: estourou ? "var(--perigo)" : "var(--primary-texto)", fontVariantNumeric: "tabular-nums" }}>{mm}:{String(ss).padStart(2, "0")}</div>
      {estimado != null && <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>meta {estimado}min</div>}
    </div>
  );
}

// ── Métricas ─────────────────────────────────────────────────────────────────
function Metricas({ lista }: { lista: Atividade[] }) {
  const m = useMemo(() => {
    let feito = 0, concl = 0, andamento = 0, pend = 0, tempoMin = 0;
    for (const a of lista) {
      feito += a.quantidade_feita || 0;
      if (a.status === "concluida") { concl++; if (a.iniciada_at && a.concluida_at) tempoMin += Math.max(0, Math.round((Date.parse(a.concluida_at) - Date.parse(a.iniciada_at)) / 60000)); }
      else if (a.status === "em_andamento") andamento++; else pend++;
    }
    return { feito, concl, andamento, pend, tempoMin };
  }, [lista]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <Stat label="Itens produzidos" value={String(m.feito)} cor="var(--primary-texto)" />
      <Stat label="Concluídas" value={String(m.concl)} cor="var(--ok)" />
      <Stat label="Em andamento" value={String(m.andamento)} cor="var(--atencao)" />
      <Stat label="Pendentes" value={String(m.pend)} cor="var(--text-dim)" />
      <div style={{ gridColumn: "1 / -1" }}><Stat label="Tempo trabalhado (concluídas)" value={`${m.tempoMin} min`} cor="var(--info)" /></div>
    </div>
  );
}
function Stat({ label, value, cor }: { label: string; value: string; cor: string }) {
  return (
    <div className="glass glass-spec" style={{ padding: 18, borderRadius: 18 }}>
      <div className="stat" style={{ fontSize: 34, color: cor }}>{value}</div>
      <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ── Insumos (pedir item do catálogo — só componentes-peças e peças) ──────────
interface Pedido { id: string; produto_nome: string; quantidade: number; observacao: string | null; status: string; created_at: string }
interface ItemCat { nome: string; categoria: string | null; tipo: string }

function Insumos() {
  const [itens, setItens] = useState<ItemCat[]>([]);
  const [sel, setSel] = useState("");
  const [qtd, setQtd] = useState(1);
  const [obs, setObs] = useState("");
  const [busca, setBusca] = useState("");
  const [busy, setBusy] = useState(false);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);

  async function carregar() {
    const [rp, ri] = await Promise.all([
      fetch("/api/insumos", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/insumos/itens", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
    ]);
    if (Array.isArray(rp.pedidos)) setPedidos(rp.pedidos);
    if (Array.isArray(ri.itens)) setItens(ri.itens);
  }
  useEffect(() => { carregar(); }, []);

  async function pedir() {
    if (!sel.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/insumos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ produto_nome: sel, quantidade: qtd, observacao: obs }) });
      if (r.ok) { setSel(""); setQtd(1); setObs(""); setBusca(""); carregar(); }
    } finally { setBusy(false); }
  }
  async function cancelar(id: string) {
    setPedidos((p) => p.filter((x) => x.id !== id));
    await fetch(`/api/insumos?id=${id}`, { method: "DELETE" });
  }

  const filtrados = busca.trim() ? itens.filter((i) => `${i.nome} ${i.categoria ?? ""}`.toLowerCase().includes(busca.trim().toLowerCase())) : itens;
  const inp: React.CSSProperties = { width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "13px 14px", color: "var(--text)", fontSize: 15 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="glass glass-spec" style={{ padding: 16, borderRadius: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Pedir item</div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 12 }}>Só componentes-peças e peças liberados.</div>

        {sel ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, background: "color-mix(in srgb, var(--primary) 14%, transparent)", marginBottom: 12 }}>
            <strong style={{ flex: 1, fontSize: 15 }}>{sel}</strong>
            <button onClick={() => setSel("")} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", display: "flex" }}><Icon name="x" size={18} /></button>
          </div>
        ) : (
          <>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar item…" style={inp} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10, maxHeight: 220, overflowY: "auto" }}>
              {filtrados.length === 0 && <div style={{ fontSize: 13, color: "var(--text-dim)", padding: 8 }}>Nenhum item disponível para pedir.</div>}
              {filtrados.slice(0, 60).map((i) => (
                <button key={i.nome} onClick={() => setSel(i.nome)}
                  style={{ fontSize: 13, padding: "9px 13px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", cursor: "pointer" }}>{i.nome}</button>
              ))}
            </div>
          </>
        )}

        {sel && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, margin: "4px 0 12px" }}>
              <StepBtn onClick={() => setQtd((q) => Math.max(1, q - 1))}>−</StepBtn>
              <div style={{ textAlign: "center", minWidth: 70 }}>
                <div className="stat" style={{ fontSize: 30 }}>{qtd}</div>
                <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>quantidade</div>
              </div>
              <StepBtn onClick={() => setQtd((q) => q + 1)}>+</StepBtn>
            </div>
            <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação (opcional)" style={inp} />
            <button onClick={pedir} disabled={busy} style={{ width: "100%", marginTop: 12, padding: "16px 0", borderRadius: 14, background: "var(--primary-acao, var(--primary))", color: "var(--on-primary, #fff)", border: "none", fontWeight: 800, fontSize: 16, cursor: "pointer", opacity: busy ? 0.5 : 1 }}>{busy ? "Enviando…" : "Pedir"}</button>
          </>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {pedidos.length === 0 && <div style={{ fontSize: 13, color: "var(--text-dim)", textAlign: "center", padding: 12 }}>Nenhum pedido ainda.</div>}
        {pedidos.map((p) => (
          <div key={p.id} className="glass" style={{ padding: "12px 14px", borderRadius: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{p.quantidade}× {p.produto_nome}</div>
              {p.observacao && <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{p.observacao}</div>}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, color: p.status === "atendido" ? "var(--ok)" : p.status === "cancelado" ? "var(--perigo)" : "var(--atencao)", background: "var(--surface)" }}>{p.status}</span>
            {p.status === "aberto" && <button onClick={() => cancelar(p.id)} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", display: "flex" }}><Icon name="trash" size={16} /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bottom nav ───────────────────────────────────────────────────────────────
function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: [Tab, string, string][] = [["atividades", "Atividades", "checklist"], ["metricas", "Métricas", "chart-line"], ["insumos", "Insumos", "package-import"]];
  return (
    <nav className="glass" style={{ position: "fixed", left: 12, right: 12, bottom: 12, maxWidth: 536, margin: "0 auto", borderRadius: 22, padding: 6, display: "flex", gap: 4, zIndex: 30 }}>
      {items.map(([k, lbl, ic]) => {
        const on = tab === k;
        return (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "11px 0", borderRadius: 16, border: "none", cursor: "pointer", background: on ? "color-mix(in srgb, var(--primary) 20%, transparent)" : "transparent", color: on ? "var(--primary-texto)" : "var(--text-dim)", fontSize: 11.5, fontWeight: 700, transition: "background .15s ease" }}>
            <Icon name={ic} size={23} color={on ? "var(--primary-texto)" : "var(--text-dim)"} /> {lbl}
          </button>
        );
      })}
    </nav>
  );
}
