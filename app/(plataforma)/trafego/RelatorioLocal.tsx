"use client";

// ── Relatório hierárquico (campanha → conjunto → anúncio) ───────────────────
// Lê o WAREHOUSE LOCAL (/api/trafego/relatorio). Não chama a Meta: abre na hora.
// Colunas escolhíveis, métricas por fórmula, filtros e layouts salvos.
import { tfSet } from "./ajustes-na-conta";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtualizacao } from "./atualizacao";
import { Icon } from "../Icon";
import { GlassSelect } from "../GlassPicker";
import { periodQuery, type PeriodState } from "../PeriodPicker";
import { useBuscaAtual } from "../ui/useBuscaAtual";
import { compilarFormula } from "@/lib/formula";
import { drenarSync, useSyncWarehouse } from "./useSyncWarehouse";
import { TrocaIcone } from "../ui/micro";

import { FunilForma, pctFunil } from "../ui/funil";
import { Botao, BotaoIcone } from "../ui/controles";

interface Linha {
  id: string; nome: string;
  spend: number; impressions: number; clicks: number;
  purchases: number; revenue: number; leads: number;
  roas: number | null; cpa: number | null; cpc: number | null; cpm: number; ctr: number; ticket: number | null;
  filhos?: Linha[];
}
interface FunilLocal {
  impressions: number; clicks: number; lpv: number; addCart: number; checkout: number; purchases: number;
}
interface Resp {
  linhas?: Linha[]; periodLabel?: string; ultimaSync?: string | null;
  contasComErro?: number; semWarehouse?: boolean; funil?: FunilLocal | null;
  totais?: { spend: number; purchaseValueMeta: number; purchasesMeta: number; clicks: number; impressions: number };
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const pct = (n: number) => `${n.toFixed(2)}%`;

// ── Colunas ─────────────────────────────────────────────────────────────────
// Cada coluna sabe extrair seu valor numérico (pra ordenar e filtrar) e
// formatá-lo. Métricas por fórmula viram colunas com a mesma interface.
interface Col { key: string; label: string; valor: (l: Linha) => number | null; fmt: (v: number | null) => string; dim?: boolean; custom?: boolean }

const BASE: Col[] = [
  { key: "spend", label: "Investido", valor: (l) => l.spend, fmt: (v) => brl(v ?? 0) },
  { key: "revenue", label: "Receita", valor: (l) => l.revenue, fmt: (v) => brl(v ?? 0) },
  { key: "roas", label: "ROAS", valor: (l) => l.roas, fmt: (v) => (v == null ? "—" : `${v.toFixed(2)}×`) },
  { key: "purchases", label: "Vendas", valor: (l) => l.purchases, fmt: (v) => num(v ?? 0) },
  { key: "cpa", label: "CPA", valor: (l) => l.cpa, fmt: (v) => (v == null ? "—" : brl(v)) },
  { key: "ticket", label: "Ticket", valor: (l) => l.ticket, fmt: (v) => (v == null ? "—" : brl(v)), dim: true },
  { key: "clicks", label: "Cliques", valor: (l) => l.clicks, fmt: (v) => num(v ?? 0), dim: true },
  { key: "ctr", label: "CTR", valor: (l) => l.ctr, fmt: (v) => pct(v ?? 0), dim: true },
  { key: "cpc", label: "CPC", valor: (l) => l.cpc, fmt: (v) => (v == null ? "—" : brl(v)), dim: true },
  { key: "cpm", label: "CPM", valor: (l) => l.cpm, fmt: (v) => brl(v ?? 0), dim: true },
  { key: "impressions", label: "Impressões", valor: (l) => l.impressions, fmt: (v) => num(v ?? 0), dim: true },
  { key: "leads", label: "Leads", valor: (l) => l.leads, fmt: (v) => num(v ?? 0), dim: true },
];
const PADRAO = ["spend", "revenue", "roas", "purchases", "cpa", "ctr"];

// Variáveis que o usuário pode usar numa fórmula (o que existe em cada linha).
const VARIAVEIS = ["spend", "revenue", "purchases", "clicks", "impressions", "leads"];

type TipoFmt = "moeda" | "numero" | "percentual" | "multiplicador";
interface Metrica { id: string; nome: string; formula: string; tipo: TipoFmt }
const fmtPorTipo: Record<TipoFmt, (v: number | null) => string> = {
  moeda: (v) => (v == null ? "—" : brl(v)),
  numero: (v) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })),
  percentual: (v) => (v == null ? "—" : pct(v)),
  multiplicador: (v) => (v == null ? "—" : `${v.toFixed(2)}×`),
};

