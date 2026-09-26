"use client";

// ── Seções presas a um template ──────────────────────────────────────────────
// Produto, coleção, lista de coleções, busca, carrinho, página e 404. Porte de
// `product-template.liquid`, `collection-template.liquid`, `cart-template.liquid`
// e `search-template.liquid`, com o vocabulário de classes do
// `snippets/product-info.liquid` na coluna de compra.
//
// O que sai do porte, e por quê: variante e opção de produto (o produto do
// projeto não tem variante — tem SKU e preço), avaliação (integração de
// terceiro), filtro de coleção por tag e estimador de frete (não há tabela de
// frete). Cada uma dessas seria uma tela inventada em cima de dado que não
// existe; a fidelidade que importa é a do que a loja realmente vende.

import { useState } from "react";
import Link from "next/link";
import {
  ACEITA_CARRINHO, ACEITA_WHATSAPP, caminhoProduto, descontoPercentual, linkWhatsApp,
  moeda, precoVigente, totalDoCarrinho, type Produto as TProduto,
} from "@/lib/lojas";
import { produtosDaColecao } from "@/lib/vitrine/colecoes";
import { BlocosDaPagina } from "../BlocosDaPagina";
import { higienizar } from "@/lib/vitrine/higienizar";
import { useCarrinho } from "../../Carrinho";
import { IconeTema } from "../Icone";
import { ProdutoCard, Parcelas } from "../ProdutoCard";
import { bool, num, txt, type Contexto, type PropsSecao } from "../contexto";

const esgotado = (p: TProduto) => p.estoque === 0 && !p.venderSemEstoque;

// ── Migalhas ─────────────────────────────────────────────────────────────────

function Migalhas({ ctx, atual }: { ctx: Contexto; atual: string }) {
  return (
    <nav aria-label="Você está aqui" className="breadcrumb">
      <ol className="breadcrumb__list">
        <li className="breadcrumb__item">
          <Link className="breadcrumb__link link" href={ctx.base || "/"}>Início</Link>
          <IconeTema nome="arrow-right" />
        </li>
        <li className="breadcrumb__item">
          <span className="breadcrumb__link" aria-current="page">{atual}</span>
        </li>
      </ol>
    </nav>
  );
}

// ── Produto ──────────────────────────────────────────────────────────────────

