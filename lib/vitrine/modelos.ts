// ── Modelos de vitrine ───────────────────────────────────────────────────────
// Um modelo é um TEMA PRONTO: a loja nova nasce com ele e o lojista mexe a
// partir dali. É o que a tela `/lojas/modelos` oferece.
//
// O modelo "Carimbos Tridi" foi SEMEADO do `config/settings_data.json` do
// export da carimbostridi.com.br — cores, fontes, a ordem das nove seções da
// home, o texto de cada bloco. Não foi digitado à mão: foi convertido, o que é
// a diferença entre "parecido" e "igual".
//
// O que NÃO veio, e não tinha como vir: as IMAGENS. Export de tema do Shopify
// não carrega `shop_images` — a logo, os seis slides, os banners e as capas dos
// vídeos são `shopify://shop_images/…` sem arquivo nenhum dentro do zip. Os
// campos de imagem nascem VAZIOS de propósito, e o editor pede o upload. Deixar
// uma URL do CDN da loja no lugar seria pior: a vitrine nova ficaria dependendo
// de um servidor que não é nosso e some no dia em que a loja antiga sair do ar.

import type { Tema } from "./tipos";
import { normalizarTema } from "./tema";

export interface Modelo {
  id: string;
  nome: string;
  descricao: string;
  tema: Tema;
}

