"use client";

// ── TridiFlow · runtime do LinkTridi (bio link) ──────────────────────────────
// A página que o seguidor abre pelo link da bio: identidade da marca no topo
// (logo, nome, @, bio, redes) e a vitrine de cartões de produto. Cada clique
// avisa o player (sessão + pixel) antes do navegador abrir o destino.
//
// Desenho (set/2026): a versão portada do app avulso tinha pílulas coloridas
// com sombra pesada nas redes, divisor decorativo, cubo cinza no lugar da foto
// e etiqueta com chama automática somada ao emoji do texto. Tudo isso lia como
// modelo pronto. Agora: redes em botão de ícone neutro, @ da marca embaixo do
// nome, título de seção como rótulo discreto, cartão com sombra macia e mídia
// sem moldura, e cor de texto do botão/etiqueta decidida pelo contraste.
//
// Classes com prefixo `.tflt-*`; `.tf-container` marca o invólucro pra o
// Custom CSS dos projetos continuar tendo um alvo estável.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  corCartaoClara, precoBRL,
  type LinkTridiDoc, type LinkTridiPost,
} from "@/lib/tridiflow-linktridi";

// Ícones Tabler inline (paths oficiais, viewBox 24, stroke 2): o runtime
// público não importa o Icon da plataforma pra continuar leve e sem depender
// de nada de dentro do app logado.
function Tabler({ d, size = 16, color = "currentColor", fill = false }: { d: string; size?: number; color?: string; fill?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? color : "none"}
      stroke={fill ? "none" : color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split("|").map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}
const P = {
  instagram: "M4 4m0 4a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4z|M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0|M16.5 7.5l0 .01",
  tiktok: "M21 7.917v4.034a9.948 9.948 0 0 1 -5 -1.951v4.5a6.5 6.5 0 1 1 -8 -6.326v4.326a2.5 2.5 0 1 0 4 2v-11.5h4.083a6.005 6.005 0 0 0 4.917 4.917z",
  whatsapp: "M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9|M9 10a0.5 .5 0 0 0 1 0v-1a0.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a0.5 .5 0 0 0 0 -1h-1a0.5 .5 0 0 0 0 1",
  youtube: "M2 8a4 4 0 0 1 4 -4h12a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-12a4 4 0 0 1 -4 -4z|M10 9l5 3l-5 3z",
  arrowUpRight: "M17 7l-10 10|M8 7l9 0l0 9",
  arrowRight: "M5 12l14 0|M13 18l6 -6|M13 6l6 6",
  circleCheck: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0|M9 12l2 2l4 -4",
  photo: "M15 8h.01|M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z|M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5|M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3",
  grid: "M4 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z|M4 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z|M14 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z|M14 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z",
  star: "M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z",
};

/** Fundo decorado: um lençol de brilhos derivado do destaque, pintado no
 *  CONTÊINER (não na coluna de 480px) — o SVG de elipses que existia antes
 *  denunciava a largura do celular no desktop. Some com `cores.formas` off. */
function fundoDecorado(cor: string, claro: boolean): string {
  const mix = (pct: number) => `color-mix(in srgb, ${cor} ${pct}%, transparent)`;
  // Fundo escuro engole cor: a mesma tinta precisa de mais presença pra
  // aparecer sem virar mancha no claro.
  const f = claro ? 1 : 1.4;
  // Só no alto da página, em faixa de altura FIXA (ver .tflt-scroll): como a
  // página rola no documento, um gradiente em % da altura esticaria junto com
  // o conteúdo e o brilho cairia no meio da vitrine.
  return [
    `radial-gradient(60% 70% at 12% 0%, ${mix(20 * f)}, transparent 70%)`,
    `radial-gradient(50% 60% at 100% 10%, ${mix(14 * f)}, transparent 70%)`,
  ].join(", ");
}

/** O @ da marca, tirado do link do Instagram (ou TikTok). Página de bio sem o
 *  @ parece anônima; com ele, a pessoa confere na hora que chegou no lugar
 *  certo. Só aceita o formato de usuário das duas redes — link estranho não
 *  vira texto estranho no topo da página. */
function arrobaDe(url?: string): string | null {
  if (!url) return null;
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean)[0]?.replace(/^@/, "");
    return seg && /^[A-Za-z0-9._]{2,30}$/.test(seg) ? `@${seg}` : null;
  } catch { return null; }
}

