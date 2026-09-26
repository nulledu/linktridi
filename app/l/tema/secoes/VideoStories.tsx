"use client";

// ── Vídeos em destaque ───────────────────────────────────────────────────────
// Porte da seção `video-stories.liquid` — que NÃO é do Warehouse: é uma seção
// que a loja acrescentou por cima do tema. Formato de "stories": uma fileira de
// capas 9:16 que rola de lado, e um player em tela cheia com barra de progresso
// por vídeo, toque nas laterais pra avançar e o card do produto embaixo.
//
// O CSS está em `complemento.css`, portado do `<style>` da seção. O que muda
// aqui é o motor: o original é jQuery mexendo em `classList` e `scrollLeft`;
// aqui é estado do React, com o mesmo DOM e as mesmas classes.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { blocosDaSecao } from "@/lib/vitrine/tema";
import { bool, resolverLink, txt, type PropsSecao } from "../contexto";

interface Item {
  id: string;
  capa: string;
  video: string;
  fotoProduto: string;
  nome: string;
  preco: string;
  link: string;
  botao: string;
}

export function VideoStories({ id, secao, ctx }: PropsSecao) {
  const itens: Item[] = blocosDaSecao(secao).map(({ id: bid, bloco }) => ({
    id: bid,
    capa: txt(bloco.ajustes, "thumbnail"),
    video: txt(bloco.ajustes, "video_url"),
    fotoProduto: txt(bloco.ajustes, "product_image"),
    nome: txt(bloco.ajustes, "product_name"),
    preco: txt(bloco.ajustes, "product_price"),
    link: resolverLink(txt(bloco.ajustes, "product_url"), ctx.base),
    botao: txt(bloco.ajustes, "cta_label", "Comprar"),
  }));

  const [aberto, setAberto] = useState<number | null>(null);
  const trilho = useRef<HTMLDivElement>(null);
  // As setas só existem quando há o que rolar. Com três capas numa tela larga a
  // fileira cabe inteira, e a seta da direita ficava boiando no vazio a meio
  // metro do último card — apontando pra nada, mas clicável.
  const [rolavel, setRolavel] = useState(false);

  useLayoutEffect(() => {
    const el = trilho.current;
    if (!el) return;
    // Largura 0 não é "não rola", é "ainda não tem layout" — acontece quando a
    // seção monta dentro de um iframe que ainda não apareceu (a prévia do
    // editor) ou de uma aba escondida. Decidir ali trava a resposta no valor
    // errado, e o `ResizeObserver` só reavalia se a medida mudar de novo.
    const medir = () => {
      if (el.clientWidth === 0) return;
      setRolavel(el.scrollWidth - el.clientWidth > 4);
    };
    medir();

    // Os DOIS caminhos, e não só um. O `ResizeObserver` pega o que a janela não
    // vê — a fileira também muda de largura quando a coluna ao redor muda
    // (prévia do editor, gaveta abrindo) e ali o evento da janela nunca
    // dispara. Mas ele depende do ciclo de layout do navegador e pode
    // simplesmente não rodar em contexto que não está compondo quadro; quando
    // isso acontece a seta some pra sempre, sem erro nenhum. O `resize` da
    // janela cobre o caso comum de graça.
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    window.addEventListener("resize", medir);
    // Rolar prova que rola: se as duas medições falharem, o primeiro arrasto
    // ainda acerta o estado.
    el.addEventListener("scroll", medir, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", medir);
      el.removeEventListener("scroll", medir);
    };
  }, [itens.length]);

  if (!itens.length) return null;

  const centralizado = txt(secao.ajustes, "alinhamento", "centro") !== "esquerda";
  const comPlayer = secao.ajustes.abrir_player === undefined || bool(secao.ajustes, "abrir_player");

  const rolar = (dir: 1 | -1) => {
    const el = trilho.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <section className="vd-root" id={`vd-${id}`} data-section-id={id} data-section-type="video-stories"
      data-alinhar={centralizado ? "centro" : "esquerda"}>
      {txt(secao.ajustes, "title") && <h2 className="vd-title">{txt(secao.ajustes, "title")}</h2>}

      <div className="vd-carousel-outer" data-rolavel={rolavel ? "1" : undefined}>
        <button type="button" className="vd-arrow vd-arrow--prev" aria-label="Anterior" onClick={() => rolar(-1)}>
          <svg viewBox="0 0 24 24" fill="none">
            <polyline points="15,18 9,12 15,6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="vd-track-wrap" ref={trilho}>
          <div className="vd-track">
            {itens.map((item, n) => {
              const miolo = (
                <>
                  {item.capa ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="vd-card-thumb" src={item.capa} alt="" loading="lazy" />
                  ) : (
                    <div className="vd-card-thumb vd-card-thumb--empty" />
                  )}
                  {/* Sem player, o triângulo de "play" some: prometer vídeo e
                      abrir uma página de produto é pior que não prometer. */}
                  <span className="vd-card-overlay">
                    {comPlayer && (
                      <span className="vd-play-btn">
                        <svg viewBox="0 0 24 24" fill="none">
                          <polygon points="6,3 20,12 6,21" fill="rgba(255,255,255,0.9)" />
                        </svg>
                      </span>
                    )}
                  </span>
                  {!comPlayer && item.nome && <span className="vd-card-nome">{item.nome}</span>}
                </>
              );

              if (!comPlayer) {
                if (!item.link) return <div key={item.id} className="vd-card" data-index={n}>{miolo}</div>;
                return (
                  <Link key={item.id} href={item.link} className="vd-card" data-index={n}
                    aria-label={item.nome || "Ver produto"}>
                    {miolo}
                  </Link>
                );
              }

              return (
                <button
                  key={item.id}
                  type="button"
                  className="vd-card"
                  data-index={n}
                  onClick={() => setAberto(n)}
                  aria-label={`Ver o vídeo de ${item.nome || "produto"}`}
                >
                  {miolo}
                </button>
              );
            })}
          </div>
        </div>

        <button type="button" className="vd-arrow vd-arrow--next" aria-label="Próximo" onClick={() => rolar(1)}>
          <svg viewBox="0 0 24 24" fill="none">
            <polyline points="9,18 15,12 9,6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {aberto !== null && (
        <Player itens={itens} inicial={aberto} aoFechar={() => setAberto(null)} />
      )}
    </section>
  );
}

