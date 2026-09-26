import { describe, it, expect } from "vitest";
import { escalaPorPolegadas } from "@/lib/painel-layout";

/**
 * As regras de LEITURA da parede, travadas.
 *
 * Os guias de painel de parede convergem em três coisas que o nosso KPI não
 * tinha: comparação com o período anterior, tendência visível e número curto.
 * Aqui ficam as duas que são conta — e que, erradas, mentem em silêncio.
 */

/** Cópia da regra do widget: acima de 300% a conta virou artefato do calendário. */
function sensato(p: number | null): number | null {
  return p == null || Math.abs(p) > 300 ? null : p;
}

function curto(n: number, dinheiro: boolean): string {
  const s = n < 0 ? "-" : "";
  const a = Math.abs(n);
  const p = dinheiro ? "R$ " : "";
  const num = (v: number) => v.toFixed(v < 10 ? 1 : 0).replace(".", ",").replace(/,0$/, "");
  if (a >= 1_000_000) return `${s}${p}${num(a / 1_000_000)} mi`;
  if (a >= 1_000) return `${s}${p}${num(a / 1_000)} mil`;
  return `${p}${Math.round(a)}`;
}

describe("contexto do número na parede", () => {
  it("variação absurda some em vez de assustar", () => {
    // 839% e 249% foram medidos de verdade — os dois no começo do mês, quando
    // a base do período anterior é quase zero. Não é desempenho, é calendário.
    expect(sensato(839)).toBeNull();
    expect(sensato(-402)).toBeNull();
    expect(sensato(38)).toBe(38);
    expect(sensato(-27)).toBe(-27);
    expect(sensato(300)).toBe(300);      // o limite ainda passa
    expect(sensato(300.5)).toBeNull();
  });

  it("número curto encurta a escala sem perder a ordem de grandeza", () => {
    expect(curto(59_925, true)).toBe("R$ 60 mil");
    expect(curto(1_240_000, true)).toBe("R$ 1,2 mi");
    expect(curto(9_400, true)).toBe("R$ 9,4 mil");
    // Abaixo de mil não abrevia: "R$ 0,8 mil" seria pior que "R$ 800".
    expect(curto(800, true)).toBe("R$ 800");
    expect(curto(-2_500, true)).toBe("-R$ 2,5 mil");
  });

  it("a escala por polegadas continua suave — nada de proporcional à diagonal", () => {
    // Guarda a régua que o app e o editor compartilham.
    expect(escalaPorPolegadas(50)).toBe(1);
    expect(escalaPorPolegadas(75)).toBeCloseTo(1.13, 2);
    expect(escalaPorPolegadas(24)).toBeCloseTo(0.87, 2);
  });
});
