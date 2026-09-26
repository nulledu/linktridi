// ── Catálogo de seções ───────────────────────────────────────────────────────
// O schema de cada seção, decalcado dos blocos `{% schema %}` do tema Warehouse
// exportado da carimbostridi.com.br. Os rótulos vêm pro português porque o
// editor é nosso; os `id` NÃO são traduzidos — são a chave do dado guardado, e
// traduzir chave é como renomear coluna de banco: quebra tudo que já foi salvo.
//
// Isto é só descrição. Quem desenha a seção é `app/l/secoes/*`, quem desenha o
// controle é o editor. Um schema errado aqui aparece como controle faltando no
// painel, nunca como tela quebrada.

import type { EsquemaSecao, Template } from "./tipos";

const POSICOES = [
  { valor: "top_left", label: "Topo à esquerda" },
  { valor: "top_center", label: "Topo ao centro" },
  { valor: "top_right", label: "Topo à direita" },
  { valor: "middle_left", label: "Meio à esquerda" },
  { valor: "middle_center", label: "Meio ao centro" },
  { valor: "middle_right", label: "Meio à direita" },
  { valor: "bottom_left", label: "Base à esquerda" },
  { valor: "bottom_center", label: "Base ao centro" },
  { valor: "bottom_right", label: "Base à direita" },
];

/** Os ícones que o tema desenha em `text-with-icons` (fonte: snippets/icon.liquid). */
export const ICONES_TEMA = [
  "bi-add-to-cart", "bi-gift-wrap", "bi-gift-box", "bi-heart", "bi-ecology",
  "bi-plant", "bi-shop", "bi-shop-pin", "bi-alert", "bi-chat", "bi-comment",
  "bi-customer-support", "bi-email", "bi-network", "bi-newsletter", "bi-love",
  "bi-phone", "bi-share", "bi-delivery", "bi-fast-delivery", "bi-returns",
  "bi-time", "bi-secure-payment", "bi-mobile-payment", "bi-computer-payment",
  "bi-credit-card", "bi-shield",
];

