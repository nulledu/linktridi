"use client";

// TridiFlow — injeção e disparo de pixels no PLAYER (client-side).
// Meta Pixel + GA4 + TikTok + Pinterest. O mesmo marcador de evento dispara em
// todas as plataformas ativas. CAPI (server-side) é disparada à parte via
// /api/f/evento — aqui só o que é público.
import type { PixelsConfig } from "@/lib/tridiflow";

type W = Window & {
  fbq?: (...a: unknown[]) => void; _fbq?: unknown;
  gtag?: (...a: unknown[]) => void; dataLayer?: unknown[];
  ttq?: { track: (e: string, d?: unknown, o?: unknown) => void; page: () => void; load: (id: string) => void; methods?: string[] };
  pintrk?: (...a: unknown[]) => void;
};

const EVENTOS_META = new Set(["Lead", "ViewContent", "AddToCart", "AddToWishlist", "InitiateCheckout", "AddPaymentInfo", "Purchase", "CompleteRegistration", "Contact", "Search", "FindLocation", "Schedule", "StartTrial", "Subscribe", "CustomizeProduct", "SubmitApplication", "PageView"]);
const MAPA_TIKTOK: Record<string, string> = { Lead: "SubmitForm", ViewContent: "ViewContent", AddToCart: "AddToCart", InitiateCheckout: "InitiateCheckout", AddPaymentInfo: "AddPaymentInfo", Purchase: "CompletePayment", CompleteRegistration: "CompleteRegistration", Search: "Search", Contact: "Contact", PageView: "ViewContent" };
const MAPA_PINTEREST: Record<string, string> = { Lead: "lead", Purchase: "checkout", CompleteRegistration: "signup", ViewContent: "pagevisit", AddToCart: "addtocart", InitiateCheckout: "checkout", Search: "search", PageView: "pagevisit" };
const MAPA_GA4: Record<string, string> = { PageView: "page_view", InitiateCheckout: "begin_checkout", AddToCart: "add_to_cart", Purchase: "purchase", ViewContent: "view_item", Lead: "generate_lead", Search: "search" };

function script(src: string) { const s = document.createElement("script"); s.async = true; s.src = src; document.head.appendChild(s); }

// Injeta os pixels configurados (uma vez) E dispara o PageView PADRÃO no load —
// é o que todo pixel normal faz e o que o Meta Pixel Helper / Events Manager
// procuram (sem ele o pixel "inicia mas não registra nada"). Os eventos de
// CICLO DE VIDA (Lead/Purchase/…) continuam vindo das REGRAS de conversão.
export function injetarPixels(p: PixelsConfig) {
  const w = window as unknown as W;
  if (p.metaPixelId && !w.fbq) {
    const fbq: ((...a: unknown[]) => void) & { queue?: unknown[]; push?: unknown; loaded?: boolean; version?: string; callMethod?: unknown } =
      (...a: unknown[]) => { (fbq.queue = fbq.queue || []).push(a); };
    fbq.push = fbq; fbq.loaded = true; fbq.version = "2.0"; fbq.queue = [];
    w.fbq = fbq; w._fbq = fbq;
    script("https://connect.facebook.net/en_US/fbevents.js");
    w.fbq("init", p.metaPixelId);
    w.fbq("track", "PageView");   // base PageView (o que o Pixel Helper detecta)
  }
  if (p.ga4Id && !w.gtag) {
    w.dataLayer = w.dataLayer || [];
    w.gtag = (...a: unknown[]) => { w.dataLayer!.push(a); };
    script(`https://www.googletagmanager.com/gtag/js?id=${p.ga4Id}`);
    w.gtag("js", new Date());
    w.gtag("config", p.ga4Id);   // page_view padrão no load
  }
  if (p.tiktokId && !w.ttq) {
    const fila: unknown[] = [];
    const ttq = { track: (e: string, d?: unknown, o?: unknown) => fila.push(["track", e, d, o]), page: () => fila.push(["page"]), load: () => {}, queue: fila } as unknown as NonNullable<W["ttq"]>;
    w.ttq = ttq;
    script(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${p.tiktokId}&lib=ttq`);
    w.ttq.page();   // pageview padrão do TikTok
  }
  if (p.pinterestId && !w.pintrk) {
    const pintrk: ((...a: unknown[]) => void) & { queue?: unknown[]; version?: string } = (...a: unknown[]) => { (pintrk.queue = pintrk.queue || []).push(a); };
    pintrk.queue = []; pintrk.version = "3.0";
    w.pintrk = pintrk;
    script("https://s.pinimg.com/ct/core.js");
    w.pintrk("load", p.pinterestId);
    w.pintrk("page");   // pagevisit padrão do Pinterest
  }
}

// Dispara um evento nas plataformas marcadas (valor em BRL quando informado).
// eventId: MESMO id usado na CAPI → o Meta deduplica browser + servidor.
export function dispararPixel(p: PixelsConfig, evento: string, plataformas: string[], valor?: string, eventId?: string) {
  const w = window as unknown as W;
  const val = valor ? Number(String(valor).replace(",", ".")) : undefined;
  const dados = val && !Number.isNaN(val) ? { value: val, currency: "BRL" } : undefined;
  if (plataformas.includes("meta") && p.metaPixelId && w.fbq) {
    const opts = eventId ? { eventID: eventId } : undefined;   // dedup com a CAPI
    if (EVENTOS_META.has(evento)) w.fbq("track", evento, dados, opts);
    else w.fbq("trackCustom", evento, dados, opts);
  }
  if (plataformas.includes("ga4") && p.ga4Id && w.gtag) {
    w.gtag("event", MAPA_GA4[evento] ?? evento.toLowerCase(), dados ? { value: dados.value, currency: "BRL" } : {});
  }
  if (plataformas.includes("tiktok") && p.tiktokId && w.ttq) {
    w.ttq.track(MAPA_TIKTOK[evento] ?? evento, dados, eventId ? { event_id: eventId } : undefined);
  }
  if (plataformas.includes("pinterest") && p.pinterestId && w.pintrk) {
    w.pintrk("track", MAPA_PINTEREST[evento] ?? "custom", { ...(dados ? { value: dados.value, currency: "BRL" } : {}), ...(eventId ? { event_id: eventId } : {}) });
  }
}
