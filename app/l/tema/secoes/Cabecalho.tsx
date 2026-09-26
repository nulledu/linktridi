"use client";

// ── Barra de aviso e cabeçalho ───────────────────────────────────────────────
// Porte de `announcement-bar.liquid` e `header.liquid`.
//
// O cabeçalho do Warehouse tem muita coisa que não existe aqui: conta de
// cliente, seletor de idioma e de moeda, mega-menu com imagem. Nada disso foi
// inventado — a loja do projeto não tem login de cliente nem multimoeda, e
// desenhar um botão "Entrar" que abre um formulário que não grava seria pior do
// que não ter o botão.
//
// O que FOI portado é o que a loja usa: logo, busca, rastreio, carrinho, o menu
// de navegação em faixa e a gaveta do celular.

import { useEffect, useState } from "react";
import Link from "next/link";
import { blocosDaSecao } from "@/lib/vitrine/tema";
import { comAlfa, legivelSobre } from "@/lib/vitrine/cor";
import { IconeTema } from "../Icone";
import { bool, num, resolverLink, txt, type PropsSecao } from "../contexto";

// ── Barra de aviso ───────────────────────────────────────────────────────────

export function BarraAviso({ id, secao, ctx }: PropsSecao) {
  const a = secao.ajustes;
  if (!bool(a, "show_announcement")) return null;
  const texto = txt(a, "text");
  if (!texto) return null;
  const link = resolverLink(txt(a, "link"), ctx.base);

  const de = txt(a, "background1", "#1e2d7d");
  const ate = txt(a, "background2", de);
  const estilo = {
    backgroundImage: `linear-gradient(to right, ${de}, ${ate})`,
    // A cor escolhida vence quando dá pra ler nas DUAS pontas do degradê. O
    // modelo importado vinha com branco sobre um degradê que termina em branco.
    color: legivelSobre(txt(a, "text_color", "#ffffff"), [de, ate]),
  } as React.CSSProperties;

  return (
    <section data-section-id={id} data-section-type="announcement-bar">
      <div className="announcement-bar" style={estilo}>
        <div className="container">
          <div className="announcement-bar__inner">
            {link ? (
              <Link href={link} className={`announcement-bar__content announcement-bar__content--${txt(a, "text_position", "left")}`}>
                {texto}
              </Link>
            ) : (
              <span className={`announcement-bar__content announcement-bar__content--${txt(a, "text_position", "left")}`}>{texto}</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Cabeçalho ────────────────────────────────────────────────────────────────

export function Cabecalho({ id, secao, ctx }: PropsSecao) {
  const a = secao.ajustes;
  const [menuAberto, setMenuAberto] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  // O campo de logo do CABEÇALHO vence, quando preenchido — é a logo daquele
  // tema. Vazio, cai na logo da LOJA (Dados da loja). Sem esse encadeamento a
  // logo teria que ser recolocada a cada troca de tema, e sumiria ao aplicar um
  // modelo pronto (que substitui o tema inteiro por um rascunho novo).
  const logo = txt(a, "logo") || ctx.loja.logoUrl || "";

  // Os links da faixa de navegação são os blocos do cabeçalho; sem nenhum, a
  // faixa mostra as coleções da loja, que é a informação que existe de graça.
  const doTema = blocosDaSecao(secao)
    .filter(({ bloco }) => bloco.tipo === "link")
    .map(({ id: bid, bloco }) => ({
      id: bid,
      titulo: txt(bloco.ajustes, "titulo"),
      href: resolverLink(txt(bloco.ajustes, "link"), ctx.base),
    }))
    .filter((l) => l.titulo && l.href);

  // Ordem de preferência: o menu CADASTRADO em Navegação, depois os blocos do
  // tema, e só então as categorias. As categorias são o padrão que funciona sem
  // ninguém configurar nada — mas assim que existe um menu de verdade, ele
  // manda: o lojista escolheu a ordem e os nomes.
  const doMenu = (ctx.menuPrincipal ?? []).map((i, n) => ({
    id: `m${n}`, titulo: i.titulo, href: resolverLink(i.destino, ctx.base),
  }));

  const links = doMenu.length
    ? doMenu
    : doTema.length
      ? doTema
      : ctx.colecoes.slice(0, 8).map((c) => ({ id: c.handle, titulo: c.titulo, href: `${ctx.base}/c/${c.handle}` }));

  // A gaveta trava o fundo enquanto está aberta. Sem isso o dedo rola a loja
  // atrás do menu — o mesmo defeito que a fundação do ERP resolve com
  // `travarRolagem`, que aqui não pode ser usada porque a vitrine não carrega
  // nada de `app/(plataforma)`.
  useEffect(() => {
    if (!menuAberto) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = antes; };
  }, [menuAberto]);

  const inicio = txt(a, "background1", "var(--header-background)");
  const fim = txt(a, "background2", "var(--header-background)");
  // O texto do cabeçalho é uma variável GLOBAL do tema, mas o degradê é desta
  // seção — nada ligava as duas coisas, e era por isso que "Carrinho" sumia na
  // metade clara da faixa. Aqui a variável é reescrita no escopo do cabeçalho.
  const tinta = legivelSobre(ctx.tema.ajustes.header_text_color as string ?? "#ffffff", [inicio, fim]);
  const estilo = {
    backgroundImage: `linear-gradient(to right, ${inicio}, ${fim})`,
    "--header-text-color": tinta,
    // A "leve" é o mesmo texto a 72% — o valor do tema é uma cor fixa clara,
    // que sobre fundo claro some junto.
    "--header-light-text-color": comAlfa(tinta, 0.72),
    "--header-border-color": comAlfa(tinta, 0.28),
    // O esmaecido da direita da faixa de menu (`.nav-bar::after` do tema) é
    // pintado com a cor do cabeçalho. Quando o lojista põe um DEGRADÊ, essa cor
    // fixa vira um bloco sólido de 40px destoando no fim da faixa — a cor do
    // fim do degradê é a que faz o esmaecido realmente esmaecer.
    "--nav-fim": fim,
  } as React.CSSProperties;

  return (
    <section data-section-id={id} data-section-type="header">
      <header
        className={`header header--inline ${bool(a, "show_condensed_search") ? "" : "header--search-expanded"} ${bool(a, "enable_sticky_header") ? "header--sticky" : ""}`}
        role="banner"
        style={estilo}
      >
        <div className="container">
          <div className="header__inner">
            <nav className="header__mobile-nav hidden-lap-and-up">
              <button
                type="button"
                className="header__mobile-nav-toggle icon-state touch-area"
                aria-expanded={menuAberto}
                aria-controls="mobile-menu"
                aria-label="Abrir o menu"
                onClick={() => setMenuAberto((v) => !v)}
              >
                <span className="icon-state__primary">
                  <IconeTema nome={menuAberto ? "close" : "hamburger"} />
                </span>
              </button>
            </nav>

            <div className="header__logo">
              <Link href={ctx.base || "/"} className="header__logo-link">
                {logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="header__logo-image"
                    src={logo}
                    alt={ctx.loja.nome}
                    style={{ maxWidth: num(a, "logo_max_width", 200) }}
                  />
                ) : (
                  <span className="header__logo-text">{ctx.loja.nome}</span>
                )}
              </Link>
            </div>

            <div className={`header__search-bar-wrapper ${buscaAberta || !bool(a, "show_condensed_search") ? "is-visible" : ""}`}>
              <form action={`${ctx.base}/busca`} method="get" role="search" className="search-bar">
                <div className="search-bar__top-wrapper">
                  <div className="search-bar__top">
                    <div className="search-bar__input-wrapper">
                      <input
                        className="search-bar__input"
                        type="text"
                        name="q"
                        autoComplete="off"
                        aria-label="Buscar na loja"
                        placeholder="Buscar produtos"
                        defaultValue={ctx.termo ?? ""}
                      />
                    </div>
                    <button type="submit" className="search-bar__submit" aria-label="Buscar">
                      <IconeTema nome="search" />
                    </button>
                  </div>
                </div>
              </form>
            </div>

            <div className="header__action-list">
              <div className="header__action-item hidden-tablet-and-up">
                <button
                  type="button"
                  className="header__action-item-link"
                  aria-expanded={buscaAberta}
                  aria-label="Abrir a busca"
                  onClick={() => setBuscaAberta((v) => !v)}
                >
                  <IconeTema nome="search" />
                </button>
              </div>

              <div className="header__action-item header__action-item--cart">
                <Link className="header__action-item-link header__cart-toggle" href={`${ctx.base}/carrinho`}>
                  <div className="header__action-item-content">
                    <div className="header__cart-icon icon-state">
                      <span className="icon-state__primary"><IconeTema nome="cart" /></span>
                    </div>
                    <span className="hidden-pocket hidden-lap">Carrinho</span>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </header>

      {links.length > 0 && (
        <nav className="nav-bar hidden-pocket" style={estilo}>
          <div className="nav-bar__inner">
            <div className="container">
              <ul className="nav-bar__linklist list--unstyled" data-type="menu">
                {links.map((l) => (
                  <li className="nav-bar__item" key={l.id}>
                    <Link href={l.href} className="nav-bar__link link">{l.titulo}</Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </nav>
      )}

      {menuAberto && (
        <>
          <div className="vt-veu" onClick={() => setMenuAberto(false)} aria-hidden="true" />
          <div className="vt-gaveta" id="mobile-menu" role="dialog" aria-label="Menu da loja">
            <ul className="list--unstyled">
              {links.map((l) => (
                <li key={l.id}>
                  <Link href={l.href} onClick={() => setMenuAberto(false)}>{l.titulo}</Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
