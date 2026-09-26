"use client";

// Bloco de VÍDEO / VSL.
//
// Progresso por provedor, com fallback honesto. Não existe integração universal
// de iframe — cada player fala um protocolo diferente por postMessage:
//
//   YouTube → manda {event:"listening"} e ele responde "infoDelivery" com
//             currentTime/duration (precisa de enablejsapi=1 na URL).
//   Vimeo   → addEventListener("timeupdate") e ele responde com seconds/percent.
//   Panda   → emite mensagens com currentTime/duration; tratamos pelo formato.
//   mp4     → <video> nativo: timeupdate exato, sem gambiarra.
//   outros  → NÃO reportamos progresso (temProgresso=false). A UI do editor
//             avisa e a liberação por tempo cai pro relógio da página.
//
// SEGURANÇA: o src nunca é HTML do usuário — `embedDoVideo` já validou o
// provedor contra a allowlist e montou a URL (ver lib/tridiflow-pagina-estilo).

import { useCallback, useEffect, useRef } from "react";
import type { Bloco } from "@/lib/tridiflow-pagina";
import { SANDBOX_VIDEO, embedDoVideo, urlImagemSegura, TEXTO } from "@/lib/tridiflow-pagina-estilo";

export interface ProgressoVideo {
  iniciou?: boolean;
  segundos?: number;
  percentual?: number;
  terminou?: boolean;
  reporta?: boolean;
}

const PROPORCAO: Record<string, string> = { "16:9": "56.25%", "9:16": "177.78%", "4:3": "75%", "1:1": "100%" };

