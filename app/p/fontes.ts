// Carregamento das fontes das PÁGINAS (landing/VSL).
//
// Só o download mora aqui. O catálogo (id → família CSS) está em
// lib/tridiflow-pagina-tema.ts, que é puro e pode ser importado por qualquer
// lib sem arrastar o pipeline de fontes junto.
//
// Via next/font/google, igual ao resto do projeto (app/layout.tsx já usa
// Manrope/Michroma): as famílias são self-hosted no build — nada de @import
// bloqueante nem chamada ao Google no carregamento, que numa landing de
// campanha custa conversão.
//
// `preload: false` em todas menos a Inter: são 5 famílias e só UMA é usada por
// página. Pré-carregar as cinco desperdiçaria banda no celular, justamente
// onde a maior parte do tráfego de campanha chega.

import {
  Bebas_Neue, Inter, Lato, Merriweather, Montserrat, Open_Sans, Oswald,
  Playfair_Display, Poppins, Raleway, Roboto,
} from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--tfp-f-inter", display: "swap" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--tfp-f-poppins", display: "swap", preload: false });
const montserrat = Montserrat({ subsets: ["latin"], variable: "--tfp-f-montserrat", display: "swap", preload: false });
// Itálico junto: é a serifa do destaque de título (`em.tfp-destaque`). Sem o
// arquivo itálico o navegador inclina a romana na marra e a letra sai torta.
const playfair = Playfair_Display({ subsets: ["latin"], style: ["normal", "italic"], variable: "--tfp-f-playfair", display: "swap", preload: false });
const bebas = Bebas_Neue({ subsets: ["latin"], weight: "400", variable: "--tfp-f-bebas", display: "swap", preload: false });
// Segunda leva: o catálogo de 6 era o teto da personalização de tipografia.
// Todas com `preload: false` pela mesma razão das anteriores — uma página usa
// no máximo duas famílias, e pré-carregar as onze desperdiçaria banda no
// celular, que é por onde chega a maior parte do tráfego de campanha.
const roboto = Roboto({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--tfp-f-roboto", display: "swap", preload: false });
const opensans = Open_Sans({ subsets: ["latin"], variable: "--tfp-f-opensans", display: "swap", preload: false });
const lato = Lato({ subsets: ["latin"], weight: ["400", "700", "900"], variable: "--tfp-f-lato", display: "swap", preload: false });
const oswald = Oswald({ subsets: ["latin"], variable: "--tfp-f-oswald", display: "swap", preload: false });
const merriweather = Merriweather({ subsets: ["latin"], weight: ["400", "700"], variable: "--tfp-f-merriweather", display: "swap", preload: false });
const raleway = Raleway({ subsets: ["latin"], variable: "--tfp-f-raleway", display: "swap", preload: false });

/** Vai no wrapper de quem renderiza página: a pública e o editor/prévia. */
export const CLASSES_FONTES = [
  inter.variable, poppins.variable, montserrat.variable, playfair.variable, bebas.variable,
  roboto.variable, opensans.variable, lato.variable, oswald.variable, merriweather.variable, raleway.variable,
].join(" ");
