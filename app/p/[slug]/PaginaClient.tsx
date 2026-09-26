"use client";

// Camada viva da página publicada: pixels, UTMs, identidade anônima do
// visitante e o envio dos eventos.
//
// Reuso deliberado (nada aqui é plataforma nova):
//  · `injetarPixels`/`dispararPixel` são os MESMOS do player de fluxo (app/f/pixels.ts);
//  · a Meta CAPI usa a MESMA rota /api/f/evento — o id da página é um id de
//    tridiflow_bots, então a config de pixel do projeto vale sem duplicar nada;
//  · os eventos de produto vão pra /api/p/evento (tridiflow_eventos), que é o
//    que alimenta as métricas da página e, quando existir, o Tridify.

import { useCallback, useEffect, useMemo, useRef } from "react";
import { dispararPixel, injetarPixels } from "../../f/pixels";
import { iframeEmbed, pixelsPublicos, uid } from "@/lib/tridiflow";
import type { PaginaPublicada } from "@/lib/tridiflow-db";
import { dispositivoAtual, idVisitante, utmsDaUrl } from "@/lib/tridiflow-pagina-runtime";
import { COOKIE_AB, type Variante } from "@/lib/tridiflow-ab";
import { RenderPagina } from "../RenderPagina";

// Evento nosso → evento padrão de pixel. Só o que tem significado de negócio:
// não faz sentido mandar "video_25" pro Meta como conversão.
const PIXEL_DE: Record<string, string | undefined> = {
  page_view: "PageView",
  cta_clicked: "InitiateCheckout",
  form_submitted: "Lead",
};

export function PaginaClient({ pagina, vars = {}, variante = "a" }: {
  pagina: PaginaPublicada; vars?: Record<string, string>; variante?: Variante;
}) {
  const pixels = useMemo(() => pixelsPublicos(pagina.settings.pixels), [pagina.settings.pixels]);
  // Teste desligado não carimba variante em evento nenhum: senão o histórico
  // de antes do teste entraria no braço A e inflaria o controle.
  const testeLigado = !!pagina.pagina.config?.teste?.ativo;
  const utm = useRef<Record<string, string>>({});
  const visitante = useRef<string>("");
  const enviados = useRef<Set<string>>(new Set());

  const registrar = useCallback((evento: string, meta?: Record<string, unknown>) => {
    // page_view uma vez só por carregamento (StrictMode/re-render não infla).
    if (evento === "page_view") {
      if (enviados.current.has("page_view")) return;
      enviados.current.add("page_view");
    }
    const corpo = {
      paginaId: pagina.id,
      evento,
      visitante: visitante.current,
      utm: utm.current,
      url: typeof window !== "undefined" ? window.location.href : "",
      dispositivo: dispositivoAtual(),
      // A variante viaja em `meta` (jsonb que a tabela já tem), então o placar
      // do teste A/B sai sem coluna nova e sem SQL pra rodar.
      meta: { ...(meta ?? {}), ...(testeLigado ? { variante } : {}) },
    };
    // Métrica não pode segurar a navegação: dispara e esquece.
    try {
      const json = JSON.stringify(corpo);
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/p/evento", new Blob([json], { type: "application/json" }));
      } else {
        void fetch("/api/p/evento", { method: "POST", headers: { "Content-Type": "application/json" }, body: json, keepalive: true });
      }
    } catch { /* bloqueador de rede: a página continua funcionando */ }

    // Pixel do browser + CAPI (dedup pelo mesmo event_id).
    const nome = PIXEL_DE[evento];
    if (!nome) return;
    const eventId = uid();
    try { dispararPixel(pixels, nome, ["meta", "ga4", "tiktok", "pinterest"], undefined, eventId); } catch { /* sem pixel */ }
    void fetch("/api/f/evento", {
      method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
      body: JSON.stringify({ botId: pagina.id, evento: nome, eventId, url: corpo.url }),
    }).catch(() => {});
  }, [pagina.id, pixels, testeLigado, variante]);

  useEffect(() => {
    utm.current = utmsDaUrl();
    visitante.current = idVisitante();
    injetarPixels(pixels);
    // PageView precisa sair no load — o Pixel Helper só enxerga o browser.
    registrar("page_view");
  }, [pixels, registrar]);

  // Guarda a versão sorteada pelo servidor. Sem isto o sorteio se repetiria a
  // cada visita: a mesma pessoa veria headlines diferentes e apareceria nos
  // dois braços do placar.
  useEffect(() => {
    if (!testeLigado) return;
    try {
      document.cookie = `${COOKIE_AB}=${variante}; path=/; max-age=${30 * 86400}; SameSite=Lax`;
    } catch { /* cookie bloqueado: o servidor sorteia de novo, e tudo bem */ }
  }, [testeLigado, variante]);

  // Iframe ligado por cima da página (settings.iframeAtivo): o link mostra a
  // página EXTERNA em tela cheia. Pixels, PageView e a contagem de visualização
  // (registrar) já rodaram nos efeitos acima — só a renderização muda. URL
  // inválida publica a página normal (ver iframePublicado).
  const emb = iframeEmbed(pagina.settings);
  if (emb) {
    return (
      <main style={{ position: "fixed", inset: 0, background: "#000" }}>
        {/* Configs do snippet colado (style/allow/etc) valem aqui também. */}
        <iframe src={emb.url} title={pagina.nome}
          allowFullScreen={emb.allowFullScreen ?? true}
          allow={emb.allow ?? "autoplay; encrypted-media; fullscreen; clipboard-write; picture-in-picture; payment"}
          referrerPolicy={emb.referrerPolicy as React.HTMLAttributeReferrerPolicy | undefined}
          sandbox={emb.sandbox} loading={emb.loading as "eager" | "lazy" | undefined} scrolling={emb.scrolling}
          style={{ width: "100%", height: "100%", border: 0, display: "block", ...emb.estilo }} />
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100dvh" }}>
      <RenderPagina
        doc={pagina.pagina}
        paginaId={pagina.id}
        modo="publicado"
        viewport="desktop"      // no ar quem manda é a media query, não este valor
        vars={vars}
        variante={variante}
        onEvento={registrar}
      />
    </main>
  );
}
