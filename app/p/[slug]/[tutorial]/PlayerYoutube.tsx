"use client";

// Player PRÓPRIO por cima de um vídeo do YouTube.
//
// O usuário não quer o chrome do YouTube (barra de controle, logo, sugestões).
// A gente não hospeda o arquivo, então o vídeo continua vindo do YouTube — mas
// pela IFrame API, com `controls=0` e `modestbranding=1`: o player deles fica
// mudo e sem barra, e QUEM controla play/tempo/volume/velocidade é a nossa
// interface aqui embaixo (as mesmas peças de qualquer player nativo).
//
// Só monta no clique (a fachada em VideoTutorial cuida disso), então o ~1,3 MB
// de script de terceiro só desce pra quem pediu pra assistir.
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/app/(plataforma)/Icon";
import { estiloDoRecorte, type RegiaoVideo } from "@/lib/tridiflow-tutoriais";

// A IFrame API é global e carrega uma vez só; várias montagens compartilham a
// mesma promessa em vez de reinjetar o <script>.
let apiPronta: Promise<void> | null = null;
export function carregarApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const w = window as unknown as { YT?: { Player: unknown }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve();
  if (apiPronta) return apiPronta;
  apiPronta = new Promise<void>((resolve) => {
    const anterior = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { anterior?.(); resolve(); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return apiPronta;
}

const tempo = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
};

const VELOCIDADES = [0.5, 1, 1.5, 2] as const;

export function PlayerYoutube({ videoId, titulo, imersivo, onAlternarImersivo, recorte }: {
  videoId: string; titulo: string;
  /** Modo imersivo (a caixa flutuando no meio da tela) — quem controla é o VideoTutorial. */
  imersivo?: boolean; onAlternarImersivo?: () => void;
  /** Onde está o conteúdo no quadro (fora das barras pretas gravadas). O
   *  iframe é ampliado pra essa região encher a caixa; o resto fica fora. */
  recorte?: RegiaoVideo;
}) {
  const alvo = useRef<HTMLDivElement>(null);
  const player = useRef<any>(null);
  const raf = useRef<number>(0);
  const [tocando, setTocando] = useState(true);
  const [pronto, setPronto] = useState(false);
  const [duracao, setDuracao] = useState(0);
  const [agora, setAgora] = useState(0);
  const [mudo, setMudo] = useState(false);
  const [velocidade, setVelocidade] = useState(1);
  const [menuVel, setMenuVel] = useState(false);
  const [mostrar, setMostrar] = useState(true);

  useEffect(() => {
    let vivo = true;
    carregarApi().then(() => {
      if (!vivo || !alvo.current) return;
      const YT = (window as any).YT;
      player.current = new YT.Player(alvo.current, {
        videoId, host: "https://www.youtube-nocookie.com",
        playerVars: {
          controls: 0, modestbranding: 1, rel: 0, playsinline: 1, disablekb: 1,
          iv_load_policy: 3, fs: 0, autoplay: 1, cc_load_policy: 0,
        },
        events: {
          onReady: (e: any) => { setPronto(true); setDuracao(e.target.getDuration() || 0); },
          onStateChange: (e: any) => {
            // 1 = tocando, 2 = pausado, 0 = terminou
            if (e.data === 1) { setTocando(true); setDuracao(e.target.getDuration() || 0); }
            else if (e.data === 2) setTocando(false);
            else if (e.data === 0) setTocando(false);
          },
        },
      });
    });
    return () => { vivo = false; cancelAnimationFrame(raf.current); try { player.current?.destroy?.(); } catch { /* já foi */ } };
  }, [videoId]);

  // Relógio da barra: só roda enquanto toca, e é rAF (interface, sem rede).
  useEffect(() => {
    if (!tocando || !pronto) return;
    const passo = () => {
      const p = player.current;
      if (p?.getCurrentTime) { setAgora(p.getCurrentTime() || 0); const d = p.getDuration?.() || 0; if (d) setDuracao(d); }
      raf.current = requestAnimationFrame(passo);
    };
    raf.current = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf.current);
  }, [tocando, pronto]);

  // Autoesconde a barra enquanto toca; volta em qualquer toque/mouse.
  useEffect(() => {
    if (!tocando) { setMostrar(true); return; }
    const t = setTimeout(() => { if (!menuVel) setMostrar(false); }, 2600);
    return () => clearTimeout(t);
  }, [tocando, mostrar, menuVel]);

  const play = useCallback(() => {
    const p = player.current; if (!p) return;
    if (tocando) p.pauseVideo(); else p.playVideo();
  }, [tocando]);

  const buscar = useCallback((pct: number) => {
    const p = player.current; if (!p || !duracao) return;
    const t = Math.min(Math.max(pct, 0), 100) / 100 * duracao;
    p.seekTo(t, true); setAgora(t);
  }, [duracao]);

  const alternarMudo = useCallback(() => {
    const p = player.current; if (!p) return;
    if (mudo) { p.unMute(); setMudo(false); } else { p.mute(); setMudo(true); }
  }, [mudo]);

  const trocarVel = useCallback((v: number) => {
    player.current?.setPlaybackRate?.(v); setVelocidade(v); setMenuVel(false);
  }, []);

  const progresso = duracao ? (agora / duracao) * 100 : 0;

  return (
    <div
      className="ytp-own"
      data-tocando={tocando ? "1" : undefined}
      data-mostra={mostrar ? "1" : undefined}
      onMouseMove={() => setMostrar(true)}
      onPointerDown={() => setMostrar(true)}
    >
      {/* a IFrame API troca esta div pelo <iframe> */}
      <div className="ytp-quadro" style={recorte ? estiloDoRecorte(recorte) : undefined}><div ref={alvo} /></div>
      {/* captura o toque no vídeo pra dar play/pause sem passar pro iframe */}
      <button type="button" className="ytp-tela" onClick={play} aria-label={tocando ? "Pausar" : "Tocar"} />

      {!pronto && <div className="ytp-carregando" aria-hidden><span /></div>}

      <div className="ytp-barra">
        {/* Progresso na linha de cima, largura inteira: no Shorts (~250px) a
            barra dividida com cinco botões virava um toco de 40px. */}
        <input
          className="ytp-scrub" type="range" min={0} max={100} step={0.1} value={progresso}
          onChange={(e) => buscar(Number(e.target.value))}
          aria-label="Avançar o vídeo" style={{ ["--p" as string]: `${progresso}%` }}
        />
        <div className="ytp-linha">
          <button type="button" className="ytp-b" onClick={play} aria-label={tocando ? "Pausar" : "Tocar"}>
            <Icon name={tocando ? "player-pause" : "player-play"} size={20} />
          </button>
          <span className="ytp-t">{tempo(agora)}<span className="ytp-t-total"> / {tempo(duracao)}</span></span>
          <span className="ytp-espaco" />

          <div className="ytp-vel">
            <button type="button" className="ytp-b ytp-b-txt" onClick={() => setMenuVel((v) => !v)} aria-haspopup="menu" aria-expanded={menuVel} aria-label={`Velocidade ${velocidade}×`}>
              {velocidade}×
            </button>
            {menuVel && (
              <>
                <button type="button" className="ytp-vel-fora" aria-label="Fechar velocidades" onClick={() => setMenuVel(false)} />
                <div className="ytp-vel-menu" role="menu">
                  {VELOCIDADES.map((v) => (
                    <button key={v} type="button" role="menuitemradio" aria-checked={velocidade === v}
                      className="ytp-vel-op" data-on={velocidade === v ? "1" : undefined} onClick={() => trocarVel(v)}>
                      {v}×
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button type="button" className="ytp-b ytp-som" onClick={alternarMudo} aria-label={mudo ? "Ativar som" : "Silenciar"}>
            <Icon name={mudo ? "volume-off" : "volume"} size={20} />
          </button>

          {onAlternarImersivo && (
            <button type="button" className="ytp-b" onClick={onAlternarImersivo}
              aria-label={imersivo ? "Sair da tela cheia" : "Ver em tela cheia"} title={imersivo ? "Sair da tela cheia" : "Ver em tela cheia"}>
              <Icon name={imersivo ? "arrows-diagonal-minimize" : "arrows-maximize"} size={20} />
            </button>
          )}
        </div>
      </div>

      <span className="ytp-titulo" aria-hidden>{titulo}</span>
    </div>
  );
}
