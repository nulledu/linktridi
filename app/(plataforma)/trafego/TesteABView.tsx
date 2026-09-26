"use client";

// ── Tridify · Teste A/B (smart link divisor) ─────────────────────────────────
// Cria um teste com 2+ variantes (destinos), gera UM link (/ab/<slug>) que
// divide o tráfego e mede: cliques por variante (garantido), vendas automáticas
// (quando a tag chega no checkout on-site) e vendas manuais (fechadas no DM).
// O vencedor você decide olhando os dados.

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { DataList, type Coluna } from "../ui/DataList";
import { toast, confirmar } from "../Toast";
import { fmtBRL2, fmtNum } from "@/lib/format";
import type { Teste, ResultadoTeste, Variante } from "@/lib/trafego-ab";
import { Botao, BotaoIcone } from "../ui/controles";

type VarianteResultado = ResultadoTeste["variantes"][number];

const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
const host = (u: string) => { try { return new URL(u).host; } catch { return u; } };
const novoVid = () => Math.random().toString(36).slice(2, 8);

const inp: React.CSSProperties = { padding: "8px 11px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, boxSizing: "border-box" };
const btnP: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 10, border: "none", background: "var(--primary-acao, var(--primary))", color: "var(--on-primary, #fff)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };
const btnG: React.CSSProperties = { ...btnP, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" };

export function TesteABView() {
  const [testes, setTestes] = useState<Teste[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<null | { id?: string; nome: string; slug: string; slugAuto: boolean; variantes: Variante[] }>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => { setOrigin(window.location.origin); }, []);
  function load() { setCarregando(true); fetch("/api/trafego/ab", { cache: "no-store" }).then((r) => r.json()).then((j) => setTestes(j.testes ?? [])).catch(() => setTestes([])).finally(() => setCarregando(false)); }
  useEffect(load, []);

  function novo() { setForm({ nome: "", slug: "", slugAuto: true, variantes: [{ id: novoVid(), nome: "A", url: "", peso: 1 }, { id: novoVid(), nome: "B", url: "", peso: 1 }] }); }
  function editar(t: Teste) { setForm({ id: t.id, nome: t.nome, slug: t.slug, slugAuto: false, variantes: t.variantes.length ? t.variantes : [{ id: novoVid(), nome: "A", url: "", peso: 1 }] }); }

  async function salvar() {
    if (!form) return;
    const r = await fetch("/api/trafego/ab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: form.id, nome: form.nome, slug: form.slug, variantes: form.variantes }) });
    const j = await r.json();
    if (j.ok) { toast.ok("Teste salvo."); setForm(null); load(); }
    else toast.erro(ERRO[j.error] ?? j.error ?? "Falha ao salvar.");
  }
  async function apagar(t: Teste) { if (!(await confirmar(`Apagar o teste "${t.nome}"?`, { perigo: true }))) return; await fetch(`/api/trafego/ab?id=${t.id}`, { method: "DELETE" }); toast.ok("Teste apagado."); load(); }

  return (
    <div className="tf-scope" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.5 }}>Um link só divide o tráfego entre variantes (ex.: <b>IG DM</b> × <b>TikTok</b>) e mede qual converte mais. Cliques são garantidos; vendas entram automático quando a tag chega num checkout seu, ou você registra a venda do DM na mão.</div>
        </div>
        {!form && <Botao variante="primario" icone="plus" onClick={novo}>Novo teste</Botao>}
      </div>

      {form && <FormTeste form={form} setForm={setForm} onSalvar={salvar} onCancelar={() => setForm(null)} testes={testes} />}

      {carregando ? <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Carregando…</div>
        : testes.length === 0 && !form ? <div className="tf-panel" style={{ padding: 28, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Nenhum teste ainda. Crie um pra começar a dividir o tráfego.</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {testes.map((t) => <TesteCard key={t.id} t={t} origin={origin} onEditar={() => editar(t)} onApagar={() => apagar(t)} onRecarregar={load} />)}
          </div>}
    </div>
  );
}

const ERRO: Record<string, string> = { slug_invalido: "Link inválido (use letras minúsculas, números e hífen).", slug_em_uso: "Esse link já existe — escolha outro.", min_2_variantes: "Precisa de pelo menos 2 variantes com URL.", url_invalida: "As URLs precisam começar com http:// ou https://.", tabela_ausente: "Rode o supabase/trafego_ab.sql no servidor.", nome_obrigatorio: "Dê um nome ao teste." };

// ── Formulário de criar/editar ───────────────────────────────────────────────
function FormTeste({ form, setForm, onSalvar, onCancelar, testes }: { form: NonNullable<ReturnType<typeof useFormState>>; setForm: (f: any) => void; onSalvar: () => void; onCancelar: () => void; testes: Teste[] }) {
  const setNome = (nome: string) => setForm({ ...form, nome, slug: form.slugAuto ? slugify(nome) : form.slug });
  const setVar = (i: number, patch: Partial<Variante>) => setForm({ ...form, variantes: form.variantes.map((v, j) => (j === i ? { ...v, ...patch } : v)) });
  const addVar = () => setForm({ ...form, variantes: [...form.variantes, { id: novoVid(), nome: String.fromCharCode(65 + form.variantes.length), url: "", peso: 1 }] });
  const rmVar = (i: number) => setForm({ ...form, variantes: form.variantes.filter((_, j) => j !== i) });
  const slugDup = testes.some((t) => t.slug === form.slug && t.id !== form.id);

  return (
    <div className="tf-panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13.5, fontWeight: 800 }}>{form.id ? "Editar teste" : "Novo teste A/B"}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)" }}>Nome do teste</span>
          <input value={form.nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Type — design julho" style={inp} />
        </label>
        <label style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)" }}>Link (slug){slugDup && <span style={{ color: "var(--tf-neg)" }}> · já existe</span>}</span>
          <input value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value), slugAuto: false })} placeholder="type-julho" style={{ ...inp, fontFamily: "ui-monospace, monospace", borderColor: slugDup ? "var(--tf-neg)" : "var(--border)" }} />
        </label>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)" }}>Variantes (destinos) — peso define a % do tráfego de cada uma</span>
        {form.variantes.map((v, i) => (
          <div key={v.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input value={v.nome} onChange={(e) => setVar(i, { nome: e.target.value })} placeholder="Nome" style={{ ...inp, width: 90 }} />
            <input value={v.url} onChange={(e) => setVar(i, { url: e.target.value })} placeholder="https://instagram.com/… ou https://tiktok.com/…" style={{ ...inp, flex: "1 1 240px" }} />
            <input value={String(v.peso)} onChange={(e) => setVar(i, { peso: Math.max(0, Number(e.target.value) || 0) })} inputMode="numeric" title="Peso (proporção do tráfego)" style={{ ...inp, width: 64, textAlign: "center" }} />
            {form.variantes.length > 2 && <BotaoIcone icone="x" titulo="Remover" variante="secundario" onClick={() => rmVar(i)} />}
          </div>
        ))}
        <Botao variante="secundario" icone="plus" onClick={addVar} style={{ alignSelf: "flex-start" }}>Variante</Botao>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Botao variante="primario" onClick={onSalvar} disabled={slugDup}>Salvar teste</Botao>
        <Botao variante="secundario" onClick={onCancelar}>Cancelar</Botao>
      </div>
    </div>
  );
}
// só p/ tipar o form sem repetir a shape
function useFormState() { return null as null | { id?: string; nome: string; slug: string; slugAuto: boolean; variantes: Variante[] }; }

