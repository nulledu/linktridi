import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Trava de alvo de toque na faixa do workspace.
 *
 * No celular a fundação vira a sidebar do workspace numa faixa horizontal e,
 * pra caber, ESCONDE o rótulo de vários botões — `.ws-exit-label`,
 * `.lj-marca-txt`, o `span` do "Configurações" do rail de Lojas. O que sobra é
 * um ícone de 15–18px dentro do padding que o botão já tinha: 38px a 42px de
 * alvo, abaixo dos 44 (`--tap`) que o CLAUDE.md exige. `min-height` sozinho não
 * pega o defeito, porque ele é de LARGURA — o botão mede 41×44 e passa em
 * qualquer conferência que só olhe a altura.
 *
 * Por que a trava mora na fundação e não em cada shell: o padrão do "Sair do
 * <workspace>" foi copiado em cinco lugares (RH, Financeiro, TridiMarket,
 * TridiChat, TridiFlow) e os cinco nasceram com 41px. Consertar em cada um só
 * garante que o sexto nasça errado de novo — e deixa a mesma regra morando em
 * dois lugares, que é como uma delas desatualiza.
 *
 * Caso especial que o teste cobre de propósito: o TridiFlow põe DOIS botões
 * dentro do `.ws-exit` (sair + trocar tema). Ali o invólucro não é o alvo — os
 * filhos são —, então a regra precisa alcançar `> a` e `> button`.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const CSS = readFileSync(join(RAIZ, "app/globals.css"), "utf8");

/** A largura a partir da qual a sidebar do workspace vira faixa horizontal. */
const CONSULTA = "@media (max-width: 900px)";

/** Os blocos `@media (max-width: 900px)` do arquivo, com as chaves casadas. */
function blocosDaFaixa(css: string): string[] {
  const out: string[] = [];
  let de = css.indexOf(CONSULTA);
  while (de !== -1) {
    let i = css.indexOf("{", de);
    let nivel = 0;
    for (; i < css.length; i++) {
      if (css[i] === "{") nivel++;
      else if (css[i] === "}" && --nivel === 0) break;
    }
    out.push(css.slice(css.indexOf("{", de) + 1, i));
    de = css.indexOf(CONSULTA, i);
  }
  return out;
}

/**
 * Todas as declarações que a faixa aplica ao seletor pedido — somadas, porque
 * `min-height` pode vir numa regra e `min-width` em outra.
 */
function declaracoesNaFaixa(seletor: string): string {
  let junto = "";
  for (const bloco of blocosDaFaixa(CSS)) {
    for (const [, alvos, corpo] of bloco.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const lista = alvos.replace(/\/\*[\s\S]*?\*\//g, "").split(",").map((s) => s.trim());
      if (lista.includes(seletor)) junto += corpo + ";";
    }
  }
  return junto;
}

/**
 * Os alvos que ficam SÓ com o ícone na faixa. Cada um está aqui porque foi
 * medido no navegador (`offsetWidth`, não `getBoundingClientRect` — no
 * embutido o rect vem com a animação congelada e mente) e voltou abaixo de 44.
 */
const SO_O_ICONE = [
  { seletor: ".ws-exit", era: "41px (ícone 15 + padding 24 + borda 2)" },
  { seletor: ".ws-exit > a", era: "41px — o \"Sair\" do TridiFlow, filho do invólucro" },
  { seletor: ".ws-exit > button", era: "38px — o troca-tema do TridiFlow, `width: 38` inline" },
  { seletor: ".lj-marca", era: "42px — a troca de loja, que é como se sai da loja" },
  { seletor: ".lj-rodape .lj-nav-item", era: "38px (ícone 18 + padding 20)" },
];

describe("alvo de toque na faixa do workspace", () => {
  for (const { seletor, era } of SO_O_ICONE) {
    it(`${seletor} tem 44px de LARGURA no celular (media ${era})`, () => {
      const decl = declaracoesNaFaixa(seletor);
      expect(decl, `${seletor} não é tocado pela faixa de 900px`).not.toBe("");
      expect(decl.replace(/\s+/g, ""), `${seletor} media ${era}`).toContain("min-width:var(--tap)");
    });
  }

  it("a regra não mora em dois lugares: nenhum shell repete o min-width inline", () => {
    const repetem: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        if (nome === "node_modules" || nome === ".next" || nome.startsWith(".")) continue;
        const full = join(dir, nome);
        if (statSync(full).isDirectory()) varrer(full);
        else if (/\.tsx?$/.test(nome)) {
          const t = readFileSync(full, "utf8");
          if (t.includes("ws-exit") && /minWidth:\s*"var\(--tap\)"/.test(t)) {
            repetem.push(relative(RAIZ, full));
          }
        }
      }
    };
    varrer(join(RAIZ, "app"));
    expect(repetem, "o alvo de 44px do `.ws-exit` é da fundação (app/globals.css)").toEqual([]);
  });
});
