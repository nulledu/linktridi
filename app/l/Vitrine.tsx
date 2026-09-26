// ── Vitrine pública ──────────────────────────────────────────────────────────
// O que o CLIENTE vê. Servida a qualquer pessoa na internet, sem sessão.
//
// Componente de servidor, sem `use client` e sem um grama de JavaScript no
// navegador: é uma página de catálogo, não um aplicativo. Quem chega por
// anúncio no 4G de um celular antigo abre uma página que já vem pronta.
//
// Ela NÃO usa nada de `app/(plataforma)` — nem os tokens, nem o kit, nem o
// tema do ERP. A vitrine é da LOJA, e o painel é do lojista: um dia a pessoa
// vai escolher a cor daqui, e amarrar isso no tema do ERP faria a escolha dela
// mudar quando alguém trocasse um token do sistema.

import Link from "next/link";
import type { Loja, Produto } from "@/lib/lojas";
import { caminhoProduto, descontoPercentual, moeda, precoVigente } from "@/lib/lojas";
import { BotaoCarrinho, Comprar } from "./Carrinho";

/** Fora de estoque de verdade: zerado E sem venda sob encomenda. */
const esgotado = (p: Produto) => p.estoque === 0 && !p.venderSemEstoque;

function Foto({ p, tamanho }: { p: Produto; tamanho: "card" | "grande" }) {
  const capa = p.imagens[0];
  if (!capa) {
    return (
      <div className={`vt-foto vt-foto-${tamanho} vt-foto-vazia`} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M15 8h.01" />
          <path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z" />
          <path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" />
          <path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" />
        </svg>
      </div>
    );
  }
  return (
    <div className={`vt-foto vt-foto-${tamanho}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={capa.url} alt={capa.alt || p.titulo} loading={tamanho === "card" ? "lazy" : "eager"} />
    </div>
  );
}

function Preco({ p, grande }: { p: Produto; grande?: boolean }) {
  const off = descontoPercentual(p);
  return (
    <div className={grande ? "vt-preco vt-preco-g" : "vt-preco"}>
      <strong>{moeda(precoVigente(p))}</strong>
      {off != null && <s>{moeda(p.preco)}</s>}
      {off != null && <span className="vt-off">{off}% OFF</span>}
    </div>
  );
}

function Cabecalho({ loja, voltar }: { loja: Loja; voltar?: string }) {
  return (
    <header className="vt-topo">
      <Link href={`/l/${loja.slug}`} className="vt-marca">{loja.nome}</Link>
      <span className="vt-topo-dir">
        {voltar && <Link href={voltar} className="vt-voltar">Voltar ao catálogo</Link>}
        {/* Só isto é interativo no cabeçalho — e some sozinho quando a loja não
            tem carrinho ligado ou ele está vazio. */}
        <BotaoCarrinho loja={loja} />
      </span>
    </header>
  );
}

function Rodape({ loja }: { loja: Loja }) {
  return (
    <footer className="vt-rodape">
      <span>{loja.nome}</span>
    </footer>
  );
}

// ── Catálogo ─────────────────────────────────────────────────────────────────

export function Vitrine({ loja, produtos }: { loja: Loja; produtos: Produto[] }) {
  return (
    <div className="vt">
      <Cabecalho loja={loja} />
      <main className="vt-main">
        <h1 className="vt-titulo">{loja.nome}</h1>

        {produtos.length === 0 ? (
          <p className="vt-vazio">Esta loja ainda não tem produtos publicados.</p>
        ) : (
          <div className="vt-grade">
            {produtos.map((p) => (
              <Link key={p.id} href={`/l/${loja.slug}/${caminhoProduto(p)}`} className="vt-card">
                <Foto p={p} tamanho="card" />
                <div className="vt-card-corpo">
                  <h2>{p.titulo}</h2>
                  <Preco p={p} />
                  {esgotado(p) && <span className="vt-esgotado">Esgotado</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      <Rodape loja={loja} />
    </div>
  );
}

// ── Página do produto ────────────────────────────────────────────────────────

export function ProdutoPublico({ loja, produto }: { loja: Loja; produto: Produto }) {
  const off = descontoPercentual(produto);
  return (
    <div className="vt">
      <Cabecalho loja={loja} voltar={`/l/${loja.slug}`} />
      <main className="vt-main">
        <div className="vt-produto">
          <Foto p={produto} tamanho="grande" />

          <div className="vt-produto-info">
            <h1>{produto.titulo}</h1>
            <Preco p={produto} grande />

            {esgotado(produto) ? (
              <p className="vt-aviso vt-aviso-esgotado">Esgotado no momento.</p>
            ) : produto.venderSemEstoque && produto.estoque === 0 ? (
              <p className="vt-aviso">Feito sob encomenda.</p>
            ) : produto.estoque <= 5 ? (
              <p className="vt-aviso">Últimas {produto.estoque} unidades.</p>
            ) : null}

            <Comprar loja={loja} produto={produto} />

            {produto.descricao && (
              <div className="vt-descricao">
                {/* Texto simples, quebrado por parágrafo. Não é HTML do
                    lojista: injetar marcação vinda do painel numa página
                    pública é a porta pra script de terceiro na vitrine. */}
                {produto.descricao.split(/\n{2,}/).map((par, i) => <p key={i}>{par}</p>)}
              </div>
            )}

            {produto.imagens.length > 1 && (
              <div className="vt-miniaturas">
                {produto.imagens.slice(1).map((img) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={img.id} src={img.url} alt={img.alt || produto.titulo} loading="lazy" />
                ))}
              </div>
            )}

            {off != null && <p className="vt-aviso">Promoção por tempo limitado.</p>}
          </div>
        </div>
      </main>
      <Rodape loja={loja} />
    </div>
  );
}
