"use client";

// ── Tridify · Anúncios & criativos ───────────────────────────────────────────
// Biblioteca de criativos com IDENTIDADE própria: o mesmo criativo rodando em
// várias campanhas (e suas "— Cópia") vira UM card com as métricas somadas
// (lib/criativos.ts). Em cima disso: busca, tags livres, editor de vídeo
// responsável, e uma prévia grande de verdade.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useComImposto } from "./imposto";
import { comImposto, fatorImposto } from "@/lib/trafego-imposto";
import type { AdsOverview } from "@/lib/meta-ads";
import { agruparCriativos, resolverMarcaCriativo, textoBusca, type GrupoCriativo, type MarcaCriativo } from "@/lib/criativos";
import { fmtBRL2, fmtNum } from "@/lib/format";
import { deriveCreativeMetrics } from "@/lib/creative-intelligence/metrics";
import type { CreativePeriodSelection } from "@/lib/creative-intelligence/period";
import { Icon } from "../Icon";
import { Portal } from "../Portal";
import { Alerta } from "../ui/Alerta";
import { toast } from "../Toast";
import { BibliotecaCriativo } from "../marketing/BibliotecaCriativo";
import { useCriativosPorNome, type CriativoLigado } from "../marketing/useCriativosPorNome";
import { codigoDoNome } from "@/lib/marketing-criativos-const";
import { CreativeIntelligencePanel } from "./creative-intelligence/CreativeIntelligencePanel";
import { FacebookAdPreview } from "./creative-intelligence/FacebookAdPreview";
import { useCreativeIntelligence } from "./creative-intelligence/useCreativeIntelligence";
import { useEstreiaCriativo } from "./creative-intelligence/useEstreiaCriativo";
import { rotuloDaEstreia, type EstreiaCriativo } from "@/lib/criativos-estreia";
import { BotaoIcone } from "../ui/controles";

const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const pctStr = (n: number) => n.toFixed(2) + "%";
const roasStr = (r: number | null) => (r == null ? "—" : r.toFixed(2) + "×");
const roasCor = (r: number | null) => (r == null ? "var(--text-dim)" : r >= 2 ? "var(--tf-pos)" : r >= 1 ? "var(--tf-warn)" : "var(--tf-neg)");
const limpar = (s: string) => s.replace(/\{[^}]+\}/g, "").trim() || s;

type Ordem = "spend" | "roas" | "purchases" | "ctr";
const ORDENS: { k: Ordem; l: string }[] = [
  { k: "spend", l: "Mais investido" }, { k: "roas", l: "Melhor ROAS" },
  { k: "purchases", l: "Mais vendas" }, { k: "ctr", l: "Maior CTR" },
];

// ── Marcas (tags + editor), persistidas por chave do criativo ────────────────
function useMarcas() {
  const [marcas, setMarcas] = useState<Map<string, MarcaCriativo>>(new Map());
  const [indisponivel, setIndisponivel] = useState(false);
  // Espelho em ref: o updater do setState só roda no render seguinte, então ler
  // o estado "atual" de dentro do salvar() daria valor velho no corpo do POST.
  const atual = useRef(marcas);
  useEffect(() => { atual.current = marcas; }, [marcas]);

  useEffect(() => {
    let vivo = true;
    fetch("/api/trafego/criativos/marcas")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!vivo || !j) return;
        if (j.indisponivel) setIndisponivel(true);
        setMarcas(new Map((j.marcas || []).map((m: MarcaCriativo) => [m.chave, m])));
      })
      .catch(() => { /* offline → segue sem marcas */ });
    return () => { vivo = false; };
  }, []);

  const salvar = useCallback(async (chave: string, nome: string, patch: Partial<Omit<MarcaCriativo, "chave">>) => {
    const antes = atual.current.get(chave) || { chave, editor: null, tags: [] };
    const novo: MarcaCriativo = { ...antes, ...patch, chave };
    setMarcas((prev) => new Map(prev).set(chave, novo));      // otimista
    try {
      const r = await fetch("/api/trafego/criativos/marcas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chave, nome, editor: novo.editor, tags: novo.tags }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setMarcas((prev) => new Map(prev).set(chave, antes));  // desfaz
        if (j.error === "tabela_ausente") { setIndisponivel(true); toast.erro("Rode supabase/trafego_criativos.sql pra salvar tags"); }
        else toast.erro("Não deu pra salvar a marcação");
      }
    } catch {
      setMarcas((prev) => new Map(prev).set(chave, antes));
      toast.erro("Sem conexão — marcação não salva");
    }
  }, []);

  return { marcas, salvar, indisponivel };
}

