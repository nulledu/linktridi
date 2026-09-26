// Logos de marca de terceiros (Meta, WhatsApp, Google…), para identificar
// integrações e canais nas telas de conectar/escolher plataforma.
//
// Os SVGs moram em `public/marcas/<slug>.svg` (cópias verbatim do thesvg —
// github.com/glincker/thesvg, MIT). Cada logo é a marca DA EMPRESA em cor
// oficial, cheia — por isso NÃO entra no mapa monocromático do `Icon.tsx`
// (traço, viewBox 0 0 24 24, cor da pessoa). Renderize com o componente
// `<Marca>` de `app/(plataforma)/Marca.tsx`.
//
// Fonte da verdade dos arquivos disponíveis: este mapa. A trava
// `lib/__tests__/marcas.test.ts` confere que todo slug aqui tem o arquivo
// (e o `-dark.svg` quando `temEscuro`) — logo faltando vira <img> quebrada,
// e a tela some calada como sumia ícone faltando no Icon.tsx.
//
// `temEscuro`: a logo tem tinta escura de tela clara e não sobrevive no tema
// escuro (letra some no fundo). Aí guardamos as DUAS variantes e o `<Marca>`
// troca por tema. A maioria das logos é colorida e lê nos dois temas — essas
// não precisam de variante.

export type Marca = {
  /** Nome legível da marca (alt da imagem, quando não há rótulo ao lado). */
  label: string;
  /** Tem `<slug>-dark.svg` para o tema escuro (logo de tinta escura). */
  temEscuro?: boolean;
};

// Slugs disponíveis. Casa 1:1 com os arquivos em `public/marcas/` — o
// `Record<MarcaSlug, Marca>` abaixo obriga o mapa a ter exatamente estas
// chaves (falta ou sobra é erro de tipo), e a trava confere o arquivo no disco.
export type MarcaSlug =
  | "meta"
  | "facebook"
  | "instagram"
  | "whatsapp"
  | "google-ads"
  | "google-analytics"
  | "google-sheets"
  | "tiktok"
  | "taboola"
  | "shopee"
  | "zapier";

export const MARCAS: Record<MarcaSlug, Marca> = {
  meta: { label: "Meta" },
  facebook: { label: "Facebook" },
  instagram: { label: "Instagram" },
  whatsapp: { label: "WhatsApp" },
  "google-ads": { label: "Google Ads" },
  "google-analytics": { label: "Google Analytics" },
  "google-sheets": { label: "Google Sheets" },
  tiktok: { label: "TikTok", temEscuro: true },
  taboola: { label: "Taboola" },
  shopee: { label: "Shopee" },
  zapier: { label: "Zapier" },
};

/** A marca tem logo vendorizada? (usado pra decidir logo × ícone de reserva) */
export function temLogo(slug: string | null | undefined): slug is MarcaSlug {
  return !!slug && Object.prototype.hasOwnProperty.call(MARCAS, slug);
}

// Nome de exibição → slug, pra quando a plataforma chega como STRING do banco
// (canal do pedido, conta de marketplace) e não como slug fixo. Devolve null
// quando não há logo — o chamador cai no ícone de reserva. Marcas ainda sem
// arquivo (Mercado Livre, Kwai, Yampi, Nuvemshop…) de propósito não entram:
// resolver pra null é o certo, pra não prometer logo que não existe.
const APELIDOS: Record<string, MarcaSlug> = {
  meta: "meta", "meta ads": "meta",
  facebook: "facebook", "facebook ads": "facebook", "facebook lead ads": "facebook",
  instagram: "instagram", ig: "instagram",
  whatsapp: "whatsapp", "whatsapp business": "whatsapp", "whatsapp web": "whatsapp",
  "google ads": "google-ads",
  "google analytics": "google-analytics", ga4: "google-analytics",
  "google sheets": "google-sheets", sheets: "google-sheets",
  tiktok: "tiktok", "tiktok ads": "tiktok", "tiktok shop": "tiktok", "tiktok pixel": "tiktok",
  taboola: "taboola", shopee: "shopee", zapier: "zapier",
};
export function marcaPorNome(nome: string | null | undefined): MarcaSlug | null {
  if (!nome) return null;
  const k = nome.trim().toLowerCase();
  if (temLogo(k)) return k; // já veio como slug
  return APELIDOS[k] ?? null;
}