// ── Card de um teste + resultados ────────────────────────────────────────────
function TesteCard({ t, origin, onEditar, onApagar, onRecarregar }: { t: Teste; origin: string; onEditar: () => void; onApagar: () => void; onRecarregar: () => void }) {
  const [abertoRes, setAbertoRes] = useState(false);
  const [res, setRes] = useState<ResultadoTeste | null>(null);
  const link = `${origin}/ab/${t.slug}`;

  function verResultados() {
    const novo = !abertoRes; setAbertoRes(novo);
    if (novo) fetch(`/api/trafego/ab?resultados=${t.id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then(setRes).catch(() => {});
  }
  function copiar() { navigator.clipboard?.writeText(link).then(() => toast.ok("Link copiado.")).catch(() => {}); }
  async function marcarVenda(varianteId: string) {
    const r = await fetch("/api/trafego/ab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "conversao", testeId: t.id, varianteId }) });
    if (r.ok) { toast.ok("Venda registrada."); if (abertoRes) fetch(`/api/trafego/ab?resultados=${t.id}`, { cache: "no-store" }).then((x) => x.json()).then(setRes); }
    else toast.erro("Falha ao registrar.");
  }

  const maxCliques = res ? Math.max(1, ...res.variantes.map((v) => v.cliques)) : 1;
  const lider = res && res.total > 0 ? res.variantes.reduce((a, b) => (b.cliques > a.cliques ? b : a)).id : null;

  // UMA definição pros dois desenhos: no computador é a tabela do sistema, no
  // celular cada variante vira cartão com os cliques em destaque ao lado do nome
  // (é o número que decide o teste) e o "Registrar venda" no rodapé, ao alcance
  // do polegar — antes o cartão era uma marcação paralela que só repetia isto.
  const colunas: Coluna<VarianteResultado>[] = [
    {
      chave: "variante", titulo: "Variante", papel: "titulo", ordenar: (v) => v.nome,
      render: (v) => (
        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          {v.id === lider && <Icon name="trophy" size={13} color="var(--tf-warn)" />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: "var(--text)" }}>{v.nome}</div>
            <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{host(v.url)}</div>
          </div>
        </div>
      ),
    },
    {
      chave: "cliques", titulo: "Cliques", papel: "destaque", alinhar: "right", ordenar: (v) => v.cliques,
      render: (v) => (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
            <span className="tf-num" style={{ fontWeight: 800, color: "var(--text)" }}>{fmtNum(v.cliques)}</span>
            <span style={{ width: 60, height: 6, borderRadius: 4, background: "var(--surface-2)", overflow: "hidden", flex: "none" }}><span style={{ display: "block", height: "100%", width: `${(v.cliques / maxCliques) * 100}%`, background: "var(--primary)" }} /></span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-dim)" }}>{fmtNum(v.visitantes)} únicos</div>
        </div>
      ),
    },
    { chave: "pct", titulo: "% tráfego", alinhar: "right", ordenar: (v) => v.pctCliques, render: (v) => <>{v.pctCliques.toFixed(0)}%</> },
    {
      chave: "auto", titulo: "Vendas (auto)", alinhar: "right", ordenar: (v) => v.vendasUtm,
      render: (v) => <span style={{ color: v.vendasUtm ? "var(--tf-pos)" : "var(--text-dim)" }}>{v.vendasUtm || "—"}</span>,
    },
    {
      chave: "manual", titulo: "Vendas (manual)", alinhar: "right", ordenar: (v) => v.vendasManuais,
      render: (v) => (
        <div>
          <span className="tf-num" style={{ fontWeight: 700, color: v.vendasManuais ? "var(--tf-pos)" : "var(--text-dim)" }}>{v.vendasManuais || "—"}</span>
          {v.receitaManual > 0 && <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{fmtBRL2(v.receitaManual)}</div>}
        </div>
      ),
    },
    {
      chave: "acao", titulo: "Ações", papel: "acoes", alinhar: "right",
      render: (v) => (
        <Botao variante="secundario" tamanho="sm" icone="plus" onClick={() => marcarVenda(v.id)} title="Registrar uma venda desta variante (ex.: fechada no DM)" style={{ whiteSpace: "nowrap" }}>Registrar venda</Botao>
      ),
    },
  ];

  return (
    <div className="tf-panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{t.nome}{!t.ativo && <span style={{ fontSize: 11, fontWeight: 700, color: "var(--tf-warn)", marginLeft: 8 }}>pausado</span>}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{t.variantes.length} variantes</div>
        </div>
        <Botao variante="secundario" icone={abertoRes ? "chevron-down" : "chart-line"} onClick={verResultados}>Resultados</Botao>
        <BotaoIcone icone="settings" titulo="Editar" variante="secundario" onClick={onEditar} />
        <BotaoIcone icone="x" titulo="Apagar" variante="perigo" onClick={onApagar} />
      </div>

      {/* Link divisor */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, background: "var(--surface-2)", flexWrap: "wrap" }}>
        <Icon name="link" size={15} color="var(--primary-texto)" />
        <span style={{ flex: 1, minWidth: 0, fontFamily: "ui-monospace, monospace", fontSize: 12.5, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link}</span>
        <Botao variante="secundario" tamanho="sm" icone="copy" onClick={copiar}>Copiar</Botao>
        <a href={link} target="_blank" rel="noreferrer" style={{ ...btnG, padding: "6px 11px", fontSize: 12, textDecoration: "none" }}><Icon name="external-link" size={13} color="var(--text)" /> Abrir</a>
      </div>

      {abertoRes && (
        !res ? <div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Carregando resultados…</div>
        : res.semTabela ? <div style={{ fontSize: 12.5, color: "var(--tf-warn)" }}>Rode o supabase/trafego_ab.sql no servidor pra registrar cliques.</div>
        : (
          <div>
            <DataList itens={res.variantes} colunas={colunas} chaveDe={(v) => v.id} minWidth={560} densa
              rotulo={`Resultados do teste ${t.nome}`} vazio="Nenhuma variante neste teste." />
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>Troféu = líder em cliques. Você decide o vencedor olhando cliques × vendas. "Vendas (auto)" só conta quando a tag da variante chega num checkout seu.</div>
          </div>
        )
      )}
    </div>
  );
}
