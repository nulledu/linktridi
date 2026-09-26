import type { Metadata, Viewport } from "next";
import { MontadorHost } from "./MontadorHost";
import { Manrope, Michroma } from "next/font/google";
import { PRELOAD_JS } from "@/lib/preload";
import "./globals.css";

// Fonte self-hosted (next/font) — remove o @import bloqueante e melhora o LCP.
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-manrope",
});

// Fonte da MARCA (só o wordmark "GAIUS"): geométrica larga e técnica, com ar
// espacial/futurista. Não é usada em texto corrido — o corpo segue na Manrope.
const michroma = Michroma({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-wordmark",
});

// Endereço público do site. OG e Twitter Card exigem URL ABSOLUTA — sem
// `metadataBase` o Next resolve as imagens contra `localhost` e o card sai
// quebrado em todo lugar que não seja a sua máquina. Em preview o Vercel
// injeta VERCEL_URL; em produção, prefira NEXT_PUBLIC_SITE_URL com o domínio
// final (a URL do deploy muda a cada push).
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  "http://localhost:3000";

const TITULO = "Gaius · Tridi";
const DESCRICAO = "Painel de vendas e produção em tempo real";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Sem `template`: as telas já escrevem o título inteiro ("Tridi · Minhas
  // Atividades"), e um sufixo automático viraria "… · Gaius · Gaius".
  title: TITULO,
  description: DESCRICAO,
  applicationName: "Gaius",
  // O ERP inteiro é privado: nada aqui deve entrar em buscador. As páginas
  // públicas (/f, /p, /l) declaram o próprio `robots` quando querem indexar.
  robots: { index: false, follow: false },
  manifest: "/site.webmanifest",
  appleWebApp: { capable: true, title: "Gaius", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: "Gaius",
    locale: "pt_BR",
    url: "/",
    title: TITULO,
    description: DESCRICAO,
    // Sem `images` aqui de propósito: `app/opengraph-image.tsx` gera o card
    // 1200×630 e o Next monta a URL absoluta sozinho. Declarar as duas coisas
    // duplica a meta tag.
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO,
    description: DESCRICAO,
  },
};

export const viewport: Viewport = {
  themeColor: "#7C3AED",
  // Sem `cover`, env(safe-area-inset-*) é sempre 0 no iOS e a barra inferior
  // fica embaixo do indicador de gestos. Com `cover`, todo elemento fixo tem
  // que respeitar as insets — ver --safe-* no globals.css.
  viewportFit: "cover",
  // Teclado virtual ENCOLHE a viewport em vez de cobrir o conteúdo: folhas e
  // barras presas embaixo (position:fixed) param de ficar atrás do teclado.
  interactiveWidget: "resizes-content",
  // Zoom continua liberado de propósito (acessibilidade): nada de maximumScale.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${manrope.variable} ${michroma.variable}`} suppressHydrationWarning>
      <head>
        {/* PRIMEIRA coisa do <head>, antes de qualquer chunk.

            O WebView de uma TV box com Android 7 é de 2016 e não conhece
            `globalThis` — que o runtime do Next usa logo na primeira linha. Na
            parede isso media uma TELA PRETA: os scripts morriam em
            "ReferenceError: globalThis is not defined" e o React nunca chegava
            a desenhar. Nada no painel dava pista, porque o erro acontecia antes
            do painel existir.

            Tem de ser inline e aqui, antes de qualquer chunk do Next: uma
            correção no aplicativo da TV chegaria só na próxima atualização de
            APK. Aqui ela vale para qualquer TV que abrir a página, hoje.

            ~90 bytes para todo mundo; navegador atual entra no `if` e sai. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if(typeof globalThis==='undefined'){Object.defineProperty(Object.prototype," +
              "'__global__',{get:function(){return this},configurable:true});" +
              "__global__.globalThis=__global__;delete Object.prototype.__global__;}",
          }}
        />
        {/* Tema, cor de destaque e a marca das micro-transições, ANTES do
            primeiro paint — cru e síncrono aqui no <head>, o único lugar em
            que isso é garantido. Morava num <Script> do next/script, que no
            App Router quem executa é o runtime, DEPOIS do chunk principal: a
            página pintava no escuro do CSS e virava o tema escolhido um
            segundo depois. Motivo por extenso em lib/preload.ts; trava em
            lib/__tests__/tema-sem-piscar.test.ts. */}
        <script dangerouslySetInnerHTML={{ __html: PRELOAD_JS }} />
        {/* Liquid glass — desfoque gaussiano injetado CRU (o Lightning CSS removeria
            backdrop-filter por causa do browserslist legado do tablet). Aqui chega
            intacto no desktop; WebView antigo ignora e degrada sem quebrar. */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
.glass{backdrop-filter:blur(20px) saturate(140%);-webkit-backdrop-filter:blur(20px) saturate(140%);}
.gp-pop{backdrop-filter:blur(28px) saturate(150%)!important;-webkit-backdrop-filter:blur(28px) saturate(150%)!important;}
.apple-modal{backdrop-filter:blur(34px) saturate(150%)!important;-webkit-backdrop-filter:blur(34px) saturate(150%)!important;}
.apple-backdrop{backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);}
.ui-side{backdrop-filter:blur(34px) saturate(150%);-webkit-backdrop-filter:blur(34px) saturate(150%);}
.ui-scrim{backdrop-filter:blur(var(--scrim-blur,3px));-webkit-backdrop-filter:blur(var(--scrim-blur,3px));}
.ui-side[data-centrado="1"]{backdrop-filter:none;-webkit-backdrop-filter:none;}
.ws-rail,.tf-side{backdrop-filter:blur(20px) saturate(140%);-webkit-backdrop-filter:blur(20px) saturate(140%);}
.pt-barra{backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);}
@media (max-width:860px){.app-topbar{backdrop-filter:blur(20px) saturate(120%);-webkit-backdrop-filter:blur(20px) saturate(120%);}}
/* Vidro DENTRO do modal e folha no celular: o desligamento tem de morar AQUI.
   O globals.css passa pelo Lightning CSS, que apaga toda declaração de
   backdrop-filter (browserslist legado do tablet) — inclusive o \`none\`. Ou
   seja: o \`!important\` de cima chegava intacto e o desligamento não chegava,
   e a folha do celular continuava borrando quatro camadas mesmo com a regra
   escrita. Motivo por extenso em globals.css, na seção da folha. */
.apple-modal .glass,.apple-modal .glass-spec,.ui-side .glass,.ui-side .glass-spec{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}
@media (max-width:700px){.apple-modal.sheet,.apple-backdrop.sheet-host,.ui-side,.ui-scrim{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}}
@media (prefers-reduced-transparency: reduce){.ui-side,.ui-scrim,.ws-rail,.tf-side,.apple-modal,.apple-backdrop{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}}
`,
          }}
        />
      </head>
      <body>
        {children}
        {/* Montador das páginas /dev-* (marcar tirar/trocar/estilo). Some em produção. */}
        {process.env.NODE_ENV !== "production" && <MontadorHost />}
      </body>
    </html>
  );
}