export const SECOES: EsquemaSecao[] = [
  // ── Fixas do layout ────────────────────────────────────────────────────────
  {
    tipo: "announcement-bar",
    nome: "Barra de anúncio",
    icone: "speakerphone",
    alcance: { onde: "fixa", faixa: "topo" },
    ajustes: [
      { tipo: "chave", id: "show_announcement", label: "Mostrar a barra", padrao: true },
      { tipo: "cor", id: "background1", label: "Cor do fundo", padrao: "#1e2d7d" },
      { tipo: "cor", id: "background2", label: "Cor do fundo (fim do degradê)", padrao: "#1e2d7d" },
      { tipo: "cor", id: "text_color", label: "Cor do texto", padrao: "#ffffff" },
      { tipo: "texto", id: "text", label: "Texto", padrao: "Anuncie algo aqui" },
      {
        tipo: "opcao", id: "text_position", label: "Posição do texto", padrao: "left",
        opcoes: [{ valor: "left", label: "À esquerda" }, { valor: "center", label: "Ao centro" }],
      },
      { tipo: "link", id: "link", label: "Link" },
    ],
  },
  {
    tipo: "header",
    nome: "Cabeçalho",
    icone: "layout-navbar",
    alcance: { onde: "fixa", faixa: "topo" },
    ajustes: [
      { tipo: "chave", id: "enable_sticky_header", label: "Cabeçalho grudado no topo", padrao: false },
      { tipo: "imagem", id: "logo", label: "Logo" },
      { tipo: "numero", id: "logo_max_width", label: "Largura da logo", padrao: 200, min: 50, max: 400, passo: 5, unidade: "px" },
      { tipo: "numero", id: "mobile_logo_max_width", label: "Largura da logo no celular", padrao: 140, min: 50, max: 250, passo: 5, unidade: "px" },
      { tipo: "titulo", id: "t_cores", label: "Cores" },
      { tipo: "cor", id: "background1", label: "Fundo (início)", padrao: "#1e2d7d" },
      { tipo: "cor", id: "background2", label: "Fundo (fim)", padrao: "#1e2d7d" },
      { tipo: "titulo", id: "t_contato", label: "Contato" },
      { tipo: "texto", id: "navigation_phone_number", label: "Telefone" },
      { tipo: "texto", id: "navigation_email", label: "E-mail" },
      { tipo: "titulo", id: "t_busca", label: "Busca" },
      { tipo: "chave", id: "show_condensed_search", label: "Busca reduzida", padrao: false },
    ],
    blocos: [
      {
        tipo: "link",
        nome: "Item do menu",
        icone: "link",
        ajustes: [
          { tipo: "texto", id: "titulo", label: "Título", padrao: "Categoria" },
          { tipo: "link", id: "link", label: "Link" },
        ],
      },
    ],
  },
  {
    tipo: "footer",
    nome: "Rodapé",
    icone: "layout-bottombar",
    alcance: { onde: "fixa", faixa: "rodape" },
    ajustes: [
      // `background2` é a SEGUNDA PONTA DO DEGRADÊ, e estava rotulada como
      // "Texto". Quem escolheu branco ali achava que estava pintando a letra e
      // estava pintando metade do rodapé de branco — foi assim que o rodapé
      // importado nasceu ilegível. A cor da letra não é mais escolha de
      // ninguém: sai derivada das duas pontas (ver `legivelSobre`).
      { tipo: "cor", id: "background1", label: "Fundo (início)", padrao: "#1e2d7d" },
      { tipo: "cor", id: "background2", label: "Fundo (fim)", padrao: "#1e2d7d" },
      { tipo: "chave", id: "show_social_media", label: "Mostrar redes sociais", padrao: false },
      { tipo: "chave", id: "show_payment_icons", label: "Mostrar bandeiras de pagamento", padrao: true },
      { tipo: "titulo", id: "t_cookie", label: "Aviso de cookies" },
      { tipo: "chave", id: "show_cookie_bar", label: "Mostrar aviso", padrao: false },
      { tipo: "rico", id: "text", label: "Texto do aviso" },
      { tipo: "texto", id: "accept_button", label: "Botão", padrao: "Entendi e fechar" },
    ],
    blocos: [
      {
        tipo: "text",
        nome: "Texto",
        icone: "align-left",
        ajustes: [
          { tipo: "texto", id: "title", label: "Título", padrao: "Atendimento" },
          { tipo: "rico", id: "content", label: "Conteúdo" },
        ],
      },
      {
        tipo: "links",
        nome: "Lista de links",
        icone: "list",
        ajustes: [
          { tipo: "texto", id: "title", label: "Título", padrao: "Institucional" },
          { tipo: "rico", id: "content", label: "Um link por linha (texto | destino)" },
        ],
      },
    ],
  },

  // ── Home e livres ──────────────────────────────────────────────────────────
  {
    tipo: "slideshow",
    nome: "Carrossel de banners",
    icone: "carousel-horizontal",
    alcance: { onde: "livre" },
    limiteBlocos: 6,
    blocosIniciais: ["image"],
    ajustes: [
      { tipo: "chave", id: "edge_to_edge", label: "Largura total", padrao: false },
      {
        tipo: "opcao", id: "section_size", label: "Altura", padrao: "preserve_ratio",
        opcoes: [
          { valor: "preserve_ratio", label: "Proporção da imagem" },
          { valor: "small", label: "Baixa" },
          { valor: "medium", label: "Média" },
          { valor: "large", label: "Alta" },
        ],
      },
      {
        tipo: "opcao", id: "carousel_effect", label: "Transição", padrao: "slide",
        opcoes: [{ valor: "slide", label: "Deslizar" }, { valor: "fade", label: "Esmaecer" }],
      },
      { tipo: "chave", id: "autoplay", label: "Girar sozinho", padrao: true },
      { tipo: "numero", id: "cycle_speed", label: "Trocar a cada", padrao: 5, min: 3, max: 15, passo: 1, unidade: "s" },
    ],
    blocos: [
      {
        tipo: "image",
        nome: "Slide",
        icone: "photo",
        ajustes: [
          { tipo: "imagem", id: "image", label: "Imagem" },
          { tipo: "imagem", id: "mobile_image", label: "Imagem no celular" },
          { tipo: "chave", id: "show_overlay", label: "Escurecer a imagem", padrao: false },
          { tipo: "numero", id: "overlay_opacity", label: "Intensidade", padrao: 30, min: 0, max: 100, passo: 5, unidade: "%" },
          { tipo: "cor", id: "text_color", label: "Cor do texto", padrao: "#ffffff" },
          { tipo: "texto", id: "title", label: "Título" },
          { tipo: "area", id: "content", label: "Texto" },
          { tipo: "opcao", id: "content_position", label: "Posição do conteúdo", padrao: "middle_center", opcoes: POSICOES },
          { tipo: "titulo", id: "t_botao", label: "Botão" },
          { tipo: "cor", id: "button_background", label: "Fundo do botão", padrao: "#ffffff" },
          { tipo: "cor", id: "button_text_color", label: "Texto do botão", padrao: "#000000" },
          { tipo: "texto", id: "button_text", label: "Texto do botão" },
          { tipo: "link", id: "link", label: "Link" },
        ],
      },
    ],
  },
  {
    tipo: "collection-list",
    nome: "Lista de coleções",
    icone: "layout-grid",
    alcance: { onde: "livre" },
    blocosIniciais: ["collection"],
    ajustes: [
      { tipo: "texto", id: "title", label: "Título" },
      { tipo: "texto", id: "link_title", label: "Texto do link", padrao: "Ver todas" },
      { tipo: "link", id: "link", label: "Link" },
      { tipo: "chave", id: "round_images", label: "Imagens redondas", padrao: true },
      { tipo: "chave", id: "show_collection_title", label: "Mostrar o nome da coleção", padrao: true },
    ],
    blocos: [
      {
        tipo: "collection",
        nome: "Coleção",
        icone: "folder",
        ajustes: [
          { tipo: "colecao", id: "collection", label: "Coleção" },
          { tipo: "imagem", id: "image", label: "Imagem" },
        ],
      },
    ],
  },
  {
    tipo: "featured-collection",
    nome: "Coleção em destaque",
    icone: "star",
    alcance: { onde: "livre" },
    ajustes: [
      { tipo: "colecao", id: "collection", label: "Coleção" },
      { tipo: "texto", id: "title", label: "Título", padrao: "Coleção em destaque" },
      { tipo: "numero", id: "products_count", label: "Produtos a mostrar", padrao: 12, min: 2, max: 50, passo: 1 },
      {
        tipo: "opcao", id: "layout", label: "Disposição", padrao: "vertical",
        opcoes: [
          { valor: "vertical", label: "Grade" },
          { valor: "horizontal", label: "Carrossel" },
          { valor: "collage", label: "Colagem" },
        ],
      },
      { tipo: "chave", id: "show_quick_buy", label: "Compra rápida", padrao: false },
      { tipo: "texto", id: "link_title", label: "Texto do link", padrao: "Ver todos" },
      { tipo: "link", id: "link_url", label: "Link" },
    ],
  },
  {
    tipo: "video-stories",
    nome: "Vídeos em destaque",
    icone: "player-play",
    alcance: { onde: "livre" },
    limiteBlocos: 20,
    blocosIniciais: ["video_item"],
    ajustes: [
      { tipo: "texto", id: "title", label: "Título", padrao: "Destaques" },
      {
        tipo: "opcao", id: "alinhamento", label: "Alinhamento", padrao: "centro",
        opcoes: [
          { valor: "centro", label: "Centralizado" },
          { valor: "esquerda", label: "À esquerda" },
        ],
      },
      // Desligado, o card leva direto ao produto em vez de abrir o vídeo. É a
      // saída pra quem quer a fileira como vitrine e não como stories — e pra
      // quem cadastrou capa e link mas ainda não tem o MP4.
      { tipo: "chave", id: "abrir_player", label: "Abrir o vídeo em tela cheia", padrao: true },
    ],
    blocos: [
      {
        tipo: "video_item",
        nome: "Vídeo",
        icone: "video",
        ajustes: [
          { tipo: "imagem", id: "thumbnail", label: "Capa (9:16)" },
          { tipo: "texto", id: "video_url", label: "URL do vídeo (MP4)" },
          { tipo: "titulo", id: "t_produto", label: "Produto" },
          { tipo: "imagem", id: "product_image", label: "Foto do produto" },
          { tipo: "texto", id: "product_name", label: "Nome do produto" },
          { tipo: "texto", id: "product_price", label: "Preço" },
          { tipo: "link", id: "product_url", label: "Link do produto" },
          { tipo: "texto", id: "cta_label", label: "Texto do botão", padrao: "Comprar" },
        ],
      },
    ],
  },
  {
    tipo: "collection-with-image",
    nome: "Coleção com imagem",
    icone: "photo-scan",
    alcance: { onde: "livre" },
    ajustes: [
      { tipo: "colecao", id: "collection", label: "Coleção" },
      { tipo: "numero", id: "products_count", label: "Produtos a mostrar", padrao: 12, min: 2, max: 24, passo: 1 },
      { tipo: "imagem", id: "image", label: "Imagem" },
      { tipo: "cor", id: "background", label: "Fundo", padrao: "#0774d7" },
      { tipo: "cor", id: "text_color", label: "Texto", padrao: "#ffffff" },
      { tipo: "texto", id: "title", label: "Título", padrao: "Coleção em destaque" },
      { tipo: "area", id: "content", label: "Texto" },
      { tipo: "titulo", id: "t_botao", label: "Botão" },
      { tipo: "cor", id: "button_background", label: "Fundo do botão", padrao: "#ffffff" },
      { tipo: "cor", id: "button_text_color", label: "Texto do botão", padrao: "#0774d7" },
      { tipo: "texto", id: "button_text", label: "Texto do botão", padrao: "Saiba mais" },
      { tipo: "link", id: "button_link", label: "Link" },
    ],
  },
  {
    tipo: "doublebanner",
    nome: "Banners duplos",
    icone: "layout-columns",
    alcance: { onde: "livre" },
    limiteBlocos: 2,
    blocosIniciais: ["banner", "banner"],
    ajustes: [
      { tipo: "numero", id: "page_width", label: "Largura máxima", padrao: 1200, min: 800, max: 1600, passo: 20, unidade: "px" },
      { tipo: "numero", id: "border_radius", label: "Arredondamento", padrao: 12, min: 0, max: 40, passo: 2, unidade: "px" },
      { tipo: "titulo", id: "t_espaco", label: "Espaçamento" },
      { tipo: "numero", id: "padding_top", label: "Espaço acima", padrao: 36, min: 0, max: 120, passo: 4, unidade: "px" },
      { tipo: "numero", id: "padding_bottom", label: "Espaço abaixo", padrao: 36, min: 0, max: 120, passo: 4, unidade: "px" },
    ],
    blocos: [
      {
        tipo: "banner",
        nome: "Banner",
        icone: "photo",
        ajustes: [
          { tipo: "imagem", id: "image_desktop", label: "Imagem no computador" },
          { tipo: "imagem", id: "image_mobile", label: "Imagem no celular" },
          { tipo: "link", id: "link", label: "Link" },
        ],
      },
    ],
  },
  {
    tipo: "image-with-text",
    nome: "Imagem com texto",
    icone: "photo-edit",
    alcance: { onde: "livre" },
    ajustes: [
      { tipo: "imagem", id: "image", label: "Imagem" },
      {
        tipo: "opcao", id: "image_position", label: "Posição da imagem", padrao: "left",
        opcoes: [{ valor: "left", label: "À esquerda" }, { valor: "right", label: "À direita" }],
      },
      { tipo: "numero", id: "image_width", label: "Largura da imagem", padrao: 50, min: 20, max: 70, passo: 5, unidade: "%" },
      { tipo: "texto", id: "title", label: "Título", padrao: "Seu título" },
      { tipo: "rico", id: "content", label: "Texto" },
      { tipo: "texto", id: "button_text", label: "Texto do botão" },
      { tipo: "link", id: "button_link", label: "Link do botão" },
    ],
  },
  {
    tipo: "text-with-icons",
    nome: "Texto com ícones",
    icone: "badges",
    alcance: { onde: "livre" },
    limiteBlocos: 4,
    blocosIniciais: ["item", "item", "item"],
    ajustes: [{ tipo: "chave", id: "stack_mobile", label: "Empilhar no celular", padrao: false }],
    blocos: [
      {
        tipo: "item",
        nome: "Item",
        icone: "circle-check",
        ajustes: [
          {
            tipo: "opcao", id: "icon", label: "Ícone", padrao: "bi-customer-support",
            opcoes: ICONES_TEMA.map((v) => ({ valor: v, label: v.replace("bi-", "").replace(/-/g, " ") })),
          },
          { tipo: "texto", id: "title", label: "Título", padrao: "Seu título" },
          { tipo: "rico", id: "content", label: "Conteúdo" },
        ],
      },
    ],
  },
  {
    tipo: "rich-text",
    nome: "Texto",
    icone: "align-left",
    alcance: { onde: "livre" },
    ajustes: [
      { tipo: "texto", id: "title", label: "Título" },
      { tipo: "rico", id: "content", label: "Texto" },
      {
        tipo: "opcao", id: "text_alignment", label: "Alinhamento", padrao: "center",
        opcoes: [
          { valor: "left", label: "À esquerda" },
          { valor: "center", label: "Ao centro" },
          { valor: "right", label: "À direita" },
        ],
      },
    ],
  },
  {
    tipo: "custom-html",
    nome: "HTML livre",
    icone: "code",
    alcance: { onde: "livre" },
    ajustes: [{ tipo: "rico", id: "html", label: "Conteúdo" }],
  },

  // ── Presas a um template ───────────────────────────────────────────────────
  {
    tipo: "product-template",
    nome: "Produto",
    icone: "package",
    alcance: { onde: "template", templates: ["produto"] },
    ajustes: [
      { tipo: "chave", id: "show_sku", label: "Mostrar o SKU", padrao: false },
      { tipo: "chave", id: "show_quantity_selector", label: "Seletor de quantidade", padrao: true },
      { tipo: "chave", id: "show_payment_button", label: "Botão de compra direta", padrao: true },
      {
        tipo: "opcao", id: "gallery_layout", label: "Galeria", padrao: "carousel",
        opcoes: [{ valor: "carousel", label: "Carrossel" }, { valor: "stacked", label: "Empilhada" }],
      },
    ],
  },
  {
    tipo: "product-recommendations",
    nome: "Você também pode gostar",
    icone: "arrows-shuffle",
    alcance: { onde: "template", templates: ["produto"] },
    ajustes: [
      { tipo: "texto", id: "title", label: "Título", padrao: "Você também pode gostar" },
      { tipo: "numero", id: "products_count", label: "Produtos", padrao: 6, min: 2, max: 12, passo: 1 },
    ],
  },
  {
    tipo: "collection-template",
    nome: "Coleção",
    icone: "folder",
    alcance: { onde: "template", templates: ["colecao"] },
    ajustes: [
      { tipo: "chave", id: "show_collection_image", label: "Mostrar a imagem da coleção", padrao: true },
      { tipo: "numero", id: "products_per_page", label: "Produtos por página", padrao: 24, min: 8, max: 48, passo: 4 },
      { tipo: "chave", id: "show_sorting", label: "Ordenação", padrao: true },
    ],
  },
  {
    tipo: "list-collections-template",
    nome: "Todas as coleções",
    icone: "layout-grid",
    alcance: { onde: "template", templates: ["colecoes"] },
    ajustes: [{ tipo: "chave", id: "round_images", label: "Imagens redondas", padrao: true }],
  },
  {
    tipo: "search-template",
    nome: "Busca",
    icone: "search",
    alcance: { onde: "template", templates: ["busca"] },
    ajustes: [{ tipo: "numero", id: "results_per_page", label: "Resultados por página", padrao: 24, min: 8, max: 48, passo: 4 }],
  },
  {
    tipo: "cart-template",
    nome: "Carrinho",
    icone: "shopping-cart",
    alcance: { onde: "template", templates: ["carrinho"] },
    ajustes: [
      { tipo: "texto", id: "title", label: "Título", padrao: "Seu carrinho" },
      { tipo: "chave", id: "show_note", label: "Campo de observação", padrao: true },
    ],
  },
  {
    tipo: "page-template",
    nome: "Página",
    icone: "file-text",
    alcance: { onde: "template", templates: ["pagina"] },
    ajustes: [],
  },
  {
    tipo: "erro-template",
    nome: "Página não encontrada",
    icone: "alert-triangle",
    alcance: { onde: "template", templates: ["erro"] },
    ajustes: [
      { tipo: "texto", id: "title", label: "Título", padrao: "Página não encontrada" },
      { tipo: "texto", id: "button_text", label: "Botão", padrao: "Voltar à loja" },
    ],
  },
];

const PORTIPO = new Map(SECOES.map((s) => [s.tipo, s]));

export function esquemaDaSecao(tipo: string): EsquemaSecao | null {
  return PORTIPO.get(tipo) ?? null;
}

/** As seções que o botão "adicionar seção" oferece neste template. */
export function secoesDisponiveis(template: Template): EsquemaSecao[] {
  return SECOES.filter((s) => {
    if (s.alcance.onde === "fixa") return false;
    if (s.alcance.onde === "template") return s.alcance.templates.includes(template);
    return true;
  });
}
