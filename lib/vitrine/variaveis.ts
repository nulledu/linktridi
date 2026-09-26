// ── As variáveis CSS da vitrine ──────────────────────────────────────────────
// Porte fiel do `snippets/css-variables.liquid` do tema. O `theme.css` inteiro
// lê daqui — trocar uma cor na aba "Tema" do editor repinta a loja porque estas
// variáveis mudam, exatamente como no Shopify.
//
// A ordem e os NOMES das variáveis não são escolha nossa: são os que o
// `theme.css` referencia. Renomear qualquer uma para algo mais bonito significa
// a regra CSS deixar de encontrar valor e a loja ficar preta no branco.

import { comAlfa, escurecer, rgbTexto, textoSobre } from "./cor";
import type { Tema } from "./tipos";

/** `poppins_n6` → família e peso. É o formato de fonte do Shopify. */
export function fonteDe(codigo: string): { familia: string; peso: number; estilo: string } {
  const [nome = "poppins", variacao = "n4"] = (codigo || "").split("_");
  const familia = nome.replace(/(^|\s)\w/g, (c) => c.toUpperCase());
  const estilo = variacao.startsWith("i") ? "italic" : "normal";
  const peso = Number(variacao.slice(1)) * 100 || 400;
  return { familia, peso, estilo };
}

/** As famílias que a vitrine precisa pedir ao Google Fonts. */
export function fontesDoTema(tema: Tema): string[] {
  const t = fonteDe(String(tema.ajustes.text_font ?? "poppins_n4"));
  const h = fonteDe(String(tema.ajustes.heading_font ?? "poppins_n6"));
  const por = new Map<string, Set<number>>();
  for (const f of [t, h]) {
    const s = por.get(f.familia) ?? new Set<number>();
    s.add(f.peso);
    // O tema usa negrito e itálico do texto em vários lugares; sem eles o
    // navegador sintetiza e a página fica visivelmente diferente.
    s.add(700);
    por.set(f.familia, s);
  }
  return [...por].map(([familia, pesos]) => {
    const lista = [...pesos].sort((a, b) => a - b).join(";");
    return `family=${familia.replace(/ /g, "+")}:ital,wght@0,${lista};1,${lista}`;
  });
}

const g = (tema: Tema, chave: string, padrao: string): string => {
  const v = tema.ajustes[chave];
  return v === undefined || v === null || v === "" ? padrao : String(v);
};

/**
 * O bloco `:root` da vitrine. Sai como string pra ser injetado num `<style>` no
 * servidor — antes do primeiro pixel, igual ao `preload.js` faz com a tinta da
 * marca no ERP. Carregar isto depois seria ver a loja piscar na cor errada.
 */
