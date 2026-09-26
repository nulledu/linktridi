import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * Modal mais alto que a tela precisa ROLAR — no desktop também.
 *
 * `.apple-backdrop` é `position: fixed; inset: 0`: exatamente a altura da
 * janela. Sem `overflow`, o que passa disso fica fora e é inalcançável, porque
 * elemento fixo não anda com a rolagem da página. Medido em `/dev-financeiro`:
 * um modal de 1030px numa janela de 900 perdia 154px do rodapé; o do
 * patrimônio, com doze campos mais anexos, perdia a maior parte.
 *
 * O sintoma que chega é **"não consigo clicar em quase nada dentro desse pop
 * up"** — que não soa como rolagem, e por isso ninguém procura no véu.
 *
 * O detalhe que torna este teste necessário: a regra de celular (≤700px) já
 * corrigia isto, e o comentário dela já descrevia o sintoma
 * ("'Salvar' ficava inalcançável"). A correção existia e nunca atravessou para
 * o desktop. Uma trava que olha só o celular não teria pego nada.
 */

const CSS = readFileSync(join(fileURLToPath(new URL("../..", import.meta.url)), "app/globals.css"), "utf8");

/** O bloco de uma regra, do seletor até a chave que a fecha. */
function regra(seletor: string, apos = 0): string {
  const i = CSS.indexOf(seletor, apos);
  if (i < 0) return "";
  return CSS.slice(i, CSS.indexOf("}", i));
}

describe("Véu de modal — o conteúdo alto tem de caber ou rolar", () => {
  const veu = regra(".apple-backdrop {");

  it("o véu existe e é fixo na janela", () => {
    expect(veu).toContain("position: fixed");
    expect(veu).toContain("inset: 0");
  });

  it("rola quando o conteúdo passa da tela", () => {
    expect(veu, "sem overflow, o que passa da janela é inalcançável").toContain("overflow-y: auto");
  });

  it("centraliza com `safe` — senão o topo fica ACIMA da área rolável", () => {
    // `center` puro, com item que não cabe, sobra igual dos dois lados: a parte
    // de cima nasce antes do início do scroll e nenhuma rolagem a alcança.
    expect(veu).toContain("place-items: safe center");
    expect(veu, "`center` sem `safe` é o defeito").not.toMatch(/place-items:\s*center\s*;/);
  });

  it("a rolagem não vaza para a página atrás", () => {
    expect(veu).toContain("overscroll-behavior: contain");
  });
});

describe("No celular a folha continua presa embaixo", () => {
  // A correção do desktop não pode desfazer a do celular, que é diferente de
  // propósito: ali o modal vira folha ancorada na base, e quem rola é o
  // PRÓPRIO modal (com max-height em dvh), não o véu.
  const bloco = CSS.slice(CSS.indexOf("Modal vira FOLHA no celular"), CSS.indexOf("Modal vira FOLHA no celular") + 1400);

  it("o véu ancora embaixo", () => {
    expect(bloco).toContain("place-items: end center");
  });

  it("o modal rola por dentro, com teto em dvh", () => {
    expect(bloco).toContain("overflow-y: auto");
    expect(bloco).toMatch(/max-height:\s*calc\(100dvh/);
  });

  it("nunca `vh` — no celular ele inclui a barra do navegador", () => {
    expect(bloco).not.toMatch(/max-height:\s*calc\(100vh/);
  });
});
