// ── Qual link de venda este anúncio está usando? ─────────────────────────────
//
// Pergunta banal e, até aqui, impossível de responder sem abrir o Gerenciador
// de Anúncios: a tabela do Tridify mostra gasto, ROAS e CPA do anúncio, mas não
// PRA ONDE ele manda. É o dado que decide se o criativo que está performando
// aponta pro funil novo ou ficou no link velho.
//
// A resposta vem por dois caminhos, e os dois aparecem na tela porque
// respondem coisas diferentes:
//
//   DECLARADO — o destino configurado no criativo, lido da Meta. É a verdade
//               de quem montou o anúncio.
//   OBSERVADO — pra onde as pessoas de fato caíram, lido das nossas sessões do
//               TridiFlow (`utm_content` do Meta = ad id). É a verdade de quem
//               clicou, e é a única que existe quando a Meta não expõe o link
//               (anúncio criado a partir de post do Instagram devolve só o
//               `effective_object_story_id`, e ler o post pede permissão que a
//               conta não tem).
//
// Este arquivo cuida do DECLARADO. O observado sai de lib/tridiflow-vendas.ts.

import { getAllTokens } from "@/lib/meta-tokens";

const GRAPH = "https://graph.facebook.com/v21.0";

// Um pedido só: nome do anúncio + tudo que pode carregar o destino. Os campos
// mudam de lugar conforme o tipo de criativo (link, vídeo, catálogo, dinâmico),
// então pedimos todos e procuramos em ordem.
const CAMPOS = [
  "name",
  "effective_status",
  "creative{object_story_spec,asset_feed_spec{link_urls},url_tags,object_type,object_url,template_url,template_url_spec,link_destination_display_url,instagram_permalink_url,effective_object_story_id}",
].join(",");

export interface LinkDoAnuncio {
  /** Destino final, já com as `url_tags` da Meta aplicadas. `null` quando o
   *  criativo não expõe link (post impulsionado). */
  url: string | null;
  /** O endereço sem as UTMs — é ele que se compara com o link do funil. */
  base: string | null;
  host: string | null;
  /** UTMs do link (as do próprio link + as `url_tags` da conta). */
  utm: Record<string, string>;
  /** Onde o link estava no criativo — some na tela, serve pra depurar. */
  origem: string | null;
  /** Só quando não há link: o post do Instagram que virou anúncio. */
  instagram: string | null;
  nome: string | null;
  status: string | null;
}

export const VAZIO: LinkDoAnuncio = { url: null, base: null, host: null, utm: {}, origem: null, instagram: null, nome: null, status: null };

export const ehAdId = (v: string): boolean => /^\d{6,}$/.test(v);

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Link de dentro de um `call_to_action` (`{ value: { link } }`). */
const doCta = (v: unknown): string => texto(obj(obj(obj(v)?.call_to_action)?.value)?.link);

/**
 * Encontra o destino dentro do criativo. Puro — é o que o teste trava, porque
 * cada tipo de anúncio guarda o link num lugar diferente e a lista só cresce.
 */
export function extrairLink(creative: unknown): { url: string; origem: string } | null {
  const c = obj(creative);
  if (!c) return null;
  const spec = obj(c.object_story_spec);

  const tentativas: [string, string][] = [
    ["link_data", texto(obj(spec?.link_data)?.link) || doCta(spec?.link_data)],
    ["video_data", doCta(spec?.video_data) || texto(obj(spec?.video_data)?.link_description)],
    ["photo_data", doCta(spec?.photo_data)],
    ["text_data", doCta(spec?.text_data)],
    ["template_data", texto(obj(spec?.template_data)?.link) || doCta(spec?.template_data)],
    ["catálogo", texto(c.template_url) || texto(obj(obj(c.template_url_spec)?.web)?.url)],
    ["object_url", texto(c.object_url)],
  ];
  for (const [origem, url] of tentativas) if (/^https?:\/\//i.test(url)) return { url, origem };

  // Criativo dinâmico: vários destinos; o primeiro é o que a Meta usa como
  // padrão e é o que interessa mostrar.
  const feed = obj(c.asset_feed_spec)?.link_urls;
  if (Array.isArray(feed)) {
    for (const l of feed) {
      const u = texto(obj(l)?.website_url);
      if (/^https?:\/\//i.test(u)) return { url: u, origem: "criativo dinâmico" };
    }
  }
  return null;
}

/** `url_tags` da Meta ("utm_source=fb&utm_campaign={{campaign.name}}") entram
 *  no link como query. Sem isto o link mostrado não é o que o cliente abre. */
export function aplicarTags(url: string, urlTags: string): string {
  const tags = (urlTags || "").trim().replace(/^[?&]+/, "");
  if (!tags) return url;
  try {
    const u = new URL(url);
    for (const [k, v] of new URLSearchParams(tags)) if (!u.searchParams.has(k)) u.searchParams.set(k, v);
    return u.toString();
  } catch { return url; }
}

/** Quebra o link em endereço limpo + UTMs. */
export function partirLink(url: string): { base: string; host: string; utm: Record<string, string> } | null {
  try {
    const u = new URL(url);
    const utm: Record<string, string> = {};
    for (const [k, v] of u.searchParams) if (/^(utm_|fbclid|ttclid|gclid)/i.test(k) && v) utm[k] = v;
    for (const k of Object.keys(utm)) u.searchParams.delete(k);
    const base = u.origin + u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : "");
    return { base: base.replace(/\/$/, ""), host: u.host, utm };
  } catch { return null; }
}

/**
 * Lê o destino do anúncio na Meta. O token é por conta e quem chama não sabe de
 * qual conta o anúncio é, então varre os tokens conectados — mesma mecânica de
 * lib/meta-preview.ts, e pelo mesmo motivo.
 */
export async function linkDoAnuncio(adId: string): Promise<LinkDoAnuncio> {
  if (!ehAdId(adId)) return { ...VAZIO };
  let tokens: string[];
  try { tokens = await getAllTokens(); } catch { return { ...VAZIO }; }

  for (const token of tokens) {
    let r: Obj;
    try {
      const res = await fetch(`${GRAPH}/${adId}?fields=${encodeURIComponent(CAMPOS)}&access_token=${token}`, {
        cache: "no-store", signal: AbortSignal.timeout(12_000),
      });
      r = (await res.json()) as Obj;
    } catch { continue; }
    if (r.error) continue;                      // anúncio de outra conta: tenta o próximo token

    const cr = obj(r.creative);
    const achado = extrairLink(cr);
    const nome = texto(r.name) || null;
    const status = texto(r.effective_status) || null;
    const instagram = texto(cr?.instagram_permalink_url) || null;
    if (!achado) {
      const exibido = texto(cr?.link_destination_display_url);
      return { ...VAZIO, nome, status, instagram, url: null, base: exibido || null, host: exibido || null };
    }
    const url = aplicarTags(achado.url, texto(cr?.url_tags));
    const partes = partirLink(url);
    return {
      url,
      base: partes?.base ?? url,
      host: partes?.host ?? null,
      utm: partes?.utm ?? {},
      origem: achado.origem,
      instagram,
      nome,
      status,
    };
  }
  return { ...VAZIO };
}
