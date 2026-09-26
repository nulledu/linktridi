import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O cartão do colaborador tem que ser o MESMO cartão pra todo mundo.
 *
 * O defeito: a fileira da etiqueta de setor só era renderizada quando a pessoa
 * tinha setor. Como o `gap` do cartão continua valendo, quem não tinha subia o
 * selo, a admissão e o rodapé uma etiqueta inteira — na grade de três colunas,
 * nada batia com nada. O mesmo valia pro nome comprido, que quebrava em três
 * linhas e empurrava o rodapé 60px pra baixo.
 *
 * Medido em `/dev-rh` a 1440px antes: rodapé em 120 (sem setor), 142 (com) e
 * 204 (nome de três linhas). Depois: 140 nos seis cartões, e 0 de sobra
 * horizontal a 320px.
 *
 * As três mecânicas que seguram isso, e é por isso que o teste olha pra elas:
 *  1. fileira do setor SEM condicional — quem não tem ganha "sem setor";
 *  2. nome e cargo numa linha só, cortando com reticências (quebrar é o que
 *     fazia um cartão ficar mais alto que o vizinho);
 *  3. rodapé preso embaixo por `marginTop: "auto"`, porque o cartão estica até
 *     a altura do mais alto da fileira e a sobra tem que ficar ACIMA do rodapé.
 */
const ARQUIVO = join(
  process.cwd(),
  "app/(plataforma)/rh/colaboradores/ColaboradoresRhClient.tsx",
);

function corpoDoCartao(): string {
  const fonte = readFileSync(ARQUIVO, "utf8");
  const inicio = fonte.indexOf("function CartaoDoColaborador(");
  expect(inicio, "CartaoDoColaborador sumiu do arquivo").toBeGreaterThan(-1);
  const fim = fonte.indexOf("\nfunction ", inicio + 10);
  return fonte.slice(inicio, fim === -1 ? undefined : fim);
}

describe("cartão do colaborador", () => {
  it("nunca renderiza uma fileira condicional (era o que desalinhava a grade)", () => {
    const corpo = corpoDoCartao();
    // `{pessoa.algo && <...>}` some do DOM e leva junto a altura da fileira,
    // mas NÃO leva o `gap` do cartão. Falta de dado vira texto ("sem setor",
    // "sem cargo", "sem admissão"), nunca fileira que some.
    const condicionais = corpo.match(/\{\s*pessoa\.\w+\s*&&\s*</g) ?? [];
    expect(condicionais, `fileira que some: ${condicionais.join(", ")}`).toEqual([]);
  });

  it("dá etiqueta de setor a quem não tem setor", () => {
    expect(corpoDoCartao()).toContain('"sem setor"');
  });

  it("prende o rodapé embaixo do cartão esticado", () => {
    expect(corpoDoCartao()).toContain('marginTop: "auto"');
  });

  it("não deixa nome nem cargo quebrarem de linha", () => {
    const corpo = corpoDoCartao();
    const reticencias = corpo.match(/textOverflow: "ellipsis"/g) ?? [];
    expect(reticencias.length, "nome e cargo precisam cortar, não quebrar").toBeGreaterThanOrEqual(2);
    expect(corpo).not.toContain('overflowWrap: "anywhere"');
  });
});
