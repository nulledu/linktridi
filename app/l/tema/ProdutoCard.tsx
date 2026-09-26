// ── Card de produto ──────────────────────────────────────────────────────────
// Porte do `snippets/product-item.liquid`. É a peça mais repetida da loja:
// aparece na coleção em destaque, na página de coleção, na busca e nas
// recomendações — e é a que mais depende de classe certa, porque quase todo
// ajuste global de card ("formato da foto", "trocar foto ao passar o mouse",
// "mostrar desconto") é CSS do tema disparado por classe.
//
// O que NÃO foi portado: as avaliações (integração com app de terceiro), o
// seletor de cor (o produto daqui não tem variante) e a compra rápida com
// escolha de opção. O que existe no domínio foi portado inteiro.

import Link from "next/link";
import { caminhoProduto, descontoPercentual, moeda, precoVigente, type Produto } from "@/lib/lojas";
import type { Tema } from "@/lib/vitrine/tipos";

const esgotado = (p: Produto) => p.estoque === 0 && !p.venderSemEstoque;

/** Proporção que a foto ocupa, igual ao ajuste global do tema. */
const PROPORCAO: Record<string, number> = { square: 100, portrait: 150, landscape: 66.67 };

export function ProdutoCard({ produto, tema, base, horizontal }: {
  produto: Produto;
  tema: Tema;
  base: string;
  horizontal?: boolean;
}) {
  const a = tema.ajustes;
  const capa = produto.imagens[0];
  const segunda = produto.imagens[1];
  const comSegunda = a.show_secondary_image === true && !!segunda;
  const off = descontoPercentual(produto);
  const emPromocao = off != null;
  const fora = esgotado(produto);
  const href = `${base}/${caminhoProduto(produto)}`;

  const formato = String(a.product_image_size ?? "square");
  const proporcao = PROPORCAO[formato];

  return (
    <div className={`product-item ${horizontal ? "product-item--horizontal" : "product-item--vertical"}`}>
      {(emPromocao || fora) && (
        <div className="product-item__label-list">
          {emPromocao && a.show_discount !== false && (
            <span className="product-label product-label--on-sale">
              {a.discount_mode === "value"
                ? `${moeda(produto.preco - precoVigente(produto))} OFF`
                : `${off}% OFF`}
            </span>
          )}
        </div>
      )}

      <Link
        href={href}
        className={`product-item__image-wrapper ${comSegunda ? "product-item__image-wrapper--with-secondary" : ""}`}
      >
        <div
          className={`aspect-ratio ${formato !== "natural" ? `aspect-ratio--${formato}` : ""}`}
          style={proporcao ? { paddingBottom: `${proporcao}%` } : undefined}
        >
          {capa ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="product-item__primary-image" src={capa.url} alt={capa.alt || produto.titulo} loading="lazy" />
              {comSegunda && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="product-item__secondary-image" src={segunda.url} alt={segunda.alt || produto.titulo} loading="lazy" />
              )}
            </>
          ) : (
            <span className="placeholder-background" aria-hidden="true" />
          )}
        </div>
      </Link>

      <div className="product-item__info">
        <div className="product-item__info-inner">
          <Link href={href} className="product-item__title text--strong link">{produto.titulo}</Link>

          <div className="product-item__price-list price-list">
            {emPromocao ? (
              <>
                <span className="price price--highlight">{moeda(precoVigente(produto))}</span>
                <span className="price price--compare">{moeda(produto.preco)}</span>
              </>
            ) : (
              <span className="price">{moeda(produto.preco)}</span>
            )}
          </div>

          <Parcelas tema={tema} valor={precoVigente(produto)} />

          {fora ? (
            <span className="product-item__inventory inventory">Esgotado</span>
          ) : produto.estoque > 0 && produto.estoque <= 5 ? (
            <span className="product-item__inventory inventory inventory--low">
              Restam {produto.estoque} em estoque
            </span>
          ) : produto.venderSemEstoque && produto.estoque === 0 ? (
            <span className="product-item__inventory inventory inventory--high">Sob encomenda</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * "ou 12x de R$ 9,90".
 *
 * No tema original isto está CRAVADO no meio do `product-item.liquid`, com o
 * fator 1.2161 escrito na mão — é uma customização que a loja fez por cima do
 * Warehouse. Aqui vira ajuste, com o mesmo padrão: a cópia fica idêntica e a
 * próxima loja não herda o juro de outra pessoa.
 */
export function Parcelas({ tema, valor }: { tema: Tema; valor: number }) {
  if (tema.ajustes.show_installments !== true) return null;
  const vezes = Number(tema.ajustes.installments_count ?? 12);
  const fator = Number(tema.ajustes.installments_factor ?? 1.2161);
  if (!vezes || valor <= 0) return null;
  return (
    <p className="product-item__installments">
      ou <b>{vezes}x</b> de <b>{moeda((valor * fator) / vezes)}</b>
    </p>
  );
}
