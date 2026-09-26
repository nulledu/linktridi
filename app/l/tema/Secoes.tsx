// ── De tipo de seção para componente ─────────────────────────────────────────
// O outro lado do registro: `lib/vitrine/registro.ts` diz o que cada seção
// AJUSTA, e este arquivo diz quem a DESENHA. Estão separados porque o editor
// precisa do primeiro sem carregar o segundo — o painel de ajustes não deve
// arrastar o carrossel e o player de vídeo pro bundle do ERP.
//
// Tipo sem componente aqui não quebra nada: a seção simplesmente não desenha.
// É a mesma tolerância da normalização — um tema pode chegar do banco falando
// de coisas que este deploy ainda não conhece.

import type { PropsSecao } from "./contexto";
import { BarraAviso, Cabecalho } from "./secoes/Cabecalho";
import { Rodape, Texto, TextoComIcones, HtmlLivre } from "./secoes/Rodape";
import { ColecaoComImagem, ColecaoDestaque, ListaColecoes } from "./secoes/Vitrines";
import { BannerDuplo, ImagemComTexto, Slideshow } from "./secoes/Banners";
import { VideoStories } from "./secoes/VideoStories";
import { Busca, Carrinho, Colecao, Erro, ListaDeColecoes, PaginaSimples, Produto, Recomendados } from "./secoes/Templates";

type Componente = (p: PropsSecao) => React.ReactNode;

const MAPA: Record<string, Componente> = {
  "announcement-bar": BarraAviso,
  header: Cabecalho,
  footer: Rodape,

  slideshow: Slideshow,
  "collection-list": ListaColecoes,
  "featured-collection": ColecaoDestaque,
  "collection-with-image": ColecaoComImagem,
  "video-stories": VideoStories,
  doublebanner: BannerDuplo,
  "image-with-text": ImagemComTexto,
  "text-with-icons": TextoComIcones,
  "rich-text": Texto,
  "custom-html": HtmlLivre,

  "product-template": Produto,
  "product-recommendations": Recomendados,
  "collection-template": Colecao,
  "list-collections-template": ListaDeColecoes,
  "search-template": Busca,
  "cart-template": Carrinho,
  "page-template": PaginaSimples,
  "erro-template": Erro,
};

export function Secao(props: PropsSecao) {
  const Componente = MAPA[props.secao.tipo];
  if (!Componente) return null;

  // No editor cada seção vira alvo: o painel rola até ela e a destaca. Fora do
  // editor o invólucro não existe — um `<div>` a mais em volta de cada seção
  // muda o `:first-child` de que o CSS do tema depende.
  if (props.ctx.editor) {
    return (
      <div data-secao={props.id} className="vt-editor-secao">
        <Componente {...props} />
      </div>
    );
  }
  return <Componente {...props} />;
}
