"use client";

// ── Seções de imagem ─────────────────────────────────────────────────────────
// Porte de `slideshow.liquid`, `doublebanner.liquid` e `image-with-text.liquid`.
//
// Só o carrossel precisa de JavaScript; os outros dois são estáticos e ficam
// aqui por vizinhança de assunto. O custo de marcar o arquivo inteiro como
// cliente é o dos três — poucos KB, e o alternativo (dois arquivos que se
// importam) espalharia o mesmo assunto por dois lugares.

import { useState } from "react";
import Link from "next/link";
import { blocosDaSecao } from "@/lib/vitrine/tema";
import { higienizar } from "@/lib/vitrine/higienizar";
import { Carrossel } from "../Carrossel";
import { bool, num, resolverLink, txt, type PropsSecao } from "../contexto";

// ── Carrossel de banners ─────────────────────────────────────────────────────

export function Slideshow({ id, secao, ctx }: PropsSecao) {
  const a = secao.ajustes;
  const blocos = blocosDaSecao(secao);

  const tamanho = txt(a, "section_size", "preserve_ratio").replace(/_/g, "-");
  const borda = bool(a, "edge_to_edge");
  const proporcional = tamanho === "preserve-ratio";

  // A proporção do banner só é conhecida quando a imagem chega.
  //
  // No Shopify ela vem do Liquid, que sabe o tamanho do arquivo e escreve o
  // `padding-bottom` no servidor. Aqui a imagem é uma URL qualquer, então quem
  // mede é o navegador — e até medir o palco fica com 42%, que é a proporção de
  // banner de loja mais comum. Sem esse valor inicial a página pularia do nada
  // pra altura cheia quando a imagem carregasse.
  const [proporcao, setProporcao] = useState("100 / 42");

  // Depois dos ganchos, sempre: sair antes muda a quantidade de `useState` que
  // o React vê entre um render e outro, e é o erro que derruba a tela inteira
  // no primeiro slide removido pelo editor.
  if (!blocos.length) return null;

  return (
    <section data-section-id={id} data-section-type="slideshow">
      <div className={borda ? undefined : "container container--flush"}>
        <Carrossel
          className={`slideshow slideshow--${tamanho} ${borda ? "slideshow--edge2edge" : ""}`}
          efeito={txt(a, "carousel_effect", "slide") === "fade" ? "fade" : "slide"}
          autoPlay={bool(a, "autoplay")}
          intervalo={num(a, "cycle_speed", 5) * 1000}
          alturaAdaptavel={false}
          estilo={proporcional ? { height: "auto", aspectRatio: proporcao } : undefined}
          rotulo="Destaques da loja"
        >
          {blocos.map(({ id: bid, bloco }, n) => {
            const s = bloco.ajustes;
            const primeiro = n === 0;
            const foto = txt(s, "image");
            const fotoCel = txt(s, "mobile_image") || foto;
            const link = resolverLink(txt(s, "link"), ctx.base);
            const textoBotao = txt(s, "button_text");
            const posicao = txt(s, "content_position", "middle_center").replace(/_/g, "-");
            const temConteudo = !!(txt(s, "title") || txt(s, "content") || (link && textoBotao));

            // Cor do texto e do botão vêm por variável e não por `<style>` com o
            // id do bloco, como o tema faz. É o mesmo resultado sem uma folha de
            // estilo por slide — que na prévia do editor recompilaria a cada
            // tecla digitada no campo de cor.
            const estilo = {
              color: txt(s, "text_color", "#ffffff"),
              "--slide-button-bg": txt(s, "button_background", "#ffffff"),
              "--slide-button-text": txt(s, "button_text_color", "#000000"),
              "--slide-overlay": bool(s, "show_overlay") ? String(num(s, "overlay_opacity", 30) / 100) : "0",
            } as React.CSSProperties;

            const miolo = (
              <div className={`slideshow__slide-inner slideshow__slide-inner--${posicao}`}>
                {foto ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className={`slideshow__image ${fotoCel !== foto ? "hidden-phone" : ""}`}
                      src={foto}
                      alt=""
                      loading="eager"
                      onLoad={(e) => {
                        if (!proporcional || !primeiro) return;
                        const img = e.currentTarget;
                        if (img.naturalWidth) setProporcao(`${img.naturalWidth} / ${img.naturalHeight}`);
                      }}
                    />
                    {fotoCel !== foto && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="slideshow__image hidden-tablet-and-up" src={fotoCel} alt="" loading="eager" />
                    )}
                  </>
                ) : (
                  <div className="slideshow__placeholder" aria-hidden="true" />
                )}

                {temConteudo && (
                  <div className="slideshow__content-wrapper">
                    <div className="container">
                      {txt(s, "title") && <h2 className="slideshow__title heading h1">{txt(s, "title")}</h2>}
                      {txt(s, "content") && (
                        <p className="slideshow__content">
                          {txt(s, "content").split("\n").map((l, i) => <span key={i}>{l}<br /></span>)}
                        </p>
                      )}
                      {link && textoBotao && (
                        <Link href={link} className="slideshow__button button">{textoBotao}</Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );

            const classe = `slideshow__slide ${bool(s, "show_overlay") ? "slideshow__slide--overlay" : ""}`;

            // Slide inteiro clicável quando não há botão — é a regra do tema, e
            // ela importa: com botão, o link do slide roubaria o clique dele.
            return link && !textoBotao ? (
              <Link key={bid} href={link} className={classe} id={`block-${bid}`} style={estilo}>{miolo}</Link>
            ) : (
              <div key={bid} className={classe} id={`block-${bid}`} style={estilo}>{miolo}</div>
            );
          })}
        </Carrossel>
      </div>
    </section>
  );
}

// ── Banners duplos ───────────────────────────────────────────────────────────

export function BannerDuplo({ id, secao, ctx }: PropsSecao) {
  const a = secao.ajustes;
  const blocos = blocosDaSecao(secao);
  if (!blocos.length) return null;

  const estilo = {
    "--bd-largura": `${num(a, "page_width", 1200)}px`,
    "--bd-raio": `${num(a, "border_radius", 12)}px`,
    paddingTop: num(a, "padding_top", 36),
    paddingBottom: num(a, "padding_bottom", 36),
  } as React.CSSProperties;

  return (
    <section className="vt-banner-duplo" data-section-id={id} data-section-type="doublebanner" style={estilo}>
      <div className="vt-banner-duplo__grade">
        {blocos.map(({ id: bid, bloco }) => {
          const s = bloco.ajustes;
          const desktop = txt(s, "image_desktop");
          const celular = txt(s, "image_mobile") || desktop;
          const link = resolverLink(txt(s, "link"), ctx.base);
          const conteudo = desktop ? (
            <>
              <div className="vt-banner-duplo__cel">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={celular} alt="" loading="lazy" />
              </div>
              <div className="vt-banner-duplo__desk">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={desktop} alt="" loading="lazy" />
              </div>
            </>
          ) : (
            <span className="placeholder-svg" aria-hidden="true" />
          );
          return (
            <div className="vt-banner-duplo__item" key={bid}>
              {link ? <Link href={link}>{conteudo}</Link> : conteudo}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Imagem com texto ─────────────────────────────────────────────────────────

export function ImagemComTexto({ id, secao, ctx }: PropsSecao) {
  const a = secao.ajustes;
  const foto = txt(a, "image");
  const esquerda = txt(a, "image_position", "left") === "left";
  const botao = txt(a, "button_text");
  const link = resolverLink(txt(a, "button_link"), ctx.base);

  const imagem = (
    <div className="image-with-text__image-container" style={{ width: `${num(a, "image_width", 50)}%` }}>
      {foto ? (
        <div className="aspect-ratio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto} alt={txt(a, "title")} loading="lazy" />
        </div>
      ) : (
        <span className="placeholder-svg" aria-hidden="true" />
      )}
    </div>
  );

  const texto = (
    <div className="image-with-text__text-container">
      <div className="image-with-text__text-aligner">
        {txt(a, "title") && <h2 className="heading h2">{txt(a, "title")}</h2>}
        <div className="rte">
          <div dangerouslySetInnerHTML={{ __html: higienizar(txt(a, "content")) }} />
          {botao && link && <Link href={link} className="button button--primary">{botao}</Link>}
        </div>
      </div>
    </div>
  );

  return (
    <section className="section" data-section-id={id} data-section-type="image-with-text">
      <div className="container">
        <div className="image-with-text">
          {esquerda ? <>{imagem}{texto}</> : <>{texto}{imagem}</>}
        </div>
      </div>
    </section>
  );
}
