"use client";

// Feed de IDEIAS da central: os nossos reels de onde usar o carimbo, em tela
// cheia, um embaixo do outro — a lógica do Shorts. Acabou um, rola sozinho
// pro próximo; acabou a lista, recomeça (infinito). Cada reel carrega o botão
// de carrinho com o link que o editor escolheu.
//
// Três decisões:
//  • Só o reel VISÍVEL toca (IntersectionObserver). Os outros ficam pausados
//    e só baixam a capa (`preload="none"`) — dez vídeos tocando juntos no 4G
//    era a página morrendo.
//  • "Infinito" é a lista repetida em voltas, montadas conforme a pessoa se
//    aproxima do fim. Uma volta nova só nasce quando falta uma tela pra acabar.
//  • Vai pro <body> por portal (regra do CLAUDE.md: nada fixo dentro da coluna)
//    e trava a rolagem do fundo enquanto está aberto.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/app/(plataforma)/Icon";
import { embedDoTutorialVideo, urlPublicaSegura, type ReelCentral } from "@/lib/tridiflow-tutoriais";
import { carregarApi } from "./[tutorial]/PlayerYoutube";
import { menosMovimento } from "./rolagem";

const externo = (url: string) => /^https?:\/\//i.test(url);

export function FeedIdeias({ reels, onFechar }: { reels: ReelCentral[]; onFechar: () => void }) {
  const [voltas, setVoltas] = useState(1);
  const [ativo, setAtivo] = useState(0);
  const [mudo, setMudo] = useState(true);
  const lista = useRef<HTMLDivElement>(null);
  const total = reels.length * voltas;

  // Fundo parado e Esc fecha.
  useEffect(() => {
    const antes = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", tecla);
    return () => { document.documentElement.style.overflow = antes; window.removeEventListener("keydown", tecla); };
  }, [onFechar]);

  // Qual reel está na tela: o que ocupa mais da metade.
  useEffect(() => {
    const raiz = lista.current;
    if (!raiz) return;
    const obs = new IntersectionObserver((itens) => {
      for (const it of itens) if (it.isIntersecting) setAtivo(Number((it.target as HTMLElement).dataset.i));
    }, { root: raiz, threshold: 0.6 });
    raiz.querySelectorAll<HTMLElement>("[data-i]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [total]);

  // Falta uma tela pra acabar: monta mais uma volta.
  useEffect(() => { if (ativo >= total - 2) setVoltas((v) => v + 1); }, [ativo, total]);

  const irPara = useCallback((i: number) => {
    const el = lista.current?.querySelector<HTMLElement>(`[data-i="${i}"]`);
    el?.scrollIntoView({ behavior: menosMovimento() ? "auto" : "smooth", block: "start" });
  }, []);
  const proximo = useCallback(() => irPara(ativo + 1), [ativo, irPara]);

  return createPortal(
    <div className="tut-feed" role="dialog" aria-modal="true" aria-label="Ideias de uso">
      <div className="tut-feed-topo">
        <strong>Ideias</strong>
        <button type="button" className="tut-feed-btn" onClick={() => setMudo((m) => !m)} aria-label={mudo ? "Ligar o som" : "Tirar o som"}>
          <Icon name={mudo ? "volume-off" : "volume"} size={20} />
        </button>
        <button type="button" className="tut-feed-btn" onClick={onFechar} aria-label="Fechar ideias">
          <Icon name="x" size={22} />
        </button>
      </div>
      <div className="tut-feed-lista" ref={lista}>
        {Array.from({ length: total }, (_, i) => {
          const r = reels[i % reels.length];
          return <Reel key={i} i={i} reel={r} ativo={i === ativo} perto={Math.abs(i - ativo) <= 1} mudo={mudo} onAcabou={proximo} />;
        })}
      </div>
    </div>,
    document.body,
  );
}

function Reel({ i, reel, ativo, perto, mudo, onAcabou }: {
  i: number; reel: ReelCentral; ativo: boolean; perto: boolean; mudo: boolean; onAcabou: () => void;
}) {
  const embed = embedDoTutorialVideo(reel.videoUrl);
  const link = urlPublicaSegura(reel.linkUrl);
  return <section className="tut-reel" data-i={i} aria-label={reel.titulo || `Ideia ${i + 1}`}>
    {embed?.tipo === "youtube"
      ? <ReelYoutube id={embed.id!} capa={reel.capaUrl} ativo={ativo} perto={perto} mudo={mudo} onAcabou={onAcabou} />
      : <ReelVideo url={embed?.url ?? reel.videoUrl} capa={reel.capaUrl} ativo={ativo} perto={perto} mudo={mudo} onAcabou={onAcabou} />}
    <div className="tut-reel-sombra" aria-hidden="true" />
    <div className="tut-reel-info">
      {reel.titulo && <strong>{reel.titulo}</strong>}
      {reel.legenda && <p>{reel.legenda}</p>}
    </div>
    {link && <a className="tut-reel-carrinho" href={link} {...(externo(link) ? { target: "_blank", rel: "noreferrer noopener" } : null)}>
      <Icon name="shopping-cart" size={20} />{reel.botao || "Comprar"}
    </a>}
  </section>;
}

function ReelVideo({ url, capa, ativo, perto, mudo, onAcabou }: {
  url: string; capa: string; ativo: boolean; perto: boolean; mudo: boolean; onAcabou: () => void;
}) {
  const v = useRef<HTMLVideoElement>(null);
  const [pausado, setPausado] = useState(false);
  useEffect(() => {
    const el = v.current;
    if (!el) return;
    if (ativo) { el.currentTime = 0; setPausado(false); el.play().catch(() => setPausado(true)); }
    else el.pause();
  }, [ativo]);
  const alternar = () => {
    const el = v.current;
    if (!el) return;
    if (el.paused) { void el.play(); setPausado(false); } else { el.pause(); setPausado(true); }
  };
  return <>
    <video ref={v} className="tut-reel-midia" src={url} poster={capa || undefined} muted={mudo} playsInline
      preload={perto ? "auto" : "none"} onEnded={onAcabou} onClick={alternar} />
    {pausado && <button type="button" className="tut-reel-play" onClick={alternar} aria-label="Tocar"><Icon name="player-play" size={34} /></button>}
  </>;
}

type YTPlayer = { mute(): void; unMute(): void; playVideo(): void; pauseVideo(): void; seekTo(s: number): void; destroy(): void };

/** Shorts do YouTube pela IFrame API: é ela que avisa quando o vídeo acabou
 *  (o iframe cru não conta), e é assim que o feed passa pro próximo. Só monta
 *  o player do reel na tela — cada iframe do YouTube pesa ~1 MB. */
function ReelYoutube({ id, capa, ativo, perto, mudo, onAcabou }: {
  id: string; capa: string; ativo: boolean; perto: boolean; mudo: boolean; onAcabou: () => void;
}) {
  const alvo = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const acabou = useRef(onAcabou);
  acabou.current = onAcabou;
  const estado = useRef({ ativo, mudo });
  estado.current = { ativo, mudo };
  const montar = ativo || perto;

  useEffect(() => {
    if (!montar || !alvo.current) return;
    let vivo = true;
    const div = document.createElement("div");
    alvo.current.appendChild(div);
    void carregarApi().then(() => {
      if (!vivo) return;
      const YT = (window as unknown as { YT: { Player: new (el: HTMLElement, o: unknown) => YTPlayer } }).YT;
      player.current = new YT.Player(div, {
        videoId: id, host: "https://www.youtube-nocookie.com",
        playerVars: { autoplay: 0, controls: 0, modestbranding: 1, playsinline: 1, rel: 0, mute: 1 },
        events: {
          // O player nasce depois do efeito de `ativo`: quem já está na tela toca aqui.
          onReady: () => { const p = player.current; if (!p) return; if (!estado.current.mudo) p.unMute(); if (estado.current.ativo) p.playVideo(); },
          onStateChange: (e: { data: number }) => { if (e.data === 0) acabou.current(); } },
      });
    });
    return () => { vivo = false; player.current?.destroy(); player.current = null; div.remove(); };
  }, [montar, id]);

  useEffect(() => {
    const p = player.current;
    if (!p || typeof p.playVideo !== "function") return;
    if (ativo) { p.seekTo(0); p.playVideo(); } else p.pauseVideo();
  }, [ativo]);
  useEffect(() => {
    const p = player.current;
    if (!p || typeof p.mute !== "function") return;
    if (mudo) p.mute(); else p.unMute();
  }, [mudo]);

  return <div className="tut-reel-midia tut-reel-yt" style={capa ? { backgroundImage: `url(${JSON.stringify(capa)})` } : undefined}>
    <div ref={alvo} className="tut-reel-yt-alvo" />
  </div>;
}
