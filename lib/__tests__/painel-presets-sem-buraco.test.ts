import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { empacotar, fileiras as contarFileiras, paraCasa, medidaDoSpan } from "@/app/(plataforma)/trafego/lattice";

/**
 * Trava do EMPACOTAMENTO dos presets (18/09/26, reclamação do dono com print
 * de produção: "olha o grid ali com um buraco").
 *
 * Duas causas juntas produziam o buraco: a rede de casas explícitas só ligava
 * no modo de edição (na leitura o CSS fluía sem preencher), e a ordem dos
 * presets deixava um P encalhado antes da muralha dos widgets G. A primeira
 * virou `data-rede` sempre; esta trava segura a segunda: TODA ordem de preset,
 * empacotada pelo `empacotar` REAL com os tamanhos REAIS do catálogo, não
 * pode deixar célula vazia antes da última fileira. A sobra que a geometria
 * impõe (total de células não múltiplo de 4) mora no FIM — a regra da
 * sobra-embaixo, agora em escala de rede.
 *
 * O teste lê o fonte (ordens e tamanhos) e usa o empacotar de verdade —
 * mudou o algoritmo ou um tamanho de widget, o teste recalcula sozinho.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const src = readFileSync(`${RAIZ}/app/(plataforma)/trafego/PainelPersonalizavel.tsx`, "utf8");

/** Tamanho padrão de cada widget, lido do catálogo (entradas `{ key: … size: N }` e os atalhos kpi/fin/eng/fun, que são P). */
function tamanhos(): Record<string, number> {
  const t: Record<string, number> = {};
  for (const m of src.matchAll(/\{ key: "([a-z_0-9]+)", nome: "[^"]*", icon: "[^"]*", cat: "[^"]*", size: (\d)/g)) t[m[1]] = Number(m[2]);
  for (const m of src.matchAll(/\b(?:kpi|fin|eng|fun)\("([a-z_0-9]+)"/g)) t[m[1]] ??= 1;
  return t;
}

function presets(): Record<string, string[]> {
  const bloco = src.slice(src.indexOf("const PRESETS"), src.indexOf("function layoutDoPreset"));
  const p: Record<string, string[]> = {};
  for (const m of bloco.matchAll(/(\w+): \{ nome: "[^"]+", order: \[([^\]]+)\] \}/g)) {
    p[m[1]] = [...m[2].matchAll(/"([a-z_0-9]+)"/g)].map((x) => x[1]);
  }
  return p;
}

describe("painel · presets sem buraco no meio da rede", () => {
  const spans = tamanhos();
  const P = presets();

  it("o teste enxerga os presets e os tamanhos (o regex não apodreceu)", () => {
    expect(Object.keys(P).length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(spans).length).toBeGreaterThanOrEqual(30);
    for (const [nome, ordem] of Object.entries(P)) {
      for (const k of ordem) expect(spans[k], `${nome}: widget "${k}" sem tamanho no catálogo (chave morta?)`).toBeDefined();
    }
  });

  for (const [nome, ordem] of Object.entries(presets())) {
    it(`preset "${nome}" não deixa célula vazia antes da última fileira`, () => {
      const itens = empacotar(ordem, (k) => medidaDoSpan(spans[k] ?? 1, 4), 4);
      const fileiras = contarFileiras(itens);
      const ocupada = new Set<string>();
      for (const casa of itens.map(paraCasa)) {
        for (let y = casa.r; y < casa.r + casa.ch; y++)
          for (let x = casa.c; x < casa.c + casa.cw; x++) ocupada.add(`${y}:${x}`);
      }
      const buracos: string[] = [];
      for (let y = 1; y <= fileiras - 1; y++)   // a ÚLTIMA fileira pode sobrar — o fim é o lugar da sobra
        for (let x = 1; x <= 4; x++) if (!ocupada.has(`${y}:${x}`)) buracos.push(`fileira ${y}, coluna ${x}`);
      expect(buracos, `vão no meio da rede — reordene o preset (a sobra vai pro FIM)`).toEqual([]);
    });
  }

  it("medidaDoSpan segue o contrato que os presets assumem (P 1×1, M 2×2, G 4×3)", () => {
    expect(medidaDoSpan(1, 4)).toEqual({ w: 1, h: 1 });
    expect(medidaDoSpan(2, 4)).toEqual({ w: 2, h: 2 });
    expect(medidaDoSpan(4, 4)).toEqual({ w: 4, h: 3 });
  });
});
