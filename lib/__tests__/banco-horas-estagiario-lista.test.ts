import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// `bancoDeTodos` remonta o objeto da pessoa campo a campo antes de chamar o
// cálculo. Quando `estagiario` ficou de fora dessa lista, a regra continuou
// existindo e passando nos testes de unidade (que usam `bancoDaPessoa`), mas a
// LISTA — a que alimenta a folha e o painel do ponto — dava hora extra a
// estagiário. Só a tela mostrava o defeito. Esta é a trava.
const FONTE = readFileSync(new URL("../banco-horas.ts", import.meta.url), "utf8");

describe("a lista da equipe carrega a marca de estágio", () => {
  it("bancoDeTodos repassa `estagiario` para o cálculo", () => {
    const chamada = /calcBanco\(\{([^}]*)\}/.exec(FONTE);
    expect(chamada, "a chamada de calcBanco dentro de bancoDeTodos sumiu").toBeTruthy();
    expect(chamada![1]).toContain("estagiario: p.estagiario");
  });
});
