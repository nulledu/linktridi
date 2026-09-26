"use client";

// ── A loja desenhada dentro do editor ────────────────────────────────────────
// Recebe o tema por `postMessage` da tela de aparência e redesenha. É isso que
// faz a prévia ser AO VIVO: o rascunho não precisa passar pelo banco pra
// aparecer, então arrastar uma seção ou mexer numa cor tem resposta imediata.
//
// O canal é `postMessage` e não `localStorage` porque a prévia é outro
// documento (iframe) e precisa saber a HORA em que o dado mudou — armazenamento
// não avisa ninguém dentro da mesma aba.

import { useEffect, useState } from "react";
import type { Loja as TLoja, Produto } from "@/lib/lojas";
import { colecoesDaLoja } from "@/lib/vitrine/colecoes";
import { normalizarTema } from "@/lib/vitrine/tema";
import { TEMA_PADRAO } from "@/lib/vitrine/modelos";
import type { Template } from "@/lib/vitrine/tipos";
import { Loja } from "@/app/l/tema/Loja";
import type { Contexto } from "@/app/l/tema/contexto";

interface Recado {
  fonte: "editor-aparencia";
  tema: unknown;
  template: Template;
  secao?: string | null;
}

export function PreviaClient({ loja, produtos }: { loja: TLoja; produtos: Produto[] }) {
  const [tema, setTema] = useState(() => TEMA_PADRAO());
  const [template, setTemplate] = useState<Template>("inicio");
  const [alvo, setAlvo] = useState<string | null>(null);

  useEffect(() => {
    const ouvir = (e: MessageEvent<Recado>) => {
      // Só aceita recado da própria origem. Um iframe escuta a janela inteira,
      // e sem esta linha qualquer página que embutisse esta URL mandaria tema.
      if (e.origin !== window.location.origin) return;
      if (e.data?.fonte !== "editor-aparencia") return;
      setTema(normalizarTema(e.data.tema));
      setTemplate(e.data.template);
      setAlvo(e.data.secao ?? null);
    };
    window.addEventListener("message", ouvir);
    // Avisa que está de pé: o editor só manda o primeiro tema depois disto,
    // senão o recado sai antes de existir quem ouça.
    window.parent?.postMessage({ fonte: "previa-pronta" }, window.location.origin);
    return () => window.removeEventListener("message", ouvir);
  }, []);

  // Rolar até a seção escolhida no painel. É o "clicou na lista, a prévia foi
  // junto" do Shopify — sem isso, mexer numa seção do fim da home é rolar a
  // prévia à mão toda vez.
  useEffect(() => {
    if (!alvo) return;
    const el = document.querySelector(`[data-secao="${CSS.escape(alvo)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [alvo, tema]);

  const ctx: Contexto = {
    loja,
    tema,
    template,
    produtos,
    colecoes: colecoesDaLoja(produtos),
    base: `/l/${loja.slug}`,
    produto: template === "produto" ? produtos[0] : undefined,
    colecao: template === "colecao" ? (colecoesDaLoja(produtos)[0] ?? null) : undefined,
    termo: template === "busca" ? "" : undefined,
    editor: true,
  };

  return <Loja ctx={ctx} />;
}