// ── Player em tela cheia ─────────────────────────────────────────────────────

function Player({ itens, inicial, aoFechar }: { itens: Item[]; inicial: number; aoFechar: () => void }) {
  const [i, setI] = useState(inicial);
  const [progresso, setProgresso] = useState(0);
  const [mudo, setMudo] = useState(true);
  const [curtidos, setCurtidos] = useState<Record<string, boolean>>({});
  const video = useRef<HTMLVideoElement>(null);
  const item = itens[i];

  const avancar = useCallback(() => {
    setProgresso(0);
    setI((n) => (n + 1 < itens.length ? n + 1 : n));
    if (i + 1 >= itens.length) aoFechar();
  }, [i, itens.length, aoFechar]);

  const voltar = useCallback(() => {
    setProgresso(0);
    setI((n) => Math.max(0, n - 1));
  }, []);

  // Teclado: fechar com Esc e navegar com as setas. Um player em tela cheia sem
  // Esc prende quem abriu por engano.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
      if (e.key === "ArrowRight") avancar();
      if (e.key === "ArrowLeft") voltar();
    };
    document.addEventListener("keydown", tecla);
    // Trava a rolagem do fundo enquanto o player está aberto — senão o dedo
    // rola a loja atrás do vídeo.
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = antes;
    };
  }, [aoFechar, avancar, voltar]);

  return (
    <div className="vd-player is-open" role="dialog" aria-modal="true" aria-label="Vídeo do produto">
      <div className="vd-player-content">
        <div className="vd-progress-wrap">
          {itens.map((it, n) => (
            <div className="vd-prog-seg" key={it.id}>
              <div
                className="vd-prog-seg-fill"
                style={{ width: n < i ? "100%" : n === i ? `${progresso}%` : "0%" }}
              />
            </div>
          ))}
        </div>

        <div className="vd-controls">
          <button type="button" className="vd-ctrl-btn" aria-label={mudo ? "Ativar som" : "Silenciar"} onClick={() => setMudo((m) => !m)}>
            {mudo ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M23 9l-6 6M17 9l6 6" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 010 7" /></svg>
            )}
          </button>
          <button type="button" className="vd-ctrl-btn" aria-label="Fechar" onClick={aoFechar}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {item.video ? (
          <video
            ref={video}
            className="vd-video"
            src={item.video}
            poster={item.capa || undefined}
            autoPlay
            muted={mudo}
            playsInline
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration) setProgresso((v.currentTime / v.duration) * 100);
            }}
            onEnded={avancar}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="vd-video" src={item.capa} alt="" />
        )}

        <button type="button" className="vd-tap vd-tap--left" aria-label="Anterior" onClick={voltar} />
        <button type="button" className="vd-tap vd-tap--right" aria-label="Próximo" onClick={avancar} />

        <button type="button" className="vd-player-arrow vd-player-arrow--prev" aria-label="Anterior" onClick={voltar}>
          <svg viewBox="0 0 24 24" fill="none"><polyline points="15,18 9,12 15,6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <button type="button" className="vd-player-arrow vd-player-arrow--next" aria-label="Próximo" onClick={avancar}>
          <svg viewBox="0 0 24 24" fill="none"><polyline points="9,18 15,12 9,6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>

        <button
          type="button"
          className={`vd-like-btn ${curtidos[item.id] ? "liked" : ""}`}
          aria-pressed={!!curtidos[item.id]}
          aria-label="Curtir"
          onClick={() => setCurtidos((c) => ({ ...c, [item.id]: !c[item.id] }))}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          </svg>
        </button>

        {(item.nome || item.link) && (
          <div className="vd-product-card">
            {item.fotoProduto && (
              <div className="vd-product-img-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.fotoProduto} alt="" />
              </div>
            )}
            <div className="vd-product-info">
              <span className="vd-product-name">{item.nome}</span>
              <span className="vd-product-price">{item.preco}</span>
            </div>
            {item.link && <a className="vd-product-btn" href={item.link}>{item.botao}</a>}
          </div>
        )}
      </div>
    </div>
  );
}