export function Produto({ id, secao, ctx }: PropsSecao) {
  const p = ctx.produto;
  const [foto, setFoto] = useState(0);
  const [quantidade, setQuantidade] = useState(1);
  const { mudar } = useCarrinho(ctx.loja.id);
  const [posto, setPosto] = useState(false);

  if (!p) return null;

  const off = descontoPercentual(p);
  const fora = esgotado(p);
  const capa = p.imagens[foto] ?? p.imagens[0];
  const podeCarrinho = ACEITA_CARRINHO(ctx.loja.checkout);
  const podeWhats = ACEITA_WHATSAPP(ctx.loja.checkout);
  // Um item só, já escrito: é o pedido que o cliente manda sem digitar nada.
  const zap = linkWhatsApp(ctx.loja, [{ produtoId: p.id, titulo: p.titulo, quantidade, precoUnitario: precoVigente(p) }]);

  const adicionar = () => {
    mudar((atual) => {
      const achado = atual.find((i) => i.produtoId === p.id);
      return achado
        ? atual.map((i) => (i.produtoId === p.id ? { ...i, quantidade: i.quantidade + quantidade } : i))
        : [...atual, { produtoId: p.id, titulo: p.titulo, quantidade, precoUnitario: precoVigente(p) }];
    });
    setPosto(true);
  };

  return (
    <section data-section-id={id} data-section-type="product">
      {/* `container` e não `container--flush`: o tema tira a margem lateral
          porque as colunas do produto vêm dentro de `.card`, que tem a sua. O
          porte não usa esses cartões, então sem a margem do container o título
          encosta na borda da tela no celular. */}
      <div className="container">
        <div className="page__sub-header">
          <Migalhas ctx={ctx} atual={p.titulo} />
        </div>

        <div className="product-block-list">
          <div className="product-block-list__wrapper">
            <div className="product-block-list__item product-block-list__item--gallery">
              <div className="product-gallery">
                <div className="product-gallery__carousel">
                  <div className="aspect-ratio aspect-ratio--square">
                    {capa ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="product-gallery__image" src={capa.url} alt={capa.alt || p.titulo} />
                    ) : (
                      <span className="placeholder-svg" aria-hidden="true" />
                    )}
                  </div>
                </div>
                {p.imagens.length > 1 && (
                  <div className="product-gallery__thumbnail-list">
                    {p.imagens.map((img, n) => (
                      <button
                        key={img.id}
                        type="button"
                        className={`product-gallery__thumbnail ${n === foto ? "is-nav-selected" : ""}`}
                        onClick={() => setFoto(n)}
                        aria-label={`Ver a foto ${n + 1}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="product-block-list__item product-block-list__item--info">
              <div className="product-meta">
                {off != null && (
                  <div className="product-meta__label-list">
                    <span className="product-label product-label--on-sale">{off}% OFF</span>
                  </div>
                )}
                <h1 className="product-meta__title heading h1">{p.titulo}</h1>

                {bool(secao.ajustes, "show_sku") && p.sku && (
                  <p className="product-meta__sku">
                    SKU: <span className="product-meta__sku-number">{p.sku}</span>
                  </p>
                )}

                <div className="price-list">
                  {off != null ? (
                    <>
                      <span className="price price--highlight">{moeda(precoVigente(p))}</span>
                      <span className="price price--compare">{moeda(p.preco)}</span>
                    </>
                  ) : (
                    <span className="price">{moeda(p.preco)}</span>
                  )}
                </div>
                <Parcelas tema={ctx.tema} valor={precoVigente(p)} />

                {fora ? (
                  <p className="product-form__inventory inventory">Esgotado no momento</p>
                ) : p.estoque > 0 && p.estoque <= 5 ? (
                  <p className="product-form__inventory inventory inventory--low">Restam {p.estoque} unidades</p>
                ) : p.venderSemEstoque && p.estoque === 0 ? (
                  <p className="product-form__inventory inventory inventory--high">Feito sob encomenda</p>
                ) : (
                  <p className="product-form__inventory inventory inventory--high">Em estoque</p>
                )}

                <div className="product-form">
                  {bool(secao.ajustes, "show_quantity_selector") && !fora && (
                    <div className="product-form__info-item product-form__info-item--quantity">
                      <span className="product-form__info-title text--strong">Quantidade</span>
                      <div className="quantity-selector">
                        <button type="button" className="quantity-selector__button" aria-label="Diminuir" onClick={() => setQuantidade((q) => Math.max(1, q - 1))}>−</button>
                        <input
                          className="quantity-selector__value"
                          type="number"
                          min={1}
                          value={quantidade}
                          onChange={(e) => setQuantidade(Math.max(1, Number(e.target.value) || 1))}
                          aria-label="Quantidade"
                        />
                        <button type="button" className="quantity-selector__button" aria-label="Aumentar" onClick={() => setQuantidade((q) => q + 1)}>+</button>
                      </div>
                    </div>
                  )}

                  {fora ? (
                    <button className="product-form__add-button button button--disabled" disabled>Esgotado</button>
                  ) : (
                    <>
                      {podeCarrinho && (
                        <button type="button" className="product-form__add-button button button--primary" onClick={adicionar}>
                          {posto ? "Adicionado ao carrinho" : "Adicionar ao carrinho"}
                        </button>
                      )}
                      {posto && podeCarrinho && (
                        <Link href={`${ctx.base}/carrinho`} className="button button--secondary button--full">
                          Ir para o carrinho
                        </Link>
                      )}
                      {podeWhats && zap && (
                        <a className="button button--secondary button--full" href={zap} target="_blank" rel="noopener noreferrer">
                          Comprar pelo WhatsApp
                        </a>
                      )}
                      {!podeCarrinho && !podeWhats && (
                        <p className="alert alert--center">Esta loja ainda não está aceitando pedidos.</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            {p.descricao && (
              <div className="product-block-list__item product-block-list__item--description">
                <div className="card">
                  <div className="card__section">
                    <span className="card__title heading h3">Descrição</span>
                    <div className="rte text--pull">
                      {p.descricao.split(/\n{2,}/).map((par, n) => <p key={n}>{par}</p>)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Recomendações ────────────────────────────────────────────────────────────

export function Recomendados({ id, secao, ctx }: PropsSecao) {
  const p = ctx.produto;
  if (!p) return null;

  // "Parecidos" é a mesma categoria; sem categoria, o resto do catálogo. Não é
  // recomendação de verdade — e prometer isso num rodapé de produto é o tipo de
  // coisa que ninguém confere.
  const mesma = p.categorias.length
    ? ctx.produtos.filter((o) => o.id !== p.id && o.categorias.some((c) => p.categorias.includes(c)))
    : [];
  const lista = (mesma.length ? mesma : ctx.produtos.filter((o) => o.id !== p.id))
    .slice(0, num(secao.ajustes, "products_count", 6));
  if (!lista.length) return null;

  return (
    <section className="section" data-section-id={id} data-section-type="product-recommendations">
      <div className="container">
        <header className="section__header">
          <h2 className="section__title heading h3">{txt(secao.ajustes, "title", "Você também pode gostar")}</h2>
        </header>
      </div>
      <div className="container">
        <div className="scroller">
          <div className="scroller__inner">
            <div className="product-list product-list--scrollable">
              {lista.map((o) => (
                <ProdutoCard key={o.id} produto={o} tema={ctx.tema} base={ctx.base} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Coleção ──────────────────────────────────────────────────────────────────

type Ordem = "manual" | "preco-asc" | "preco-desc" | "nome";

export function Colecao({ id, secao, ctx }: PropsSecao) {
  const [ordem, setOrdem] = useState<Ordem>("manual");
  const col = ctx.colecao;
  const lista = ordenar(produtosDaColecao(ctx.produtos, col?.handle ?? ""), ordem);

  return (
    <section data-section-id={id} data-section-type="collection">
      <div className="container">
        <div className="page__sub-header">
          <Migalhas ctx={ctx} atual={col?.titulo ?? "Coleção"} />
        </div>

        <header className="page__header">
          <h1 className="page__title heading h1">{col?.titulo ?? "Todos os produtos"}</h1>
          <p className="page__description">{lista.length} {lista.length === 1 ? "produto" : "produtos"}</p>
        </header>

        {bool(secao.ajustes, "show_sorting") && lista.length > 1 && (
          <div className="collection__toolbar">
            <label className="collection__sort">
              <span className="visually-hidden">Ordenar por</span>
              <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className="form__field form__field--select">
                <option value="manual">Em destaque</option>
                <option value="preco-asc">Menor preço</option>
                <option value="preco-desc">Maior preço</option>
                <option value="nome">Nome</option>
              </select>
            </label>
          </div>
        )}

        {lista.length === 0 ? (
          <p className="alert alert--center">Nenhum produto nesta coleção ainda.</p>
        ) : (
          <div className="product-list product-list--vertical">
            {lista.slice(0, num(secao.ajustes, "products_per_page", 24)).map((p) => (
              <ProdutoCard key={p.id} produto={p} tema={ctx.tema} base={ctx.base} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ordenar(lista: TProduto[], ordem: Ordem): TProduto[] {
  const copia = [...lista];
  if (ordem === "preco-asc") copia.sort((a, b) => precoVigente(a) - precoVigente(b));
  if (ordem === "preco-desc") copia.sort((a, b) => precoVigente(b) - precoVigente(a));
  if (ordem === "nome") copia.sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
  return copia;
}

// ── Lista de coleções ────────────────────────────────────────────────────────

export function ListaDeColecoes({ id, secao, ctx }: PropsSecao) {
  return (
    <section className="section" data-section-id={id} data-section-type="list-collections">
      <div className="container">
        <header className="page__header">
          <h1 className="page__title heading h1">Coleções</h1>
        </header>
        <div className="collection-list">
          {ctx.colecoes.map((c) => (
            <Link key={c.handle} href={`${ctx.base}/c/${c.handle}`} className="collection-item">
              <div className={`collection-item__image-wrapper ${bool(secao.ajustes, "round_images") ? "collection-item__image-wrapper--rounded" : ""}`}>
                <div className="aspect-ratio" style={{ paddingBottom: "100%" }}>
                  {c.capa ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.capa} alt="" loading="lazy" />
                  ) : (
                    <span className="placeholder-svg" aria-hidden="true" />
                  )}
                </div>
              </div>
              <span className="collection-item__title text--strong">{c.titulo}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Busca ────────────────────────────────────────────────────────────────────

export function Busca({ id, secao, ctx }: PropsSecao) {
  const termo = (ctx.termo ?? "").trim().toLowerCase();
  const achados = termo
    ? ctx.produtos.filter((p) =>
        [p.titulo, p.descricao, p.sku, ...p.categorias].join(" ").toLowerCase().includes(termo))
    : [];

  return (
    <section data-section-id={id} data-section-type="search">
      <div className="container">
        <header className="page__header">
          <h1 className="page__title heading h1">
            {termo ? `Resultados para "${ctx.termo}"` : "Buscar"}
          </h1>
          {termo && (
            <p className="page__description">
              {achados.length} {achados.length === 1 ? "produto encontrado" : "produtos encontrados"}
            </p>
          )}
        </header>

        {termo && achados.length === 0 && (
          <p className="alert alert--center">Nada encontrado. Tente outra palavra.</p>
        )}

        <div className="product-list product-list--vertical">
          {achados.slice(0, num(secao.ajustes, "results_per_page", 24)).map((p) => (
            <ProdutoCard key={p.id} produto={p} tema={ctx.tema} base={ctx.base} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Carrinho ─────────────────────────────────────────────────────────────────

export function Carrinho({ id, secao, ctx }: PropsSecao) {
  const { itens, mudar } = useCarrinho(ctx.loja.id);
  const porId = new Map(ctx.produtos.map((p) => [p.id, p]));
  // O item guarda título e preço do momento em que foi posto na sacola; o
  // produto só é buscado pela FOTO. É a mesma decisão do pedido gravado: preço
  // que muda no meio não pode reescrever o que a pessoa já viu.
  const linhas = itens.map((i) => ({ item: i, produto: porId.get(i.produtoId) ?? null }));
  const total = totalDoCarrinho(itens);
  const zap = linkWhatsApp(ctx.loja, itens);

  return (
    <section data-section-id={id} data-section-type="cart">
      <div className="container">
        <header className="page__header">
          <h1 className="page__title heading h1">{txt(secao.ajustes, "title", "Seu carrinho")}</h1>
        </header>

        {linhas.length === 0 ? (
          <div className="empty-state">
            <p className="alert alert--center">Seu carrinho está vazio.</p>
            <Link href={ctx.base || "/"} className="button button--primary">Ver produtos</Link>
          </div>
        ) : (
          <>
            <div className="line-item-list">
              {linhas.map(({ item, produto }) => {
                const href = produto ? `${ctx.base}/${caminhoProduto(produto)}` : "";
                return (
                <div className="line-item" key={item.produtoId}>
                  {href ? (
                    <Link href={href} className="line-item__image-wrapper">
                      {produto?.imagens[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={produto.imagens[0].url} alt="" />
                      ) : (
                        <span className="placeholder-svg" aria-hidden="true" />
                      )}
                    </Link>
                  ) : (
                    <span className="line-item__image-wrapper" aria-hidden="true" />
                  )}
                  <div className="line-item__info">
                    {href ? (
                      <Link href={href} className="line-item__title link text--strong">{item.titulo}</Link>
                    ) : (
                      <span className="line-item__title text--strong">{item.titulo}</span>
                    )}
                    <span className="price">{moeda(item.precoUnitario)}</span>
                  </div>
                  <div className="line-item__quantity">
                    <div className="quantity-selector">
                      <button type="button" className="quantity-selector__button" aria-label="Diminuir"
                        onClick={() => mudar((a) => a.flatMap((i) => i.produtoId !== item.produtoId ? [i] : i.quantidade > 1 ? [{ ...i, quantidade: i.quantidade - 1 }] : []))}>−</button>
                      <span className="quantity-selector__value">{item.quantidade}</span>
                      <button type="button" className="quantity-selector__button" aria-label="Aumentar"
                        onClick={() => mudar((a) => a.map((i) => i.produtoId === item.produtoId ? { ...i, quantidade: i.quantidade + 1 } : i))}>+</button>
                    </div>
                    <button type="button" className="line-item__remove link"
                      onClick={() => mudar((a) => a.filter((i) => i.produtoId !== item.produtoId))}>Remover</button>
                  </div>
                  <div className="line-item__price">
                    <span className="price price--highlight">{moeda(item.precoUnitario * item.quantidade)}</span>
                  </div>
                </div>
                );
              })}
            </div>

            <div className="cart__recap">
              <p className="cart__total-label text--strong">Total</p>
              <p className="cart__total-price price price--highlight">{moeda(total)}</p>
              {ACEITA_WHATSAPP(ctx.loja.checkout) && zap ? (
                <a className="button button--primary button--full" href={zap} target="_blank" rel="noopener noreferrer">
                  Fechar pedido pelo WhatsApp
                </a>
              ) : (
                <p className="alert alert--center">Esta loja ainda não está aceitando pedidos.</p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ── Página e 404 ─────────────────────────────────────────────────────────────

export function PaginaSimples({ id, ctx }: PropsSecao) {
  const p = ctx.pagina;
  const blocos = p?.blocos ?? [];

  // Uma página montada em blocos desenha os blocos e mais nada: o título fica a
  // cargo do primeiro bloco, porque o construtor deixa escolher se ele aparece
  // e como. Página antiga (só HTML) segue com o cabeçalho de sempre.
  if (blocos.length) {
    return (
      <div data-section-id={id} data-section-type="page">
        <BlocosDaPagina blocos={blocos} ctx={ctx} />
      </div>
    );
  }

  return (
    <section className="section" data-section-id={id} data-section-type="page">
      <div className="container container--narrow">
        <header className="page__header">
          <h1 className="page__title heading h1">{p?.titulo ?? ctx.loja.nome}</h1>
        </header>
        {/* O conteúdo é HTML escrito no painel e servido a QUALQUER pessoa na
            internet: passa pelo mesmo higienizador do resto da vitrine, com
            lista de permissão. */}
        <div className="rte" dangerouslySetInnerHTML={{ __html: higienizar(p?.conteudo ?? "") }} />
        {!p?.conteudo && <p className="in-vazio">Esta página ainda não tem conteúdo.</p>}
      </div>
    </section>
  );
}

export function Erro({ id, secao, ctx }: PropsSecao) {
  return (
    <section className="section" data-section-id={id} data-section-type="404">
      <div className="container container--narrow" style={{ textAlign: "center" }}>
        <h1 className="heading h1">{txt(secao.ajustes, "title", "Página não encontrada")}</h1>
        <Link href={ctx.base || "/"} className="button button--primary">
          {txt(secao.ajustes, "button_text", "Voltar à loja")}
        </Link>
      </div>
    </section>
  );
}
