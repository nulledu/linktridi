import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { janelaDataVenda } from "../vendedoras";
import { resolvePeriod } from "../period";

/**
 * O livro das vendedoras não pode perder o último dia do recorte.
 *
 * `vendas_planilha.data_venda` parece uma data e não é: é TIMESTAMP, e cada
 * lançamento entra na meia-noite UTC do dia (medido: 2.000 linhas de 2026,
 * nenhuma com hora diferente de 00:00:00).
 *
 * O filtro era `gte.<inicio>&lte.<fim>` com a data nua. O Postgres converte a
 * data nua pelo fuso DO SERVIDOR, e o instante resultante cai antes da
 * meia-noite UTC do mesmo dia — então a linha do último dia fica ACIMA do
 * limite superior e some. Toda faixa perdia o último dia; num período "hoje",
 * em que o último dia é o único, sumia o livro inteiro. Medido em 07/ago/26 no
 * ERP: R$ 1.619,50 em 13 lançamentos viravam R$ 0,00 na tela, e o mês fechava
 * R$ 31.111,98 onde havia R$ 32.731,48.
 *
 * O erro é invisível: nenhuma tela quebra, nenhum log aparece, e o número
 * errado é plausível. Só dá pra ver comparando com o ERP. Por isso a trava é
 * aqui — e ela vale para o formato da consulta, não para o resultado, porque
 * o resultado depende do banco.
 */
describe("janela de data_venda (livro das vendedoras)", () => {
  const hoje = resolvePeriod("hoje", null, null, new Date("2026-08-07T19:00:00Z"));

  it("é meio-aberta: começa no dia pedido e termina no dia SEGUINTE ao último", () => {
    const q = decodeURIComponent(janelaDataVenda(hoje));
    expect(q).toContain("data_venda=gte.2026-08-07T00:00:00+00:00");
    // O fim é 08, exclusivo — é isso que faz o dia 07 inteiro entrar.
    expect(q).toContain("data_venda=lt.2026-08-08T00:00:00+00:00");
  });

  it("nunca usa `lte` — é o operador que derrubava o último dia", () => {
    expect(janelaDataVenda(hoje)).not.toContain("lte.");
  });

  it("escreve o fuso, pra não depender de como o servidor resolveria a data nua", () => {
    const q = janelaDataVenda(hoje);
    expect(q).toContain(encodeURIComponent("+00:00"));
    // Data nua (só YYYY-MM-DD, sem hora) é exatamente o que causou o bug.
    expect(q).not.toMatch(/(gte|lt)\.\d{4}-\d{2}-\d{2}(&|$)/);
  });

  it("vira o mês e o ano sem inventar dia 32", () => {
    const fim = (ate: string) =>
      decodeURIComponent(janelaDataVenda(resolvePeriod("custom", "2026-01-01", ate))).match(/lt\.([\d-]+)T/)?.[1];
    expect(fim("2026-08-31")).toBe("2026-09-01");
    expect(fim("2026-12-31")).toBe("2027-01-01");
    expect(fim("2026-02-28")).toBe("2026-03-01");
  });

  it("nenhum leitor de vendas_planilha filtra com data nua", () => {
    const raiz = path.resolve(__dirname, "../..");
    const semComentario = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
    for (const rel of ["lib/vendedoras.ts", "lib/erp.ts"]) {
      const src = semComentario(fs.readFileSync(path.join(raiz, rel), "utf8"));
      // `data_venda=lte.` ou `data_venda=gte.` com uma data crua interpolada:
      // é o padrão que perde o último dia. Use `janelaDataVenda()`.
      expect(src, `${rel} usa lte em data_venda — perde o último dia do recorte`)
        .not.toMatch(/data_venda=lte\./);
    }
  });
});