export function variaveisDoTema(tema: Tema): string {
  const texto = fonteDe(g(tema, "text_font", "poppins_n4"));
  const titulo = fonteDe(g(tema, "heading_font", "poppins_n6"));

  const borda = g(tema, "border_color", "#e7e7e7");
  const destaque = g(tema, "accent_color", "#00badb");
  const link = g(tema, "link_color", "#00badb");
  const erro = g(tema, "error_color", "#f71b1b");
  const sucesso = g(tema, "success_color", "#00d864");
  const promo = g(tema, "product_on_sale_accent", "#ee0000");
  const fundoSec = g(tema, "secondary_background", "#ffffff");
  const corTexto = g(tema, "text_color", "#737b97");
  const btn1 = g(tema, "primary_button_background", "#00badb");
  const btn2 = g(tema, "secondary_button_background", "#1e2d7d");
  const cabLeve = g(tema, "header_light_text_color", "#e7e7e7");

  const linhas: [string, string][] = [
    ["--default-text-font-size", "15px"],
    ["--base-text-font-size", `${Number(tema.ajustes.base_text_font_size ?? 15)}px`],
    ["--heading-font-family", `${titulo.familia}, sans-serif`],
    ["--heading-font-weight", String(titulo.peso)],
    ["--heading-font-style", titulo.estilo],
    ["--text-font-family", `${texto.familia}, sans-serif`],
    ["--text-font-weight", String(texto.peso)],
    ["--text-font-style", texto.estilo],
    ["--text-font-bolder-weight", "600"],
    ["--text-link-decoration", tema.ajustes.underline_links ? "underline" : "normal"],

    ["--text-color", corTexto],
    ["--text-color-rgb", rgbTexto(corTexto)],
    ["--heading-color", g(tema, "heading_color", "#1e2d7d")],
    ["--border-color", borda],
    ["--border-color-rgb", rgbTexto(borda)],
    ["--form-border-color", escurecer(borda, 5)],
    ["--accent-color", destaque],
    ["--accent-color-rgb", rgbTexto(destaque)],
    ["--link-color", link],
    ["--link-color-hover", escurecer(link, 15)],
    ["--background", g(tema, "background", "#f7f7f7")],
    ["--secondary-background", fundoSec],
    ["--secondary-background-rgb", rgbTexto(fundoSec)],
    ["--accent-background", comAlfa(destaque, 0.08)],

    ["--error-color", erro],
    ["--error-background", comAlfa(erro, 0.07)],
    ["--success-color", sucesso],
    ["--success-background", comAlfa(sucesso, 0.11)],

    ["--primary-button-background", btn1],
    ["--primary-button-background-rgb", rgbTexto(btn1)],
    ["--primary-button-text-color", g(tema, "primary_button_text_color", "#ffffff")],
    ["--secondary-button-background", btn2],
    ["--secondary-button-background-rgb", rgbTexto(btn2)],
    ["--secondary-button-text-color", g(tema, "secondary_button_text_color", "#ffffff")],

    ["--footer-background", g(tema, "footer_background", "#1e2d7d")],
    ["--footer-text-color", g(tema, "footer_text_color", "#ffffff")],

    ["--header-background", g(tema, "header_background", "#1e2d7d")],
    ["--header-text-color", g(tema, "header_text_color", "#ffffff")],
    ["--header-light-text-color", cabLeve],
    ["--header-border-color", comAlfa(cabLeve, 0.3)],
    ["--header-accent-color", g(tema, "header_accent_color", "#00badb")],

    ["--flickity-arrow-color", escurecer(borda, 20)],

    ["--product-on-sale-accent", promo],
    ["--product-on-sale-accent-rgb", rgbTexto(promo)],
    ["--product-on-sale-color", textoSobre(promo)],
    ["--product-cor-do-preco", g(tema, "product_cor_do_preco", "#1e2d7d")],
    ["--product-cor-do-preco-riscado", g(tema, "product_cor_do_preco_riscado", "#a4a9be")],
    ["--product-cor-dos-titles", g(tema, "product_cor_dos_titles", "#1e2d7d")],
    ["--product-in-stock-color", g(tema, "product_in_stock_color", "#00d864")],
    ["--product-low-stock-color", g(tema, "product_low_stock_color", "#ee0000")],
    ["--product-sold-out-color", g(tema, "product_sold_out_color", "#d1d1d4")],
    ["--product-review-star-color", g(tema, "product_star_color", "#ffb647")],

    ["--mobile-container-gutter", "20px"],
    ["--desktop-container-gutter", "40px"],
  ];

  return `:root{${linhas.map(([k, v]) => `${k}:${v};`).join("")}}${resetDoHost()}`;
}

/**
 * Desliga o cenário do ERP por baixo da loja.
 *
 * A vitrine é servida pelo mesmo aplicativo, então o `globals.css` do sistema
 * chega junto — e ele pinta `body` com a cor do tema do PAINEL e ainda desenha
 * um `body::before` fixo com o degradê da marca. Sem isto a loja abre preta no
 * escuro: o degradê do ERP cobre o fundo do tema e o texto some.
 *
 * `!important` aqui não é preguiça. O `globals.css` é uma folha que não dá pra
 * reordenar (o layout raiz a importa antes de qualquer rota existir) e a regra
 * concorrente tem a mesma especificidade — sem `!important` a disputa é
 * decidida pela ordem, que varia com o empacotamento. Este bloco sai num
 * `<style>` dentro da página, que é o último a ser lido.
 */
function resetDoHost(): string {
  return [
    "body{background:var(--background)!important;color:var(--text-color)!important;",
    "font-family:var(--text-font-family)!important;font-size:var(--base-text-font-size)!important;}",
    "body::before{display:none!important;}",
  ].join("");
}