interface Filtro { id: string; col: string; op: ">" | "<"; valor: number }
interface Layout { nome: string; cols: string[]; ordem: string; filtros: Filtro[]; busca: string }

const novoId = () => Math.random().toString(36).slice(2, 9);
function ler<T>(chave: string, padrao: T): T {
  try { const s = localStorage.getItem(chave); return s ? (JSON.parse(s) as T) : padrao; } catch { return padrao; }
}
function gravar(chave: string, v: unknown) {
  try { tfSet(chave, JSON.stringify(v)); } catch { /* quota/privado: só não persiste */ }
}

// ── Funil do período (banco local) ──────────────────────────────────────────
// Cada etapa mostra o volume e a conversão em relação à etapa ANTERIOR — é
// onde o vazamento aparece.
function FaixaFunil({ f }: { f: FunilLocal }) {
  const etapas = [
    { nome: "Impressões", v: f.impressions },
    { nome: "Cliques", v: f.clicks },
    { nome: "Página", v: f.lpv },
    { nome: "Carrinho", v: f.addCart },
    { nome: "Checkout", v: f.checkout },
    { nome: "Compras", v: f.purchases },
  ].filter((e) => e.v > 0);
  if (etapas.length < 2) return null;
  return (
    <div className="glass" style={{ borderRadius: 14, padding: 14 }}>
      <FunilForma rotulo="Funil do período" formatar={num} etapas={etapas.map((e, i) => {
        const ant = i === 0 ? null : etapas[i - 1].v;
        const conv = ant ? (e.v / ant) * 100 : null;
        return { chave: e.nome, nome: e.nome, valor: e.v, taxa: conv == null ? undefined : pctFunil(conv) };
      })} />
    </div>
  );
}

const campo: React.CSSProperties = {
  padding: "7px 9px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--surface)", color: "var(--text)", fontSize: 12.5, width: "100%",
};

// ── Editor de métrica por fórmula ───────────────────────────────────────────
function EditorMetrica({ inicial, onSalvar, onCancelar }: { inicial?: Metrica; onSalvar: (m: Metrica) => void; onCancelar: () => void }) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [formula, setFormula] = useState(inicial?.formula ?? "");
  const [tipo, setTipo] = useState<TipoFmt>(inicial?.tipo ?? "numero");

  // Valida enquanto digita: fórmula quebrada ou variável inexistente não salva.
  const compilada = useMemo(() => (formula.trim() ? compilarFormula(formula) : null), [formula]);
  const desconhecidas = compilada ? compilada.variaveis.filter((v) => !VARIAVEIS.includes(v)) : [];
  const erro = !formula.trim() ? null
    : !compilada ? "Expressão inválida."
    : desconhecidas.length ? `Não existe: ${desconhecidas.join(", ")}.`
    : null;
  const podeSalvar = !!nome.trim() && !!compilada && !erro;

  // Prévia com números redondos: mostra o que a fórmula faz antes de salvar.
  const previa = useMemo(() => {
    if (!compilada || erro) return null;
    const v = compilada.calcular({ spend: 100, revenue: 400, purchases: 8, clicks: 50, impressions: 2000, leads: 10 });
    return fmtPorTipo[tipo](v);
  }, [compilada, erro, tipo]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome da métrica (ex.: Lucro)" style={campo} />
      <div>
        <input value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="revenue - spend"
          style={{ ...campo, fontFamily: "ui-monospace, monospace", borderColor: erro ? "var(--perigo)" : "var(--border)" }} />
        <div style={{ fontSize: 11, color: erro ? "var(--perigo)" : "var(--text-dim)", marginTop: 4, lineHeight: 1.5 }}>
          {erro ?? <>Use <code>+ - * / ( )</code> com: {VARIAVEIS.join(", ")}.</>}
        </div>
      </div>
      <GlassSelect value={tipo} onChange={(v) => setTipo(v as TipoFmt)} style={campo}
          options={[
            { value: "numero", label: "Número" },
            { value: "moeda", label: "Moeda (R$)" },
            { value: "percentual", label: "Percentual (%)" },
            { value: "multiplicador", label: "Multiplicador (×)" },
          ]} />
      {previa && (
        <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
          Com R$100 investido e R$400 de receita: <strong style={{ color: "var(--text)" }}>{previa}</strong>
        </div>
      )}
      <div style={{ display: "flex", gap: 7 }}>
        <Botao variante="primario" disabled={!podeSalvar}
          onClick={() => onSalvar({ id: inicial?.id ?? novoId(), nome: nome.trim(), formula: formula.trim(), tipo })}>
          Salvar métrica
        </Botao>
        <Botao variante="secundario" onClick={onCancelar}>Cancelar</Botao>
      </div>
    </div>
  );
}

