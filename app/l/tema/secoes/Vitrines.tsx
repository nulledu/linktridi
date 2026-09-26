// ── Seções que mostram produto ───────────────────────────────────────────────
// Porte de `collection-list.liquid`, `featured-collection.liquid` e
// `collection-with-image.liquid`. As três compartilham o mesmo miolo: um
// cabeçalho de seção com link à direita e uma `product-list` rolável dentro de
// um `scroller`.
//
// O `scroller`/`scroller__inner` não é enfeite: é o que faz a fileira de
// produtos rolar DENTRO do bloco no celular em vez de esticar a página — a
// mesma regra de "tabela larga rola dentro do bloco" do CLAUDE.md, que o tema
// já resolvia do jeito dele.

import Link from "next/link";
import { produtosDaColecao } from "@/lib/vitrine/colecoes";
import { IconeTema } from "../Icone";
import { ProdutoCard } from "../ProdutoCard";
import { blocosDaSecao } from "@/lib/vitrine/tema";
import { bool, num, resolverLink, txt, type PropsSecao } from "../contexto";

/** Cabeçalho de seção: título à esquerda, link à direita. */
function CabecalhoSecao({ titulo, link, rotuloLink }: { titulo: string; link: string; rotuloLink: string }) {
  if (!titulo && !rotuloLink) return null;
  return (
    <header className="section__header">
      <div className="section__header-stack">
        {titulo && <h2 className="section__title heading h3">{titulo}</h2>}
      </div>
      {rotuloLink && link && (
        <Link href={link} className="section__action-link link">
          {rotuloLink} <IconeTema nome="tail-right" />
        </Link>
      )}
    </header>
  );
}

// ── Lista de coleções ────────────────────────────────────────────────────────

/**
 * Coleção sem produto ainda não existe no catálogo e não tem título — sem isto
 * o chip mostraria o handle cru ("estencil" em vez de "Estencil").
 */
const nomeDoHandle = (h: string) =>
  h.split("-").map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p)).join(" ");

export function ListaColecoes({ id, secao, ctx }: PropsSecao) {
  const a = secao.ajustes;
  const redondas = bool(a, "round_images");
  const blocos = blocosDaSecao(secao);

  return (
    <section className="section" data-section-id={id} data-section-type="collection-list">
      <div className="container">
        <CabecalhoSecao
          titulo={txt(a, "title")}
          link={resolverLink(txt(a, "link"), ctx.base)}
          rotuloLink={txt(a, "link_title")}
        />

        <div className="scroller">
          <div className="scroller__inner">
            <div className="collection-list">
              {blocos.map(({ id: bid, bloco }, n) => {
                const handle = txt(bloco.ajustes, "collection");
                const col = ctx.colecoes.find((c) => c.handle === handle);
                const imagem = txt(bloco.ajustes, "image") || col?.capa || "";
                return (
                  <Link
                    key={bid}
                    href={`${ctx.base}/c/${handle}`}
                    className="collection-item"
                    data-collection-index={n}
                  >
                    <div className={`collection-item__image-wrapper ${redondas ? "collection-item__image-wrapper--rounded" : ""}`}>
                      <div className="aspect-ratio" style={{ paddingBottom: "100%" }}>
                        {imagem ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imagem} alt={col?.titulo ?? ""} loading="lazy" />
                        ) : (
                          <span className="placeholder-svg" aria-hidden="true" />
                        )}
                      </div>
                    </div>
                    {bool(a, "show_collection_title") && (
                      <span className="collection-item__title text--strong">
                        {col?.titulo ?? nomeDoHandle(handle)} <IconeTema nome="tail-right" />
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Coleção em destaque ──────────────────────────────────────────────────────

export function ColecaoDestaque({ id, secao, ctx }: PropsSecao) {
  const a = secao.ajustes;
  const handle = txt(a, "collection");
  const layout = txt(a, "layout", "vertical");
  const lista = produtosDaColecao(ctx.produtos, handle).slice(0, num(a, "products_count", 12));
  const col = ctx.colecoes.find((c) => c.handle === handle);

  return (
    <section className="section" data-section-id={id} data-section-type="featured-collection">
      <div className="container">
        <CabecalhoSecao
          titulo={txt(a, "title") || col?.titulo || ""}
          link={resolverLink(txt(a, "link_url"), ctx.base) || `${ctx.base}/c/${handle}`}
          rotuloLink={txt(a, "link_title")}
        />
      </div>

      <div className={`container ${layout !== "vertical" ? "container--flush" : ""}`}>
        <div className="scroller">
          <div className="scroller__inner">
            <div className={`product-list product-list--${layout} ${layout === "vertical" ? "product-list--scrollable" : ""} ${bool(a, "stack_desktop") ? "product-list--stackable" : ""}`}>
              {lista.map((p) => (
                <ProdutoCard
                  key={p.id}
                  produto={p}
                  tema={ctx.tema}
                  base={ctx.base}
                  horizontal={layout === "horizontal"}
                />
              ))}
            </div>
          </div>
        </div>
        {lista.length === 0 && (
          // Coleção vazia não pode virar buraco branco: o tema desenha
          // esqueletos, e aqui a frase é mais honesta do que fingir catálogo.
          <p className="text--subdued">Nenhum produto nesta coleção ainda.</p>
        )}
      </div>
    </section>
  );
}

// ── Coleção com imagem ───────────────────────────────────────────────────────

export function ColecaoComImagem({ id, secao, ctx }: PropsSecao) {
  const a = secao.ajustes;
  const handle = txt(a, "collection");
  const lista = produtosDaColecao(ctx.produtos, handle).slice(0, num(a, "products_count", 12));
  const imagem = txt(a, "image");

  // O tema pinta isto por `<style>` com o id da seção. Aqui vira variável CSS
  // no próprio bloco: mesmo efeito, sem injetar folha de estilo por seção — e
  // uma folha por seção era o que fazia a prévia do editor piscar a cada tecla.
  const estilo = {
    "--fc-background": txt(a, "background", "#0774d7"),
    "--fc-text": txt(a, "text_color", "#ffffff"),
    "--fc-button-bg": txt(a, "button_background", "#ffffff"),
    "--fc-button-text": txt(a, "button_text_color", "#0774d7"),
  } as React.CSSProperties;

  return (
    <section className="section vt-colecao-imagem" data-section-id={id} data-section-type="collection-with-image" style={estilo}>
      <div className="container container--flush">
        <div className="featured-collection">
          <header
            className="featured-collection__header"
            style={imagem ? { backgroundImage: `url(${imagem})` } : undefined}
          >
            {txt(a, "title") && <h2 className="featured-collection__title heading h2">{txt(a, "title")}</h2>}
            {txt(a, "content") && (
              <p className="featured-collection__text">
                {txt(a, "content").split("\n").map((linha, i) => (
                  <span key={i}>{linha}<br /></span>
                ))}
              </p>
            )}
            {txt(a, "button_text") && (
              <Link
                href={resolverLink(txt(a, "button_link"), ctx.base) || `${ctx.base}/c/${handle}`}
                className="featured-collection__cta button button--floating"
              >
                {txt(a, "button_text")}
              </Link>
            )}
          </header>

          <div className="featured-collection__content">
            <div className="scroller scroller--flush">
              <div className="scroller__inner">
                <div className="product-list product-list--scrollable">
                  {lista.map((p) => (
                    <ProdutoCard key={p.id} produto={p} tema={ctx.tema} base={ctx.base} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