/** O tema da carimbostridi.com.br, convertido do export. */
const CARIMBOS = normalizarTema(
{
    "versao": 1,
    "modelo": "warehouse",
    "ajustes": {
      "heading_color": "#000000",
      "text_color": "#737b97",
      "accent_color": "#a18fff",
      "link_color": "#7a00ff",
      "border_color": "#e7e7e7",
      "background": "#f7f7f7",
      "secondary_background": "#ffffff",
      "error_color": "#f71b1b",
      "success_color": "#00d864",
      "primary_button_background": "#17cb63",
      "primary_button_text_color": "#ffffff",
      "secondary_button_background": "#00d864",
      "secondary_button_text_color": "#ffffff",
      "header_background": "#9207ff",
      "header_text_color": "#ffffff",
      "header_light_text_color": "#e7e7e7",
      "header_accent_color": "#8860ff",
      "footer_background": "#9207ff",
      "footer_text_color": "#ffffff",
      "heading_font": "poppins_n6",
      "text_font": "poppins_n4",
      "base_text_font_size": 15,
      "underline_links": true,
      "product_cor_do_preco": "#00d864",
      "product_cor_do_preco_riscado": "#a4a9be",
      "product_cor_dos_titles": "#7a00ff",
      "product_on_sale_accent": "#00d864",
      "product_in_stock_color": "#00d864",
      "product_low_stock_color": "#ee0000",
      "product_sold_out_color": "#d1d1d4",
      "product_star_color": "#ffb647",
      "show_secondary_image": true,
      "show_discount": true,
      "discount_mode": "percentage",
      "product_image_size": "square",
      "animation_image_zoom": false,
      "cart_type": "page",
      "cart_show_free_shipping_threshold": false,
      "cart_free_shipping_threshold": "50",
      "show_installments": true,
      "installments_count": 12,
      "installments_factor": 1.2161
    },
    "secoes": {
      "announcement-bar_1": {
        "tipo": "announcement-bar",
        "ajustes": {
          "show_announcement": true,
          "background1": "#ba7ffa",
          "background2": "#b573fc",
          "text_color": "#ffffff",
          "text": "Qualidade com preço direto de fábrica",
          "text_position": "center",
          "link": "",
          "show_newsletter": false,
          "newsletter_button": "",
          "newsletter_title": "Newsletter",
          "newsletter_content": "<p>Se inscreva em nossa newsletter para receber as últimas promoções.</p>"
        }
      },
      "header_1": {
        "tipo": "header",
        "ajustes": {
          "enable_sticky_header": false,
          "rastreiopage": "rastreio",
          "mostrar_barra": true,
          "background1": "#a18fff",
          "background2": "#ffffff",
          "background3": "#a18fff",
          "background4": "#ffffff",
          "logo": "",
          "logo_max_width": 300,
          "mobile_logo_max_width": 165,
          "show_locale_selector": false,
          "show_currency_selector": false,
          "navigation_menu": "main-menu",
          "desktop_navigation_layout": "inline",
          "desktop_navigation_open_trigger": "hover",
          "show_navigation_social_media": false,
          "navigation_phone_number": "14 99787-9996",
          "navigation_email": "atendimento@tridixp.com.br",
          "show_condensed_search": false,
          "show_search_filter": false,
          "search_menu": "",
          "show_search_menu_title": false
        }
      },
      "footer_1": {
        "tipo": "footer",
        "ajustes": {
          "mostrar_mensagemdeaviso": false,
          "mostrar_barra": true,
          "background1": "#b274e7",
          "background2": "#ffffff",
          "background3": "#b274e7",
          "background4": "#ffffff",
          "show_social_media": false,
          "show_payment_icons": false,
          "show_locale_selector": false,
          "show_currency_selector": false,
          "show_cookie_bar": false,
          "text": "<p>Utilizamos cookies para melhorar nosso site e sua experiência de compra. Ao continuar navegando em nosso site,<strong>você está de acordo conforme nossa política quando a utilização de cookies.</strong></p>",
          "accept_button": "ENTENDI E FECHAR"
        },
        "blocos": {
          "links_1": {
            "tipo": "links",
            "ajustes": {
              "menu": "footer"
            }
          },
          "text_1": {
            "tipo": "text",
            "ajustes": {
              "title": "ATENDIMENTO",
              "content": "<p><strong>E-mail: </strong>atendimento@tridixp.com.br<br/><strong>E-mail: </strong>sac@tridixp.com.br<br/><strong>WhatsApp: </strong>(14) 99854-4623</p><p>Seg-Sex: 08:00h as 17:00h<br/>Sáb: 09:00h as 12:00h<br/>Dom e Feriados: Não há atendimento</p>"
            }
          }
        },
        "ordemBlocos": [
          "links_1",
          "text_1"
        ]
      },
      "slideshow_1": {
        "tipo": "slideshow",
        "ajustes": {
          "edge_to_edge": false,
          "section_size": "preserve_ratio",
          "carousel_effect": "slide",
          "autoplay": true,
          "cycle_speed": 5
        },
        "blocos": {
          "image_1": {
            "tipo": "image",
            "ajustes": {
              "image": "",
              "mobile_image": "",
              "show_overlay": false,
              "overlay_opacity": 30,
              "text_color": "#ffffff",
              "title": "",
              "content": "",
              "content_position": "middle_center",
              "button_background": "#ffffff",
              "button_text_color": "#000000",
              "button_text": "",
              "link": "shopify://collections/mais-vendidos"
            }
          },
          "image_2": {
            "tipo": "image",
            "ajustes": {
              "image": "",
              "mobile_image": "",
              "show_overlay": false,
              "overlay_opacity": 30,
              "text_color": "#ffffff",
              "title": "",
              "content": "",
              "content_position": "middle_center",
              "button_background": "#ffffff",
              "button_text_color": "#000000",
              "button_text": "Button",
              "link": ""
            }
          },
          "image_3": {
            "tipo": "image",
            "ajustes": {
              "image": "",
              "mobile_image": "",
              "show_overlay": false,
              "overlay_opacity": 30,
              "text_color": "#ffffff",
              "title": "",
              "content": "",
              "content_position": "middle_center",
              "button_background": "#ffffff",
              "button_text_color": "#000000",
              "button_text": "Button",
              "link": ""
            }
          },
          "image_4": {
            "tipo": "image",
            "ajustes": {
              "image": "",
              "mobile_image": "",
              "show_overlay": false,
              "overlay_opacity": 30,
              "text_color": "#ffffff",
              "title": "",
              "content": "",
              "content_position": "middle_center",
              "button_background": "#ffffff",
              "button_text_color": "#000000",
              "button_text": "Button",
              "link": ""
            }
          },
          "image_5": {
            "tipo": "image",
            "ajustes": {
              "image": "",
              "mobile_image": "",
              "show_overlay": false,
              "overlay_opacity": 30,
              "text_color": "#ffffff",
              "title": "",
              "content": "",
              "content_position": "middle_center",
              "button_background": "#ffffff",
              "button_text_color": "#000000",
              "button_text": "Button",
              "link": ""
            }
          },
          "image_6": {
            "tipo": "image",
            "ajustes": {
              "image": "",
              "mobile_image": "",
              "show_overlay": false,
              "overlay_opacity": 30,
              "text_color": "#ffffff",
              "title": "",
              "content": "",
              "content_position": "middle_center",
              "button_background": "#ffffff",
              "button_text_color": "#000000",
              "button_text": "Button",
              "link": ""
            }
          }
        },
        "ordemBlocos": [
          "image_1",
          "image_2",
          "image_3",
          "image_4",
          "image_5",
          "image_6"
        ]
      },
      "collection-list_1": {
        "tipo": "collection-list",
        "ajustes": {
          "title": "",
          "link_title": "View all",
          "link": "shopify://collections/calcados-femininos",
          "round_images": true,
          "show_collection_title": true
        },
        "blocos": {
          "collection_1": {
            "tipo": "collection",
            "ajustes": {
              "collection": "carimbos"
            }
          },
          "collection_2": {
            "tipo": "collection",
            "ajustes": {
              "collection": "chancela"
            }
          },
          "collection_3": {
            "tipo": "collection",
            "ajustes": {
              "collection": "cortadores"
            }
          },
          "collection_4": {
            "tipo": "collection",
            "ajustes": {
              "collection": "modeladores"
            }
          },
          "collection_5": {
            "tipo": "collection",
            "ajustes": {
              "collection": "marcadores"
            }
          },
          "collection_6": {
            "tipo": "collection",
            "ajustes": {
              "collection": "estencil"
            }
          },
          "collection_7": {
            "tipo": "collection",
            "ajustes": {
              "collection": "outros"
            }
          }
        },
        "ordemBlocos": [
          "collection_1",
          "collection_2",
          "collection_3",
          "collection_4",
          "collection_5",
          "collection_6",
          "collection_7"
        ]
      },
      "featured-collection_1": {
        "tipo": "featured-collection",
        "ajustes": {
          "collection": "mais-vendidos",
          "title": "Mais Vendidos",
          "products_count": 50,
          "layout": "vertical",
          "stack_desktop": false,
          "show_quick_buy": true,
          "link_title": "Ver Todos",
          "link_url": ""
        }
      },
      "video-stories_1": {
        "tipo": "video-stories",
        "ajustes": {
          "title": "Destaques"
        },
        "blocos": {
          "video_item_1": {
            "tipo": "video_item",
            "ajustes": {
              "thumbnail": "",
              "video_url": "https://cdn.shopify.com/videos/c/o/v/5cf3722fc61543468406cac487416f52.mov",
              "product_image": "",
              "product_name": "Carimbo 16cm² para todas as embalagens",
              "product_price": "R$ 97,90",
              "product_url": "shopify://products/carimbo-personalizado-16cm-para-todas-embalagens",
              "cta_label": "Comprar"
            }
          },
          "video_item_2": {
            "tipo": "video_item",
            "ajustes": {
              "thumbnail": "",
              "video_url": "https://cdn.shopify.com/videos/c/o/v/721a5ae94ef84a69bebac58bfce5ed02.mov",
              "product_image": "",
              "product_name": "Carimbo Personalizado 16cm² Com a Sua Logo",
              "product_price": "R$ 97,90",
              "product_url": "shopify://products/carimbo-personalizado-16cm-para-todas-embalagens",
              "cta_label": "Comprar"
            }
          },
          "video_item_3": {
            "tipo": "video_item",
            "ajustes": {
              "thumbnail": "",
              "video_url": "https://cdn.shopify.com/videos/c/o/v/9a44d46b993e42a9bdb9b87cb0aa1515.mov",
              "product_image": "",
              "product_name": "Carimbo 8cm Para Todas as Embalagens",
              "product_price": "R$ 152,90",
              "product_url": "shopify://products/carimbo-personalizado-8cm-para-todas-embalagens",
              "cta_label": "Comprar"
            }
          }
        },
        "ordemBlocos": [
          "video_item_1",
          "video_item_2",
          "video_item_3"
        ]
      },
      "collection-with-image_1": {
        "tipo": "collection-with-image",
        "ajustes": {
          "collection": "todos-os-produtos",
          "products_count": 12,
          "background": "#9207ff",
          "text_color": "#ffffff",
          "title": "Todos os nossos produtos",
          "content": "Feitos para todos os tipos de embalagens, independente do material.",
          "button_background": "#ffffff",
          "button_text_color": "#7a00ff",
          "button_text": "Saiba Mais",
          "button_link": ""
        }
      },
      "doublebanner_1": {
        "tipo": "doublebanner",
        "ajustes": {
          "page_width": 1200,
          "border_radius": 12,
          "padding_top": 36,
          "padding_bottom": 36
        },
        "blocos": {
          "banner_1": {
            "tipo": "banner",
            "ajustes": {
              "image_desktop": "",
              "image_mobile": "",
              "link": "shopify://collections/chancela"
            }
          },
          "banner_2": {
            "tipo": "banner",
            "ajustes": {
              "image_desktop": "",
              "image_mobile": "",
              "link": "shopify://collections/modeladores"
            }
          }
        },
        "ordemBlocos": [
          "banner_1",
          "banner_2"
        ]
      },
      "image-with-text_1": {
        "tipo": "image-with-text",
        "ajustes": {
          "image": "",
          "image_position": "left",
          "image_width": 40,
          "title": "Sobre nós",
          "content": "<p>Somos uma empresa especializada em carimbos de alta qualidade para personalizar qualquer tipo de embalagem, independentemente do material.</p>",
          "button_text": "Saiba mais",
          "button_link": "shopify://pages/sobre-a-carimbos-tridi"
        }
      },
      "featured-collection_2": {
        "tipo": "featured-collection",
        "ajustes": {
          "collection": "carimbos-exclusivos",
          "title": "Produtos Diversos",
          "products_count": 50,
          "layout": "vertical",
          "stack_desktop": false,
          "show_quick_buy": false,
          "link_title": "Ver todos",
          "link_url": ""
        }
      },
      "text-with-icons_1": {
        "tipo": "text-with-icons",
        "ajustes": {
          "show_section": false,
          "stack_mobile": false
        },
        "blocos": {
          "item_1": {
            "tipo": "item",
            "ajustes": {
              "icon": "bi-mobile-payment",
              "title": "Compra Segura",
              "content": "<p>Ambiente  seguro para pagamentos online</p>"
            }
          },
          "item_2": {
            "tipo": "item",
            "ajustes": {
              "icon": "bi-fast-delivery",
              "title": "Frete a Calcular",
              "content": "<p>Envio rápido e acompanhado com código de rastreio<br/></p>"
            }
          },
          "item_3": {
            "tipo": "item",
            "ajustes": {
              "icon": "bi-love",
              "title": "Suporte Profissional",
              "content": "<p>Equipe de suporte de extrema qualidade a semana toda<br/></p>"
            }
          },
          "item_4": {
            "tipo": "item",
            "ajustes": {
              "icon": "bi-returns",
              "title": "Satisfação ou Reembolso",
              "content": "<p>Caso haja algo, devolvemos seu dinheiro com velocidade</p>"
            }
          }
        },
        "ordemBlocos": [
          "item_1",
          "item_2",
          "item_3",
          "item_4"
        ]
      },
      "product-template_1": {
        "tipo": "product-template",
        "ajustes": {}
      },
      "product-recommendations_1": {
        "tipo": "product-recommendations",
        "ajustes": {}
      },
      "collection-template_1": {
        "tipo": "collection-template",
        "ajustes": {}
      },
      "list-collections-template_1": {
        "tipo": "list-collections-template",
        "ajustes": {}
      },
      "search-template_1": {
        "tipo": "search-template",
        "ajustes": {}
      },
      "cart-template_1": {
        "tipo": "cart-template",
        "ajustes": {}
      },
      "page-template_1": {
        "tipo": "page-template",
        "ajustes": {}
      },
      "erro-template_1": {
        "tipo": "erro-template",
        "ajustes": {}
      }
    },
    "fixas": {
      "topo": [
        "announcement-bar_1",
        "header_1"
      ],
      "rodape": [
        "footer_1"
      ]
    },
    "ordem": {
      "inicio": [
        "slideshow_1",
        "collection-list_1",
        "featured-collection_1",
        "video-stories_1",
        "collection-with-image_1",
        "doublebanner_1",
        "image-with-text_1",
        "featured-collection_2",
        "text-with-icons_1"
      ],
      "produto": [
        "product-template_1",
        "product-recommendations_1"
      ],
      "colecao": [
        "collection-template_1"
      ],
      "colecoes": [
        "list-collections-template_1"
      ],
      "busca": [
        "search-template_1"
      ],
      "carrinho": [
        "cart-template_1"
      ],
      "pagina": [
        "page-template_1"
      ],
      "erro": [
        "erro-template_1"
      ]
    }
  }
);

