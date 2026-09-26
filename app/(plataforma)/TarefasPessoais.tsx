"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Botao, BotaoIcone } from "./ui/controles";
import { GlassDate, GlassSelect } from "./GlassPicker";

interface Solic { id: string; titulo: string }
interface Todo {
  id: string; texto: string; feito: boolean; ordem?: number;
  data?: string | null; prioridade?: string | null; pedido_ref?: string | null; solicitacao_id?: string | null;
  _sync?: "saving" | "error"; // estado otimista (Instagram-like)
}

const fmtData = (d?: string | null) => { if (!d) return null; const [y, m, dd] = d.split("-"); return `${dd}/${m}`; };
function prazoCor(d?: string | null): string {
  if (!d) return "var(--text-dim)";
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dt = new Date(d + "T00:00:00");
  const dias = Math.round((dt.getTime() - hoje.getTime()) / 86400000);
  if (dias < 0) return "var(--perigo)"; if (dias === 0) return "var(--atencao)"; return "var(--text-dim)";
}

export function TarefasPessoais({ titulo = "Minhas tarefas", compact = false }: { titulo?: string; compact?: boolean }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [solics, setSolics] = useState<Solic[]>([]);
  const [loading, setLoading] = useState(true);
  const [novo, setNovo] = useState("");
  const [data, setData] = useState("");
  const [pedido, setPedido] = useState("");
  const [solic, setSolic] = useState("");
  const [maisOpcoes, setMaisOpcoes] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/todos", { cache: "no-store" }).then((r) => r.json()).then((d) => setTodos(d.todos ?? [])).catch(() => {}).finally(() => setLoading(false));
    fetch("/api/central/solicitacoes", { cache: "no-store" }).then((r) => r.json()).then((d) => setSolics((d.solicitacoes ?? []).map((s: { id: string; titulo: string }) => ({ id: s.id, titulo: s.titulo })))).catch(() => {});
  }, []);

  // ── Otimista: aparece na hora; sincroniza em segundo plano; se falhar, marca erro + reenviar.
  async function add() {
    const texto = novo.trim();
    if (!texto) return;
    const tmpId = "tmp-" + Date.now();
    const novoTodo: Todo = { id: tmpId, texto, feito: false, data: data || null, pedido_ref: pedido || null, solicitacao_id: solic || null, _sync: "saving" };
    setTodos((l) => [novoTodo, ...l]);
    setNovo(""); setData(""); setPedido(""); setSolic(""); setMaisOpcoes(false);
    inputRef.current?.focus();
    try {
      const r = await fetch("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto, data: novoTodo.data, pedido_ref: novoTodo.pedido_ref, solicitacao_id: novoTodo.solicitacao_id }) });
      const d = await r.json();
      if (!r.ok || !d.todo) throw new Error();
      setTodos((l) => l.map((t) => (t.id === tmpId ? { ...d.todo } : t)));
    } catch {
      setTodos((l) => l.map((t) => (t.id === tmpId ? { ...t, _sync: "error" } : t)));
    }
  }
  function reenviar(t: Todo) {
    setTodos((l) => l.map((x) => (x.id === t.id ? { ...x, _sync: "saving" } : x)));
    fetch("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: t.texto, data: t.data, pedido_ref: t.pedido_ref, solicitacao_id: t.solicitacao_id }) })
      .then((r) => r.json()).then((d) => { if (d.todo) setTodos((l) => l.map((x) => (x.id === t.id ? { ...d.todo } : x))); else throw new Error(); })
      .catch(() => setTodos((l) => l.map((x) => (x.id === t.id ? { ...x, _sync: "error" } : x))));
  }

  async function toggle(t: Todo) {
    if (t.id.startsWith("tmp-")) return;
    const novoFeito = !t.feito;
    setTodos((l) => l.map((x) => (x.id === t.id ? { ...x, feito: novoFeito } : x)));
    try {
      const r = await fetch("/api/todos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id, feito: novoFeito }) });
      if (!r.ok) throw new Error();
    } catch { setTodos((l) => l.map((x) => (x.id === t.id ? { ...x, feito: !novoFeito } : x))); } // reverte
  }
  async function remover(t: Todo) {
    const antes = todos;
    setTodos((l) => l.filter((x) => x.id !== t.id));
    if (t.id.startsWith("tmp-")) return;
    try { const r = await fetch(`/api/todos?id=${t.id}`, { method: "DELETE" }); if (!r.ok) throw new Error(); }
    catch { setTodos(antes); } // reverte se falhar
  }

  const pendentes = todos.filter((t) => !t.feito).length;
  const ordenadas = [...todos].sort((a, b) => Number(a.feito) - Number(b.feito));

  return (
    <div className="glass glass-spec" style={{ padding: compact ? 16 : 18, borderRadius: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
        <Icon name="checklist" size={17} color="var(--primary-texto)" />
        <h2 style={{ fontSize: 14.5, fontWeight: 800, flex: 1 }}>{titulo}</h2>
        {todos.length > 0 && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{pendentes} pendente{pendentes === 1 ? "" : "s"}</span>}
      </div>

      {/* Adicionar */}
      <div style={{ display: "flex", gap: 8, marginBottom: maisOpcoes ? 8 : 12 }}>
        <input ref={inputRef} value={novo} onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Adicionar tarefa e Enter…"
          style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 12px", color: "var(--text)", fontSize: 14, boxShadow: "none" }} />
        <BotaoIcone icone="calendar" titulo="Prazo, pedido, solicitação" variante="secundario" aria-pressed={maisOpcoes} style={{ flex: "none" }} onClick={() => setMaisOpcoes((v) => !v)} />
        <BotaoIcone icone="plus" titulo="Adicionar tarefa" variante="primario" style={{ flex: "none" }} onClick={add} />
      </div>

      {/* Opções avançadas: prazo + vínculos */}
      {maisOpcoes && (
        <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr 1fr" : "repeat(3, 1fr)", gap: 8, marginBottom: 12 }}>
          <label style={lbl}>Prazo<GlassDate value={data} onChange={setData} placeholder="Sem prazo" style={{ ...inp, marginTop: 4 }} /></label>
          <label style={lbl}>Pedido nº<input value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="#1234" style={inp} /></label>
          <label style={lbl}>Solicitação
            <GlassSelect value={solic} onChange={setSolic} placeholder="—" style={{ marginTop: 4 }}
              options={[{ value: "", label: "—" }, ...solics.map((s) => ({ value: s.id, label: s.titulo.slice(0, 40) }))]} />
          </label>
        </div>
      )}

      {/* Lista */}
      {loading ? <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Carregando…</p>
        : todos.length === 0 ? <p style={{ fontSize: 13, color: "var(--text-dim)", padding: "4px 2px", display: "flex", alignItems: "center", gap: 6 }}><Icon name="edit" size={14} color="var(--text-dim)" /> Nenhuma tarefa. Escreva a primeira acima.</p>
        : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: compact ? 300 : 440, overflowY: "auto" }}>
          {ordenadas.map((t) => {
            const sol = solics.find((s) => s.id === t.solicitacao_id);
            return (
              <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px", borderRadius: 10, opacity: t._sync === "saving" ? 0.6 : 1 }}>
                <button onClick={() => toggle(t)} aria-label="concluir" disabled={!!t._sync} style={{ marginTop: 1, width: 20, height: 20, flex: "none", borderRadius: 6, cursor: t._sync ? "default" : "pointer", display: "grid", placeItems: "center", boxShadow: "none",
                  border: `1.5px solid ${t.feito ? "var(--primary)" : "var(--border)"}`, background: t.feito ? "var(--primary)" : "transparent" }}>
                  {t.feito && <Icon name="check" size={13} color="#fff" />}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 14, color: t.feito ? "var(--text-dim)" : "var(--text)", textDecoration: t.feito ? "line-through" : "none" }}>{t.texto}</span>
                  {/* chips: prazo / pedido / solicitação / status */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: (t.data || t.pedido_ref || sol || t._sync) ? 4 : 0 }}>
                    {t.data && <Chip cor={prazoCor(t.data)} icon="calendar">{fmtData(t.data)}</Chip>}
                    {t.pedido_ref && <Chip cor="var(--primary-texto)" icon="trending-up">{t.pedido_ref}</Chip>}
                    {sol && <Chip cor="var(--atencao)" icon="inbox">{sol.titulo.slice(0, 22)}</Chip>}
                    {t._sync === "saving" && <span style={{ fontSize: 11, color: "var(--text-dim)" }}>enviando…</span>}
                    {t._sync === "error" && <Botao variante="perigo" tamanho="sm" icone="refresh" onClick={() => reenviar(t)}>falhou · reenviar</Botao>}
                  </div>
                </div>
                <BotaoIcone icone="trash" titulo="Remover" tamanho="sm" style={{ flex: "none" }} onClick={() => remover(t)} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Chip({ children, cor, icon }: { children: React.ReactNode; cor: string; icon: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: cor, background: `color-mix(in srgb, ${cor} 12%, transparent)`, padding: "2px 7px", borderRadius: 7 }}><Icon name={icon} size={11} color={cor} /> {children}</span>;
}

const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 600, color: "var(--text-dim)" };
const inp: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 9, padding: "8px 10px", color: "var(--text)", fontSize: 13, boxShadow: "none", width: "100%" };
