import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Peso que só um canto da tela usa chega sob demanda ───────────────────────
// Import estático entra no pacote da página inteira, aberto ou não. Dois casos
// que pagavam isso no primeiro load:
//  · Impressão: o compositor de etiqueta (aba "Compor") puxa EtiquetaLivre →
//    @zxing/library, e a aba padrão é a de configuração.
//  · Logística: o "Ritmo do setor" nasce FECHADO, e os gráficos dele são o kit
//    Monocharts (recharts) — que o layout da plataforma não carrega.

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Módulos importados por VALOR (`import type` é apagado e não pesa). */
function importsDeValor(texto: string): string[] {
  return [...texto.matchAll(/^import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
}

describe("carga sob demanda", () => {
  it("Impressão não embarca o compositor (nem o @zxing/library dele) de saída", () => {
    const texto = ler("app/(plataforma)/estoque/impressao/ImpressaoClient.tsx");
    expect(importsDeValor(texto).filter((m) => /ComporEtiqueta|EtiquetaLivre|@zxing/.test(m))).toEqual([]);
    expect(texto).toMatch(/import\(["']\.\/ComporEtiqueta["']\)/);
  });

  it("o Ritmo da Logística não embarca recharts enquanto o bloco está fechado", () => {
    const texto = ler("app/(plataforma)/logistica/Ritmo.tsx");
    expect(importsDeValor(texto).filter((m) => /ui\/monocharts|recharts/.test(m))).toEqual([]);
    expect(texto).toMatch(/import\(["'][^"']*ui\/monocharts\/MonoRoundedBarChart["']\)/);
    expect(texto).toMatch(/import\(["'][^"']*ui\/monocharts\/MonoRoundedLineChart["']\)/);
  });
});