/**
 * A vitrine simples: catálogo cru, sem uma linha de JavaScript no navegador.
 *
 * Continua existindo, e não como consolo. Ela é a que abre mais rápido no 4G de
 * um celular antigo — quem vende por anúncio e não precisa de banner nem de
 * vídeo é servido melhor por ela.
 */
const SIMPLES = normalizarTema({ modelo: "simples" }, "simples");

export const MODELOS: Modelo[] = [
  {
    id: "carimbos",
    nome: "Carimbos Tridi",
    descricao:
      "A loja da Carimbos Tridi, portada do tema Warehouse: barra de anúncio, carrossel de banners, " +
      "coleções redondas, vídeos em destaque e banners duplos. As imagens entram no editor.",
    tema: CARIMBOS,
  },
  {
    id: "simples",
    nome: "Catálogo simples",
    descricao:
      "Nome da loja, grade de produtos e rodapé. Sem JavaScript no navegador — é a vitrine que " +
      "abre mais rápido em celular antigo e rede ruim.",
    tema: SIMPLES,
  },
];

export const modeloPorId = (id: string): Modelo | null => MODELOS.find((m) => m.id === id) ?? null;

/** O tema com que uma loja sem tema salvo é servida. */
export const TEMA_PADRAO = (): Tema => CARIMBOS;
