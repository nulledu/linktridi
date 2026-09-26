"use client";

// Tráfego Pago — Cockpit da Visão Geral. Alimentado pelo snapshot REAL de
// /api/trafego/vendas. LAYOUT PERSONALIZÁVEL e salvo POR USUÁRIO (localStorage
// namespaced pelo userId): cada pessoa monta o painel do jeito dela — escolhe
// quais cards e seções aparecem, a ordem e um preset (Simples/Completo). Só ela
// vê o layout que criou.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtualizacao } from "./atualizacao";
import { Icon } from "../Icon";
import { periodQuery, type PeriodState } from "../PeriodPicker";
import { useSyncedPref } from "../useSyncedPref";
import { useBuscaAtual } from "../ui/useBuscaAtual";
import { useIsMobile } from "../ui/useMediaQuery";
import { Fila, NumeroVivo, Revelar, useOnda } from "../ui/micro";
import { VendasRecentes } from "./VendasRecentes";
import type { VendasSnapshot } from "@/lib/trafego-vendas";
import type { MetasConfig } from "@/lib/marketing-config";
import { Botao, BotaoIcone, Caixa } from "../ui/controles";

const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brl2 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString("pt-BR");
const roasFmt = (r: number | null) => (r == null ? "—" : `${r.toFixed(2)}×`);
const dm = (iso: string) => { const [, m, d] = iso.split("-"); return d && m ? `${d}/${m}` : iso; };
// Período ANTERIOR de mesmo tamanho, terminando no dia anterior a `since`.
// Tudo em UTC (evita off-by-one por fuso).
function periodoAnterior(since: string, until: string): { from: string; to: string } {
  const ms = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const a = ms(since), b = ms(until);
  const dias = Math.max(1, Math.round((b - a) / 86400000) + 1);
  const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { from: fmt(a - dias * 86400000), to: fmt(a - 86400000) };
}

// Fonte de vendas usada como base do painel: só tráfego (canais pagos),
// tráfego + Marketing X1, ou faturamento geral (todas as vendas do ERP).
export type Fonte = "trafego" | "trafegox1" | "geral";
interface Vista { fat: number; vendas: number; custos: number; lucro: number; margem: number | null; roas: number | null; roi: number | null; cpa: number | null; ticket: number }
function viewOf(snap: VendasSnapshot, fonte: Fonte): Vista {
  const fat = fonte === "trafego" ? snap.faturamentoPago : fonte === "trafegox1" ? snap.faturamentoPago + snap.faturamentoX1 : snap.faturamento;
  const vendas = fonte === "trafego" ? snap.pedidosPago : fonte === "trafegox1" ? snap.pedidosPago + snap.pedidosX1 : snap.aprovados;
  const c = snap.custosConfig;
  const custos = fat * (c.produtoPct + c.impostoPct + c.gatewayPct) / 100 + c.custoFixo * vendas;
  const lucro = fat - custos - snap.gasto;
  return { fat, vendas, custos, lucro, margem: fat > 0 ? (lucro / fat) * 100 : null, roas: snap.gasto > 0 ? fat / snap.gasto : null, roi: snap.gasto > 0 ? lucro / snap.gasto : null, cpa: vendas > 0 ? snap.gasto / vendas : null, ticket: vendas > 0 ? fat / vendas : 0 };
}

type Cor = "verde" | "amarelo" | "vermelho" | "azul" | "cinza";
const COR: Record<Cor, string> = { verde: "var(--ok)", amarelo: "var(--atencao)", vermelho: "var(--perigo)", azul: "var(--azul)", cinza: "var(--neutro)" };

type Widget = "inv" | "fat" | "luc" | "roas" | "vend" | "cpa";
const CARD_NOME: Record<Widget, string> = { inv: "Investimento", fat: "Faturamento", luc: "Lucro", roas: "ROAS", vend: "Vendas", cpa: "CPA" };
const TODOS: Widget[] = ["inv", "fat", "luc", "roas", "vend", "cpa"];

interface Layout { modo: "simples" | "completo"; cards: Widget[]; largos: Widget[]; saude: boolean; meta: boolean; atencao: boolean }
const LAYOUT_COMPLETO: Layout = { modo: "completo", cards: ["inv", "fat", "luc", "roas", "vend", "cpa"], largos: [], saude: true, meta: true, atencao: true };
const LAYOUT_SIMPLES: Layout = { modo: "simples", cards: ["fat", "luc", "roas", "vend"], largos: [], saude: false, meta: true, atencao: true };