/** O cartão é um LINK, então tem que SER um link: `<a>` devolve Cmd-clique,
 *  botão do meio, "copiar endereço" e a prévia do destino na barra de status —
 *  tudo que o `div role="link"` de antes desligava. Sem destino (cartão em
 *  rascunho) não vira link nenhum: link que não leva a lugar algum é pior. */
function Alvo({ href, className, style, onClick, children }: {
  href?: string; className: string; style: React.CSSProperties;
  onClick: () => void; children: React.ReactNode;
}) {
  if (!href) return <div className={className} style={style}>{children}</div>;
  return (
    // O clique avisa o player (sessão + pixel) e o navegador abre — sem
    // `window.open`, que o bloqueador de pop-up às vezes engole.
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} style={style} onClick={onClick}>
      {children}
    </a>
  );
}

/** Selo de verificado: círculo cheio com check branco (formato do Instagram). */
function Selo({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="Verificado">
      <path d="M12 1.5l2.6 2.1 3.3-.5 1.2 3.1 3.1 1.2-.5 3.3 2.1 2.6-2.1 2.6.5 3.3-3.1 1.2-1.2 3.1-3.3-.5-2.6 2.1-2.6-2.1-3.3.5-1.2-3.1-3.1-1.2.5-3.3L.7 12l2.1-2.6-.5-3.3 3.1-1.2 1.2-3.1 3.3.5z" fill="#3897F0" transform="scale(.92) translate(1 1)" />
      <path d="M8.2 12.3l2.5 2.5 5-5" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Tinta legível sobre uma cor livre (botão, etiqueta): o lojista escolhe o
 *  fundo, o texto escolhe o próprio contraste — botão amarelo com letra branca
 *  some, com letra escura lê. */
const tintaSobre = (hex: string) => (corCartaoClara(hex) ? "#1D1D1F" : "#FFFFFF");

/** Vídeo do cartão. Só baixa quando o cartão APARECE e pausa quando sai —
 *  `autoplay` baixaria todos os vídeos da página no primeiro segundo, com o
 *  seguidor vendo só o de cima, e cada um sai do plano de dados dele e da
 *  cota de tráfego do Storage. Até aparecer, o que se vê é a capa. Movimento
 *  reduzido: fica na capa e não toca sozinho. */
function VideoCartao({ src, capa, aoFalhar }: { src: string; capa?: string; aoFalhar: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => { /* navegador recusou: fica a capa */ });
      else v.pause();
    }, { threshold: 0.35 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <video ref={ref} src={src} poster={capa || undefined} muted loop playsInline
      // Com capa, nada baixa até tocar. Sem capa, só o começo (metadados +
      // primeiro quadro) pra não ficar um retângulo vazio.
      preload={capa ? "none" : "metadata"} onError={aoFalhar} />
  );
}

function Cartao({ post, cores, indice, aoClicar }: {
  post: LinkTridiPost;
  cores: LinkTridiDoc["cores"];
  indice: number;
  aoClicar: (p: LinkTridiPost) => void;
}) {
  // Tinta do cartão derivada da luminância — mesma regra da vitrine de /l.
  const clara = corCartaoClara(cores.cartao);
  const corTitulo = clara ? "#1D1D1F" : "#F2F2F5";
  const corFraco = clara ? "#6B6B73" : "#A1A1AA";
  const linha = `color-mix(in srgb, ${corTitulo} 9%, transparent)`;
  const temPreco = post.preco != null && post.preco > 0;
  const temDe = temPreco && post.precoDe != null && post.precoDe > post.preco!;
  const desconto = temDe ? Math.round((1 - post.preco! / post.precoDe!) * 100) : 0;
  const nota = post.avaliacaoNota != null && post.avaliacaoNota > 0 ? Math.min(5, post.avaliacaoNota) : null;
  const parcelas = temPreco && post.parcelas != null && post.parcelas >= 2 ? Math.round(post.parcelas) : null;
  const tamTitulo = post.tamanhoTitulo === "sm" ? 13 : post.tamanhoTitulo === "lg" ? 16 : 14.5;
  const [midiaFalhou, setMidiaFalhou] = useState(false);
  const temMidia = !!post.mediaUrl && !midiaFalhou;
  // `onError` sozinho não basta: a imagem começa a baixar enquanto o HTML é
  // lido e, quando morre ANTES da hidratação, o evento já passou. O ref lê o
  // mesmo fato pelo estado do elemento (terminou e não tem pixel = falhou).
  const refMidia = (el: HTMLImageElement | null) => {
    if (el && el.complete && el.naturalWidth === 0) setMidiaFalhou(true);
  };

  // Botão de link clássico do Linktree: pílula de largura toda, miniatura
  // opcional, título no centro e seta — pro link que não é produto.
  if (post.formato === "botao") {
    return (
      <Alvo href={post.destinoUrl} className="tflt-botao" onClick={() => aoClicar(post)}
        style={{ background: cores.cartao, borderColor: linha, color: corTitulo }}>
        {post.mediaUrl
          // eslint-disable-next-line @next/next/no-img-element -- mídia externa colada pelo usuário
          ? <img src={post.thumbUrl || post.mediaUrl} alt="" draggable={false} className="tflt-botao-thumb" loading="lazy" decoding="async" />
          : <span className="tflt-botao-thumb tflt-botao-thumb-vazia" />}
        <span className="tflt-botao-titulo">{post.titulo || post.destinoUrl}</span>
        <span className="tflt-botao-seta"><Tabler d={P.arrowUpRight} size={17} color={corFraco} /></span>
      </Alvo>
    );
  }

  return (
    <Alvo href={post.destinoUrl} className={`tflt-card${post.destaque ? " tflt-card-destaque" : ""}`} onClick={() => aoClicar(post)}
      style={{
        background: cores.cartao,
        borderColor: linha,
        // Fundo da mídia enquanto carrega (e quando não há mídia): um fio da
        // cor de destaque sobre o próprio cartão, não um cinza de erro.
        ...({ "--lt-ph": `color-mix(in srgb, ${cores.destaque} 9%, ${cores.cartao})` } as React.CSSProperties),
      }}>
      <div className="tflt-card-midia">
        {post.tipo === "video" && temMidia ? (
          <VideoCartao src={post.mediaUrl} capa={post.thumbUrl} aoFalhar={() => setMidiaFalhou(true)} />
        ) : temMidia ? (
          // O primeiro é o LCP da página: prioridade alta. O resto é lazy.
          // eslint-disable-next-line @next/next/no-img-element -- mídia externa colada pelo usuário; next/image exigiria domínio cadastrado
          <img src={post.mediaUrl} alt={post.titulo ?? ""} loading={indice < 2 ? "eager" : "lazy"}
            fetchPriority={indice === 0 ? "high" : undefined} decoding="async" draggable={false}
            ref={refMidia} onError={() => setMidiaFalhou(true)} />
        ) : (
          <span className="tflt-card-vazia"><Tabler d={P.photo} size={28} color={`color-mix(in srgb, ${corTitulo} 26%, transparent)`} /></span>
        )}
        {post.badge && (
          // Sem ícone automático: o texto da etiqueta já traz o que a pessoa
          // quis dizer (e às vezes um emoji) — chama + emoji virava ruído.
          <span className="tflt-badge" style={{ background: cores.badge, color: tintaSobre(cores.badge) }}>{post.badge}</span>
        )}
      </div>
      <div className="tflt-card-corpo">
        {post.titulo && <h3 style={{ fontSize: tamTitulo, color: corTitulo }}>{post.titulo}</h3>}
        {nota != null && (
          <p className="tflt-estrelas" style={{ color: corFraco }} aria-label={`Nota ${nota} de 5`}>
            <span className="tflt-estrelas-fila" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((i) => (
                <Tabler key={i} d={P.star} size={12} fill color={i <= Math.round(nota) ? "#F5A623" : `color-mix(in srgb, ${corFraco} 35%, transparent)`} />
              ))}
            </span>
            <strong style={{ color: corTitulo }}>{nota.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</strong>
            {post.avaliacaoQtd != null && post.avaliacaoQtd > 0 && <>({post.avaliacaoQtd.toLocaleString("pt-BR")})</>}
          </p>
        )}
        {temPreco && (
          <>
            {post.prefixo && <p className="tflt-prefixo" style={{ color: corFraco }}>{post.prefixo}</p>}
            <p className="tflt-preco">
              <strong style={{ color: corTitulo }}>R$ {precoBRL(post.preco!)}</strong>
              {temDe && <s style={{ color: corFraco }}>R$ {precoBRL(post.precoDe!)}</s>}
              {temDe && (
                <span className="tflt-off" style={{ background: `color-mix(in srgb, ${cores.preco} 16%, transparent)`, color: cores.preco }}>-{desconto}%</span>
              )}
            </p>
            {parcelas != null && (
              <p className="tflt-parcelas" style={{ color: corFraco }}>ou {parcelas}x de R$ {precoBRL(post.preco! / parcelas)}</p>
            )}
          </>
        )}
        {post.sufixo && (
          <p className="tflt-sufixo" style={{ color: corFraco }}>
            <Tabler d={P.circleCheck} size={14} color={cores.preco} /> {post.sufixo}
          </p>
        )}
        <span className="tflt-esticador" />
        <span className="tflt-cta" style={{ background: cores.cta, color: tintaSobre(cores.cta) }}>
          {post.cta || "Comprar agora"} <Tabler d={P.arrowRight} size={16} color={tintaSobre(cores.cta)} />
        </span>
      </div>
    </Alvo>
  );
}

export function LinkTridiRuntime({ doc, customCss, altura, aoClicarPost }: {
  doc: LinkTridiDoc;
  customCss?: string;
  /** Sem altura = página de verdade (player): quem rola é o DOCUMENTO. A
   *  prévia do editor passa "100%" e rola por dentro da moldura. */
  altura?: string;
  /** Chamado ANTES de abrir o destino — o player grava a sessão e o pixel. */
  aoClicarPost?: (post: LinkTridiPost) => void;
}) {
  const { perfil, cores } = doc;
  // Tinta da página pela luminância do fundo (regra da vitrine): fundo claro
  // pede texto escuro e vice-versa, sem a pessoa escolher as duas cores.
  const fundoClaro = corCartaoClara(cores.fundo);
  const tinta = fundoClaro ? "#1D1D1F" : "#F2F2F5";
  const fraco = fundoClaro ? "#6B6B73" : "#A1A1AA";
  const posts = useMemo(() => doc.posts.filter((p) => p.publicado), [doc.posts]);
  const social = perfil.social;
  const redes = perfil.mostrarSocial ? ([
    ["Instagram", social.instagram, P.instagram],
    ["TikTok", social.tiktok, P.tiktok],
    ["WhatsApp", social.whatsapp, P.whatsapp],
    ["YouTube", social.youtube, P.youtube],
  ] as const).filter(([, url]) => !!url) : [];
  const arroba = arrobaDe(social.instagram) ?? arrobaDe(social.tiktok);

  // Só avisa: quem navega é o `<a>` do cartão (ver `Alvo`).
  const abrir = (post: LinkTridiPost) => { aoClicarPost?.(post); };

  const tamSecao = perfil.tamanhoTituloSecao === "sm" ? 11 : perfil.tamanhoTituloSecao === "lg" ? 13.5 : 12;
  // Página de verdade rola o documento, não uma caixa de 100dvh: no iPhone a
  // caixa prendia a barra de endereço aberta (menos tela), matava o "tocar no
  // relógio volta pro topo" e dava rolagem de app-dentro-da-página.
  const modoPagina = altura === undefined;
  // O que aparece no "puxão" além do topo/fim é o fundo do <html>, não o nosso.
  // Só hex — é cor vinda do doc indo parar numa folha de estilo.
  const fundoHtml = modoPagina && /^#[0-9a-f]{3,8}$/i.test(cores.fundo) ? cores.fundo : null;

  return (
    <div className={`tf-container tflt-scroll${modoPagina ? " tflt-doc" : ""}`}
      style={{
        // backgroundColor, não o atalho `background`: o atalho inline zera o
        // background-size/-repeat da folha de estilo, e o brilho voltava a
        // esticar com a altura da página (medido: size "auto", repeat "repeat").
        backgroundColor: cores.fundo,
        backgroundImage: cores.formas ? fundoDecorado(cores.destaque, fundoClaro) : undefined,
        ...(modoPagina ? { minHeight: "100dvh" } : { height: altura }),
        ...({
          "--lt-tinta": tinta, "--lt-fraco": fraco, "--lt-fundo": cores.fundo,
          "--lt-linha": `color-mix(in srgb, ${tinta} 12%, transparent)`,
          // Superfície dos botões de rede: um véu da própria tinta, então vale
          // no fundo claro e no escuro sem cor nova.
          "--lt-sup": `color-mix(in srgb, ${tinta} 5%, transparent)`,
          "--lt-sup-2": `color-mix(in srgb, ${tinta} 10%, transparent)`,
          // Anel de foco na cor da marca, garantido contra o fundo: no escuro
          // o destaque puro leva um fio de branco pra não sumir.
          "--lt-foco": fundoClaro ? cores.destaque : `color-mix(in srgb, ${cores.destaque} 70%, white)`,
        } as React.CSSProperties),
      }}>
      <div className="tflt-pagina">
        <header className="tflt-topo">
          <span className={`tflt-halo${perfil.halo ? " tflt-halo-on" : ""}${perfil.formatoLogo === "redondo" ? " tflt-redondo" : ""}`}>
            {perfil.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- logo enviado pelo usuário
              <span className="tflt-logo"><img src={perfil.avatarUrl} alt="" draggable={false} fetchPriority="high" /></span>
            ) : (
              <span className="tflt-logo tflt-logo-vazia"><Tabler d={P.photo} size={30} color={fraco} /></span>
            )}
          </span>
          {perfil.nome && (
            <h1 className="tflt-nome">
              {perfil.nome}
              {perfil.verificado && <Selo />}
            </h1>
          )}
          {arroba && <p className="tflt-arroba">{arroba}</p>}
          {perfil.bio && <p className="tflt-bio">{perfil.bio}</p>}

          {redes.length > 0 && (
            <nav className="tflt-social" aria-label="Redes sociais">
              {redes.map(([nome, url, d]) => (
                <a key={nome} href={url} target="_blank" rel="noopener noreferrer" className="tflt-rede" aria-label={nome} title={nome}>
                  <Tabler d={d} size={20} />
                </a>
              ))}
            </nav>
          )}
        </header>

        {perfil.tituloSecao && <h2 className="tflt-secao" style={{ fontSize: tamSecao }}>{perfil.tituloSecao}</h2>}

        {posts.length === 0 ? (
          <div className="tflt-vazio">
            <Tabler d={P.grid} size={44} color={fraco} />
            <p>Sem publicações ainda</p>
          </div>
        ) : (
          <div className="tflt-grade">
            {posts.map((p, i) => <Cartao key={p.id} post={p} cores={cores} indice={i} aoClicar={abrir} />)}
          </div>
        )}

        {perfil.zapFlutuante && social.whatsapp && (
          <a href={social.whatsapp} target="_blank" rel="noopener noreferrer" className="tflt-zap" aria-label="Falar no WhatsApp">
            <Tabler d={P.whatsapp} size={26} color="#fff" />
          </a>
        )}

        {perfil.mostrarMarca && (
          <p className="tflt-marca">Feito com <strong>LinkTridi</strong></p>
        )}
      </div>

      <style>{CSS}</style>
      {fundoHtml && <style>{`html,body{background:${fundoHtml}}`}</style>}
      {customCss && <style>{customCss}</style>}
    </div>
  );
}