export function CriativosStudio({ d }: { d: AdsOverview }) {
  // Safra padrão = ano do período em tela (usada quando a Meta não devolve
  // created_time do anúncio).
  const anoPadrao = useMemo(() => {
    const ultimo = d.serie && d.serie.length ? d.serie[d.serie.length - 1].day : null;
    const y = ultimo ? Number(String(ultimo).slice(0, 4)) : NaN;
    return Number.isFinite(y) && y > 2000 ? y : new Date().getFullYear();
  }, [d.serie]);

  const { marcas, salvar, indisponivel } = useMarcas();
  const [agrupar, setAgrupar] = useState(true);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("spend");
  const [tipoF, setTipoF] = useState<"todos" | "video" | "imagem">("todos");
  const [editorF, setEditorF] = useState<string | null>(null);
  const [tagF, setTagF] = useState<string | null>(null);
  const [aberto, setAberto] = useState<number | null>(null);
  // Nome de cada anúncio → criativo do Marketing (pelo código no nome), numa
  // consulta só pra grade inteira. É o que põe o código no card e a nossa
  // capa no lugar do ícone cinza quando a Meta não dá miniatura.
  const nomesDaGrade = useMemo(() => d.anuncios.map((a) => a.name), [d.anuncios]);
  const ligacao = useCriativosPorNome(nomesDaGrade);

  const grupos = useMemo(() => {
    if (agrupar) return agruparCriativos(d.anuncios, anoPadrao);
    // Sem agrupar: 1 card por anúncio, mas a CHAVE continua a do grupo — as tags
    // seguem valendo pros dois modos.
    return d.anuncios.flatMap((a) => agruparCriativos([a], anoPadrao));
  }, [d.anuncios, agrupar, anoPadrao]);

  const marcasEfetivas = useMemo(() => new Map(grupos.map((grupo) => [
    grupo.chave,
    resolverMarcaCriativo(grupo, marcas.get(grupo.chave)),
  ])), [grupos, marcas]);

  const catalogo = useMemo(() => {
    const editores = new Set<string>(), tags = new Set<string>();
    for (const m of marcasEfetivas.values()) { if (m.editor) editores.add(m.editor); for (const t of m.tags) tags.add(t); }
    return { editores: [...editores].sort(), tags: [...tags].sort() };
  }, [marcasEfetivas]);

  const lista = useMemo(() => {
    const termos = busca.toLowerCase().split(/\s+/).map((t) => t.trim()).filter(Boolean);
    const l = grupos.filter((g) => {
      const m = marcasEfetivas.get(g.chave);
      if (tipoF !== "todos" && g.tipo !== tipoF) return false;
      if (editorF && (m?.editor || "") !== editorF) return false;
      if (tagF && !(m?.tags || []).includes(tagF)) return false;
      if (termos.length) { const t = textoBusca(g, m); if (!termos.every((x) => t.includes(x))) return false; }
      return true;
    });
    l.sort((a, b) => {
      if (ordem === "roas") return (b.roas ?? -1) - (a.roas ?? -1);
      if (ordem === "purchases") return b.purchases - a.purchases;
      if (ordem === "ctr") return b.ctr - a.ctr;
      return b.spend - a.spend;
    });
    return l;
  }, [grupos, marcasEfetivas, busca, tipoF, editorF, tagF, ordem]);

  const fundidos = useMemo(() => grupos.filter((g) => g.anuncios > 1).length, [grupos]);

  if (d.anuncios.length === 0) {
    return <div className="tf-panel" style={{ padding: 34, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Sem criativos com gasto no período.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── Barra: busca + agrupar + ordenação ── */}
      <div className="tf-panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 260px", minWidth: 220 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none" }}>
              <Icon name="search" size={15} color="var(--text-dim)" />
            </span>
            <input value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, campanha, tag ou editor…"
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 30px 9px 32px", borderRadius: 10, border: `1px solid ${busca ? "var(--primary)" : "var(--border)"}`, background: "var(--surface)", color: "var(--text)", fontSize: 13 }} />
            {busca && (
              <button onClick={() => setBusca("")} title="Limpar" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}>
                <Icon name="x" size={14} color="var(--text-dim)" />
              </button>
            )}
          </div>

          <button onClick={() => setAgrupar((v) => !v)}
            title="Junta num card só os anúncios com o mesmo nome (e as cópias) da mesma safra"
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 13px", borderRadius: 10, cursor: "pointer", fontSize: 12.5, fontWeight: 700, border: `1px solid ${agrupar ? "transparent" : "var(--border)"}`, background: agrupar ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: agrupar ? "var(--on-primary, #fff)" : "var(--text)" }}>
            <Icon name="layout-grid" size={14} color={agrupar ? "#fff" : "var(--text-dim)"} />
            Agrupar iguais
          </button>

          <div style={{ display: "inline-flex", gap: 2, background: "var(--seg-track)", borderRadius: 10, padding: 3 }}>
            {ORDENS.map((o) => (
              <button key={o.k} onClick={() => setOrdem(o.k)}
                style={{ padding: "6px 11px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: ordem === o.k ? "var(--seg-pill)" : "transparent", color: ordem === o.k ? "var(--text)" : "var(--text-dim)" }}>{o.l}</button>
            ))}
          </div>
        </div>

        {/* ── Filtros: tipo · editor · tag ── */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {(["todos", "video", "imagem"] as const).map((t) => (
            <Chip key={t} on={tipoF === t} onClick={() => setTipoF(t)} label={t === "todos" ? "Todos" : t === "video" ? "Vídeo" : "Imagem"} />
          ))}
          {catalogo.editores.length > 0 && <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 2px" }} />}
          {catalogo.editores.map((e) => (
            <Chip key={e} on={editorF === e} onClick={() => setEditorF(editorF === e ? null : e)} label={e} icone="user" />
          ))}
          {catalogo.tags.length > 0 && <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 2px" }} />}
          {catalogo.tags.map((t) => (
            <Chip key={t} on={tagF === t} onClick={() => setTagF(tagF === t ? null : t)} label={t} icone="tag" />
          ))}
        </div>

        <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
          {lista.length} {lista.length === 1 ? "criativo" : "criativos"}
          {agrupar && fundidos > 0 && <> · {fundidos} agrupado(s) por nome + safra</>}
          {indisponivel && <> · <span style={{ color: "var(--tf-warn)" }}>tags/editor indisponíveis: rode <code>supabase/trafego_criativos.sql</code></span></>}
        </div>
      </div>

      {/* ── Grade ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 215px), 1fr))", gap: 14 }}>
        {lista.map((g, i) => (
          <CardCriativo key={g.chave + (agrupar ? "" : g.ads[0]?.id)} g={g} marca={marcasEfetivas.get(g.chave)} ligado={ligacao.porNome(g.nome)} onAbrir={() => setAberto(i)} />
        ))}
      </div>
      {lista.length === 0 && (
        <div className="tf-panel" style={{ padding: 30, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
          Nenhum criativo bate com o filtro.
        </div>
      )}

      {aberto != null && lista[aberto] && (
        <CriativoModal
          lista={lista} idx={aberto} marcas={marcasEfetivas}
          since={d.since} until={d.until}
          editores={catalogo.editores} tagsExistentes={catalogo.tags}
          onIr={(n) => setAberto(Math.max(0, Math.min(lista.length - 1, n)))}
          onSalvar={salvar} onClose={() => setAberto(null)}
        />
      )}
    </div>
  );
}

function Chip({ label, on, onClick, icone }: { label: string; on: boolean; onClick: () => void; icone?: string }) {
  return (
    <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? "transparent" : "var(--border)"}`, background: on ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: on ? "var(--on-primary, #fff)" : "var(--text)" }}>
      {icone && <Icon name={icone} size={12} color={on ? "#fff" : "var(--text-dim)"} />}
      {label}
    </button>
  );
}

function CardCriativo({ g, marca, ligado, onAbrir }: { g: GrupoCriativo; marca?: MarcaCriativo; ligado?: CriativoLigado | null; onAbrir: () => void }) {
  // Sem miniatura da Meta (acontece: anúncio pausado, prévia bloqueada), a
  // capa da NOSSA biblioteca serve de thumb — o card deixa de ser um ícone cinza.
  const capa = ligado?.capa ?? null;
  return (
    <div className="tf-panel" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div onClick={onAbrir} data-nozoom title="Ver criativo" role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAbrir(); } }}
        style={{ position: "relative", aspectRatio: "1 / 1", background: "var(--surface-2)", overflow: "hidden", cursor: "pointer" }}>
        {g.thumb
          ? <img src={g.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : capa && capa.tipo === "imagem"
            ? <img src={capa.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : capa
            ? <video src={`${capa.url}#t=0.1`} preload="metadata" muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}><Icon name={g.tipo === "video" ? "player-play" : "photo"} size={28} color="var(--text-dim)" /></div>}
        {/* Ligado ao cadastro do Marketing: mostra o código. Quem procura "o
            JL-041" acha sem abrir card por card. */}
        {ligado && (
          <span title={`Criativo ${ligado.codigo} no Marketing${capa ? " · peça na biblioteca" : ""}`} style={{ position: "absolute", left: 8, bottom: 8, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "rgba(0,0,0,.62)", color: "#fff" }}>
            <Icon name={capa ? "photo" : "id-badge"} size={11} color="#fff" /> {ligado.codigo}
          </span>
        )}
        {g.tipo === "video" && (
          <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
            <span style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center" }}><Icon name="player-play" size={20} color="#fff" /></span>
          </span>
        )}
        {/* Quantos anúncios foram fundidos neste card. */}
        {g.anuncios > 1 && (
          <span title={`${g.anuncios} anúncios com este mesmo criativo`} style={{ position: "absolute", left: 8, top: 8, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "rgba(0,0,0,.62)", color: "#fff" }}>
            <Icon name="layout-grid" size={11} color="#fff" /> {g.anuncios}
          </span>
        )}
        {g.conflito && (
          <span title="Mesmo nome e ano, mas o vídeo/imagem é diferente — confira antes de somar" style={{ position: "absolute", right: 8, top: 8, display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 999, background: "var(--tf-warn)" }}>
            <Icon name="alert-triangle" size={13} color="#fff" />
          </span>
        )}
      </div>

      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.nome}>{g.nome}</div>
          <div style={{ fontSize: 10.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {g.campanhas.length > 1 ? `${g.campanhas.length} campanhas · ${g.safra}` : `${limpar(g.campanhas[0] || "—")} · ${g.safra}`}
          </div>
        </div>

        {(marca?.editor || (marca?.tags?.length ?? 0) > 0) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {marca?.editor && <Selo texto={marca.editor} icone="user" />}
            {marca?.tags.map((t) => <Selo key={t} texto={t} icone="tag" />)}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: "auto" }}>
          <Met l="ROAS" v={roasStr(g.roas)} cor={roasCor(g.roas)} />
          <Met l="CTR" v={pctStr(g.ctr)} />
          <Met l="Investido" v={brl(g.spend)} />
          <Met l="Compras" v={fmtNum(g.purchases)} />
        </div>
      </div>
    </div>
  );
}

function Selo({ texto, icone }: { texto: string; icone: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "color-mix(in srgb, var(--primary) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 26%, transparent)", color: "var(--text)" }}>
      <Icon name={icone} size={10} color="var(--primary-texto)" /> {texto}
    </span>
  );
}

function Met({ l, v, cor }: { l: string; v: string; cor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, color: "var(--text-dim)", fontWeight: 600 }}>{l}</div>
      <div className="tf-num" style={{ fontSize: 13.5, fontWeight: 800, color: cor || "var(--text)" }}>{v}</div>
    </div>
  );
}

// ── Prévia do criativo ──────────────────────────────────────────────────────
// Redesenhada: em telas largas vira DUAS COLUNAS (mídia à esquerda, ficha à
// direita) em vez do modal estreito com tarja preta. A mídia ocupa a altura
// toda e o painel direito concentra métricas, tags, editor e os anúncios do
// grupo. Navega com ← → entre os criativos da lista filtrada.
export function CriativoModal({ lista, idx, marcas, editores, tagsExistentes, since, until, onIr, onSalvar, onClose }: {
  lista: GrupoCriativo[]; idx: number; marcas: Map<string, MarcaCriativo>;
  editores: string[]; tagsExistentes: string[];
  since: string; until: string;
  onIr: (n: number) => void;
  onSalvar: (chave: string, nome: string, patch: Partial<Omit<MarcaCriativo, "chave">>) => void;
  onClose: () => void;
}) {
  const g = lista[idx];
  const marca = marcas.get(g.chave);
  const ehVideo = g.tipo === "video";
  const adId = g.ads[0]?.id || "";
  // Nome do anúncio → criativo do Marketing (pelo código). Uma ida só por
  // criativo aberto; o hook guarda por chave.
  const nomesDoModal = useMemo(() => [g.nome], [g.nome]);
  const { porNome } = useCriativosPorNome(nomesDoModal);
  const ligado = porNome(g.nome);

  type Prev = { src: string; width: number | null; height: number | null };
  const [prev, setPrev] = useState<Prev | null | false>(ehVideo ? null : false);
  const buscados = useRef(new Map<string, Prev | false>());
  const [presentationSignal, setPresentationSignal] = useState(0);
  const [analysisSelection, setAnalysisSelection] = useState<CreativePeriodSelection>({ preset: "panel", since, until });

  useEffect(() => setAnalysisSelection({ preset: "panel", since, until }), [since, until, g.chave]);

  const fallbackMetrics = useMemo(() => deriveCreativeMetrics({
    spend: g.spend,
    revenue: g.revenue,
    impressions: g.impressions,
    reach: null,
    clicks: g.clicks,
    landingPageViews: g.lpv ?? null,
    initiateCheckout: g.checkout ?? null,
    purchases: g.purchases,
    videoPlays: null,
    videoViews3s: null,
    videoViews2s: null,
    videoViews25: null,
    videoViews50: null,
    videoViews75: null,
    videoViews95: null,
    videoViews100: null,
    videoAvgWatchTime: null,
    thruPlays: null,
  }), [g]);

  const creativeAdIds = useMemo(() => g.ads.map((ad) => ad.id).filter(Boolean), [g]);
  const { payload: intelligenceBruta, loading: intelligenceLoading, error: intelligenceError } = useCreativeIntelligence({
    creativeKey: g.chave,
    adIds: creativeAdIds,
    since: analysisSelection.since,
    until: analysisSelection.until,
  });
  // A análise vem da rota própria com a fatura crua; a chave "Com imposto" do
  // topo converte custo e ROAS igual ao panorama (a grade já chega convertida).
  const [comImp] = useComImposto();
  const intelligence = useMemo(() => (intelligenceBruta && comImp ? comImposto(intelligenceBruta, fatorImposto()) : intelligenceBruta), [intelligenceBruta, comImp]);
  // Quando a peça subiu na Meta pela primeira vez. Não depende do período em
  // tela: o anúncio original costuma estar pausado e fora da lista.
  const estreia = useEstreiaCriativo(creativeAdIds);

  useEffect(() => {
    if (!ehVideo || !adId) { setPrev(false); return; }
    const cache = buscados.current.get(adId);
    if (cache !== undefined) { setPrev(cache); return; }
    setPrev(null);
    let vivo = true;
    fetch(`/api/trafego/ad-preview?adId=${encodeURIComponent(adId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const v: Prev | false = j && j.src ? { src: j.src, width: j.width ?? null, height: j.height ?? null } : false;
        buscados.current.set(adId, v);
        if (vivo) setPrev(v);
      })
      .catch(() => { if (vivo) setPrev(false); });
    return () => { vivo = false; };
  }, [ehVideo, adId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && idx < lista.length - 1) onIr(idx + 1);
      if (e.key === "ArrowLeft" && idx > 0) onIr(idx - 1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, onIr, idx, lista.length]);

  return (
    <Portal>
      <div onClick={onClose} data-nozoom className="tf-scope sheet-host ci-modal-host">
        <div onClick={(e) => e.stopPropagation()} className="tf-panel sheet ci-modal" role="dialog" aria-modal="true" aria-labelledby="ci-modal-title">
          <header className="ci-modal-header">
            <button aria-label="Voltar para criativos" onClick={onClose} title="Voltar"><Icon name="chevron-left" size={18} color="var(--text)" /></button>
            <div className="ci-modal-heading">
              <div id="ci-modal-title" title={g.nome}>{g.nome}</div>
              <div>
                safra {g.safra} · {g.anuncios} {g.anuncios === 1 ? "anúncio" : "anúncios"} · {g.campanhas.length} {g.campanhas.length === 1 ? "campanha" : "campanhas"}
                {estreia && <Estreia estreia={estreia} />}
              </div>
            </div>
            <div className="ci-modal-nav">
              <span>{idx + 1}/{lista.length}</span>
              <button aria-label="Criativo anterior" onClick={() => onIr(idx - 1)} disabled={idx === 0} title="Anterior (←)"><Icon name="chevron-left" size={18} color="var(--text)" /></button>
              <button aria-label="Próximo criativo" onClick={() => onIr(idx + 1)} disabled={idx >= lista.length - 1} title="Próximo (→)"><Icon name="chevron-right" size={18} color="var(--text)" /></button>
              <i aria-hidden="true" />
              <button aria-label="Fechar detalhes" onClick={onClose} title="Fechar (Esc)"><Icon name="x" size={19} color="var(--text)" /></button>
            </div>
          </header>

          <div className="cs-corpo ci-modal-body">
            <aside className="ci-media">
              <div className="ci-ad-card">
                <div className="ci-ad-card-label">Anúncio</div>
                <div className="ci-ad-card-title"><h2>{g.nome}</h2><Icon name="dots" size={20} color="var(--text)" /></div>
                <div className="ci-ad-card-media">
              {ehVideo ? (
                prev === null ? (
                  <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 300, display: "grid", placeItems: "center" }}>
                    {g.thumb && <img src={g.thumb} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", opacity: .3 }} />}
                    <div className="spin" style={{ width: 28, height: 28, borderRadius: "50%", border: "3px solid var(--border)", borderTopColor: "var(--primary)", position: "relative" }} />
                  </div>
                ) : prev ? (
                  <FacebookAdPreview src={prev.src} title={g.nome} width={prev.width} height={prev.height} />
                ) : (
                  <div style={{ textAlign: "center", color: "var(--text-dim)", padding: 24 }}>
                    {g.thumb && <img src={g.thumb} alt="" style={{ maxWidth: "100%", maxHeight: "46dvh", objectFit: "contain", borderRadius: 10, marginBottom: 12 }} />}
                    <div style={{ fontSize: 12 }}>A Meta não liberou a prévia deste vídeo.</div>
                    {g.permalink && <div style={{ fontSize: 12, marginTop: 4 }}>Use “Abrir no Facebook”.</div>}
                  </div>
                )
              ) : g.thumb ? (
                <img src={g.thumb} alt={g.nome} style={{ maxWidth: "100%", maxHeight: "72dvh", objectFit: "contain", display: "block", borderRadius: 10 }} />
              ) : (
                <Icon name="photo" size={40} color="var(--text-dim)" />
              )}
                </div>
              </div>

              {/* A PEÇA NOSSA, quando o nome do anúncio traz um código que existe
                  no Marketing. Só leitura aqui: quem sobe peça é o Marketing,
                  pela biblioteca do criativo. */}
              {ligado ? (
                <div className="ci-ad-card">
                  <div className="ci-ad-card-label">Biblioteca · {ligado.codigo}</div>
                  <BibliotecaCriativo criativoId={ligado.id} codigo={ligado.codigo} podeEditar={false} compacta />
                </div>
              ) : codigoDoNome(g.nome) ? (
                <div className="ci-ad-card" style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.45 }}>
                  O código <b>{codigoDoNome(g.nome)}</b> do nome não existe no Marketing. Cadastre o criativo lá e a peça aparece aqui.
                </div>
              ) : null}
            </aside>

            {/* Ficha */}
            {/* minHeight:0: como item de grid o padrão é min-height:auto, que faz
                a coluna CRESCER com o conteúdo em vez de rolar — a lista "Onde
                rodou" vazava pra fora do modal e era cortada. Com 0 ela respeita
                a altura do modal e rola dentro de si. */}
            <div className="ci-details">
              {g.conflito && (
                <Alerta tom="atencao">
                  Anúncios com este nome e ano usam <b>mídias diferentes</b>. As métricas estão somadas — confira se é mesmo o mesmo criativo.
                </Alerta>
              )}

              <CreativeIntelligencePanel
                payload={intelligence}
                fallback={analysisSelection.since === since && analysisSelection.until === until ? { name: g.nome, metrics: fallbackMetrics } : undefined}
                loading={intelligenceLoading}
                error={intelligenceError}
                openPresentationSignal={presentationSignal}
                previewUrl={g.thumb}
                panelPeriod={{ since, until }}
                periodSelection={analysisSelection}
                onPeriodSelectionChange={setAnalysisSelection}
              />

              <details className="ci-operations">
                <summary><span><Icon name="adjustments-horizontal" size={15} color="var(--text-dim)" /> Organização do criativo</span><small>Editor, tags e campanhas</small></summary>
                <div className="ci-operations-grid">
                  <Campo titulo="Editor de vídeo" icone="user">
                    <Autocompletar valor={marca?.editor || ""} sugestoes={editores} placeholder="Quem editou…"
                      onConfirmar={(v) => onSalvar(g.chave, g.nome, { editor: v || null })} />
                  </Campo>

                  <Campo titulo="Tags" icone="tag">
                    <EditorTags tags={marca?.tags || []} sugestoes={tagsExistentes}
                      onMudar={(tags) => onSalvar(g.chave, g.nome, { tags })} />
                  </Campo>

                  <Campo titulo={`Onde rodou (${g.campanhas.length})`} icone="list" className="ci-operation-campaigns">
                    <div className="ci-campaign-list">
                      {g.campanhas.map((c) => (
                        <div key={c} title={c}>{limpar(c)}</div>
                      ))}
                    </div>
                  </Campo>
                </div>
              </details>

              <div className="ci-modal-actions">
                {g.permalink && (
                  <a href={g.permalink} target="_blank" rel="noreferrer">
                    <Icon name="external-link" size={14} color="currentColor" /> Abrir no Facebook
                  </a>
                )}
                <button onClick={() => setPresentationSignal((value) => value + 1)} disabled={!intelligence}>
                  <Icon name="file-text" size={15} color="currentColor" /> Gerar apresentação
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// "subiu em 12/03/2026 (há 5 meses)" — a idade do criativo. A fonte (upload da
// peça ou criação do anúncio) fica no title: é o porquê, não o dado.
function Estreia({ estreia }: { estreia: EstreiaCriativo }) {
  const r = rotuloDaEstreia(estreia);
  return <> · <span title={r.explicacao}>subiu em <time dateTime={estreia.em}>{r.data}</time> ({r.idade})</span></>;
}

function Campo({ titulo, icone, children, className }: { titulo: string; icone: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-dim)", marginBottom: 7 }}>
        <Icon name={icone} size={12} color="var(--text-dim)" /> {titulo}
      </div>
      {children}
    </div>
  );
}

// Texto livre + sugestões já usadas (datalist nativo: sem dependência nova).
function Autocompletar({ valor, sugestoes, placeholder, onConfirmar }: { valor: string; sugestoes: string[]; placeholder: string; onConfirmar: (v: string) => void }) {
  const [v, setV] = useState(valor);
  useEffect(() => { setV(valor); }, [valor]);
  const id = `ac-${sugestoes.length}-${placeholder.length}`;
  return (
    <>
      <input list={id} value={v} placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v.trim() !== valor) onConfirmar(v.trim()); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
        style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5 }} />
      <datalist id={id}>{sugestoes.map((s) => <option key={s} value={s} />)}</datalist>
    </>
  );
}

function EditorTags({ tags, sugestoes, onMudar }: { tags: string[]; sugestoes: string[]; onMudar: (t: string[]) => void }) {
  const [nova, setNova] = useState("");
  const add = (t: string) => {
    const v = t.trim();
    if (!v || tags.includes(v)) { setNova(""); return; }
    onMudar([...tags, v]); setNova("");
  };
  const livres = sugestoes.filter((s) => !tags.includes(s)).slice(0, 8);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {tags.map((t) => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, padding: "3px 5px 3px 9px", borderRadius: 999, background: "color-mix(in srgb, var(--primary) 13%, transparent)", border: "1px solid color-mix(in srgb, var(--primary) 28%, transparent)" }}>
              {t}
              <button onClick={() => onMudar(tags.filter((x) => x !== t))} title={`Tirar "${t}"`}
                style={{ display: "grid", placeItems: "center", width: 16, height: 16, borderRadius: "50%", border: "none", background: "transparent", cursor: "pointer" }}>
                <Icon name="x" size={11} color="var(--text-dim)" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <input value={nova} onChange={(e) => setNova(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(nova); } }}
          placeholder="Nova tag + Enter"
          style={{ flex: 1, minWidth: 0, boxSizing: "border-box", padding: "8px 11px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5 }} />
        <BotaoIcone icone="plus" titulo="Adicionar tag" variante="secundario" onClick={() => add(nova)} disabled={!nova.trim()} style={{ flex: "none" }} />
      </div>
      {livres.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {livres.map((s) => (
            <button key={s} onClick={() => add(s)} style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, border: "1px dashed var(--border)", background: "transparent", color: "var(--text-dim)", cursor: "pointer" }}>+ {s}</button>
          ))}
        </div>
      )}
    </div>
  );
}
