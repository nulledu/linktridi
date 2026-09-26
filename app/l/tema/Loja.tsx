// ── A loja com tema ──────────────────────────────────────────────────────────
// O equivalente ao `layout/theme.liquid`: monta a página inteira a partir do
// tema — barra de aviso e cabeçalho, o `<main>` com as seções do template, e o
// rodapé.
//
// Componente de SERVIDOR. As peças que precisam de JavaScript (carrossel,
// player, gaveta do menu, carrinho) se marcam como cliente sozinhas; o esqueleto
// e todas as seções estáticas chegam prontas do servidor. Quem abre a loja por
// anúncio, no 4G, recebe HTML — que é a razão de a vitrine antiga não ter uma
// linha de JavaScript, e o motivo de o porte não trazer o `theme.js`.

import { secoesDoTemplate, secoesFixas } from "@/lib/vitrine/tema";
import { fontesDoTema, variaveisDoTema } from "@/lib/vitrine/variaveis";
import { Secao } from "./Secoes";
import type { Contexto } from "./contexto";
import type { ReactNode } from "react";

export function Loja({ ctx, children }: { ctx: Contexto; children?: ReactNode }) {
  const { tema } = ctx;
  const topo = secoesFixas(tema, "topo");
  const rodape = secoesFixas(tema, "rodape");
  const corpo = secoesDoTemplate(tema, ctx.template);

  const fontes = fontesDoTema(tema);
  const href = `https://fonts.googleapis.com/css2?${fontes.join("&")}&display=swap`;

  return (
    <>
      {/*
        As variáveis ANTES de qualquer coisa que pinte. Escrever isto depois
        seria a loja abrir na cor errada e trocar de cor no primeiro quadro — a
        mesma razão de o pre-paint do ERP (`lib/preload.ts`) escrever a tinta da marca antes do
        paint. `dangerouslySetInnerHTML` num `<style>` é a única forma de emitir
        CSS cru no servidor; o conteúdo é gerado por `variaveisDoTema`, não vem
        do lojista.
      */}
      <style dangerouslySetInnerHTML={{ __html: variaveisDoTema(tema) }} />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={href} />

      {/*
        O CSS do tema entra por `<link>` pra um arquivo de `public/`, e não por
        `import` — de propósito. `import` de CSS é estático: entraria no pacote
        da rota `/l` inteira e cairia também na vitrine SIMPLES, que é o outro
        modelo servido pela mesma rota. As regras de elemento do tema (`body`,
        `a`, `button`, `input`) desfigurariam aquela vitrine sem ninguém pedir.
        Por `<link>` o tema só carrega em quem está usando o tema — que é
        exatamente como o Shopify serve o `theme.css`.
      */}
      <link rel="stylesheet" href="/vitrine/warehouse/theme.css" />
      <link rel="stylesheet" href="/vitrine/warehouse/complemento.css" />

      <div className="vt-tema">
        {topo.map(({ id, secao }) => <Secao key={id} id={id} secao={secao} ctx={ctx} />)}

        <main id="main" role="main">
          {children ?? corpo.map(({ id, secao }) => <Secao key={id} id={id} secao={secao} ctx={ctx} />)}
        </main>

        {rodape.map(({ id, secao }) => <Secao key={id} id={id} secao={secao} ctx={ctx} />)}
      </div>
    </>
  );
}
