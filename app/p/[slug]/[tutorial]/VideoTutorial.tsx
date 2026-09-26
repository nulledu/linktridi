"use client";

// Vídeo do tutorial — FACHADA, não iframe.
//
// O embed do YouTube puxa ~1,3 MB de script de terceiro e abre conexão com
// quatro domínios ANTES de alguém apertar o play. Num tutorial com três passos
// em vídeo isso é a página inteira gasta em players que talvez ninguém assista,
// e no celular em 4G é o tempo até o texto ficar utilizável.
//
// Então o que nasce na página é a miniatura (uma imagem) com um botão de play.
// O iframe só é montado no clique — aí já com `autoplay=1`, porque quem clicou
// pediu pra assistir e não deve ter de clicar de novo.
//
// Assistir abre o MODO IMERSIVO: o vídeo flutua grande no meio da tela, com a
// página esmaecida atrás e ainda rolável/clicável. Não é o fullscreen do
// navegador — é a mesma caixa do player que passa a `position: fixed`.
// Mover o player pra um portal remontaria o <iframe>, e o YouTube recomeçaria
// do zero a cada abrir/fechar; trocando só a classe, o vídeo nem pisca. A
// vaga na página guarda a altura, então o texto de baixo não sobe.
//
// Rolar/arrastar a página com o vídeo aberto ENCAIXA o vídeo no topo (como o
// YouTube mostra os comentários): o véu sai e o tutorial aparece embaixo,
// com o vídeo tocando em cima. Voltar ao ponto onde abriu — ou arrastar o
// vídeo pra baixo — devolve o vídeo grande ao centro.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as PointerEventReact, type ReactNode } from "react";
import { Icon } from "@/app/(plataforma)/Icon";
import { REGIAO_INTEIRA, conteudoDoVideo, dimensoesDoJpeg, embedDoTutorialVideo, estiloDoRecorte, regiaoSemBarras, type RegiaoVideo } from "@/lib/tridiflow-tutoriais";
import { PlayerYoutube } from "./PlayerYoutube";

// Formato do YouTube, em duas leituras baratas:
//  1. o QUADRO do arquivo: o `oar2.jpg` vem na proporção real do vídeo, e só o
//     cabeçalho (8 KB por Range) já traz as dimensões — o link `watch?v=` de
//     um Shorts não diz que ele é vertical;
//  2. onde está o CONTEÚDO: a `hqdefault` (a mesma miniatura da fachada, então
//     sai do cache) passa por um canvas pequeno e as barras pretas das bordas
//     são medidas. Vídeo 3:4 enviado dentro de um 16:9 vira caixa 3:4 com o
//     preto cortado, em vez de uma faixa no meio de duas barras.
// Uma sonda por vídeo por carga de página; falhou, fica 16:9 (ou 9:16 no link
// de Shorts) inteiro, como era.
type Formato = { proporcao: number; regiao: RegiaoVideo; naMiniatura: RegiaoVideo };
const formatoConhecido = new Map<string, Formato>();
const miniaturaDe = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

async function quadroDoVideo(id: string, sinal: AbortSignal): Promise<number | null> {
  const r = await fetch(`https://i.ytimg.com/vi/${id}/oar2.jpg`, { headers: { Range: "bytes=0-8191" }, signal: sinal });
  // Vídeo antigo não tem `oar2` (404): é da época em que tudo era 16:9.
  if (r.status === 404) return 16 / 9;
  if (!r.ok) return null;
  const d = dimensoesDoJpeg(new Uint8Array(await r.arrayBuffer()));
  return d ? d.w / d.h : null;
}
function barrasDaMiniatura(id: string): Promise<RegiaoVideo> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 160; c.height = 120; // 4:3 reduzido: medir barra não pede resolução
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(REGIAO_INTEIRA);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(regiaoSemBarras(ctx.getImageData(0, 0, c.width, c.height)));
      } catch { resolve(REGIAO_INTEIRA); }
    };
    img.onerror = () => resolve(REGIAO_INTEIRA);
    img.src = miniaturaDe(id);
  });
}

