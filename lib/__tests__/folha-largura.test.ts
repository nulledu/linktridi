import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * A folha tem que CABER na tela de quem usa — inclusive com zoom.
 *
 * O ERP é usado a 125% de zoom (é o padrão de quem passa o dia lendo número
 * pequeno). Zoom não aumenta a tela: ele DIVIDE a largura em CSS. Um monitor
 * de 1920 a 125% vira 1536px de CSS, e daí ainda saem a barra do workspace, o
 * respiro da coluna de conteúdo e o do cartão — sobra ~1192px para a tabela.
 *
 * O piso de largura da folha era 1120px, e a tabela ainda crescia além dele
 * pelo conteúdo (1199px medidos): não cabia, e a única saída era uma rolagem
 * lateral que quase não tinha de onde ser pega, porque quase toda a superfície
 * da tabela é campo de dinheiro.
 *
 * Esta trava guarda as duas pontas:
 *  · o PISO cabe no orçamento de 1192px;
 *  · o campo de dinheiro não tem largura mínima própria — quem dita a largura
 *    da coluna é o rótulo, senão oito campos de 70px reinflam a tabela sem
 *    ninguém mexer no piso.
 */

const ARQUIVO = fileURLToPath(
  new URL("../../app/(plataforma)/financeiro/cadastros/colaboradores/ColaboradoresClient.tsx", import.meta.url),
);

/** 1920 a 125% = 1536px de CSS, menos a barra (244), a coluna (60) e o cartão (36). */
const ORCAMENTO_125 = 1192;

describe("a folha cabe em 1920 a 125% de zoom", () => {
  const fonte = readFileSync(ARQUIVO, "utf8");

  it("o piso de largura da tabela cabe no orçamento", () => {
    const m = fonte.match(/className="folha-tab"[^>]*minWidth:\s*(\d+)/);
    expect(m, "a tabela da folha perdeu o piso de largura declarado").not.toBeNull();
    const piso = Number(m![1]);
    expect(
      piso,
      `piso de ${piso}px não cabe nos ${ORCAMENTO_125}px que sobram a 125% de zoom — ` +
      `a folha volta a exigir rolagem lateral no monitor de todo dia.`,
    ).toBeLessThanOrEqual(ORCAMENTO_125);
  });

  it("o campo de dinheiro não carrega largura mínima própria", () => {
    const celula = fonte.slice(fonte.indexOf("function CelulaDinheiro"));
    const m = celula.match(/minWidth:\s*(\d+)/);
    expect(m, "CelulaDinheiro sem minWidth declarado — deixe `minWidth: 0`").not.toBeNull();
    expect(
      Number(m![1]),
      "campo de dinheiro com piso próprio: oito colunas × esse piso reinflam a tabela " +
      "por fora do minWidth da tabela, que é onde a trava de cima olha.",
    ).toBe(0);
  });

  /**
   * A RODA DO MOUSE em cima da tabela tem que rolar a PÁGINA.
   *
   * Declarar `overflow-x` já faz o `overflow-y` computar `auto`: o bloco vira
   * rolador nos dois eixos, e num deles não há nada para rolar. Com o atalho
   * `overscroll-behavior: contain` (os dois eixos), esse eixo morto ENGOLE a
   * roda em vez de passar a rolagem adiante — a tabela fica parada e a página
   * também. É o "não consigo rolar a tabela" que sobreviveu ao arrasto.
   *
   * A fundação já escreve `overscroll-behavior-x: contain` (só o X) no
   * `.tab-strip` e no `.kpi-row`; conter o X é o que impede o gesto lateral
   * de virar "voltar" do navegador. Rolador horizontal novo segue essa forma.
   */
  it("rolador horizontal não contém a rolagem vertical", () => {
    const linhas = fonte.split("\n");
    const culpados: number[] = [];
    linhas.forEach((linha, i) => {
      if (!/overflowX:\s*"auto"/.test(linha)) return;
      const janela = linhas.slice(i, i + 14).join("\n");
      if (/overscrollBehavior:\s*"contain"/.test(janela)) culpados.push(i + 1);
    });
    expect(
      culpados,
      "rolador horizontal com `overscrollBehavior: \"contain\"` (atalho, os dois eixos): " +
      "a roda do mouse morre em cima dele. Use `overscrollBehaviorX: \"contain\"`.",
    ).toEqual([]);
  });

  it("dá para arrastar a tabela de qualquer ponto, não só do fundo", () => {
    expect(
      /Math\.abs\(dx\) < 8/.test(fonte),
      "o arrasto-para-rolar voltou a exigir um ponto 'livre' da tabela. Quase toda a " +
      "superfície da folha é campo: sem a histerese de 8px não há de onde pegar.",
    ).toBe(true);
    expect(
      /closest\("input, button, a, select"\)/.test(fonte.slice(fonte.indexOf("function pegar"), fonte.indexOf("function soltar"))),
      "voltou o `closest(input, button…)` que bloqueava o arrasto em cima dos campos.",
    ).toBe(false);
  });
});
