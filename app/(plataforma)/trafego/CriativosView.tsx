"use client";

// Tráfego Pago — Biblioteca de criativos. Galeria premium dos anúncios com
// selo de desempenho (Vencedor / Saturando / Em teste / Baixo), ordenação e
// comparação lado a lado. Dados REAIS do Meta (AdsOverview.anuncios).
import { useEffect, useMemo, useRef, useState } from "react";
import type { AdsOverview, AdRow } from "@/lib/meta-ads";
import { fmtBRL2, fmtNum } from "@/lib/format";
import { Icon } from "../Icon";
import { Portal } from "../Portal";
import { TrocaIcone } from "../ui/micro";
import { Cartao, LinkDeAcao } from "./TfKit";
import { FacebookAdPreview } from "./creative-intelligence/FacebookAdPreview";
import { LinkDeVendaLinha } from "./LinkDeVenda";
import { Botao, BotaoIcone } from "../ui/controles";

const brl = (n: number) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const pct = (n: number) => n.toFixed(2) + "%";
const roasStr = (r: number | null) => (r == null ? "—" : r.toFixed(2) + "×");
const roasColor = (r: number | null) => (r == null ? "var(--text-dim)" : r >= 2 ? "var(--ok)" : r >= 1 ? "var(--atencao)" : "var(--perigo)");
const limpar = (s: string) => s.replace(/\{[^}]+\}/g, "").trim() || s;

function selo(a: AdRow): { txt: string; cor: string } | null {
  if (a.roas != null && a.roas >= 3 && a.purchases >= 3) return { txt: "Vencedor", cor: "var(--ok)" };
  if (a.roas != null && a.roas < 1 && a.spend > 50) return { txt: "Baixo desempenho", cor: "var(--perigo)" };
  if (a.frequency >= 3.5 || (a.ctr < 1 && a.spend > 100)) return { txt: "Saturando", cor: "var(--atencao)" };
  if (a.spend < 50) return { txt: "Em teste", cor: "var(--azul)" };
  return null;
}

type Ordem = "roas" | "ctr" | "spend" | "purchases";
const ORDENS: { k: Ordem; l: string }[] = [{ k: "roas", l: "Melhor ROAS" }, { k: "purchases", l: "Mais vendas" }, { k: "spend", l: "Mais investido" }, { k: "ctr", l: "Maior CTR" }];

