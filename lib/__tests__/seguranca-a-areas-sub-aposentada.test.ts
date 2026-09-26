import { describe, expect, it } from "vitest";
import { AREA_BASICA, AREAS, chavesDasAreas } from "../areas";

/**
 * Sub APOSENTADA não pode reabrir o back-compat do modelo antigo.
 *
 * Quem só tinha `marketing:aquecimento` foi gravado pela grade como
 * `{ marketing: true, "marketing:ver": false, …, "marketing:aquecimento": true }`.
 * Quando a sub saiu do catálogo (virou a área Contingência, 4d05a7d5), nenhuma
 * sub ATUAL ficou ligada com a área `true` — e o ramo pensado pro mapa SEM
 * subs concedia ver/criar/desempenho. Operador de contingência passou a criar
 * criativo e a ver o ranking com dinheiro investido, sem ninguém decidir.
 *
 * A regra geral: o back-compat é pra mapa que nunca passou pela grade de subs
 * daquela área. Qualquer `area:*` no mapa (ligada ou não, atual ou aposentada)
 * prova que alguém decidiu sub a sub — e aí quem manda são os quadradinhos.
 */
const MARKETING = ["marketing", "marketing:ver", "marketing:criar", "marketing:desempenho"];

describe("back-compat do modelo antigo — só pra mapa SEM subs da área", () => {
  it("só a sub aposentada ligada não concede nada do Marketing", () => {
    const keys = chavesDasAreas({ marketing: true, "marketing:aquecimento": true });
    for (const k of MARKETING) expect(keys, k).not.toContain(k);
    // A Contingência continua herdada — é pra lá que a sub foi.
    expect(keys).toContain("contingencia");
  });

  it("o mapa completo que a grade gravava também não", () => {
    const keys = chavesDasAreas({
      marketing: true, "marketing:ver": false, "marketing:criar": false,
      "marketing:desempenho": false, "marketing:aquecimento": true,
    });
    for (const k of MARKETING) expect(keys, k).not.toContain(k);
  });

  it("o modelo antigo de verdade (só a área) continua herdando a leitura", () => {
    const keys = chavesDasAreas({ marketing: true });
    for (const k of MARKETING) expect(keys, k).toContain(k);
  });

  it("vale pra toda área com subs: sub no mapa = a grade decidiu", () => {
    const basica = new Set<string>(AREA_BASICA);
    for (const a of AREAS.filter((x) => x.subs?.length && !basica.has(x.key))) {
      const mapa: Record<string, boolean> = { [a.key]: true };
      for (const s of a.subs!) mapa[`${a.key}:${s.key}`] = false;
      expect(chavesDasAreas(mapa), a.key).not.toContain(a.key);
      // Sem nenhuma sub no mapa, a área do modelo antigo continua entrando.
      expect(chavesDasAreas({ [a.key]: true }), a.key).toContain(a.key);
    }
  });
});
