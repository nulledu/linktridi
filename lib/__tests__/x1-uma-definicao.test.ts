import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isMarketingX1 } from "@/lib/vendedoras";

// ── Quem é X1 se responde num lugar só ───────────────────────────────────────
//
// Marketing X1 é um RECORTE do comercial (venda com fonte Facebook), e quem
// entra nele muda conforme o time muda. Existiam DUAS listas respondendo a
// mesma pergunta: `X1_VENDEDORAS` em lib/vendedoras.ts (Letícia e Beatriz) e um
// `USER_TEAM` por UUID em lib/erp.ts (só a Letícia). Elas divergiram sem que
// nada quebrasse: a Beatriz saía como Marketing no Analytics e como Comercial
// na parede de TV, com o MESMO dado embaixo — e ninguém tinha como notar,
// porque as duas telas nunca aparecem lado a lado.
//
// A trava não é sobre os nomes de hoje; é sobre não voltar a existir uma
// segunda lista amanhã.

describe("Marketing X1 — uma definição para o app inteiro", () => {
  it("reconhece quem é X1 e quem não é", () => {
    expect(isMarketingX1("Letícia Valentim")).toBe(true);
    expect(isMarketingX1("Beatriz")).toBe(true);
    // Acento e caixa não podem mudar a resposta: o ERP escreve de um jeito e a
    // planilha de outro.
    expect(isMarketingX1("LETICIA VALENTIM")).toBe(true);
    expect(isMarketingX1("Paola")).toBe(false);
    expect(isMarketingX1(null)).toBe(false);
    expect(isMarketingX1("")).toBe(false);
  });

  it("o painel de TV usa a definição compartilhada, não uma lista própria", () => {
    const erp = readFileSync(join(process.cwd(), "lib/erp.ts"), "utf8");
    expect(
      erp.includes("isMarketingX1"),
      "lib/erp.ts precisa decidir o time de X1 por `isMarketingX1` de lib/vendedoras.ts. " +
      "Uma lista própria aqui volta a divergir em silêncio — foi assim que a Beatriz " +
      "ficou Comercial na TV e Marketing no Analytics.",
    ).toBe(true);

    // Nome de vendedora escrito à mão no mapa de UUID é o começo da segunda lista.
    const mapa = /const USER_TEAM[^=]*=\s*\{([\s\S]*?)\};/.exec(erp)?.[1] ?? "";
    expect(
      mapa.trim(),
      "`USER_TEAM` voltou a ter entradas. Se for X1, a resposta é `isMarketingX1`; " +
      "se for outra coisa, escreva o porquê aqui e ajuste esta trava de propósito.",
    ).toBe("");
  });

  it("o total do Comercial da TV conta o mesmo recorte que o ranking mostra", () => {
    const erp = readFileSync(join(process.cwd(), "lib/erp.ts"), "utf8");
    // Somar toda linha da planilha (o que havia antes) fazia a TV exibir um
    // Comercial maior que o do Analytics, sem nada na tela explicando.
    expect(
      /teamOf\(byId\.get\(id\)\) === "comercial"[^\n]*comTotalR/.test(erp),
      "O total do Comercial na TV precisa filtrar pelo time comercial, igual ao " +
      "ranking. Sem o filtro ele soma X1 e as pessoas excluídas do ranking.",
    ).toBe(true);
  });
});