function useFormato(id: string | undefined, dica: boolean): Formato {
  const inicial: Formato = { proporcao: dica ? 9 / 16 : 16 / 9, regiao: REGIAO_INTEIRA, naMiniatura: REGIAO_INTEIRA };
  const [formato, setFormato] = useState<Formato>(() => (id && formatoConhecido.get(id)) || inicial);
  useEffect(() => {
    if (!id) return;
    const salvo = formatoConhecido.get(id);
    if (salvo) { setFormato(salvo); return; }
    const ctrl = new AbortController();
    Promise.all([quadroDoVideo(id, ctrl.signal).catch(() => null), barrasDaMiniatura(id)]).then(([quadro, naMiniatura]) => {
      if (ctrl.signal.aborted || !quadro) return;
      const f = { ...conteudoDoVideo(quadro, naMiniatura), naMiniatura };
      if (f.regiao === REGIAO_INTEIRA) f.naMiniatura = REGIAO_INTEIRA;
      formatoConhecido.set(id, f);
      setFormato(f);
    });
    return () => ctrl.abort();
  }, [id]);
  return formato;
}

// Quanto rolar (px) a partir do ponto onde o vídeo abriu pra ele ir pro topo.
const LIMIAR_ENCAIXE = 40;
// Arrasto vertical no próprio vídeo que conta como gesto (não toque).
const LIMIAR_GESTO = 50;