// Persistência POR USUÁRIO (só a pessoa vê o layout dela).
// Layout salvo por usuário e sincronizado entre dispositivos (user_prefs).
function useLayout(userId: string) {
  const [layout, salvar] = useSyncedPref<Layout>("trafego.layout", userId, LAYOUT_COMPLETO, (parsed) => {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return { ...LAYOUT_COMPLETO, ...(parsed as Partial<Layout>) };
  });
  return { layout, salvar };
}

export function Cockpit({ period, userId, fonte, onNavigate }: { period: PeriodState; userId: string; fonte: Fonte; onNavigate: (tab: string) => void }) {
  const [s, setS] = useState<VendasSnapshot | null>(null);
  const [sPrev, setSPrev] = useState<VendasSnapshot | null>(null);
  const [erro, setErro] = useState(false);
  const [dispensadas, setDispensadas] = useState<Set<string>>(new Set());
  const [editMetas, setEditMetas] = useState(false);
  // Reordenar os cards depende de arrastar (draggable HTML5), que é inerte no
  // toque: no celular o modo de edição abriria uma tela onde nada responde.
  // Derivado, e não só escondido, pra que um estado herdado (ou uma janela que
  // encolheu com a edição aberta) caia sozinho pra leitura.
  const celular = useIsMobile();
  const [editAberto, setEditLayout] = useState(false);
  const editLayout = editAberto && !celular;
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const { layout, salvar } = useLayout(userId);
  const onda = useOnda();

  const buscaAtual = useBuscaAtual();
  const load = useCallback(() => {
    if (period.key === "custom" && (!period.from || !period.to)) return;
    setErro(false);
    // NÃO zera sPrev aqui: zerar fazia os deltas "vs anterior" piscarem/sumirem
    // a cada revalidação. O dado velho fica na tela até o novo chegar
    // (stale-while-revalidate de verdade, não tela em branco).
    // As duas buscas saem JUNTAS: o período anterior é derivável do period
    // local — esperar o 1º fetch pra disparar o 2º era cascata desnecessária.
    const souAtual = buscaAtual();
    fetch(`/api/trafego/vendas?${periodQuery(period)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject())).then((d: VendasSnapshot) => {
        // Trocou o período com esta busca no ar: a resposta atrasada não
        // sobrescreve a nova — nem dispara o comparativo do período errado.
        if (!souAtual()) return;
        setS(d);
        const p = periodoAnterior(d.since, d.until);
        // `period=custom` é obrigatório: sem ele o resolvePeriod devolvia O MÊS
        // ATUAL e todo delta "vs anterior" comparava contra o próprio mês.
        fetch(`/api/trafego/vendas?period=custom&from=${p.from}&to=${p.to}`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null)).then((dp: VendasSnapshot | null) => { if (souAtual()) setSPrev(dp); }).catch(() => { /* mantém o anterior */ });
      }).catch(() => { if (souAtual()) setErro(true); });
  }, [period, buscaAtual]);
  useEffect(() => { load(); }, [load]);
  // Segue o botão "Atualizar" da Tridify (ver `atualizacao.ts`).
  useAtualizacao(load);

  const V = useMemo(() => (s ? viewOf(s, fonte) : null), [s, fonte]);
  const cpa = V?.cpa ?? null;
  const roas = V?.roas ?? null;

  const saude = useMemo(() => {
    if (!s || !V) return null;
    const rent = V.lucro > 0 && V.margem != null ? Math.min(100, (V.margem / 30) * 100) : V.lucro > 0 ? 60 : 12;
    const qual = Math.max(0, Math.min(100, s.pctAtribuido));
    const alvo = s.metas.roas > 0 ? s.metas.roas : 3;
    const ret = Math.min(100, ((V.roas ?? 0) / alvo) * 100);
    return { nota: Math.round(rent * 0.4 + qual * 0.3 + ret * 0.3), rent: Math.round(rent), qual: Math.round(qual), ret: Math.round(ret) };
  }, [s, V]);

  const alertas = useMemo(() => {
    if (!s || !V) return [];
    const a: { id: string; cor: Cor; titulo: string; motivo: string; valor?: string; tab: string }[] = [];
    const c = s.custosConfig;
    const custosZerados = (c.produtoPct + c.impostoPct + c.gatewayPct + c.custoFixo) === 0;
    const semOrigemPct = 100 - s.pctAtribuido;
    if (semOrigemPct >= 20 && s.faturamento > 0) a.push({ id: "origem", cor: semOrigemPct >= 45 ? "vermelho" : "amarelo", titulo: `${semOrigemPct.toFixed(0)}% das vendas sem origem identificada`, motivo: "Melhore as UTMs dos anúncios/links para atribuir corretamente.", valor: brl0(s.faturamento - s.faturamentoPago), tab: "tags" });
    // Sem custos configurados o "lucro" é só faturamento−gasto (ignora produto/
    // imposto), então NÃO afirmamos prejuízo — pedimos pra configurar os custos.
    if (custosZerados) a.push({ id: "custos", cor: "amarelo", titulo: "Configure seus custos para ver o lucro real", motivo: "Produto, imposto e gateway estão em 0% — sem eles o lucro exibido não considera a margem do produto.", tab: "lucro" });
    else if (s.gasto > 0 && V.lucro < 0) a.push({ id: "vermelho", cor: "vermelho", titulo: "Operação no vermelho no período", motivo: `Gasto ${brl0(s.gasto)} · faturamento ${brl0(V.fat)} · custos ${brl0(V.custos)}.`, valor: brl0(V.lucro), tab: "lucro" });
    if (s.metas.roas > 0 && roas != null && roas < s.metas.roas) a.push({ id: "roas", cor: "amarelo", titulo: `ROAS ${roasFmt(roas)} abaixo da meta (${s.metas.roas.toFixed(1)}×)`, motivo: "Reveja criativos/públicos das campanhas com menor retorno.", tab: "campanhas" });
    if (s.metas.cpa > 0 && cpa != null && cpa > s.metas.cpa) a.push({ id: "cpa", cor: "amarelo", titulo: `CPA ${brl2(cpa)} acima da meta (${brl2(s.metas.cpa)})`, motivo: "O custo por venda subiu — investigue as campanhas mais caras.", tab: "campanhas" });
    if (s.gasto > 0 && V.lucro > 0 && roas != null && roas >= (s.metas.roas > 0 ? s.metas.roas : 3)) a.push({ id: "escala", cor: "verde", titulo: "Retorno saudável — dá pra escalar", motivo: `ROAS ${roasFmt(roas)} com lucro positivo. Considere aumentar orçamento das melhores campanhas.`, valor: brl0(V.lucro), tab: "campanhas" });
    return a.filter((x) => !dispensadas.has(x.id));
  }, [s, V, roas, cpa, dispensadas]);

  async function salvarMetas(m: MetasConfig) {
    await fetch("/api/trafego/vendas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(m) }).catch(() => {});
    setEditMetas(false); load();
  }

  if (erro) return null;
  if (!s || !V) return <div className="glass" style={{ borderRadius: 18, padding: 22, marginBottom: 16, color: "var(--text-dim)", fontSize: 13 }}>Carregando cockpit…</div>;

  const lucroOk = V.lucro >= 0;
  // Custos zerados → o "lucro" não considera a margem do produto; tratamos o
  // resultado em tom NEUTRO em vez de afirmar prejuízo (que pode não existir).
  const cc = s.custosConfig;
  const custosZerados = (cc.produtoPct + cc.impostoPct + cc.gatewayPct + cc.custoFixo) === 0;
  // Comparação com o período anterior (deltas ↑/↓) — mesma fonte.
  const metrica = (snap: VendasSnapshot, k: Widget): number | null => {
    const v = viewOf(snap, fonte);
    switch (k) {
      case "inv": return snap.gasto;
      case "fat": return v.fat;
      case "luc": return v.lucro;
      case "roas": return v.roas;
      case "vend": return v.vendas;
      case "cpa": return v.cpa;
    }
  };
  const trendDe = (k: Widget): { pct: number; up: boolean; bom: boolean | null } | null => {
    if (!sPrev) return null;
    const cur = metrica(s, k), prev = metrica(sPrev, k);
    if (cur == null || prev == null || prev === 0 || !Number.isFinite(cur)) return null;
    const pct = ((cur - prev) / Math.abs(prev)) * 100;
    if (!Number.isFinite(pct) || Math.abs(pct) < 0.5) return null;
    const up = pct > 0;
    return { pct: Math.abs(pct), up, bom: k === "cpa" ? !up : k === "inv" ? null : up };
  };
  // `n` + `fmt` acompanham o `valor` já formatado porque o número do KPI CONTA
  // até o valor novo (`NumeroVivo`) quando o período muda: sem o par numérico o
  // cartão só teria a string pronta e a troca seria um corte seco. Onde não há
  // número (ROAS/CPA sem dado) `n` é nulo e a string "—" continua valendo.
  const defCard = (k: Widget): { label: string; valor: string; sub: string; cor: Cor; tab: string; n: number | null; fmt: (v: number) => string } => {
    switch (k) {
      case "inv": return { label: "Investimento", valor: brl0(s.gasto), n: s.gasto, fmt: brl0, sub: "gasto em anúncios (Meta)", cor: "azul", tab: "integracoes" };
      case "fat": return { label: "Faturamento", valor: brl0(V.fat), n: V.fat, fmt: brl0, sub: `${num(V.vendas)} venda(s)`, cor: "verde", tab: "lucro" };
      case "luc": return custosZerados
        ? { label: "Resultado (sem custos)", valor: brl0(V.lucro), n: V.lucro, fmt: brl0, sub: "configure custos p/ lucro real", cor: "cinza", tab: "lucro" }
        : { label: "Lucro", valor: brl0(V.lucro), n: V.lucro, fmt: brl0, sub: V.margem != null ? `margem ${V.margem.toFixed(0)}%` : "—", cor: lucroOk ? "verde" : "vermelho", tab: "lucro" };
      case "roas": return { label: "ROAS", valor: roasFmt(roas), n: roas, fmt: (v) => roasFmt(v), sub: fonte === "geral" ? "faturamento / gasto" : "retorno atribuído", cor: roas == null ? "cinza" : roas >= (s.metas.roas || 2) ? "verde" : "amarelo", tab: "campanhas" };
      case "vend": return { label: "Vendas", valor: num(V.vendas), n: V.vendas, fmt: num, sub: `ticket ${brl0(V.ticket)}`, cor: "azul", tab: "campanhas" };
      case "cpa": return { label: "CPA", valor: cpa == null ? "—" : brl2(cpa), n: cpa, fmt: brl2, sub: s.metas.cpa > 0 ? `meta ${brl2(s.metas.cpa)}` : "custo por venda", cor: cpa == null ? "cinza" : s.metas.cpa > 0 && cpa > s.metas.cpa ? "vermelho" : "verde", tab: "campanhas" };
    }
  };

  const tFat = trendDe("fat");
  const comp = tFat ? ` Faturamento ${tFat.up ? "subiu" : "caiu"} ${tFat.pct.toFixed(0)}% vs. o período anterior.` : "";
  const FONTE_LABEL = fonte === "trafego" ? "do tráfego" : fonte === "trafegox1" ? "de tráfego + X1" : "gerais";
  const resumo = V.fat === 0
    ? `Ainda não há vendas ${FONTE_LABEL} no período. Confira as UTMs e o período selecionado.`
    : custosZerados
      ? `No período: ${brl0(V.fat)} em vendas ${FONTE_LABEL}, ROAS ${roasFmt(roas)}. Configure os custos (produto/imposto/gateway) para calcular o lucro real.${comp}`
      : `No período: ${brl0(V.fat)} em vendas ${FONTE_LABEL}, ROAS ${roasFmt(roas)} e ${lucroOk ? "lucro" : "prejuízo"} de ${brl0(Math.abs(V.lucro))}.${comp}`;

  const ocultos = TODOS.filter((k) => !layout.cards.includes(k));
  const mover = (i: number, dir: -1 | 1) => { const arr = [...layout.cards]; const j = i + dir; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; salvar({ ...layout, cards: arr }); };
  // Drag-and-drop: solta o card arrastado na posição do card alvo.
  const soltarEm = (alvo: number) => { if (dragIdx == null || dragIdx === alvo) return; const arr = [...layout.cards]; const [item] = arr.splice(dragIdx, 1); arr.splice(alvo, 0, item); salvar({ ...layout, cards: arr }); };
  const sparkDe = (k: Widget): number[] | null => {
    if (!s.serieDia || s.serieDia.length < 2) return null;
    if (k === "fat") return s.serieDia.map((d) => d.trafego + d.organico);
    if (k === "vend") return s.serieDia.map((d) => d.vendas);
    return null;
  };
  const nivelSaude = saude ? (saude.nota >= 80 ? { rot: "Excelente", cor: COR.verde } : saude.nota >= 60 ? { rot: "Boa", cor: COR.azul } : saude.nota >= 40 ? { rot: "Atenção", cor: COR.amarelo } : { rot: "Crítica", cor: COR.vermelho }) : null;

  return (
    <div className="tf-scope" style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 18 }}>
      {/* Linha-herói: Resumo inteligente · Saúde · Precisa da sua atenção.
          `Revelar` é a PRÓPRIA grade (e não um invólucro a mais): a entrada é
          por transição, então o `transform` volta a `none` no fim e nenhum
          popover de dentro herda bloco de contenção. */}
      <Revelar de="baixo" indice={0} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 12, alignItems: "stretch" }}>
        {/* Resumo inteligente */}
        <div className="tf-panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 11, minHeight: 168 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 12%, transparent)" }}>
              <Icon name="sparkles" size={16} color="var(--primary-texto)" />
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text-dim)", letterSpacing: ".01em" }}>Resumo inteligente</span>
            {celular ? (
              // No lugar do botão, o motivo: sem isso o card some no celular e
              // parece que a personalização foi tirada do sistema.
              <span title="Disponível no computador"
                style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-dim)", fontSize: 11.5, fontWeight: 700 }}>
                <Icon name="device-desktop" size={13} color="var(--text-dim)" /> Personalizar é no computador
              </span>
            ) : (
              <Botao variante="sutil" tamanho="sm" icone="settings" onClick={() => setEditLayout((v) => !v)} title="Personalizar meu painel" aria-pressed={editLayout}
                style={{ marginLeft: "auto" }}>
                Personalizar
              </Botao>
            )}
          </div>
          <div style={{ fontSize: 15.5, fontWeight: 700, color: "var(--text)", lineHeight: 1.42 }}>{resumo}</div>
          <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {tFat && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 800, padding: "3px 9px", borderRadius: 999, background: `color-mix(in srgb, ${tFat.up ? COR.verde : COR.vermelho} 12%, transparent)`, color: tFat.up ? COR.verde : COR.vermelho }}>
                <Icon name={tFat.up ? "trending-up" : "trending-down"} size={13} color={tFat.up ? COR.verde : COR.vermelho} /> {tFat.pct.toFixed(0)}% vs anterior
              </span>
            )}
            <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{s.pctAtribuido.toFixed(0)}% atribuído · {dm(s.since)}–{dm(s.until)}</span>
          </div>
        </div>

        {/* Saúde do tráfego (anel) */}
        {layout.saude && saude && nivelSaude && (
          <div className="tf-panel" style={{ padding: 18, display: "flex", gap: 16, alignItems: "center", minHeight: 168 }}>
            <RingSaude nota={saude.nota} cor={nivelSaude.cor} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text-dim)" }}>Saúde do tráfego</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: nivelSaude.cor, margin: "1px 0 9px" }}>{nivelSaude.rot}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {([["Rentabilidade", saude.rent], ["Qualidade dos dados", saude.qual], ["Retorno (ROAS)", saude.ret]] as const).map(([l, v]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", flex: "none", background: v >= 60 ? COR.verde : v >= 35 ? COR.amarelo : COR.vermelho }} />
                    <span style={{ flex: 1, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l}</span>
                    <span className="tf-num" style={{ fontWeight: 700, color: "var(--text)" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Precisa da sua atenção */}
        {layout.atencao && (
          <div className="tf-panel" style={{ padding: 18, minHeight: 168, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <Icon name="bell" size={15} color="var(--text-dim)" />
              <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text-dim)" }}>Precisa da sua atenção</span>
              {alertas.length > 0 && <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, padding: "1px 8px", borderRadius: 999, background: "var(--surface-2)", color: "var(--text-dim)" }}>{alertas.length}</span>}
            </div>
            {alertas.length === 0 ? (
              <div style={{ margin: "auto 0", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-dim)" }}><Icon name="circle-check" size={16} color={COR.verde} /> Tudo sob controle no período.</div>
            ) : (
              <Fila style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {/* Sem a faixa lateral: o pontinho colorido já diz a gravidade — a
                    barra de 3px era a mesma informação duas vezes, em peso. */}
                {alertas.slice(0, 3).map((a) => (
                  <button key={a.id} onClick={() => onNavigate(a.tab)} className="mt-anel mt-seta" onPointerDown={onda} style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 9, padding: "8px 11px", borderRadius: 11, background: "var(--surface-2)", border: "none", cursor: "pointer" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", background: COR[a.cor] }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.titulo}</span>
                    <span data-mt-seta style={{ display: "inline-flex", flex: "none" }}><Icon name="chevron-right" size={14} color="var(--text-dim)" /></span>
                  </button>
                ))}
              </Fila>
            )}
          </div>
        )}
      </Revelar>

      {/* Editor de layout (por usuário) */}
      {editLayout && (
        <div className="tf-panel" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)" }}>Meu painel</span>
            <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>· só você vê este layout, fica salvo pra você</span>
            <Botao variante="sutil" tamanho="sm" onClick={() => salvar(LAYOUT_COMPLETO)} style={{ marginLeft: "auto" }}>Restaurar padrão</Botao>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {([["completo", "Completo"], ["simples", "Simples"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => salvar(k === "simples" ? LAYOUT_SIMPLES : LAYOUT_COMPLETO)} className="mt-anel" onPointerDown={onda}
                style={{ padding: "7px 14px", borderRadius: 9, border: `1px solid ${layout.modo === k ? "var(--primary)" : "var(--border)"}`, background: layout.modo === k ? "color-mix(in srgb, var(--primary) 10%, transparent)" : "var(--surface)", color: layout.modo === k ? "var(--primary-texto)" : "var(--text)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{l}</button>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-dim)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".04em" }}>Cards (arraste a ordem)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {layout.cards.map((k, i) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 9, background: "var(--surface-2)" }}>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{CARD_NOME[k]}</span>
                  <BotaoIcone icone="chevron-up" titulo="Subir" tamanho="sm" onClick={() => mover(i, -1)} disabled={i === 0} />
                  <BotaoIcone icone="chevron-down" titulo="Descer" tamanho="sm" onClick={() => mover(i, 1)} disabled={i === layout.cards.length - 1} />
                  <BotaoIcone icone="x" titulo="Ocultar" tamanho="sm" onClick={() => salvar({ ...layout, modo: "completo", cards: layout.cards.filter((x) => x !== k) })} />
                </div>
              ))}
            </div>
            {ocultos.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {ocultos.map((k) => (
                  <button key={k} onClick={() => salvar({ ...layout, modo: "completo", cards: [...layout.cards, k] })}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999, border: "1px dashed var(--border)", background: "var(--surface)", color: "var(--text-dim)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    <Icon name="circle-plus" size={13} color="var(--text-dim)" /> {CARD_NOME[k]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {([["saude", "Saúde do tráfego"], ["meta", "Meta do período"], ["atencao", "Central de atenção"]] as const).map(([k, l]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--text)", cursor: "pointer", fontWeight: 600 }}>
                <Caixa marcado={layout[k]} onChange={(marc) => salvar({ ...layout, modo: "completo", [k]: marc })} /> {l}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Barra do modo edição (drag-and-drop) */}
      {editLayout && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderRadius: 12, background: "color-mix(in srgb, var(--primary) 12%, var(--surface))", border: "1px solid color-mix(in srgb, var(--primary) 30%, var(--border))", flexWrap: "wrap" }}>
          <Icon name="drag-drop" size={16} color="var(--primary-texto)" />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>Editando o painel — <span style={{ color: "var(--text-dim)", fontWeight: 500 }}>arraste os cards para reordenar, use o × para ocultar. Fica salvo só pra você.</span></span>
          <Botao variante="sutil" tamanho="sm" onClick={() => salvar(LAYOUT_COMPLETO)} style={{ marginLeft: "auto" }}>Restaurar padrão</Botao>
          <Botao variante="primario" tamanho="sm" onClick={() => setEditLayout(false)}>Concluir</Botao>
        </div>
      )}

      {/* KPIs premium — sparkline real onde há série; arrastáveis no modo edição.
          A entrada é da GRADE inteira (`Revelar`), não de cada cartão: `.mt-fila`
          num cartão que também eleva no ponteiro seria armadilha — o
          `fill-mode: forwards` da fila congela o transform final e o `:hover`
          do `.mt-eleva` nunca mais sobe. */}
      {layout.cards.length > 0 && (
        <Revelar de="baixo" indice={1} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 158px), 1fr))", gap: 12 }}>
          {layout.cards.map((k, i) => { const c = defCard(k); const t = trendDe(k); const sp = sparkDe(k); const arrastando = dragIdx === i; const largo = (layout.largos || []).includes(k); return (
            // No modo edição o cartão é ALVO DE ARRASTE: elevar/ondular ali
            // brigaria com o gesto e com a moldura tracejada.
            <button key={k} onClick={() => { if (!editLayout) onNavigate(c.tab); }} className={editLayout ? "tf-panel" : "tf-panel mt-eleva mt-anel"}
              onPointerDown={editLayout ? undefined : onda}
              draggable={editLayout}
              onDragStart={() => setDragIdx(i)} onDragOver={(e) => { if (editLayout) e.preventDefault(); }} onDrop={() => { soltarEm(i); setDragIdx(null); }} onDragEnd={() => setDragIdx(null)}
              style={{ position: "relative", gridColumn: largo ? "span 2" : undefined, textAlign: "left", padding: "14px 15px 12px", cursor: editLayout ? "grab" : "pointer", display: "flex", flexDirection: "column", gap: 3, overflow: "hidden",
                borderStyle: editLayout ? "dashed" : "solid", borderColor: editLayout ? "color-mix(in srgb, var(--primary) 45%, var(--tf-line))" : undefined, opacity: arrastando ? 0.4 : 1 }}>
              {editLayout && (
                <span onClick={(e) => { e.stopPropagation(); salvar({ ...layout, modo: "completo", cards: layout.cards.filter((x) => x !== k), largos: (layout.largos || []).filter((x) => x !== k) }); }}
                  title="Ocultar card" style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 7, display: "grid", placeItems: "center", background: "var(--surface-2)", border: "1px solid var(--tf-line)", cursor: "pointer" }}><Icon name="x" size={13} color="var(--text-dim)" /></span>
              )}
              {editLayout && (
                <span onClick={(e) => { e.stopPropagation(); const cur = layout.largos || []; salvar({ ...layout, modo: "completo", largos: largo ? cur.filter((x) => x !== k) : [...cur, k] }); }}
                  title={largo ? "Voltar ao tamanho normal" : "Deixar card largo (2 colunas)"} style={{ position: "absolute", bottom: 6, right: 6, width: 22, height: 22, borderRadius: 7, display: "grid", placeItems: "center", background: largo ? "color-mix(in srgb, var(--primary) 18%, var(--surface-2))" : "var(--surface-2)", border: `1px solid ${largo ? "color-mix(in srgb, var(--primary) 45%, var(--tf-line))" : "var(--tf-line)"}`, cursor: "pointer" }}><Icon name={largo ? "arrows-diagonal-minimize" : "arrows-diagonal"} size={13} color={largo ? "var(--primary-texto)" : "var(--text-dim)"} /></span>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", flex: "none", background: COR[c.cor] }} />
                <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
              </div>
              <span className="tf-num" style={{ fontSize: 24, fontWeight: 800, color: c.cor === "vermelho" ? COR.vermelho : "var(--text)" }}>
                {c.n == null ? c.valor : <NumeroVivo valor={c.n} formatar={c.fmt} />}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, fontSize: 11, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.sub}</span>
                {t && <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 800, color: t.bom == null ? "var(--text-dim)" : t.bom ? COR.verde : COR.vermelho }}><Icon name={t.up ? "trending-up" : "trending-down"} size={12} color={t.bom == null ? "var(--text-dim)" : t.bom ? COR.verde : COR.vermelho} />{t.pct.toFixed(0)}%</span>}
              </div>
              {sp && !editLayout && <div style={{ margin: "8px -15px -12px" }}><SparkMini pts={sp} cor={c.cor === "cinza" ? COR.azul : COR[c.cor]} /></div>}
            </button>
          ); })}
        </Revelar>
      )}

      {/* Central de atenção (detalhada) — quando há alertas, abaixo dos KPIs */}
      {layout.atencao && alertas.length > 0 && (
        <Revelar de="baixo" indice={2} className="tf-panel" style={{ padding: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text-dim)", marginBottom: 10, display: "flex", alignItems: "center", gap: 7 }}>
            <Icon name="bell" size={15} color="var(--text-dim)" /> Precisa da sua atenção
          </div>
          <Fila style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {alertas.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 13px", borderRadius: 12, background: "var(--surface-2)" }}>
                {/* A gravidade vira o pontinho (cor como apoio), não uma barra. */}
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", background: COR[a.cor] }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{a.titulo}{a.valor ? <span className="tf-num" style={{ color: COR[a.cor], marginLeft: 8 }}>{a.valor}</span> : null}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 1 }}>{a.motivo}</div>
                </div>
                <Botao variante="secundario" tamanho="sm" onClick={() => onNavigate(a.tab)} style={{ flex: "none" }}>Ver</Botao>
                <BotaoIcone icone="x" titulo="Marcar como resolvido" tamanho="sm" onClick={() => setDispensadas((p) => new Set(p).add(a.id))} style={{ flex: "none" }} />
              </div>
            ))}
          </Fila>
        </Revelar>
      )}

      {/* Meta do período */}
      {layout.meta && (
        <Revelar de="baixo" indice={3} className="tf-panel" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: "var(--text-dim)" }}>Meta do período</span>
            <Botao variante="sutil" tamanho="sm" onClick={() => setEditMetas((v) => !v)}>{editMetas ? "Fechar" : "Definir metas"}</Botao>
          </div>
          {editMetas ? <MetasEditor metas={s.metas} onSave={salvarMetas} /> : s.metas.faturamento > 0 ? (() => {
            const p = Math.min(100, (V.fat / s.metas.faturamento) * 100);
            return (<>
              <div className="tf-num" style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}><NumeroVivo valor={V.fat} formatar={brl0} /> <span style={{ color: "var(--text-dim)", fontWeight: 500 }}>de {brl0(s.metas.faturamento)}</span></div>
              {/* A barra ANDA até a marca nova em vez de saltar: é a mesma
                  ênfase do anel de saúde, então usa o mesmo token. */}
              <div style={{ height: 10, borderRadius: 999, background: "var(--surface-2)", overflow: "hidden" }}><div style={{ width: `${p}%`, height: "100%", background: p >= 100 ? COR.verde : COR.azul, borderRadius: 999, transition: "width var(--duration-very-slow) var(--ease-smooth-out), background-color var(--duration-fast) ease" }} /></div>
              <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 6 }}>{p.toFixed(0)}% da meta de faturamento{s.metas.lucro > 0 ? ` · lucro ${brl0(V.lucro)} de ${brl0(s.metas.lucro)}` : ""}</div>
            </>);
          })() : (
            <div style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5 }}>Nenhuma meta definida. Clique em <strong>Definir metas</strong> para acompanhar ROAS, CPA, faturamento e lucro.</div>
          )}
        </Revelar>
      )}

      {/* Vendas recentes (feed real do ERP) */}
      <VendasRecentes period={period} />
    </div>
  );
}

// Anel de saúde (0–100) — donut SVG, cor pelo nível.
function RingSaude({ nota, cor }: { nota: number; cor: string }) {
  const R = 42, C = 2 * Math.PI * R, off = C * (1 - Math.max(0, Math.min(100, nota)) / 100);
  return (
    <div style={{ position: "relative", width: 106, height: 106, flex: "none" }}>
      <svg width={106} height={106} viewBox="0 0 106 106" style={{ transform: "rotate(-90deg)" }}>
        <circle cx={53} cy={53} r={R} fill="none" stroke="var(--surface-2)" strokeWidth={9} />
        {/* O anel enche na escala do sistema (`very-slow` é o token de ÊNFASE —
            a nota é o número que a pessoa veio ver), não num .7s próprio. */}
        <circle cx={53} cy={53} r={R} fill="none" stroke={cor} strokeWidth={9} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} style={{ transition: "stroke-dashoffset var(--duration-very-slow) var(--ease-smooth-out)" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <NumeroVivo valor={nota} as="div" className="tf-num" style={{ fontSize: 30, fontWeight: 800, color: "var(--text)", lineHeight: 1 }} />
          <div style={{ fontSize: 9, fontWeight: 800, color: "var(--text-dim)", letterSpacing: ".1em", marginTop: 2 }}>DE 100</div>
        </div>
      </div>
    </div>
  );
}

// Sparkline mini (área + linha) a partir de uma série de números reais.
function SparkMini({ pts, cor }: { pts: number[]; cor: string }) {
  if (!pts || pts.length < 2) return null;
  const w = 100, h = 30, pad = 2;
  const max = Math.max(...pts), min = Math.min(...pts), rng = max - min || 1;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / rng) * (h - pad * 2);
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z`;
  const gid = "spk-" + Math.random().toString(36).slice(2, 8);
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }} aria-hidden>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={cor} stopOpacity="0.2" /><stop offset="1" stopColor={cor} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={cor} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function MetasEditor({ metas, onSave }: { metas: MetasConfig; onSave: (m: MetasConfig) => void }) {
  const [m, setM] = useState<MetasConfig>(metas);
  const campo = (k: keyof MetasConfig, label: string, prefixo?: string) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11.5, color: "var(--text-dim)", fontWeight: 700 }}>
      {label}
      {/* `.t-input`: a borda acende no foco pela escala do sistema em vez de
          trocar de cor por corte seco. */}
      <input type="number" min={0} value={m[k] || ""} onChange={(e) => setM({ ...m, [k]: Number(e.target.value) || 0 })} placeholder={prefixo} className="t-input"
        style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 9, padding: "7px 9px", fontSize: 13, background: "var(--surface)", color: "var(--text)" }} />
    </label>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {campo("roas", "ROAS-alvo (×)", "ex.: 3")}{campo("cpa", "CPA-alvo (R$)", "ex.: 25")}
        {campo("faturamento", "Faturamento (R$)", "ex.: 50000")}{campo("lucro", "Lucro (R$)", "ex.: 15000")}
        {campo("investimento", "Investimento (R$)", "ex.: 20000")}{campo("vendas", "Vendas (nº)", "ex.: 300")}
        {campo("margem", "Margem (%)", "ex.: 30")}
      </div>
      <Botao variante="primario" onClick={() => onSave(m)}>Salvar metas</Botao>
    </div>
  );
}
