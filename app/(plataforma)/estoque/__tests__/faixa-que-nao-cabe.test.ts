import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Fileira que não cabe entre 901px e ~1270px ───────────────────────────────
//
// A `.tab-strip` da fundação (app/globals.css) só ganha `overflow-x: auto`
// dentro de `@media (max-width: 900px)`. Acima disso ela é um `inline-flex`
// com `max-width: 100%` e filhos `white-space: nowrap`: o conteúdo simplesmente
// VAZA — e, quando a fileira é filha de um grid de coluna única, ela ainda
// ESTICA a coluna inteira junto (`min-width: auto` do item de grid).
//
// O Estoque tem três fileiras longas, e as três quebravam exatamente na faixa
// de largura do notebook (901px → ~1270px), que é onde ninguém mede porque
// "1280 dá zero e 320 dá zero":
//
//   · as SETE seções (926px) — "Localização" e "Bipar" nasciam FORA do recorte
//     da coluna de 676px: invisíveis e sem clique. Página com 213px de rolagem
//     lateral a 1024px.
//   · os OITO filtros do Recebimento (765px) — 90px pra fora da coluna, 54px
//     de rolagem lateral na página.
//   · os motivos do Bipar (896px de min-content) — dentro de `.bip-wrap`, que
//     era `display: grid` puro: a coluna nascia com 918px e TODOS os blocos da
//     tela vazavam 242px, com 208px de rolagem lateral na página.
//
// Medir a 1280px e a 320px não pega nada disso, e documentar não segurou —
// esta é a trava. Se alguém tirar uma destas guardas, o teste diz por quê.
const raiz = join(__dirname, "..", "..", "..", "..");
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");

/** Remove comentários pra não casar a guarda com o texto que a explica. */
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");

describe("fileira longa do Estoque não vaza no notebook", () => {
  it("a faixa das sete seções rola dentro do invólucro, não na página", () => {
    const src = semComentarios(ler("app/(plataforma)/estoque/EstoqueTabs.tsx"));
    // O invólucro do `<Abas>` precisa rolar sozinho: sem isto, `scrollIntoView`
    // da aba ativa rola a PÁGINA e as duas últimas abas ficam fora do recorte.
    expect(src, "invólucro do <Abas> em EstoqueTabs perdeu o overflowX").toMatch(
      /overflowX:\s*"auto"[\s\S]{0,120}<Abas/,
    );
  });

  it("os oito filtros do Recebimento rolam dentro do invólucro", () => {
    const src = semComentarios(ler("app/(plataforma)/estoque/RecebimentoPanel.tsx"));
    expect(src, "invólucro do <Abas> de filtros perdeu o overflowX").toMatch(
      /overflowX:\s*"auto"[\s\S]{0,120}<Abas<Filtro>/,
    );
  });

  it("o grid do Bipar não pode ser esticado por um filho", () => {
    const src = ler("app/(plataforma)/estoque/BiparClient.tsx");
    // `minmax(0, 1fr)` desliga o `min-width: auto` do item de grid. Sem ele, a
    // fileira de motivos (896px) vira a largura da coluna e leva a tela junto.
    expect(src, ".bip-wrap voltou a ser um grid sem minmax(0, 1fr)").toMatch(
      /\.bip-wrap\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
    );
    // E os motivos quebram em linha nova no computador, onde a fundação não
    // rola mais — senão eles só não estouram porque o `minmax` os recorta.
    expect(src, "os motivos do Bipar deixaram de quebrar acima de 900px").toMatch(
      /@media\s*\(min-width:\s*901px\)\s*\{[^}]*\.bip-motivos\s*\{[^}]*flex-wrap:\s*wrap/,
    );
  });

  // ── As duas que a varredura por `scrollWidth` da PÁGINA nunca acusa ────────
  //
  // Nas três de cima o vazamento chegava à página, então dava pra achá-lo
  // medindo `document.documentElement.scrollWidth − clientWidth`. Nestas duas
  // não: a fileira mora dentro de um cartão estreito, e o que escapa cabe na
  // margem da página. A conta da página dá ZERO e o botão está impresso do
  // lado de fora do cartão — que é exatamente o defeito que o dono descreve.
  it("os atalhos de tamanho da Impressão rolam dentro do cartão", () => {
    const src = semComentarios(ler("app/(plataforma)/estoque/impressao/AjusteMm.tsx"));
    // Medido a 1280 sem o invólucro: faixa de 560px com 620px de conteúdo, e
    // "Estreita 40×15" terminando em x=657 com o cartão em 618 — 39px de botão
    // pintados por cima do vão entre os dois cartões, com a página em zero.
    expect(src, "invólucro dos atalhos de tamanho perdeu o overflowX").toMatch(
      /overflowX:\s*"auto"[\s\S]{0,160}className="tab-strip"/,
    );
  });

  it("as sugestões de categoria do Classificar em lote rolam dentro do painel", () => {
    const src = semComentarios(ler("app/(plataforma)/estoque/TriarEmLote.tsx"));
    // Medido a 1280 sem o invólucro: faixa de 483px com 666px de conteúdo, a
    // última pílula 183px além da borda da faixa e cortada pelo `.ui-side-corpo`
    // — duas sugestões invisíveis e sem clique, e nada rolava pra alcançá-las.
    expect(src, "invólucro das sugestões de categoria perdeu o overflowX").toMatch(
      /overflowX:\s*"auto"[\s\S]{0,160}className="tab-strip"/,
    );
  });
});