const CSS = `
.tflt-scroll { overflow-y: auto; overscroll-behavior: none; color: var(--lt-tinta);
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  background-repeat: no-repeat; background-size: 100% 760px;
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  /* container e não media query: a prévia do editor é uma moldura de celular
     DENTRO de uma tela grande — por @media ela nasceria com o layout de
     desktop e mentiria sobre o que o seguidor vê. */
  container-type: inline-size; }
.tflt-doc { overflow: visible; overscroll-behavior: auto; }
.tflt-pagina { position: relative; max-width: 480px; margin: 0 auto; min-height: 100%; box-sizing: border-box;
  padding: 0 16px calc(20px + var(--safe-b, 0px)); }

/* Sem animação de entrada, de propósito. O topo descia e os cartões subiam em
   fila (400 ms + 40 ms por cartão): o último produto só ficava inteiro depois
   de ~700 ms, com o conteúdo JÁ carregado e parado em opacidade zero. Numa
   página que existe pra ser vista em um segundo vindo do Instagram, entrada
   animada é latência com enfeite — e ainda empurrava a medida de LCP.
   Toque e hover seguem em --duration-quick: resposta sai da frente. */

/* ── Topo: logo, nome, @, bio, redes ─────────────────────────────────────── */
.tflt-topo { display: flex; flex-direction: column; align-items: center; text-align: center;
  padding: calc(40px + var(--safe-t, 0px)) 8px 4px; }
.tflt-halo { display: block; margin-bottom: 14px; border-radius: 22px; }
.tflt-halo-on { padding: 2.5px; background: linear-gradient(45deg, #F9CE34, #EE2A7B, #6228D7); }
/* O vão entre o anel e a foto é o FUNDO da página, não um cinza sujo. */
.tflt-halo-on .tflt-logo { border: 3px solid var(--lt-fundo); }
.tflt-logo { width: 88px; height: 88px; border-radius: 20px; overflow: hidden; display: block; box-sizing: border-box;
  box-shadow: 0 1px 2px rgb(0 0 0 / .06), 0 10px 28px -12px rgb(0 0 0 / .3); }
.tflt-redondo, .tflt-redondo .tflt-logo { border-radius: 50%; }
.tflt-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.tflt-logo-vazia { background: var(--lt-sup); display: grid; place-items: center; }
/* Tracking por tamanho: nome grande aperta, corpo fica em zero. */
.tflt-nome { display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap;
  font-size: 21px; font-weight: 700; letter-spacing: -.02em; line-height: 1.2; margin: 0; text-wrap: balance; }
.tflt-nome svg { flex: none; }
.tflt-arroba { font-size: 13.5px; color: var(--lt-fraco); margin: 3px 0 0; }
.tflt-bio { font-size: 14px; line-height: 1.5; color: var(--lt-fraco); max-width: 34ch; margin: 10px 0 0;
  white-space: pre-line; text-wrap: pretty; }
/* Redes em botão de ícone neutro: a pílula colorida com sombra de 20px era a
   parte que mais parecia modelo pronto — e disputava o olho com os produtos,
   que são o motivo da página existir. */
.tflt-social { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 18px; }
.tflt-rede { width: var(--tap, 44px); height: var(--tap, 44px); border-radius: 50%; display: grid; place-items: center;
  background: var(--lt-sup); box-shadow: inset 0 0 0 1px var(--lt-linha); color: var(--lt-tinta);
  text-decoration: none; -webkit-tap-highlight-color: transparent;
  transition: transform var(--duration-quick, .15s) var(--ease-out, ease-out), background-color var(--duration-quick, .15s) var(--ease-out, ease-out); }
.tflt-rede:active { transform: scale(.94); }
@media (hover: hover) and (pointer: fine) { .tflt-rede:hover { background-color: var(--lt-sup-2); } }

/* Título da seção como RÓTULO: pequeno, espaçado, em caixa alta. Assim o
   texto que a pessoa digitou em maiúsculas lê como escolha de desenho, não
   como grito — e não disputa com o nome da marca. */
.tflt-secao { font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--lt-fraco);
  text-align: center; line-height: 1.4; margin: 0; padding: 28px 8px 12px; text-wrap: balance; }

.tflt-grade { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding-bottom: 24px; }
.tflt-vazio { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 56px 16px; }
.tflt-vazio p { font-size: 15px; color: var(--lt-fraco); margin: 0; }

/* ── Cartão ───────────────────────────────────────────────────────────────── */
/* Cartão e botão são <a>: tira o sublinhado, herda a tinta e desliga o flash
   cinza do toque — a resposta de verdade é o afundar de 1,5% no pointer-down. */
.tflt-card, .tflt-botao { text-decoration: none; color: inherit; -webkit-tap-highlight-color: transparent; }
.tflt-card:focus-visible, .tflt-botao:focus-visible, .tflt-rede:focus-visible, .tflt-zap:focus-visible {
  outline: 2px solid var(--lt-foco); outline-offset: 3px; }
/* Sombra em duas camadas (contato + ambiente) e borda de 9% da tinta: o
   cartão descola do fundo sem a moldura grossa de antes. */
.tflt-card { position: relative; display: flex; flex-direction: column; border-radius: 18px; overflow: hidden;
  box-sizing: border-box; border: 1px solid transparent; cursor: pointer; user-select: none;
  box-shadow: 0 1px 2px rgb(0 0 0 / .05), 0 10px 28px -18px rgb(0 0 0 / .35);
  transition: transform var(--duration-quick, .15s) var(--ease-out, ease-out), box-shadow var(--duration-quick, .15s) var(--ease-out, ease-out); }
.tflt-card:active { transform: scale(.985); }
@media (hover: hover) and (pointer: fine) {
  .tflt-card:hover { transform: translateY(-2px); box-shadow: 0 2px 4px rgb(0 0 0 / .05), 0 18px 36px -18px rgb(0 0 0 / .42); }
  .tflt-card:hover .tflt-cta { filter: brightness(1.07); }
}
.tflt-card-destaque { grid-column: 1 / -1; }
/* Foto de produto é quase sempre quadrada ou vertical: 16:9 cortava a peça. */
.tflt-card-destaque .tflt-card-midia { aspect-ratio: 4 / 3; }
.tflt-card-midia { position: relative; aspect-ratio: 1; overflow: hidden; background: var(--lt-ph); }
.tflt-card-midia img, .tflt-card-midia video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.tflt-card-vazia { position: absolute; inset: 0; display: grid; place-items: center; }
.tflt-badge { position: absolute; top: 10px; left: 10px; max-width: calc(100% - 20px); box-sizing: border-box;
  padding: 4px 9px; border-radius: 999px; font-size: 10.5px; font-weight: 700; letter-spacing: .03em; line-height: 1.3;
  text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  box-shadow: 0 2px 8px -2px rgb(0 0 0 / .3); }
.tflt-card-corpo { display: flex; flex-direction: column; gap: 6px; padding: 12px; flex: 1; }
.tflt-card-corpo h3 { margin: 0; font-weight: 650; line-height: 1.3; letter-spacing: -.01em;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.tflt-card-destaque .tflt-card-corpo h3 { font-size: 17px !important; }
.tflt-prefixo { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; margin: 0; }
/* Preço: forte + "de" riscado ao lado + selo -X%. */
.tflt-preco { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin: 0; }
.tflt-preco strong { font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }
.tflt-preco s { font-size: 12.5px; }
.tflt-off { font-size: 10.5px; font-weight: 800; letter-spacing: .02em; padding: 2px 7px; border-radius: 999px; }
.tflt-estrelas { display: flex; align-items: center; gap: 5px; font-size: 11px; margin: 0; }
.tflt-estrelas-fila { display: inline-flex; gap: 1px; }
.tflt-estrelas strong { font-weight: 750; }
.tflt-parcelas { font-size: 11.5px; margin: 2px 0 0; }
.tflt-sufixo { font-size: 12px; display: flex; align-items: flex-start; gap: 5px; line-height: 1.4; margin: 0; }
.tflt-sufixo svg { flex: none; margin-top: 1px; }
.tflt-esticador { flex: 1; min-height: 4px; }
/* Botão: 44 px de alvo, texto que quebra em vez de vazar (num 320 cada cartão
   tem ~140 px e "É SÓ CLICAR AQUI!" não cabe numa linha). */
.tflt-cta { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%;
  min-height: var(--tap, 44px); padding: 8px 10px; border-radius: 12px; box-sizing: border-box;
  font-size: 13.5px; font-weight: 650; line-height: 1.2; text-align: center;
  transition: filter var(--duration-quick, .15s) var(--ease-out, ease-out); }
.tflt-cta svg { flex: none; }

/* ── Botão de link ───────────────────────────────────────────────────────── */
.tflt-botao { grid-column: 1 / -1; display: flex; align-items: center; gap: 12px; min-height: 58px;
  padding: 9px 12px; border-radius: 16px; border: 1px solid transparent; box-sizing: border-box; cursor: pointer; user-select: none;
  box-shadow: 0 1px 2px rgb(0 0 0 / .05), 0 10px 28px -20px rgb(0 0 0 / .35);
  transition: transform var(--duration-quick, .15s) var(--ease-out, ease-out), box-shadow var(--duration-quick, .15s) var(--ease-out, ease-out); }
.tflt-botao:active { transform: scale(.985); }
@media (hover: hover) and (pointer: fine) { .tflt-botao:hover { transform: translateY(-2px); box-shadow: 0 2px 4px rgb(0 0 0 / .05), 0 18px 36px -20px rgb(0 0 0 / .42); } }
.tflt-botao-thumb { width: 40px; height: 40px; border-radius: 10px; object-fit: cover; flex: none; }
.tflt-botao-thumb-vazia { visibility: hidden; }
.tflt-botao-titulo { flex: 1; min-width: 0; text-align: center; font-size: 15px; font-weight: 600;
  line-height: 1.3; letter-spacing: -.01em; overflow-wrap: anywhere; }
.tflt-botao-seta { flex: none; width: 40px; display: grid; place-items: center; }

.tflt-marca { text-align: center; font-size: 12px; letter-spacing: .01em; color: var(--lt-fraco); margin: 0; padding: 8px 16px 16px; }
.tflt-marca strong { color: var(--lt-tinta); font-weight: 700; }

/* WhatsApp flutuante: verde da marca (identidade alheia, não segue o tema).
   sticky e não fixed: flutua no canto e, na prévia embutida do editor, fica
   CONTIDO na moldura — fixed escaparia pro viewport do editor inteiro. */
.tflt-zap { position: sticky; bottom: calc(16px + var(--safe-b, 0px));
  margin: -56px calc(var(--safe-r, 0px)) 12px auto;
  width: 56px; height: 56px; border-radius: 50%; background: #25D366; display: grid; place-items: center;
  box-shadow: 0 8px 24px rgb(0 0 0 / .28); z-index: 10;
  transition: transform var(--duration-quick, .15s) var(--ease-out, ease-out); }
.tflt-zap:active { transform: scale(.92); }
@media (hover: hover) and (pointer: fine) { .tflt-zap:hover { transform: translateY(-2px); } }

@media (prefers-reduced-motion: reduce) {
  .tflt-rede, .tflt-card, .tflt-botao, .tflt-zap, .tflt-cta { transition: none; }
}
/* Contraste alto: o desenho vive de superfícies quase iguais. Quem pede
   contraste recebe a borda desenhada, não o sussurro de 9% de tinta. */
@media (prefers-contrast: more) {
  .tflt-card, .tflt-botao { border-color: var(--lt-tinta) !important; }
  .tflt-rede { box-shadow: inset 0 0 0 1.5px var(--lt-tinta); }
  .tflt-bio, .tflt-arroba, .tflt-secao, .tflt-marca, .tflt-sufixo, .tflt-parcelas, .tflt-estrelas { color: var(--lt-tinta) !important; }
}

/* ── Tablet e janela média: uma coluna que respira ──────────────────────────
   480px numa tela de 768 é uma tira fina com deserto dos dois lados; aqui a
   coluna alarga e cabe mais um produto por fileira. */
@container (min-width: 620px) and (max-width: 899px) {
  .tflt-pagina { max-width: 640px; padding-inline: 24px; }
  .tflt-grade { grid-template-columns: repeat(auto-fill, minmax(min(100%, 180px), 1fr)); gap: 14px; }
}

/* ── Tela larga: duas colunas ────────────────────────────────────────────────
   A identidade da marca fica parada de um lado (sticky) enquanto os produtos
   ocupam o resto. Linhas explícitas de propósito: seção, grade, zap e
   assinatura são IRMÃOS e qualquer um pode não existir; com auto-placement,
   esconder a seção jogaria a grade pra debaixo do perfil. */
@container (min-width: 900px) {
  .tflt-pagina { max-width: 1080px; padding: 56px 32px calc(48px + var(--safe-b, 0px));
    display: grid; grid-template-columns: 300px minmax(0, 1fr); column-gap: 56px; align-items: start; }
  .tflt-topo { grid-column: 1; grid-row: 1 / span 3; position: sticky; top: 56px;
    align-items: flex-start; text-align: left; padding: 0; }
  .tflt-logo { width: 104px; height: 104px; }
  .tflt-nome { justify-content: flex-start; font-size: 26px; letter-spacing: -.025em; }
  .tflt-arroba { font-size: 14px; }
  .tflt-bio { font-size: 14.5px; max-width: 30ch; }
  .tflt-social { justify-content: flex-start; }
  .tflt-secao { grid-column: 2; grid-row: 1; text-align: left; padding: 4px 0 14px; }
  .tflt-grade, .tflt-vazio { grid-column: 2; grid-row: 2; }
  /* 196 e não 220: a coluna da direita tem ~660 px, e com 220 só cabiam duas
     trilhas — o destaque (span 2) virava largura inteira e ocupava a dobra. */
  .tflt-grade { grid-template-columns: repeat(auto-fill, minmax(min(100%, 196px), 1fr)); gap: 18px; padding-bottom: 8px; }
  /* Destaque em duas colunas: a largura toda deixaria a foto grande demais e
     empurraria o resto pra baixo da dobra. */
  .tflt-card-destaque { grid-column: span 2; }
  .tflt-card-destaque .tflt-card-midia { aspect-ratio: 16 / 10; }
  .tflt-card-corpo { padding: 14px; }
  .tflt-zap { grid-column: 2; grid-row: 3; justify-self: end; margin: 8px 0; }
  .tflt-marca { grid-column: 1 / -1; grid-row: 4; text-align: left; padding: 24px 0 0; }
}
`;
