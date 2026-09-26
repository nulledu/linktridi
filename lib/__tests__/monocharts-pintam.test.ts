import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ── A forma tem que existir sem depender de animação ─────────────────────────
//
// O recharts anima a FORMA a partir do zero (barra, setor de rosca, arco de
// medidor). Quando essa animação não roda — React 19 + StrictMode remontam o
// efeito no dev, e o react-smooth às vezes fica preso no primeiro quadro — a
// forma nunca cresce e o gráfico aparece VAZIO: eixo de pé, grade de pé, dica
// funcionando, e nenhum dado desenhado. Sem erro no console, sem teste
// vermelho, sem nada. Foi exatamente assim que barra, rosca e medidor foram
// parar em produção mostrando cartão em branco.
//
// Linha e área não escapam — só falham diferente: a animação delas revela o
// traço por `stroke-dasharray`, e quando congela no meio o gráfico mostra os
// primeiros dias e mais nada. Medido: `4px, …, 0.19px, 0px, 1110.67px` num
// caminho de 599px. Por isso a trava vale pro kit INTEIRO.
//
// O movimento de entrada, se for desejado, sai da escala do app
// (`--duration-*` do globals.css), não do relógio próprio da biblioteca.

const DIR = join(process.cwd(), "app/(plataforma)/ui/monocharts");
const DESENHAM = /<(Bar|Pie|Line|Area)\b/;

function arquivos() {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ({ nome: f, texto: readFileSync(join(DIR, f), "utf8") }));
}

describe("Monocharts — o gráfico pinta sem depender da animação", () => {
  it("toda série desenhada desliga a animação interna do recharts", () => {
    const suspeitos: string[] = [];
    for (const { nome, texto } of arquivos()) {
      if (!DESENHAM.test(texto)) continue;
      // Um `isAnimationActive={false}` por série desenhada.
      const formas = (texto.match(/<(Bar|Pie|Line|Area)\b/g) ?? []).length;
      const desligadas = (texto.match(/isAnimationActive=\{false\}/g) ?? []).length;
      if (desligadas < formas) {
        suspeitos.push(`${nome} — ${formas} série(s) desenhada(s), ${desligadas} com a animação desligada`);
      }
    }
    expect(
      suspeitos,
      "Série sem `isAnimationActive={false}`. A animação do recharts cresce a forma " +
      "a partir do zero (barra/setor) ou revela o traço por dasharray (linha/área): " +
      "quando ela trava, o gráfico fica vazio ou pela metade, sem avisar — com eixo, " +
      "grade e dica funcionando por cima de nada.",
    ).toEqual([]);
  });

  it("nenhum gráfico do kit volta a marcar `animationDuration`", () => {
    const suspeitos: string[] = [];
    for (const { nome, texto } of arquivos()) {
      texto.split("\n").forEach((linha, i) => {
        if (/animationDuration/.test(linha)) suspeitos.push(`${nome}:${i + 1}`);
      });
    }
    expect(
      suspeitos,
      "`animationDuration` num gráfico do kit. Ele reintroduz o relógio da " +
      "biblioteca — o mesmo que deixava barra e rosca invisíveis e a linha pela " +
      "metade. Movimento de entrada sai da escala do app (`--duration-*`).",
    ).toEqual([]);
  });
});
