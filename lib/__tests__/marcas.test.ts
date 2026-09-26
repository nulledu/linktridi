import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MARCAS, marcaPorNome, temLogo, type MarcaSlug } from "../marcas";

/**
 * ── Logo de marca tem que ter o arquivo ─────────────────────────────────────
 *
 * As logos de terceiros (Meta, WhatsApp, Google…) moram em `public/marcas/` e
 * o mapa `MARCAS` diz quais existem. Um slug no mapa sem o arquivo no disco
 * vira uma `<img>` quebrada e a tela some com o rótulo — do mesmo jeito que um
 * nome errado no `Icon.tsx` sumia calado. Esta trava é o espelho daquela: se
 * `MARCAS` promete a marca, o SVG tem que estar lá (e o `-dark.svg` também,
 * quando a logo troca por tema).
 */
const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const marcasDir = join(RAIZ, "public", "marcas");
const slugs = Object.keys(MARCAS) as MarcaSlug[];

function lerSvg(rel: string): string {
  const p = join(marcasDir, rel);
  expect(existsSync(p), `Falta o arquivo public/marcas/${rel}`).toBe(true);
  return readFileSync(p, "utf8");
}

describe("logos de marca", () => {
  it("todo slug do mapa tem o SVG no disco, e é um SVG de verdade", () => {
    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) {
      const svg = lerSvg(`${slug}.svg`);
      // Alguns vêm com prólogo XML/comentário do Illustrator antes do <svg> —
      // válido, e a <img> renderiza normal. O que importa é: é um SVG.
      expect(svg, `${slug}.svg não tem <svg`).toContain("<svg");
      expect(svg, `${slug}.svg não fecha </svg>`).toContain("</svg>");
    }
  });

  it("slug com temEscuro tem também a variante -dark.svg", () => {
    for (const slug of slugs) {
      if (!MARCAS[slug].temEscuro) continue;
      const svg = lerSvg(`${slug}-dark.svg`);
      expect(svg, `${slug}-dark.svg não tem <svg`).toContain("<svg");
    }
  });

  it("temLogo distingue slug conhecido de desconhecido", () => {
    expect(temLogo("meta")).toBe(true);
    expect(temLogo("whatsapp")).toBe(true);
    expect(temLogo("mercado-livre")).toBe(false); // sem logo vendorizada, de propósito
    expect(temLogo(null)).toBe(false);
    expect(temLogo(undefined)).toBe(false);
    expect(temLogo("")).toBe(false);
  });

  it("marcaPorNome resolve apelidos comuns e devolve null pro que não tem logo", () => {
    expect(marcaPorNome("Meta Ads")).toBe("meta");
    expect(marcaPorNome("  WhatsApp  ")).toBe("whatsapp");
    expect(marcaPorNome("GA4")).toBe("google-analytics");
    expect(marcaPorNome("TikTok Shop")).toBe("tiktok");
    expect(marcaPorNome("google-sheets")).toBe("google-sheets"); // slug direto passa
    // Marcas que a gente sabe que não têm arquivo não podem resolver pra algo:
    expect(marcaPorNome("Mercado Livre")).toBeNull();
    expect(marcaPorNome("Kwai")).toBeNull();
    expect(marcaPorNome("Yampi")).toBeNull();
    expect(marcaPorNome(null)).toBeNull();
    expect(marcaPorNome("")).toBeNull();
  });

  it("todo alvo de marcaPorNome aponta pra um slug que existe", () => {
    // Um apelido apontando pra slug sem arquivo seria o mesmo bug por outro caminho.
    for (const nome of ["Meta Ads", "Facebook Lead Ads", "Instagram", "WhatsApp", "Google Ads", "Google Analytics", "Google Sheets", "TikTok Ads", "Taboola", "Shopee", "Zapier"]) {
      const slug = marcaPorNome(nome);
      expect(slug, `apelido "${nome}" não resolveu`).not.toBeNull();
      expect(temLogo(slug), `apelido "${nome}" → "${slug}" sem arquivo`).toBe(true);
    }
  });
});
