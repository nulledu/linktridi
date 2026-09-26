import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `t-modal` sem quem o acenda = modal INVISÍVEL E INTOCÁVEL.
 *
 * A receita de movimento é um par, e as três regras juntas têm uma consequência
 * que não se vê lendo nenhuma delas sozinha:
 *
 *   .t-modal            { opacity: 0; pointer-events: none }   ← nasce apagado
 *   .t-modal.is-open    { opacity: 1; pointer-events: auto }   ← quem acende
 *   .apple-modal.t-modal{ animation: none }                    ← plano B desligado
 *
 * Quem marca o card com `t-modal` e não recebe a classe do `useAbrirFechar`
 * monta um modal que nunca acende: o véu embaça a tela, o card está no DOM, e
 * nada acontece — nem clique, porque `pointer-events: none`.
 *
 * Aconteceu de verdade no "Cadastrar item" do Estoque, numa migração pela
 * metade: duas das três chamadas do editor passaram a usar o hook e a terceira
 * ficou pra trás. O dono ficou sem conseguir cadastrar produto, e eu cheguei a
 * ver a `opacity: 0` medindo no navegador e classifiquei como artefato de
 * animação congelada — o defeito estava na tela dele o tempo todo.
 *
 * A trava é grosseira de propósito: procura `t-modal` escrito em JSX e exige
 * que o mesmo arquivo saiba de `is-open` (direto ou pelo hook). Não prova que a
 * classe chega em toda ramificação, mas pega a migração pela metade, que é o
 * modo de falha real.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const ALVO = join(RAIZ, "app");

function arquivos(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) arquivos(p, achados);
    else if (/\.tsx$/.test(nome)) achados.push(p);
  }
  return achados;
}

describe("modal que usa a receita t-modal", () => {
  it("todo arquivo que marca t-modal sabe acender", () => {
    const culpados: string[] = [];

    for (const arq of arquivos(ALVO)) {
      const src = readFileSync(arq, "utf8");
      // Só interessa `t-modal` escrito como CLASSE em JSX, não citado em texto
      // ou comentário (o globals.css e as docs falam dele o tempo todo).
      const usaClasse = /className=[^\n]*\bt-modal\b/.test(src);
      if (!usaClasse) continue;

      // Quem acende: a classe direta, o hook que a produz, ou uma prop que
      // claramente carrega o ciclo (`classe`/`className` vindo de fora).
      const sabeAcender = /is-open|useAbrirFechar|classe\s*[?:}]|classe\s*=/.test(src);
      if (!sabeAcender) culpados.push(arq.replace(RAIZ, ""));
    }

    expect(
      culpados,
      "estes marcam `t-modal` e nada acende: o modal fica invisível e sem receber toque.\n" +
        "Use `useAbrirFechar` no chamador e passe a classe, ou não marque `t-modal`.\n" +
        culpados.join("\n"),
    ).toEqual([]);
  });

  it("o editor de item não marca t-modal sem a classe do ciclo", () => {
    // O caso concreto que custou o cadastro de produto: a prop é opcional (as
    // provas /dev-* e os testes montam o componente direto), então a classe da
    // receita só pode entrar acompanhada.
    const src = readFileSync(join(ALVO, "(plataforma)", "estoque", "ItemEditor.tsx"), "utf8");
    expect(src).toMatch(/classe \? `t-modal \$\{classe\}` : ""/);
    expect(src, "t-modal solto no className volta a apagar o modal")
      .not.toMatch(/className=\{`apple-modal[^`]*\bt-modal \$\{classe\}`/);
  });

  // A trava de arquivo acima não pega o modo de falha do PessoaModal: o modal
  // SABIA acender (`classe` chega por prop), mas dois chamadores montavam
  // `<PessoaModal …>` sem passar nada — véu borrado e nada em cima, exatamente
  // o mesmo sintoma, e a edição do cadastro de ponto ficou impossível.
  // Aqui a varredura é por CHAMADA: modal exportado que marca `t-modal` e
  // aceita `classe` opcional não pode ser montado sem ela.
  it("nenhuma chamada de modal exportado esquece a classe do ciclo", () => {
    const alvos = new Map<string, string>();   // componente → arquivo de origem
    for (const arq of arquivos(ALVO)) {
      const src = readFileSync(arq, "utf8");
      if (!/className=[^\n]*\bt-modal \$\{classe\}/.test(src)) continue;
      // Quem tem fallback próprio não depende do chamador — está a salvo.
      if (/useClasseAberta/.test(src)) continue;
      // Nem quem só marca `t-modal` QUANDO a classe existe (padrão do ItemEditor).
      if (/classe \? `t-modal/.test(src)) continue;
      for (const m of src.matchAll(/export function (\w+)\(\{[^}]*\bclasse\b/g)) alvos.set(m[1], arq.replace(RAIZ, ""));
    }

    const culpados: string[] = [];
    for (const arq of arquivos(ALVO)) {
      // Teste monta o componente cru de propósito — e o ItemEditor só marca
      // `t-modal` quando a classe existe, então ali montar sem ela é legítimo.
      if (arq.includes("__tests__")) continue;
      const src = readFileSync(arq, "utf8");
      for (const [nome, origem] of alvos) {
        for (const c of src.match(new RegExp(`<${nome}\\b[^>]*`, "g")) ?? []) {
          if (!/classe=\{/.test(c)) culpados.push(`${arq.replace(RAIZ, "")} → <${nome}> (de ${origem})`);
        }
      }
    }
    expect(
      culpados,
      "estas chamadas montam um modal `t-modal` sem a classe que o acende —\n" +
        "o véu embaça e nada aparece. Passe a classe do `useAbrirFechar` ou dê\n" +
        "ao modal um fallback próprio (`useClasseAberta`).\n" +
        culpados.join("\n"),
    ).toEqual([]);
  });

  it("os modais que o chamador esquecia acendem sozinhos", () => {
    // PessoaModal (cadastro de ponto) e FolhaFoto tinham chamadores sem
    // `classe`: véu borrado e nada em cima. O fallback é o que segura.
    for (const rel of [["(plataforma)", "administracao", "PontoPanel.tsx"], ["..", "app", "fotos-comuns", "pecas.tsx"], ["(plataforma)", "estoque", "AjusteDeQuantidade.tsx"]]) {
      const src = readFileSync(join(ALVO, ...rel), "utf8");
      expect(src, `${rel.join("/")} voltou a depender do chamador`).toMatch(/useClasseAberta/);
      expect(src, `${rel.join("/")} tem t-modal cru na className`).not.toMatch(/t-modal \$\{classe\}/);
    }
  });

  it("as três chamadas do editor no catálogo passam a classe", () => {
    // Duas passavam e uma não — e a que não passava era a do botão principal.
    const src = readFileSync(join(ALVO, "(plataforma)", "estoque", "CatalogoClient.tsx"), "utf8");
    const chamadas = src.match(/<ItemEditor[^>]*/g) ?? [];
    expect(chamadas.length, "o catálogo tem três chamadas do editor").toBeGreaterThanOrEqual(3);
    for (const c of chamadas) {
      expect(c, `chamada sem classe do ciclo:\n${c.slice(0, 120)}`).toMatch(/classe=\{/);
    }
  });
});