export function CriativosView({ d }: { d: AdsOverview }) {
  const [ordem, setOrdem] = useState<Ordem>("roas");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [comparar, setComparar] = useState(false);
  const [preview, setPreview] = useState<AdRow | null>(null);   // criativo aberto no modal

  const anuncios = useMemo(() => [...d.anuncios].sort((a, b) => {
    if (ordem === "roas") return (b.roas ?? -1) - (a.roas ?? -1);
    if (ordem === "purchases") return b.purchases - a.purchases;
    if (ordem === "ctr") return b.ctr - a.ctr;
    return b.spend - a.spend;
  }), [d.anuncios, ordem]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else if (n.size < 4) n.add(id); return n; });
  const selecionados = anuncios.filter((a) => sel.has(a.id));

  if (d.anuncios.length === 0) return <div className="tf-scope"><div className="tf-panel" style={{ padding: 34, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Sem criativos com gasto no período.</div></div>;

  return (
    <div className="tf-scope" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)" }}>Ordenar:</span>
        {ORDENS.map((o) => (
          <button key={o.k} onClick={() => setOrdem(o.k)} style={{ padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: "pointer", border: `1px solid ${ordem === o.k ? "transparent" : "var(--tf-line)"}`, background: ordem === o.k ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: ordem === o.k ? "var(--on-primary, #fff)" : "var(--text)" }}>{o.l}</button>
        ))}
        {sel.size >= 2 && <Botao variante="primario" icone="git-compare" onClick={() => setComparar(true)} style={{ marginLeft: "auto" }}>Comparar {sel.size}</Botao>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 210px), 1fr))", gap: 14 }}>
        {anuncios.map((a) => {
          const s = selo(a); const marcado = sel.has(a.id);
          return (
            // Cartão do kit com a mídia colada no topo (padding 0 — a foto sangra
            // até a borda; a largura fixa do .tf-cartao-midia é pro horizontal,
            // então a faixa de mídia aqui segue própria, com os overlays).
            <Cartao key={a.id} style={{ padding: 0, gap: 0, overflow: "hidden", outline: marcado ? "2px solid var(--primary)" : "none" }}>
              <div onClick={() => setPreview(a)} data-nozoom title="Clique pra ver o criativo" style={{ position: "relative", aspectRatio: "1 / 1", background: "var(--surface-2)", overflow: "hidden", cursor: "pointer" }}>
                {a.thumb ? <img src={a.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}><Icon name={a.tipo === "video" ? "player-play" : "photo"} size={30} color="var(--text-dim)" /></div>}
                {/* Play central pros vídeos: convida a abrir a prévia. */}
                {a.tipo === "video" && <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}><span style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center", boxShadow: "0 2px 10px rgba(0,0,0,.4)" }}><Icon name="player-play" size={22} color="#fff" /></span></span>}
                {a.tipo === "video" && <span style={{ position: "absolute", left: 8, bottom: 8, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: "rgba(0,0,0,.6)", color: "#fff" }}><Icon name="player-play" size={11} color="#fff" /> Vídeo</span>}
                {s && <span style={{ position: "absolute", right: 8, top: 8, fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, background: s.cor, color: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,.3)" }}>{s.txt}</span>}
                <button onClick={(e) => { e.stopPropagation(); toggle(a.id); }} title="Selecionar p/ comparar" style={{ position: "absolute", left: 8, top: 8, width: 24, height: 24, borderRadius: 7, display: "grid", placeItems: "center", border: "none", cursor: "pointer", background: marcado ? "var(--primary)" : "rgba(0,0,0,.5)" }}><TrocaIcone ligado={marcado} a="circle-plus" b="check" size={14} corA="var(--on-primary)" corB="var(--on-primary)" /></button>
              </div>
              <Cartao.Corpo style={{ padding: "11px 13px", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.name}>{a.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{limpar(a.campaign)}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: "auto" }}>
                  <Met l="ROAS" v={roasStr(a.roas)} cor={roasColor(a.roas)} />
                  <Met l="CTR" v={pct(a.ctr)} />
                  <Met l="Investido" v={brl(a.spend)} />
                  <Met l="Compras" v={fmtNum(a.purchases)} />
                </div>
                {a.permalink && (
                  <Cartao.Rodape>
                    <LinkDeAcao href={a.permalink} externo>Ver anúncio</LinkDeAcao>
                  </Cartao.Rodape>
                )}
              </Cartao.Corpo>
            </Cartao>
          );
        })}
      </div>

      {comparar && selecionados.length >= 2 && <CompararModal ads={selecionados} onClose={() => setComparar(false)} />}
      {preview && <PreviewModal ad={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

// Modal de PRÉVIA do criativo. Portado pro <body> (Portal) porque a Tridify
// roda dentro de ancestrais com transform/backdrop-filter — o position:fixed
// ficava "contido" por eles, saindo do centro e escurecendo só um pedaço da
// tela (era o "fundo escuro / não centralizado" do print). No <body> o fixed
// volta a ser relativo à tela inteira.
//
// Vídeo: o campo `source` do Graph é BLOQUEADO pra este app ("(#10) Application
// does not have permission"), e o embed público (plugins/video.php) dá "Vídeo
// indisponível". A via que funciona é o AD PREVIEW oficial: /{ad_id}/previews
// devolve um <iframe> assinado que renderiza o criativo real (com o player de
// vídeo). Buscamos via /api/trafego/ad-preview e embutimos o iframe. Se nem o
// preview vier, sobra o link "Abrir no Facebook".
export function PreviewModal({ ad, onClose }: { ad: AdRow; onClose: () => void }) {
  const ehVideo = ad.tipo === "video";
  // Preview oficial do anúncio (iframe). null = buscando · objeto = pronto · false = indisponível.
  type Prev = { src: string; width: number | null; height: number | null };
  const [prev, setPrev] = useState<Prev | null | false>(ehVideo ? null : false);
  const buscou = useRef(false);

  useEffect(() => {
    if (!ehVideo || !ad.id || buscou.current) return;
    buscou.current = true;
    let vivo = true;
    fetch(`/api/trafego/ad-preview?adId=${encodeURIComponent(ad.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (vivo) setPrev(j && j.src ? { src: j.src, width: j.width ?? null, height: j.height ?? null } : false); })
      .catch(() => { if (vivo) setPrev(false); });
    return () => { vivo = false; };
  }, [ehVideo, ad.id]);

  // Fecha no Esc.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const alturaMidia = "min(72dvh, 620px)";

  return (
    <Portal>
      {/* data-nozoom: impede o GlobalLightbox (visor "Abrir original") de
          sequestrar o clique dentro do modal — era o que "bugava" o player. */}
      <div onClick={onClose} data-nozoom className="tf-scope sheet-host" style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(8,10,18,.72)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", padding: 20, animation: "tfFade .18s ease both" }}>
        <div onClick={(e) => e.stopPropagation()} className="tf-panel sheet" style={{ width: "min(600px, 100%)", maxHeight: "90dvh", display: "flex", flexDirection: "column", overflow: "hidden", padding: 0, animation: "riseIn .22s ease both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderBottom: "1px solid var(--tf-line, var(--border))", flex: "none" }}>
            <Icon name={ehVideo ? "player-play" : "photo"} size={16} color="var(--primary-texto)" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ad.name}>{ad.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{limpar(ad.campaign)}</div>
            </div>
            <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={onClose} style={{ flex: "none" }} />
          </div>
          <div style={{ background: "#000", display: "grid", placeItems: "center", minHeight: ehVideo ? 315 : undefined, maxHeight: ehVideo ? "min(72dvh, 640px)" : undefined, overflow: "auto", flex: "none" }}>
            {ehVideo
              ? prev === null
                // Buscando o preview — thumb esmaecida com spinner por cima.
                ? <div style={{ position: "relative", width: "100%", height: alturaMidia, display: "grid", placeItems: "center" }}>
                    {ad.thumb && <img src={ad.thumb} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", opacity: .35 }} />}
                    <div className="spin" style={{ width: 30, height: 30, borderRadius: "50%", border: "3px solid rgba(255,255,255,.25)", borderTopColor: "#fff", position: "relative" }} />
                  </div>
                : prev
                  // Preview oficial do anúncio (renderiza o vídeo). Tamanho natural do iframe, centrado.
                  ? <FacebookAdPreview src={prev.src} title={ad.name} width={prev.width} height={prev.height} />
                  // Nem o preview veio — placeholder; o "Abrir no Facebook" do rodapé resolve.
                  : <div style={{ padding: 60 }}><Icon name="player-play" size={40} color="var(--text-dim)" /></div>
              : ad.thumb
                ? <img src={ad.thumb} alt={ad.name} style={{ width: "100%", height: "auto", maxHeight: "70dvh", objectFit: "contain", display: "block" }} />
                : <div style={{ padding: 60 }}><Icon name="photo" size={40} color="var(--text-dim)" /></div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", flexWrap: "wrap", flex: "none" }}>
            <Met l="ROAS" v={roasStr(ad.roas)} cor={roasColor(ad.roas)} />
            <Met l="CTR" v={pct(ad.ctr)} />
            <Met l="Investido" v={brl(ad.spend)} />
            <Met l="Compras" v={fmtNum(ad.purchases)} />
            {ad.permalink && <a href={ad.permalink} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: "var(--text-dim)", textDecoration: "none" }}><Icon name="external-link" size={13} color="var(--text-dim)" /> Abrir no Facebook</a>}
          </div>
          {/* Pra onde o criativo manda. Uma linha só: o modal tem teto de 90dvh
              e todos os blocos são `flex: none` — um painel alto aqui nasceria
              cortado. A versão completa está na gaveta de detalhes. */}
          {ad.id && <div style={{ flex: "none" }}><LinkDeVendaLinha adId={ad.id} /></div>}
          {ehVideo && prev === false && <div style={{ padding: "0 16px 14px", fontSize: 11.5, color: "var(--text-dim)", flex: "none" }}>Não deu pra carregar a prévia deste criativo — abra no Facebook pra ver o vídeo.</div>}
        </div>
      </div>
    </Portal>
  );
}

function Met({ l, v, cor }: { l: string; v: string; cor?: string }) {
  return <div><div style={{ fontSize: 9.5, color: "var(--text-dim)", fontWeight: 600 }}>{l}</div><div className="tf-num" style={{ fontSize: 13.5, fontWeight: 800, color: cor || "var(--text)" }}>{v}</div></div>;
}

function CompararModal({ ads, onClose }: { ads: AdRow[]; onClose: () => void }) {
  const linhas: { l: string; f: (a: AdRow) => string; cor?: (a: AdRow) => string }[] = [
    { l: "ROAS", f: (a) => roasStr(a.roas), cor: (a) => roasColor(a.roas) },
    { l: "CTR", f: (a) => pct(a.ctr) },
    { l: "CPA", f: (a) => (a.cpa == null ? "—" : fmtBRL2(a.cpa)) },
    { l: "CPC", f: (a) => fmtBRL2(a.cpc) },
    { l: "Frequência", f: (a) => a.frequency.toFixed(1) },
    { l: "Investido", f: (a) => brl(a.spend) },
    { l: "Faturamento", f: (a) => brl(a.revenue) },
    { l: "Compras", f: (a) => fmtNum(a.purchases) },
    { l: "Impressões", f: (a) => fmtNum(a.impressions) },
  ];
  return (
    <div onClick={onClose} className="tf-scope sheet-host" style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(8,10,18,.5)", backdropFilter: "blur(3px)", display: "grid", placeItems: "center", padding: 20, animation: "tfFade .18s ease both" }}>
      <div onClick={(e) => e.stopPropagation()} className="tf-panel sheet" style={{ width: "min(760px, 100%)", maxHeight: "88dvh", overflowY: "auto", padding: 20, animation: "riseIn .22s ease both" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Comparar criativos</div>
          <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={onClose} style={{ marginLeft: "auto" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `120px repeat(${ads.length}, 1fr)`, gap: 8, alignItems: "center" }}>
          <span />
          {ads.map((a) => (
            <div key={a.id} style={{ textAlign: "center" }}>
              <div style={{ aspectRatio: "1/1", borderRadius: 10, overflow: "hidden", background: "var(--surface-2)", marginBottom: 6 }}>{a.thumb ? <img src={a.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}><Icon name="photo" size={22} color="var(--text-dim)" /></div>}</div>
              <div style={{ fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.name}>{a.name}</div>
            </div>
          ))}
          {linhas.map((r) => (
            <FragmentRow key={r.l} label={r.l} ads={ads} r={r} />
          ))}
        </div>
      </div>
    </div>
  );
}
function FragmentRow({ label, ads, r }: { label: string; ads: AdRow[]; r: { f: (a: AdRow) => string; cor?: (a: AdRow) => string } }) {
  return (
    <>
      <span style={{ gridColumn: "1", fontSize: 12, color: "var(--text-dim)", fontWeight: 700, borderTop: "1px solid var(--tf-line-soft)", padding: "8px 0" }}>{label}</span>
      {ads.map((a) => <span key={a.id} className="tf-num" style={{ textAlign: "center", fontSize: 13.5, fontWeight: 800, color: r.cor ? r.cor(a) : "var(--text)", borderTop: "1px solid var(--tf-line-soft)", padding: "8px 0" }}>{r.f(a)}</span>)}
    </>
  );
}
