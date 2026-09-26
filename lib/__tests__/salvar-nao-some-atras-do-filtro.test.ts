import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Salvar não pode esconder o que foi salvo.
 *
 * Quem está filtrando por "Empresa" edita um cadastro, marca como pessoa e
 * salva: a linha some da lista. O que se lê é **"não salvou"** — e ninguém
 * suspeita do filtro, porque ele estava ligado desde antes de a edição
 * começar. O dado está no banco; a tela é que o esconde.
 *
 * É o mesmo defeito do TridiMarket, onde o filtro escondia a linha reabastecida
 * e parecia que o ajuste não tinha entrado. Reaparece porque nada impede: cada
 * tela decide sozinha o que fazer depois de salvar.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const TELA = readFileSync(
  join(RAIZ, "app/(plataforma)/financeiro/cadastros/contatos/ContatosClient.tsx"), "utf8");

describe("Depois de salvar", () => {
  it("os filtros saem quando havia algum ligado", () => {
    const bloco = TELA.slice(TELA.indexOf("setFotoPendente(null);\n      const salvo"), TELA.indexOf("router.refresh();"));
    expect(bloco).toContain("if (temFiltro)");
    expect(bloco).toContain("limparFiltros()");
  });

  it("e a pessoa é AVISADA — mudar a tela em silêncio confunde igual", () => {
    expect(TELA).toContain("Tirei os filtros para ele aparecer");
  });

  it("sem filtro ligado, nada muda", () => {
    // Limpar sempre mexeria na tela de quem não pediu nada.
    const bloco = TELA.slice(TELA.indexOf("if (temFiltro)"), TELA.indexOf("router.refresh();"));
    expect(bloco).toContain("} else {");
    expect(bloco).toContain('toast.ok("Cadastro salvo.")');
  });

  it("a ficha do que foi salvo reabre — é a prova de que salvou", () => {
    expect(TELA).toContain("if (salvo) setFichaId(salvo)");
  });

  it("o id é capturado ANTES de limpar o rascunho", () => {
    // Lê-lo depois daria `null`, e a ficha não reabriria.
    const i = TELA.indexOf("const salvo = rascunho.id;");
    const j = TELA.indexOf("setRascunho(null);", i);
    expect(i).toBeGreaterThan(0);
    expect(i).toBeLessThan(j);
  });
});