export function VideoTutorial({ url, legenda, capa }: {
  url: string; legenda?: string;
  /** Capa escolhida no editor (o primeiro quadro, tirado no navegador).
   *  Vazia = a miniatura do YouTube, ou o primeiro quadro do arquivo. */
  capa?: string;
}) {
  const video = embedDoTutorialVideo(url);
  const formatoYt = useFormato(video?.tipo === "youtube" ? video.id : undefined, !!video?.vertical);
  const [tocando, setTocando] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  // O botão focado some no clique e o foco cairia no <body>: o vídeo toca,
  // mas teclado e leitor de tela ficam fora do player — e no passo a passo a
  // seta, sem alvo no vídeo, troca de passo e desmonta o que acabou de
  // começar. O foco vai pro player no instante em que ele nasce (e só nele:
  // re-render do pai não pode roubar o foco de volta).
  useEffect(() => { if (tocando) frame.current?.focus({ preventScroll: true }); }, [tocando]);

  const vaga = useRef<HTMLDivElement>(null);
  const [imersivo, setImersivo] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [encaixado, setEncaixado] = useState(false);
  const [altura, setAltura] = useState<number | null>(null);
  // Arquivo nativo: o primeiro play abre o imersivo; depois de fechado, quem
  // der play de novo continua na página (quem fechou pediu pra ficar).
  const jaAbriu = useRef(false);
  // Quem rola por baixo: a página, ou o palco do passo a passo (lá a página
  // fica parada e quem rola é a coluna do passo).
  const rolagem = useRef<{ el: Element; base: number } | null>(null);
  const gesto = useRef<{ y: number; id: number } | null>(null);
  // Arrasto que virou gesto não pode chegar como clique na camada de toque
  // do player (que pausaria o vídeo no fim do arrasto).
  const engolirClique = useRef(false);

  const abrir = useCallback(() => {
    // offsetHeight, não rect: a vaga pode estar sob transform de entrada.
    if (vaga.current) setAltura(vaga.current.offsetHeight);
    const el = vaga.current?.closest(".tut-modo-palco") ?? document.scrollingElement ?? document.documentElement;
    rolagem.current = { el, base: el.scrollTop };
    jaAbriu.current = true;
    setSaindo(false);
    setEncaixado(false);
    setImersivo(true);
  }, []);
  const fechar = useCallback(() => setSaindo(true), []);

  // Fechar é sair da frente: 150ms de esmaecer e só então a caixa volta pra vaga.
  useEffect(() => {
    if (!saindo) return;
    const t = setTimeout(() => { setImersivo(false); setSaindo(false); setEncaixado(false); setAltura(null); }, 150);
    return () => clearTimeout(t);
  }, [saindo]);

  // Esc fecha o vídeo ANTES do passo a passo ouvir (captura na window roda
  // antes do listener dele no document). As setas também param aqui — sem
  // isso trocariam de passo por baixo e desmontariam o vídeo aberto — exceto
  // dentro do <video>/barra de tempo, onde são do próprio controle.
  useEffect(() => {
    if (!imersivo) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); fechar(); return; }
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight")
        && !(e.target instanceof Element && e.target.closest("video, input"))) e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [imersivo, fechar]);

  // Rolou pra baixo a partir de onde abriu → encaixa no topo; voltou → centro.
  // `scroll` não borbulha: captura no document pega a página E o palco do
  // passo a passo. Só lê scrollTop — nada de layout forçado por quadro.
  useEffect(() => {
    if (!imersivo) return;
    const aoRolar = () => {
      const r = rolagem.current;
      if (r) setEncaixado(r.el.scrollTop - r.base > LIMIAR_ENCAIXE);
    };
    document.addEventListener("scroll", aoRolar, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", aoRolar, { capture: true });
  }, [imersivo]);

  // No vídeo aberto o arrasto vertical é NOSSO (touch-action: none na caixa):
  // pra cima rola o tutorial pra vista, pra baixo devolve ao ponto de abertura.
  // Mouse fica de fora — no computador a roda do mouse já faz isso.
  const aoTocar = (e: PointerEventReact) => {
    if (!imersivo) return;
    e.stopPropagation(); // não é gesto de trocar passo
    if (e.pointerType === "mouse" || !e.isPrimary) return;
    gesto.current = { y: e.clientY, id: e.pointerId };
  };
  const aoSoltar = (e: PointerEventReact) => {
    if (!imersivo) return;
    e.stopPropagation();
    const g = gesto.current; gesto.current = null;
    const r = rolagem.current;
    if (!g || g.id !== e.pointerId || !r) return;
    const dy = e.clientY - g.y;
    engolirClique.current = Math.abs(dy) > 10;
    if (dy < -LIMIAR_GESTO) r.el.scrollBy({ top: Math.round(window.innerHeight * 0.5), behavior: "smooth" });
    else if (dy > LIMIAR_GESTO && encaixado) r.el.scrollTo({ top: r.base, behavior: "smooth" });
  };

  if (!video) return null;
  const imagem = (capa || "").trim();
  const titulo = legenda || "Vídeo do tutorial";
  // Só o YouTube tem formato medido; arquivo usa o do próprio <video>, Vimeo 16:9.
  const doYoutube = video.tipo === "youtube" && !!video.id;
  const emPe = doYoutube && formatoYt.proporcao < 1;
  // Caixa do player embutido é SEMPRE 3:4 (pedido do dono, set/2026): o vídeo
  // de tutorial é gravado em pé e a caixa deitada o deixava minúsculo. O
  // recorte medido continua tirando as barras pretas por dentro.
  const formato = video.tipo === "arquivo" ? undefined : "tres-quatro";
  const proporcao = { ["--tv-ar" as string]: video.tipo === "arquivo" ? String(16 / 9) : "0.75" } as CSSProperties;

  const palco = (conteudo: ReactNode, expandir: boolean) => (
    <figure className="tut-leitura-video" data-imersivo={imersivo ? "1" : undefined}>
      <div ref={vaga} className="tut-video-vaga" data-formato={formato} style={altura ? { ...proporcao, height: altura } : proporcao}>
        <div className="tut-video-palco" data-tipo={video.tipo} data-formato={formato}
          data-imersivo={imersivo ? "1" : undefined} data-saindo={saindo ? "1" : undefined}
          data-encaixado={imersivo && encaixado ? "1" : undefined}
          role={imersivo ? "dialog" : undefined} aria-label={imersivo ? titulo : undefined}>
          <div className="tut-video-caixa" onPointerDown={aoTocar} onPointerUp={aoSoltar}
            onPointerCancel={() => { gesto.current = null; }}
            onClickCapture={(e) => { if (engolirClique.current) { engolirClique.current = false; e.preventDefault(); e.stopPropagation(); } }}>{conteudo}</div>
          {imersivo ? (
            <button type="button" className="tut-video-sair" onClick={fechar} aria-label="Sair da tela cheia" title="Sair da tela cheia (Esc)">
              <Icon name="x" size={22} />
            </button>
          ) : expandir && (
            <button type="button" className="tut-video-expandir" onClick={abrir} aria-label="Ver em tela cheia" title="Ver em tela cheia">
              <Icon name="arrows-maximize" size={18} />
            </button>
          )}
        </div>
      </div>
      {legenda && <figcaption>{legenda}</figcaption>}
    </figure>
  );

  // Arquivo é servido por nós e o controle nativo é melhor que qualquer
  // fachada. Com capa, `preload="none"`: a imagem já diz o que é o vídeo e
  // nada do arquivo (até 20 MB) desce antes do play. Sem capa, "metadata" —
  // senão o player nasce como uma caixa preta muda.
  if (video.tipo === "arquivo") {
    return palco(
      <video src={video.url} poster={imagem || undefined} preload={imagem ? "none" : "metadata"} controls playsInline
        onPlay={() => { if (!jaAbriu.current) abrir(); }} />,
      true,
    );
  }

  // A `hqdefault` é 4:3 com o vídeo encaixado (e às vezes barras gravadas):
  // ela é ampliada na MESMA região que a sonda mediu, então a capa mostra só
  // o conteúdo, na proporção da caixa. `crossOrigin` igual ao da sonda pra
  // as duas usarem uma resposta só do cache.
  // Em pé é diferente: a `hqdefault` de um Shorts é um recorte 4:3 do MEIO do
  // vídeo, sem barra nenhuma — ampliada numa caixa 9:16 viraria um borrão.
  // Aí a capa é o próprio `oar2.jpg`, que já é o quadro em pé (lazy).
  const miniatura = imagem || (video.id ? (emPe ? `https://i.ytimg.com/vi/${video.id}/oar2.jpg` : miniaturaDe(video.id)) : null);
  const recorteDaCapa = !imagem && !emPe && formatoYt.naMiniatura !== REGIAO_INTEIRA ? estiloDoRecorte(formatoYt.naMiniatura) : undefined;

  // A fachada mostra a miniatura; o clique monta o player. YouTube ganha o
  // player PRÓPRIO (sem o chrome deles); Vimeo cai no iframe padrão.
  if (!tocando) {
    return <figure className="tut-leitura-video">
      <div ref={vaga} className="tut-video-vaga" data-formato={formato} style={proporcao}>
        <button type="button" className="tut-video-capa" onClick={() => { abrir(); setTocando(true); }} aria-label={`Assistir: ${titulo}`}>
          {miniatura && <img src={miniatura} alt="" loading="lazy" decoding="async" crossOrigin={imagem || emPe ? undefined : "anonymous"}
            data-recorte={recorteDaCapa ? "1" : undefined} style={recorteDaCapa} />}
          <span className="tut-video-play"><Icon name="player-play" size={26} /></span>
        </button>
      </div>
      {legenda && <figcaption>{legenda}</figcaption>}
    </figure>;
  }

  return palco(
    video.tipo === "youtube" && video.id ? (
      <PlayerYoutube videoId={video.id} titulo={titulo} imersivo={imersivo} onAlternarImersivo={imersivo ? fechar : abrir}
        recorte={formatoYt.regiao === REGIAO_INTEIRA ? undefined : formatoYt.regiao} />
    ) : (
      <iframe ref={frame} src={`${video.url}${video.url.includes("?") ? "&" : "?"}autoplay=1`} title={titulo}
        sandbox="allow-scripts allow-same-origin allow-presentation" allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
    ),
    !(video.tipo === "youtube" && video.id),
  );
}
