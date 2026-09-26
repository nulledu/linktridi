// ── Prévia OFICIAL do anúncio na Meta (inclusive o vídeo) ───────────────────
// `/{ad_id}/previews` devolve um `<iframe src=".../preview_iframe.php?d=…">`.
// O `d` é um token de preview ASSINADO — não é o access token da conta, então
// pode ir pro navegador sem vazar segredo. É o caminho suportado: pegar o .mp4
// pelo campo `source` a Meta bloqueia com "(#10) Application does not have
// permission for this action".
//
// Vive aqui (e não dentro de uma rota) porque Tráfego e Marketing mostram a
// mesma prévia com gates diferentes — a regra da Meta é uma só.
import { getAllTokens } from "@/lib/meta-tokens";

const GRAPH = "https://graph.facebook.com/v21.0";

// Ordem de tentativa. MOBILE_FEED_STANDARD renderiza o vídeo na maioria dos
// casos; os outros cobrem stories/reels verticais.
const FORMATOS = ["MOBILE_FEED_STANDARD", "INSTAGRAM_STANDARD", "FACEBOOK_STORY_MOBILE", "INSTAGRAM_STORY"];

export interface PreviewAnuncio {
  src: string;
  width: number | null;
  height: number | null;
  format: string;
}

export function ehAdId(v: string): boolean {
  return /^\d{6,}$/.test(v);
}

/**
 * Prévia do anúncio. O token é por conta e o chamador não sabe de qual conta o
 * anúncio é, então varre os tokens conectados e devolve a primeira que renderiza.
 * Sem prévia possível (id errado, sem permissão, sem token) → null.
 */
export async function previewDoAnuncio(adId: string): Promise<PreviewAnuncio | null> {
  if (!ehAdId(adId)) return null;
  let tokens: string[];
  try { tokens = await getAllTokens(); } catch { return null; }

  for (const token of tokens) {
    for (const fmt of FORMATOS) {
      let resp: Record<string, unknown>;
      try {
        const r = await fetch(`${GRAPH}/${adId}/previews?ad_format=${fmt}&access_token=${token}`, { cache: "no-store" });
        resp = (await r.json()) as Record<string, unknown>;
      } catch { continue; }
      // Erro de permissão/id inexistente COM ESTE token → pula pro próximo token
      // (insistir nos outros formatos daria o mesmo erro).
      if (resp.error) break;
      const body = (resp.data as Array<{ body?: string }> | undefined)?.[0]?.body || "";
      const src = extrairSrc(body);
      if (src) return { src, width: numAttr(body, "width"), height: numAttr(body, "height"), format: fmt };
    }
  }
  return null;
}

// O body vem como '<iframe src="https://...&amp;..." width="340" height="574" ...>'.
function extrairSrc(body: string): string | null {
  const m = body.match(/src="([^"]+)"/);
  if (!m) return null;
  return m[1].replace(/&amp;/g, "&");
}

function numAttr(body: string, attr: string): number | null {
  const m = body.match(new RegExp(`${attr}="?(\\d+)`));
  return m ? Number(m[1]) : null;
}
