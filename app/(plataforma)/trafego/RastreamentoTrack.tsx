"use client";

// Tráfego Pago — aba Rastreamento (Fase 2): instala o pixel próprio (tf-track.js),
// mostra o status ao vivo (eventos recebidos), o feed de eventos e a jornada do
// visitante. Dados reais do endpoint /api/t (público) → /api/trafego/track.
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../Icon";
import type { EventoRow, TrackResumo } from "@/lib/trafego-track";
import { Botao, BotaoIcone } from "../ui/controles";

const LABEL: Record<string, string> = {
  pageview: "Página vista", whatsapp_click: "Clique no WhatsApp", checkout: "Checkout iniciado",
  lead: "Lead", compra: "Compra", form_start: "Início de formulário", form_submit: "Formulário enviado",
};
const rel = (iso: string) => {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "agora";
  const m = Math.floor(s / 60); if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
};

export function RastreamentoTrack() {
  const [resumo, setResumo] = useState<TrackResumo | null>(null);
  const [recentes, setRecentes] = useState<EventoRow[]>([]);
  const [jornada, setJornada] = useState<{ vid: string; itens: EventoRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiado, setCopiado] = useState(false);

  const origem = typeof window !== "undefined" ? window.location.origin : "";
  const snippet = `<script src="${origem}/tf-track.js" data-site="meu-site"></script>`;

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/trafego/track", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      setResumo(d.resumo ?? null); setRecentes(d.recentes ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  function verJornada(vid: string) {
    setJornada({ vid, itens: [] });
    fetch(`/api/trafego/track?vid=${encodeURIComponent(vid)}`, { cache: "no-store" })
      .then((r) => r.json()).then((d) => setJornada({ vid, itens: d.jornada ?? [] })).catch(() => {});
  }
  const copiar = () => { navigator.clipboard.writeText(snippet); setCopiado(true); setTimeout(() => setCopiado(false), 1500); };
  const nomeEv = (e: string) => LABEL[e] || e;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Instalação */}
      <div className="glass" style={{ borderRadius: 18, padding: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", marginBottom: 4 }}>Instale o rastreador</div>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "0 0 12px", lineHeight: 1.5 }}>
          Cole este script antes de <code>&lt;/body&gt;</code> nas suas páginas/landing pages. Ele captura UTMs (origem preservada), cria o visitante, controla a sessão e registra páginas e eventos. Troque <code>meu-site</code> por um nome pra identificar a origem.
        </p>
        <div style={{ position: "relative" }}>
          {/* Kinetics 016 · Copy Button: o ícone cruza pro check e o rótulo
              troca, depois volta. aria-live lê o "Copiado" pra quem não vê. */}
          <Botao variante="secundario" tamanho="sm" icone="copy" estado={copiado ? "ok" : "ocioso"} onClick={copiar} aria-live="polite" style={{ position: "absolute", top: 8, right: 8 }}>
            {copiado ? "Copiado!" : "Copiar"}
          </Botao>
          <pre style={{ margin: 0, background: "#0f172a", color: "#e2e8f0", borderRadius: 12, padding: 14, fontSize: 12, overflowX: "auto", fontFamily: "ui-monospace, Menlo, monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{snippet}</pre>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "10px 0 0", lineHeight: 1.5 }}>
          Eventos custom no seu código: <code>tfTrack(&apos;checkout&apos;, {'{'} valor: 97 {'}'})</code>. O clique em links de WhatsApp é registrado automaticamente.
        </p>
      </div>

      {/* Status ao vivo */}
      <div className="glass" style={{ borderRadius: 18, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>Status ao vivo</span>
          <Botao variante="secundario" tamanho="sm" icone="refresh" onClick={load} carregando={loading} style={{ marginLeft: "auto" }}>Atualizar</Botao>
        </div>
        {!resumo || resumo.eventos24h === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-dim)" }}>
            <Icon name="world" size={30} color="var(--text-dim)" />
            <p style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", marginTop: 8 }}>Nenhum evento recebido ainda</p>
            <p style={{ fontSize: 12.5, margin: "4px 0 0" }}>Instale o script acima e abra a página. Os eventos aparecem aqui em segundos. Verifique também as UTMs do link do anúncio.</p>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: 12, marginBottom: 14 }}>
              <Kpi label="Eventos (24h)" valor={resumo.eventos24h.toLocaleString("pt-BR")} />
              <Kpi label="Visitantes" valor={resumo.visitantes.toLocaleString("pt-BR")} />
              <Kpi label="Último evento" valor={resumo.ultimoEm ? rel(resumo.ultimoEm) : "—"} />
            </div>
            {resumo.porTipo.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {resumo.porTipo.map((t) => (
                  <span key={t.evento} style={{ fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 999, background: "var(--surface-2)", color: "var(--text)" }}>{nomeEv(t.evento)} · {t.n}</span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Eventos recentes + jornada */}
      {recentes.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: jornada ? "1fr 1fr" : "1fr", gap: 16, alignItems: "start" }}>
          <div className="glass" style={{ borderRadius: 18, padding: "6px 18px" }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", padding: "12px 0 6px" }}>Eventos recentes</div>
            {recentes.map((e) => (
              <button key={e.eid} onClick={() => verJornada(e.vid)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 0", borderTop: "1px solid var(--border)", background: "none", border: "none", cursor: "pointer" }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 12%, transparent)" }}><Icon name={e.evento === "whatsapp_click" ? "brand-whatsapp" : "world"} size={15} color="var(--primary-texto)" /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{nomeEv(e.evento)}</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.utm.utm_source ? `${e.utm.utm_source}${e.utm.utm_campaign ? " · " + e.utm.utm_campaign : ""} · ` : ""}{e.device || ""}
                  </div>
                </div>
                <span style={{ flex: "none", fontSize: 11.5, color: "var(--text-dim)" }}>{rel(e.criadoEm)}</span>
              </button>
            ))}
          </div>

          {jornada && (
            <div className="glass" style={{ borderRadius: 18, padding: 18, position: "sticky", top: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text)" }}>Jornada do visitante</span>
                <code style={{ fontSize: 11, color: "var(--text-dim)" }}>{jornada.vid.slice(0, 10)}…</code>
                <BotaoIcone icone="x" titulo="Fechar" onClick={() => setJornada(null)} style={{ marginLeft: "auto" }} />
              </div>
              {jornada.itens.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Carregando…</p> : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {jornada.itens.map((e, i) => (
                    <div key={e.eid} style={{ display: "flex", gap: 11 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "none" }}>
                        <span style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--primary)", marginTop: 4 }} />
                        {i < jornada.itens.length - 1 && <span style={{ flex: 1, width: 2, background: "var(--border)", margin: "2px 0" }} />}
                      </div>
                      <div style={{ paddingBottom: 14, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{nomeEv(e.evento)}</div>
                        <div style={{ fontSize: 11, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis" }}>{e.url || ""}</div>
                        <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 1 }}>{new Date(e.criadoEm).toLocaleString("pt-BR")}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ background: "var(--surface-2)", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", letterSpacing: "-.02em" }}>{valor}</div>
    </div>
  );
}