export function RelatorioLocal({ period, accounts, userId }: { period: PeriodState; accounts: string[]; userId: string }) {
  const [d, setD] = useState<Resp | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [cols, setCols] = useState<string[]>(PADRAO);
  const [painel, setPainel] = useState<"" | "colunas" | "filtros" | "layouts">("");
  const [ordem, setOrdem] = useState("spend");
  const [metricas, setMetricas] = useState<Metrica[]>([]);
  const [editandoMetrica, setEditandoMetrica] = useState<Metrica | "nova" | null>(null);
  const [filtros, setFiltros] = useState<Filtro[]>([]);
  const [busca, setBusca] = useState("");
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [nomeLayout, setNomeLayout] = useState("");
  const acctKey = accounts.join(",");

  const kM = `trafego.rel.metricas.${userId}`;
  const kL = `trafego.rel.layouts.${userId}`;
  const kC = `trafego.rel.cols.${userId}`;

  // Preferências do usuário (métricas, layouts, colunas) sobrevivem ao F5.
  useEffect(() => {
    setMetricas(ler<Metrica[]>(kM, []));
    setLayouts(ler<Layout[]>(kL, []));
    setCols(ler<string[]>(kC, PADRAO));
  }, [kM, kL, kC]);

  const buscaAtual = useBuscaAtual();
  const carregar = useCallback(() => {
    if (period.key === "custom" && (!period.from || !period.to)) return;
    setCarregando(true);
    // Resposta atrasada de outro período não sobrescreve a busca nova.
    const souAtual = buscaAtual();
    const acc = acctKey ? `&accounts=${encodeURIComponent(acctKey)}` : "";
    fetch(`/api/trafego/relatorio?${periodQuery(period)}${acc}`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (souAtual()) setD(j); }).catch(() => { if (souAtual()) setD(null); }).finally(() => { if (souAtual()) setCarregando(false); });
  }, [period, acctKey, buscaAtual]);

  useEffect(() => { carregar(); }, [carregar]);
  // Segue o botão "Atualizar" da Tridify (ver `atualizacao.ts`).
  useAtualizacao(carregar);

  // Dreno compartilhado (mesmo estado de módulo do cabeçalho da Tridify):
  // dois consumidores NÃO disparam dois drenos.
  const dreno = useSyncWarehouse();

  // "Sincronizar agora": botão explícito pra quando o relatório está vazio —
  // abre uma rodada NOVA do dreno (ignora o throttle do automático; é o mesmo
  // laço do cabeçalho, então o selo mostra o progresso) e recarrega.
  const [sincronizando, setSincronizando] = useState(false);
  const sincronizarAgora = useCallback(async () => {
    setSincronizando(true);
    try { await drenarSync(); } catch { /* rede: só não sincroniza */ }
    setSincronizando(false);
    carregar();
  }, [carregar]);

  const mudarCols = (f: (p: string[]) => string[]) => setCols((p) => { const n = f(p); gravar(kC, n); return n; });

  // Métricas viram colunas de verdade: compiladas UMA vez, não por linha.
  const colsCustom: Col[] = useMemo(() => metricas.map((m) => {
    const f = compilarFormula(m.formula);
    return {
      key: `f:${m.id}`, label: m.nome, custom: true,
      valor: (l: Linha) => (f ? f.calcular(l as unknown as Record<string, number>) : null),
      fmt: fmtPorTipo[m.tipo],
    };
  }), [metricas]);

  const todasCols = useMemo(() => [...BASE, ...colsCustom], [colsCustom]);
  const visiveis = useMemo(() => todasCols.filter((c) => cols.includes(c.key)), [todasCols, cols]);
  const colDe = (key: string) => todasCols.find((c) => c.key === key);

  const salvarMetrica = (m: Metrica) => {
    setMetricas((p) => {
      const n = p.some((x) => x.id === m.id) ? p.map((x) => (x.id === m.id ? m : x)) : [...p, m];
      gravar(kM, n); return n;
    });
    mudarCols((p) => (p.includes(`f:${m.id}`) ? p : [...p, `f:${m.id}`]));
    setEditandoMetrica(null);
  };
  const apagarMetrica = (id: string) => {
    setMetricas((p) => { const n = p.filter((x) => x.id !== id); gravar(kM, n); return n; });
    mudarCols((p) => p.filter((k) => k !== `f:${id}`));
    if (ordem === `f:${id}`) setOrdem("spend");
    setFiltros((p) => p.filter((f) => f.col !== `f:${id}`));
  };

  const salvarLayout = () => {
    const nome = nomeLayout.trim();
    if (!nome) return;
    setLayouts((p) => {
      const novo: Layout = { nome, cols, ordem, filtros, busca };
      const n = p.some((l) => l.nome === nome) ? p.map((l) => (l.nome === nome ? novo : l)) : [...p, novo];
      gravar(kL, n); return n;
    });
    setNomeLayout("");
  };
  const aplicarLayout = (l: Layout) => {
    mudarCols(() => l.cols); setOrdem(l.ordem); setFiltros(l.filtros ?? []); setBusca(l.busca ?? "");
    setPainel("");
  };
  const apagarLayout = (nome: string) =>
    setLayouts((p) => { const n = p.filter((l) => l.nome !== nome); gravar(kL, n); return n; });

  // Filtro + ordenação: uma linha fica se ela casa OU se algum filho casa
  // (senão sumiria a campanha inteira por causa de um anúncio fraco).
  const passa = (l: Linha): boolean => {
    if (busca.trim() && !l.nome.toLowerCase().includes(busca.trim().toLowerCase())) return false;
    return filtros.every((f) => {
      const c = colDe(f.col);
      if (!c) return true;
      const v = c.valor(l);
      if (v == null) return false;                       // indefinido não passa em comparação
      return f.op === ">" ? v > f.valor : v < f.valor;
    });
  };
  const podar = (arr: Linha[]): Linha[] =>
    arr.map((l): Linha | null => {
      const filhos = l.filhos ? podar(l.filhos) : undefined;
      if (passa(l) || filhos?.length) return { ...l, filhos };
      return null;
    }).filter((l): l is Linha => l !== null);

  const ordenar = (arr: Linha[]): Linha[] => {
    const c = colDe(ordem);
    return [...arr].sort((a, b) => ((c?.valor(b) ?? 0) || 0) - ((c?.valor(a) ?? 0) || 0))
      .map((l) => (l.filhos ? { ...l, filhos: ordenar(l.filhos) } : l));
  };

  const toggle = (id: string) => setAbertos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const BotaoSync = () => (
    <Botao variante="primario" icone="refresh" onClick={sincronizarAgora} carregando={sincronizando || dreno.rodando} style={{ marginTop: 12 }}>
      {sincronizando || dreno.rodando ? "Sincronizando…" : "Sincronizar agora"}
    </Botao>
  );

  if (d?.semWarehouse) {
    return (
      <div className="glass" style={{ padding: 22, borderRadius: 16, color: "var(--text-dim)", fontSize: 13.5, lineHeight: 1.6 }}>
        O relatório detalhado ainda não tem dados sincronizados da Meta. Clique pra puxar agora — depois o sistema mantém atualizado sozinho.
        <div><BotaoSync /></div>
      </div>
    );
  }
  if (carregando && !d) return <p style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Lendo o relatório local…</p>;
  if (!d?.linhas?.length) {
    return (
      <div className="glass" style={{ padding: 22, borderRadius: 16, color: "var(--text-dim)", fontSize: 13.5, lineHeight: 1.6 }}>
        {dreno.rodando || sincronizando ? (
          <>Sincronizando as contas com a Meta… {dreno.contas} pronta(s), {dreno.restantes} na fila.
            <div style={{ fontSize: 12, marginTop: 4 }}>Pode deixar aberto — o relatório aparece sozinho quando terminar.</div></>
        ) : dreno.falhou ? (
          <>Não consegui sincronizar agora. Tente de novo:<div><BotaoSync /></div></>
        ) : (
          <>Sem dados deste período no relatório detalhado ainda.<div><BotaoSync /></div></>
        )}
      </div>
    );
  }

  const linhas = ordenar(podar(d.linhas));
  const filtrando = !!busca.trim() || filtros.length > 0;

  // Escala das BARRAS visuais: máximo por coluna entre as linhas de TOPO
  // (campanhas). Filhos (conjunto/anúncio) usam a mesma escala → barra menor,
  // que é o certo (são um pedaço da campanha).
  const escalaBarra = new Map<string, number>();
  for (const c of visiveis) {
    let mx = 0;
    for (const l of linhas) { const v = c.valor(l); if (v != null) mx = Math.max(mx, Math.abs(v)); }
    escalaBarra.set(c.key, mx);
  }

  const render = (l: Linha, nivel: number): React.ReactNode[] => {
    const temFilhos = !!l.filhos?.length;
    const aberto = abertos.has(l.id);
    const out: React.ReactNode[] = [
      <tr key={l.id} style={{ borderTop: "1px solid var(--border)", background: nivel === 0 ? "transparent" : "color-mix(in srgb, var(--primary) 4%, transparent)" }}>
        <td style={{ padding: "9px 12px", position: "sticky", left: 0, background: "var(--surface)", minWidth: 220, maxWidth: 320 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, paddingLeft: nivel * 16 }}>
            {temFilhos ? (
              <button onClick={() => toggle(l.id)} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "grid", placeItems: "center", flex: "none" }}>
                <TrocaIcone ligado={aberto} a="chevron-right" b="chevron-down" size={15} corA="var(--text-dim)" corB="var(--text-dim)" />
              </button>
            ) : <span style={{ width: 15, flex: "none" }} />}
            <span title={l.nome} style={{ fontSize: 13, fontWeight: nivel === 0 ? 700 : 600, color: nivel === 2 ? "var(--text-dim)" : "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.nome}</span>
          </div>
        </td>
        {visiveis.map((c) => {
          const v = c.valor(l);
          const mx = escalaBarra.get(c.key) ?? 0;
          const frac = v == null || mx <= 0 ? 0 : Math.max(0, Math.min(1, Math.abs(v) / mx));
          return (
            <td key={c.key} style={{ padding: "9px 12px", textAlign: "right", position: "relative", fontSize: 12.5, fontWeight: c.key === "spend" || c.key === "revenue" || c.key === "roas" ? 700 : 500, color: c.dim ? "var(--text-dim)" : "var(--text)", whiteSpace: "nowrap" }}>
              {frac > 0.001 && <span aria-hidden style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", height: "60%", width: `${frac * 100}%`, background: "color-mix(in srgb, var(--primary) 13%, transparent)", borderRadius: "5px 0 0 5px", zIndex: 0, pointerEvents: "none" }} />}
              <span style={{ position: "relative", zIndex: 1 }}>{c.fmt(v)}</span>
            </td>
          );
        })}
      </tr>,
    ];
    if (temFilhos && aberto) for (const f of l.filhos!) out.push(...render(f, nivel + 1));
    return out;
  };

  const Painel = ({ children, largura = 210 }: { children: React.ReactNode; largura?: number }) => (
    <>
      <div onClick={() => setPainel("")} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
      <div className="glass pop-solid" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 50, borderRadius: 12, padding: 10, width: largura, maxHeight: 380, overflowY: "auto" }}>
        {children}
      </div>
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {d.funil && <FaixaFunil f={d.funil} />}

      {/* Cabeçalho: origem do dado + busca + colunas/filtros/layouts */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--text-dim)", display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          Direto do banco local — não consulta a Meta.
          {d.ultimaSync && <> Sincronizado {new Date(d.ultimaSync).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.</>}
          {!!d.contasComErro && <strong style={{ color: "var(--tf-neg)" }}> {d.contasComErro} conta(s) com erro de sync.</strong>}
          {dreno.rodando && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--primary-texto, var(--primary))", fontWeight: 700 }}>
              <span className="spin" style={{ display: "inline-flex" }}><Icon name="refresh" size={12} color="var(--primary-texto)" /></span>
              Atualizando {dreno.contas} conta(s){dreno.restantes > 0 ? ` · ${dreno.restantes} na fila` : ""}
            </span>
          )}
        </span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 7, flexWrap: "wrap" }}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome…"
            style={{ ...campo, width: 180 }} />

          <div style={{ position: "relative" }}>
            <Botao variante="secundario" tamanho="sm" icone="settings" onClick={() => setPainel((p) => (p === "colunas" ? "" : "colunas"))} aria-expanded={painel === "colunas"}>
              Colunas ({visiveis.length})
            </Botao>
            {painel === "colunas" && (
              <Painel largura={240}>
                {todasCols.map((c) => {
                  const on = cols.includes(c.key);
                  return (
                    <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button onClick={() => mudarCols((p) => (on ? p.filter((x) => x !== c.key) : [...p, c.key]))}
                        style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, textAlign: "left", padding: "7px 9px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontSize: 12.5, color: "var(--text)" }}>
                        <span style={{ width: 16, height: 16, borderRadius: 5, display: "grid", placeItems: "center", background: on ? "var(--primary)" : "transparent", border: on ? "none" : "1.5px solid var(--border)", flex: "none" }}>
                          {on && <Icon name="check" size={11} color="#fff" />}
                        </span>
                        {c.label}
                      </button>
                      {c.custom && (
                        <BotaoIcone icone="trash" titulo="Apagar métrica" tamanho="sm" onClick={() => apagarMetrica(c.key.slice(2))} />
                      )}
                    </div>
                  );
                })}
                <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8 }}>
                  {editandoMetrica ? (
                    <EditorMetrica inicial={editandoMetrica === "nova" ? undefined : editandoMetrica}
                      onSalvar={salvarMetrica} onCancelar={() => setEditandoMetrica(null)} />
                  ) : (
                    <Botao variante="secundario" tamanho="sm" bloco icone="plus" onClick={() => setEditandoMetrica("nova")}>Métrica por fórmula</Botao>
                  )}
                </div>
              </Painel>
            )}
          </div>

          <div style={{ position: "relative" }}>
            <Botao variante="secundario" tamanho="sm" icone="filter" onClick={() => setPainel((p) => (p === "filtros" ? "" : "filtros"))} aria-expanded={painel === "filtros"}>
              Filtros{filtros.length ? ` (${filtros.length})` : ""}
            </Botao>
            {painel === "filtros" && (
              <Painel largura={280}>
                {!filtros.length && <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "2px 0 9px" }}>Sem filtros. Ex.: ROAS &lt; 1 pra achar o que está queimando dinheiro.</p>}
                {filtros.map((f) => (
                  <div key={f.id} style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 7 }}>
                    <GlassSelect value={f.col} onChange={(v) => setFiltros((p) => p.map((x) => (x.id === f.id ? { ...x, col: v } : x)))}
                      style={{ ...campo, flex: 1 }}
                      options={todasCols.map((c) => ({ value: c.key, label: c.label }))} />
                    <GlassSelect value={f.op} onChange={(v) => setFiltros((p) => p.map((x) => (x.id === f.id ? { ...x, op: v as ">" | "<" } : x)))}
                      style={{ ...campo, width: 62 }}
                      options={[{ value: ">", label: ">" }, { value: "<", label: "<" }]} />
                    <input type="number" value={f.valor} onChange={(e) => setFiltros((p) => p.map((x) => (x.id === f.id ? { ...x, valor: Number(e.target.value) } : x)))}
                      style={{ ...campo, width: 72 }} />
                    <BotaoIcone icone="trash" titulo="Remover filtro" tamanho="sm" onClick={() => setFiltros((p) => p.filter((x) => x.id !== f.id))} />
                  </div>
                ))}
                <Botao variante="secundario" tamanho="sm" bloco icone="plus" onClick={() => setFiltros((p) => [...p, { id: novoId(), col: "roas", op: "<", valor: 1 }])}>Adicionar filtro</Botao>
              </Painel>
            )}
          </div>

          <div style={{ position: "relative" }}>
            <Botao variante="secundario" tamanho="sm" icone="bookmark" onClick={() => setPainel((p) => (p === "layouts" ? "" : "layouts"))} aria-expanded={painel === "layouts"}>Layouts</Botao>
            {painel === "layouts" && (
              <Painel largura={250}>
                {!layouts.length && <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "2px 0 9px" }}>Salve colunas, ordenação e filtros como um layout pra voltar nele com um clique.</p>}
                {layouts.map((l) => (
                  <div key={l.nome} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button onClick={() => aplicarLayout(l)}
                      style={{ flex: 1, textAlign: "left", padding: "7px 9px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontSize: 12.5, color: "var(--text)" }}>
                      {l.nome}
                    </button>
                    <BotaoIcone icone="trash" titulo="Apagar layout" tamanho="sm" onClick={() => apagarLayout(l.nome)} />
                  </div>
                ))}
                <div style={{ borderTop: "1px solid var(--border)", marginTop: 8, paddingTop: 8, display: "flex", gap: 6 }}>
                  <input value={nomeLayout} onChange={(e) => setNomeLayout(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") salvarLayout(); }}
                    placeholder="Nome do layout" style={{ ...campo, flex: 1 }} />
                  <Botao variante="secundario" tamanho="sm" onClick={salvarLayout}>Salvar</Botao>
                </div>
              </Painel>
            )}
          </div>
        </div>
      </div>

      {/* Tabela hierárquica (rola dentro do bloco) */}
      <div className="glass" style={{ borderRadius: 14, overflow: "hidden" }}>
        <div className="tf-sticky" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 11.5, fontWeight: 800, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", position: "sticky", left: 0, background: "var(--surface-2)" }}>Campanha / conjunto / anúncio</th>
                {visiveis.map((c) => (
                  <th key={c.key} onClick={() => setOrdem(c.key)} title="Ordenar por esta coluna"
                    style={{ padding: "10px 12px", textAlign: "right", fontSize: 11.5, fontWeight: 800, color: ordem === c.key ? "var(--primary-texto)" : "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".04em", cursor: "pointer", whiteSpace: "nowrap" }}>
                    {c.label}{ordem === c.key ? " ↓" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.length ? linhas.flatMap((l) => render(l, 0)) : (
                <tr><td colSpan={visiveis.length + 1} style={{ padding: 20, textAlign: "center", fontSize: 12.5, color: "var(--text-dim)" }}>
                  Nenhuma linha passou {filtrando ? "nos filtros" : "no período"}.
                </td></tr>
              )}
            </tbody>
            {/* Totais do período — da API (d.totais já vinha e ficava sem uso).
                Passa pelas MESMAS colunas (inclusive fórmulas custom) via uma
                Linha sintética, então cada coluna mostra seu total certo. */}
            {linhas.length > 0 && d.totais && (() => {
              const t = d.totais;
              const tot: Linha = {
                id: "__totais__", nome: "Total",
                spend: t.spend, impressions: t.impressions, clicks: t.clicks,
                purchases: t.purchasesMeta, revenue: t.purchaseValueMeta, leads: 0,
                roas: t.spend > 0 ? t.purchaseValueMeta / t.spend : null,
                cpa: t.purchasesMeta > 0 ? t.spend / t.purchasesMeta : null,
                cpc: t.clicks > 0 ? t.spend / t.clicks : null,
                cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0,
                ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
                ticket: t.purchasesMeta > 0 ? t.purchaseValueMeta / t.purchasesMeta : null,
              };
              return (
                <tfoot>
                  <tr>
                    <td style={{ padding: "10px 12px", textAlign: "left", fontSize: 12.5, position: "sticky", left: 0, background: "var(--surface-2)", zIndex: 4 }}>Total do período</td>
                    {visiveis.map((c) => (
                      <td key={c.key} style={{ padding: "10px 12px", textAlign: "right", fontSize: 12.5, whiteSpace: "nowrap", color: "var(--text)" }}>{c.fmt(c.valor(tot))}</td>
                    ))}
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>
      </div>
    </div>
  );
}