export function VideoBloco({ bloco, onProgresso, interativo = true }: {
  bloco: Bloco;
  onProgresso?: (p: ProgressoVideo) => void;
  /** No editor o vídeo não deve roubar o clique de seleção do bloco. */
  interativo?: boolean;
}) {
  const embed = embedDoVideo(bloco.video);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const jaIniciou = useRef(false);

  const reportar = useCallback((p: ProgressoVideo) => { onProgresso?.(p); }, [onProgresso]);

  // ── Provedores por iframe (postMessage) ────────────────────────────────────
  useEffect(() => {
    if (embed.tipo !== "iframe" || !embed.temProgresso || !onProgresso) return;
    const win = () => iframeRef.current?.contentWindow ?? null;

    // Handshake: cada player só começa a falar depois de ser cutucado.
    const cutucar = () => {
      const w = win();
      if (!w) return;
      try {
        if (embed.provedor === "youtube") {
          w.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "*");
        } else if (embed.provedor === "vimeo") {
          for (const ev of ["play", "timeupdate", "ended"]) {
            w.postMessage(JSON.stringify({ method: "addEventListener", value: ev }), "*");
          }
        }
      } catch { /* cross-origin fecha a porta: seguimos sem progresso */ }
    };

    // O iframe pode não estar pronto no primeiro tick.
    const t0 = setTimeout(cutucar, 400);
    const t1 = setInterval(cutucar, 2000);

    const aoReceber = (ev: MessageEvent) => {
      // Só aceita mensagem VINDA do nosso iframe — evita qualquer página/extensão
      // injetar progresso falso e destravar a oferta antes da hora.
      if (iframeRef.current && ev.source !== iframeRef.current.contentWindow) return;
      let d: unknown = ev.data;
      if (typeof d === "string") { try { d = JSON.parse(d); } catch { return; } }
      if (!d || typeof d !== "object") return;
      const m = d as Record<string, unknown>;

      // YouTube
      if (m.event === "infoDelivery" && m.info) {
        const info = m.info as { currentTime?: number; duration?: number; playerState?: number };
        const seg = Number(info.currentTime ?? 0);
        const dur = Number(info.duration ?? 0);
        if (info.playerState === 1 && !jaIniciou.current) { jaIniciou.current = true; reportar({ iniciou: true, reporta: true }); }
        if (dur > 0) reportar({ segundos: seg, percentual: Math.min(100, (seg / dur) * 100), reporta: true });
        if (info.playerState === 0) reportar({ terminou: true, percentual: 100, reporta: true });
        return;
      }
      // Vimeo
      if (m.event === "timeupdate" && m.data) {
        const data = m.data as { seconds?: number; percent?: number };
        if (!jaIniciou.current) { jaIniciou.current = true; reportar({ iniciou: true, reporta: true }); }
        reportar({ segundos: Number(data.seconds ?? 0), percentual: Number(data.percent ?? 0) * 100, reporta: true });
        return;
      }
      if (m.event === "play" && !jaIniciou.current) { jaIniciou.current = true; reportar({ iniciou: true, reporta: true }); return; }
      if (m.event === "ended") { reportar({ terminou: true, percentual: 100, reporta: true }); return; }

      // Panda e genéricos que mandam currentTime/duration soltos.
      const seg = Number(m.currentTime ?? (m as { time?: number }).time ?? NaN);
      const dur = Number(m.duration ?? NaN);
      if (Number.isFinite(seg) && Number.isFinite(dur) && dur > 0) {
        if (!jaIniciou.current) { jaIniciou.current = true; reportar({ iniciou: true, reporta: true }); }
        const pct = Math.min(100, (seg / dur) * 100);
        reportar({ segundos: seg, percentual: pct, reporta: true });
        if (pct >= 99.5) reportar({ terminou: true, reporta: true });
      }
    };

    window.addEventListener("message", aoReceber);
    return () => { clearTimeout(t0); clearInterval(t1); window.removeEventListener("message", aoReceber); };
  }, [embed.tipo, embed.provedor, embed.temProgresso, embed.src, onProgresso, reportar]);

  // ── Arquivo direto: progresso exato ────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (embed.tipo !== "arquivo" || !v || !onProgresso) return;
    const aoTocar = () => { if (!jaIniciou.current) { jaIniciou.current = true; reportar({ iniciou: true, reporta: true }); } };
    const aoTempo = () => {
      const dur = v.duration || 0;
      if (dur > 0) reportar({ segundos: v.currentTime, percentual: Math.min(100, (v.currentTime / dur) * 100), reporta: true });
    };
    const aoFim = () => reportar({ terminou: true, percentual: 100, reporta: true });
    v.addEventListener("play", aoTocar);
    v.addEventListener("timeupdate", aoTempo);
    v.addEventListener("ended", aoFim);
    return () => { v.removeEventListener("play", aoTocar); v.removeEventListener("timeupdate", aoTempo); v.removeEventListener("ended", aoFim); };
  }, [embed.tipo, onProgresso, reportar]);

  // Avisa de cara se o player NÃO reporta — quem decide o fallback é o runtime.
  useEffect(() => {
    if (embed.tipo !== "vazio" && !embed.temProgresso) onProgresso?.({ reporta: false });
  }, [embed.tipo, embed.temProgresso, onProgresso]);

  const pad = PROPORCAO[bloco.video?.proporcao ?? "16:9"] ?? PROPORCAO["16:9"];
  const raio = bloco.estilo?.raio ?? 12;

  if (embed.tipo === "vazio") {
    return (
      <div style={{
        position: "relative", width: "100%", paddingTop: pad, borderRadius: raio,
        background: "color-mix(in srgb, currentColor 8%, transparent)",
        border: "1px dashed color-mix(in srgb, currentColor 25%, transparent)",
      }}>
        <span style={{
          position: "absolute", inset: 0, display: "grid", placeItems: "center",
          fontSize: 13, opacity: TEXTO.secundario,
        }}>Adicione o link ou o código do vídeo</span>
      </div>
    );
  }

  const capa = urlImagemSegura(bloco.video?.capaUrl);

  return (
    <div style={{ position: "relative", width: "100%", paddingTop: pad, borderRadius: raio, overflow: "hidden", background: "#000" }}>
      {embed.tipo === "arquivo" ? (
        <video
          ref={videoRef}
          src={embed.src}
          poster={capa || undefined}
          controls={bloco.video?.controles !== false}
          autoPlay={!!bloco.video?.autoplay}
          muted={bloco.video?.mudo !== false}
          playsInline
          preload="metadata"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
        />
      ) : (
        <iframe
          ref={iframeRef}
          src={embed.src}
          title="Vídeo"
          loading="lazy"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          sandbox={SANDBOX_VIDEO}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, pointerEvents: interativo ? "auto" : "none" }}
        />
      )}
    </div>
  );
}
