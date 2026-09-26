"use client";

// Publicação & Embed — link público, QR e formas de incorporar (iframe + bubble).
import { useState } from "react";
import { Icon } from "../../Icon";
import { toast } from "../../Toast";
import { GlassSelect } from "../../GlassPicker";
import { Botao, BotaoIcone } from "../../ui/controles";
import { SecaoIframe } from "../_shared/SecaoIframe";
import type { BotSettings } from "@/lib/tridiflow";

interface Dom { id: string; host: string }
export function PublicarModal({ dominioPadrao, dominios, dominioId, setDominioId, slug, setSlug, settings, onSettings, onClose }: {
  dominioPadrao: string; dominios: Dom[]; dominioId: string | null; setDominioId: (v: string | null) => void; slug: string; setSlug: (v: string) => void;
  /** Quando presentes, a aba Link ganha a seção "Publicar como iframe" —
   *  é como fluxo e quiz existentes ligam o iframe sem mudar de tipo. */
  settings?: BotSettings; onSettings?: (s: BotSettings) => void;
  onClose: () => void;
}) {
  const [aba, setAba] = useState<"link" | "iframe" | "bubble">("link");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const host = dominios.find((d) => d.id === dominioId)?.host || dominioPadrao;
  const link = `https://${host}/f/${slug}`;
  const iframe = `<iframe src="${link}" width="100%" height="640" style="border:0;border-radius:16px"></iframe>`;
  const bubble = `<script src="${origin}/tf-embed.js" data-bot="${link}" data-cor="var(--primary-texto)"></script>`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=190x190&margin=8&data=${encodeURIComponent(link)}`;
  const copiar = (t: string) => { navigator.clipboard.writeText(t); toast.ok("Copiado."); };

  const abas: [typeof aba, string, string][] = [["link", "Link", "world"], ["iframe", "Incorporar (iframe)", "code"], ["bubble", "Bubble de chat", "message-chatbot"]];

  return (
    // `--z-modal` (1300) e não 5000 escrito na mão: o painel do GlassSelect vai
    // pro <body> por portal em `--z-pop` (1400), então um véu em 5000 nascia POR
    // CIMA da lista de domínios — ela abria invisível atrás do véu e o clique na
    // opção acertava o véu, que fecha o modal. Era o "não consigo trocar o
    // domínio". Ver `--z-pop`/`--z-modal` no globals.css.
    <div onClick={onClose} className="sheet-host" style={{ position: "fixed", inset: 0, zIndex: "var(--z-modal, 1300)", background: "rgba(16,24,40,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6dvh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} className="tf-workspace sheet" style={{ width: "min(620px, 100%)", background: "var(--bg)", borderRadius: 18, border: "1px solid var(--border)", boxShadow: "0 24px 70px rgba(16,24,40,.35)", overflow: "hidden", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div><div style={{ fontSize: 17, fontWeight: 800, color: "var(--text)" }}>Publicação & Embed</div><div style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Compartilhe o link ou incorpore em sites e landing pages.</div></div>
          <BotaoIcone icone="x" titulo="Fechar" onClick={onClose} />
        </div>

        {/* As três abas somam ~370px: no celular rolam de lado (.tab-strip). */}
        <div className="tab-strip" style={{ display: "flex", gap: 6, padding: "12px 20px 0" }}>
          {abas.map(([k, label, ic]) => (
            <button key={k} onClick={() => setAba(k)}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 10, border: "1px solid " + (aba === k ? "transparent" : "var(--border)"), background: aba === k ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: aba === k ? "var(--on-primary, #fff)" : "var(--text)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
              <Icon name={ic} size={14} color={aba === k ? "#fff" : "var(--text-dim)"} /> {label}
            </button>
          ))}
        </div>

        <div style={{ padding: 20 }}>
          {/* Endereço editável (domínio + slug) */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)", marginBottom: 6 }}>Endereço do bot</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <GlassSelect value={dominioId ?? ""} onChange={(v) => setDominioId(v || null)}
                style={{ width: "auto", minWidth: 170 }}
                options={[{ value: "", label: `${dominioPadrao} (padrão)` }, ...dominios.map((d) => ({ value: d.id, label: d.host }))]} />
              <span style={{ fontSize: 13, color: "var(--text-dim)" }}>/f/</span>
              <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug"
                style={{ flex: 1, minWidth: 160, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 11px", color: "var(--text)", fontSize: 13, outline: "none" }} />
            </div>
            {!dominios.length && (
              <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "8px 0 0", lineHeight: 1.45 }}>
                Só o domínio padrão está disponível. Para usar um domínio próprio, cadastre em Configurações › Domínios — é o mesmo cadastro das páginas.
              </p>
            )}
          </div>

          {aba === "link" && (
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)", marginBottom: 6 }}>Link público</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", fontSize: 13, outline: "none" }} />
                  <Botao variante="primario" onClick={() => copiar(link)}>Copiar</Botao>
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <a href={link} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}><Icon name="external-link" size={14} color="var(--text-dim)" /> Abrir</a>
                  <a href={`https://wa.me/?text=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5, fontWeight: 700, textDecoration: "none" }}><Icon name="brand-whatsapp" size={14} color="#25d366" /> WhatsApp</a>
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)", marginBottom: 6 }}>QR Code</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="QR do bot" width={150} height={150} style={{ borderRadius: 12, border: "1px solid var(--border)" }} />
                <div><a href={qr} download="qr-bot.png" style={{ fontSize: 12, color: "var(--primary-texto, var(--primary))", fontWeight: 700, textDecoration: "none" }}>Baixar QR</a></div>
              </div>
            </div>
          )}

          {aba === "link" && settings && onSettings && (
            <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
              <SecaoIframe settings={settings} onChange={onSettings} />
            </div>
          )}

          {aba === "iframe" && <Snippet titulo="Cole no HTML da sua página" texto={iframe} onCopy={() => copiar(iframe)} nota="Incorpora o bot direto na página, ocupando a largura do container." />}
          {aba === "bubble" && <Snippet titulo="Cole antes de </body>" texto={bubble} onCopy={() => copiar(bubble)} nota="Cria um botão flutuante no canto que abre o bot num painel. Ajuste data-cor / data-pos (right|left)." />}
        </div>
      </div>
    </div>
  );
}

function Snippet({ titulo, texto, onCopy, nota }: { titulo: string; texto: string; onCopy: () => void; nota: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-dim)" }}>{titulo}</span>
        <Botao tamanho="sm" icone="copy" onClick={onCopy}>Copiar</Botao>
      </div>
      <pre style={{ margin: 0, background: "#0f172a", color: "#e2e8f0", borderRadius: 12, padding: 14, fontSize: 12, lineHeight: 1.55, overflowX: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{texto}</pre>
      <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "8px 0 0", lineHeight: 1.4 }}>{nota}</p>
    </div>
  );
}
