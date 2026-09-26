// ── Uma página montada em blocos ─────────────────────────────────────────────
// Renderiza o que o construtor de Páginas gravou.
//
// Cada bloco desenha com as CLASSES DO TEMA (`section`, `container`, `heading`,
// `button button--primary`, `rte`) e não com um visual próprio. É o ponto: a
// página "Sobre a empresa" tem que parecer a mesma loja da página inicial —
// mesma fonte, mesmo raio de botão, mesma cor de destaque. Um construtor que
// desenha por fora do tema entrega uma página que parece de outro site.
//
// O que é layout de bloco (a coluna dupla da imagem-e-texto, a fileira de
// diferenciais) mora em `complemento.css` sob o prefixo `pg-`, sempre lendo
// token do tema.

import Link from "next/link";
import { higienizar } from "@/lib/vitrine/higienizar";
import { produtosDaColecao } from "@/lib/vitrine/colecoes";
import { caminhoProduto } from "@/lib/lojas";
import type { BlocoPagina, BotaoBloco } from "@/lib/lojas-blocos";
import { ProdutoCard } from "./ProdutoCard";
import { IconeBeneficio } from "./secoes/Rodape";
import type { Contexto } from "./contexto";
import { destinoDoItem } from "@/lib/lojas-conteudo";

const CLASSE_BOTAO: Record<BotaoBloco["estilo"], string> = {
  primario: "button button--primary",
  secundario: "button button--secondary",
  texto: "link link--underline pg-botao-texto",
};

function Botoes({ botoes, ctx, alinhamento = "left" }: {
  botoes: BotaoBloco[]; ctx: Contexto; alinhamento?: "left" | "center";
}) {
  const uteis = botoes.filter((b) => b.texto.trim());
  if (!uteis.length) return null;
  return (
    <div className="pg-botoes" style={{ justifyContent: alinhamento === "center" ? "center" : "flex-start" }}>
      {uteis.map((b, i) => {
        const href = destinoDoItem(b.destino, ctx.base);
        return (
          <Link key={i} href={href} className={CLASSE_BOTAO[b.estilo]}>{b.texto}</Link>
        );
      })}
    </div>
  );
}

const Rico = ({ html }: { html: string }) =>
  html ? <div className="rte" dangerouslySetInnerHTML={{ __html: higienizar(html) }} /> : null;

function Bloco({ bloco: b, ctx }: { bloco: BlocoPagina; ctx: Contexto }) {
  switch (b.tipo) {
    case "texto":
      return (
        <section className="section" data-bloco="texto">
          <div className="container container--narrow" style={{ textAlign: b.alinhamento === "center" ? "center" : "left" }}>
            {b.titulo && <h2 className="section__title heading h3">{b.titulo}</h2>}
            <Rico html={b.conteudo} />
          </div>
        </section>
      );

    case "imagem":
      if (!b.url) return null;
      return (
        <section className="section" data-bloco="imagem">
          <div className={`container ${b.largura === "estreita" ? "container--narrow" : ""}`}>
            <figure className="pg-figura">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.url} alt={b.alt} loading="lazy" />
              {b.legenda && <figcaption>{b.legenda}</figcaption>}
            </figure>
          </div>
        </section>
      );

    case "imagem-texto":
      return (
        <section className="section" data-bloco="imagem-texto">
          <div className="container">
            {/* No celular a foto vem SEMPRE primeiro, independente do lado
                escolhido: o "lado" é uma decisão de desktop, e alternar a ordem
                em coluna faz o texto do primeiro bloco encostar na foto do
                segundo. */}
            <div className={`pg-duo ${b.lado === "direita" ? "pg-duo--invertido" : ""}`}>
              {b.url ? (
                <div className="pg-duo-foto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.url} alt={b.alt} loading="lazy" />
                </div>
              ) : (
                <div className="pg-duo-foto pg-duo-foto--vazia" aria-hidden="true" />
              )}
              <div className="pg-duo-txt">
                {b.titulo && <h2 className="heading h3">{b.titulo}</h2>}
                <Rico html={b.conteudo} />
                <Botoes botoes={b.botoes} ctx={ctx} />
              </div>
            </div>
          </div>
        </section>
      );

    case "botoes":
      return (
        <section className="section section--tight" data-bloco="botoes">
          <div className="container">
            <Botoes botoes={b.botoes} ctx={ctx} alinhamento={b.alinhamento} />
          </div>
        </section>
      );

    case "produtos": {
      const escolhidos = b.fonte === "escolhidos"
        ? b.produtos.map((id) => ctx.produtos.find((p) => p.id === id)).filter(Boolean)
        : produtosDaColecao(ctx.produtos, b.colecao);
      const lista = (escolhidos as typeof ctx.produtos).slice(0, b.limite);
      // Sem produto pra mostrar o bloco não vira uma grade vazia com título:
      // some. O lojista vê o vazio no construtor, o cliente não vê nada.
      if (!lista.length) return null;
      return (
        <section className="section" data-bloco="produtos">
          <div className="container">
            {b.titulo && <h2 className="section__title heading h3">{b.titulo}</h2>}
            <div className="product-list product-list--grid">
              {lista.map((p) => <ProdutoCard key={p.id} produto={p} tema={ctx.tema} base={ctx.base} />)}
            </div>
            <Botoes botoes={b.botoes} ctx={ctx} alinhamento="center" />
          </div>
        </section>
      );
    }

    case "destaques":
      if (!b.itens.length) return null;
      return (
        <section className="section" data-bloco="destaques">
          <div className="container">
            {b.titulo && <h2 className="section__title heading h3">{b.titulo}</h2>}
            <div className="pg-destaques">
              {b.itens.map((i, n) => (
                <div className="pg-destaque" key={n}>
                  <IconeBeneficio nome={i.icone} />
                  <p className="pg-destaque-tit text--strong">{i.titulo}</p>
                  <p className="pg-destaque-txt">{i.texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      );

    case "perguntas":
      if (!b.itens.length) return null;
      return (
        <section className="section" data-bloco="perguntas">
          <div className="container container--narrow">
            {b.titulo && <h2 className="section__title heading h3">{b.titulo}</h2>}
            <div className="pg-faq">
              {/* `<details>` e não sanfona em JavaScript: abre sem script, o
                  Ctrl+F do navegador acha texto dentro do que está fechado, e a
                  vitrine não paga um componente de cliente por página. */}
              {b.itens.map((i, n) => (
                <details key={n} className="pg-faq-item">
                  <summary>{i.pergunta}</summary>
                  <div className="pg-faq-resposta"><Rico html={i.resposta} /></div>
                </details>
              ))}
            </div>
          </div>
        </section>
      );

    case "chamada":
      return (
        <section className="section" data-bloco="chamada">
          <div className="container">
            <div className="pg-chamada" style={b.fundo ? { background: b.fundo } : undefined}>
              {b.titulo && <h2 className="heading h3">{b.titulo}</h2>}
              <Rico html={b.conteudo} />
              <Botoes botoes={b.botoes} ctx={ctx} alinhamento="center" />
            </div>
          </div>
        </section>
      );
  }
}

export function BlocosDaPagina({ blocos, ctx }: { blocos: BlocoPagina[]; ctx: Contexto }) {
  return <>{blocos.map((b) => <Bloco key={b.id} bloco={b} ctx={ctx} />)}</>;
}

/** Usado pelo construtor pra abrir o produto escolhido numa aba. */
export const caminhoDoProduto = caminhoProduto;
