import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ── Botão que só tem ícone precisa dizer o que faz ──────────────────────────
 *
 * O `<Icon>` sai com `aria-hidden` de propósito — um ícone decorativo ao lado
 * de um rótulo não deve ser lido duas vezes. A consequência é que um botão
 * cujo ÚNICO filho é um ícone fica sem texto nenhum: o leitor de tela anuncia
 * "botão" e para aí.
 *
 * Numa tela cheia de modais, isso significa que a pessoa cega encontra vários
 * "botão" idênticos e nenhum diz qual fecha, qual remove e qual publica. Foram
 * dez assim quando esta trava foi escrita — nove de fechar e um de remover
 * bloco do painel de TV, que é destrutivo.
 *
 * O rótulo descreve a AÇÃO, nunca o desenho: "Fechar", não "X". Ninguém aperta
 * um "xis" — aperta o que ele faz.
 *
 * Escopo estreito: só o caso inequívoco (`<button>` cujo conteúdo inteiro é um
 * `<Icon/>`). Botão com ícone MAIS texto já tem nome pelo texto, e um botão
 * montado em várias linhas com lógica no meio pode ter rótulo por outro
 * caminho — acusar esses geraria ruído e a trava seria desligada.
 */
const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

function varrer(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (["node_modules", ".next", "__tests__"].includes(nome) || nome.startsWith(".")) continue;
    const full = join(dir, nome);
    if (statSync(full).isDirectory()) varrer(full, saida);
    else if (nome.endsWith(".tsx")) saida.push(full);
  }
  return saida;
}

/** `<button ...>` com um `<Icon/>` como conteúdo inteiro. */
const SO_ICONE = /<button\b([^>]*)>\s*(<Icon\b[^>]*\/>)\s*<\/button>/g;
/** Qualquer uma destas dá nome ao botão. `title` conta: o navegador o usa como
 *  nome acessível quando não há texto — não é o melhor caminho, mas é válido. */
const TEM_NOME = /aria-label|aria-labelledby|title=/;

describe("botão só com ícone tem nome acessível", () => {
  const arquivos = varrer(join(RAIZ, "app")).map((f) => ({
    caminho: relative(RAIZ, f),
    texto: readFileSync(f, "utf8"),
  }));

  it("varre uma quantidade plausível de telas", () => {
    expect(arquivos.length).toBeGreaterThan(300);
  });

  it("nenhum botão só-ícone fica mudo", () => {
    const ruins: string[] = [];
    for (const { caminho, texto } of arquivos) {
      for (const m of texto.matchAll(SO_ICONE)) {
        if (TEM_NOME.test(m[1])) continue;
        const linha = texto.slice(0, m.index).split("\n").length;
        const icone = /name="([a-z0-9-]+)"/.exec(m[2])?.[1] ?? "?";
        ruins.push(`${caminho}:${linha}  <button> só com <Icon name="${icone}">`);
      }
    }
    expect(
      ruins,
      'Botão sem texto nenhum: o leitor de tela anuncia só "botão". Acrescente ' +
        '`aria-label` com a AÇÃO — "Fechar", "Remover bloco", "Publicar" — nunca o ' +
        'nome do desenho ("X", "lixeira").',
    ).toEqual([]);
  });
});
