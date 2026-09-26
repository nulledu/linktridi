import { describe, it, expect } from "vitest";
import {
  MAX_POR_MUDANCA, problemaDaMudancaDeLugar, fraseDeProdutos, fraseDeGuardar,
  comDescendentes, contarComDescendentes, filhosPorPai,
} from "../estoque-lugar-dos-itens";

/**
 * A régua de "onde este produto mora".
 *
 * O que se trava aqui é o modo de errar que NÃO dá sinal: mover o catálogo
 * inteiro pra uma prateleira mantém todo número certo — saldo, contagem,
 * histórico — e só o endereço passa a mentir. Ninguém descobre até ir buscar.
 */

describe("o que impede a mudança", () => {
  it("lista vazia não é mudança", () => {
    expect(problemaDaMudancaDeLugar([])).toMatch(/ao menos um/);
  });

  it("uma mudança normal passa", () => {
    expect(problemaDaMudancaDeLugar(["a", "b", "c"])).toBeNull();
  });

  it("no teto ainda passa; um a mais é recusado com o PORQUÊ", () => {
    const noTeto = Array.from({ length: MAX_POR_MUDANCA }, (_, i) => `i${i}`);
    expect(problemaDaMudancaDeLugar(noTeto)).toBeNull();
    const problema = problemaDaMudancaDeLugar([...noTeto, "sobra"]);
    expect(problema).toMatch(/selecionar todos/);
    // A frase explica o custo do engano, não só o número: é o que faz alguém
    // parar pra conferir em vez de dividir em dois lotes e seguir errado.
    expect(problema).toMatch(/não dá sinal/);
  });

  it("id repetido é recusado — a contagem devolvida mentiria", () => {
    // "Movi 5" quando a pessoa marcou 7 é pior que um erro: ela vai embora
    // achando que guardou tudo.
    expect(problemaDaMudancaDeLugar(["a", "b", "a"])).toMatch(/repetidos/);
  });

  it("entrada que não é lista não estoura", () => {
    expect(problemaDaMudancaDeLugar(null as never)).toMatch(/ao menos um/);
  });
});

describe("a árvore: um lugar é o que está nele MAIS o que está abaixo", () => {
  // A forma real do galpão: Rua → Módulo → Nível, e as peças nas FOLHAS.
  const LUGARES = [
    { id: "E", pai_id: null },
    { id: "E-01", pai_id: "E" },
    { id: "E-02", pai_id: "E" },
    { id: "E-02-5", pai_id: "E-02" },
    { id: "A", pai_id: null },
  ];

  it("desce a árvore inteira, incluindo o próprio lugar", () => {
    const f = filhosPorPai(LUGARES);
    expect([...comDescendentes("E", f)].sort()).toEqual(["E", "E-01", "E-02", "E-02-5"]);
    expect([...comDescendentes("E-02", f)].sort()).toEqual(["E-02", "E-02-5"]);
    expect([...comDescendentes("E-02-5", f)]).toEqual(["E-02-5"]);
  });

  it("A RUA conta o que está nos níveis dela — era o furo", () => {
    // Reproduz o caso medido: 5 produtos nos níveis da Rua E, e a árvore
    // mostrava "0 itens". Quem bipa a placa da rua conclui que o sistema
    // perdeu o estoque.
    const itens = [
      { local_id: "E-02-5" }, { local_id: "E-01" }, { local_id: "E-01" },
      { local_id: "E-01" }, { local_id: "E-02" },
    ];
    const c = contarComDescendentes(LUGARES, itens);
    expect(c.get("E")).toBe(5);
    expect(c.get("E-01")).toBe(3);
    expect(c.get("E-02")).toBe(2);   // o dele + o do nível abaixo
    expect(c.get("E-02-5")).toBe(1);
    expect(c.get("A")).toBe(0);      // rua vizinha não herda nada
  });

  it("item SEM lugar não entra em conta nenhuma", () => {
    const c = contarComDescendentes(LUGARES, [{ local_id: null }, { local_id: undefined }]);
    expect(c.get("E")).toBe(0);
  });

  it("CICLO não trava a tela", () => {
    // Dois PATCH separados fazem A virar pai de B e B virar pai de A — a API
    // não impede sozinha. Sem a guarda isso e um laço infinito, e a tela
    // inteira congela em vez de só desenhar torto.
    const ciclo = [{ id: "X", pai_id: "Y" }, { id: "Y", pai_id: "X" }];
    const f = filhosPorPai(ciclo);
    expect([...comDescendentes("X", f)].sort()).toEqual(["X", "Y"]);
    expect(contarComDescendentes(ciclo, [{ local_id: "Y" }]).get("X")).toBe(1);
  });

  it("lugar órfão (pai apagado por fora) não some da conta", () => {
    const orfao = [{ id: "Z", pai_id: "apagado" }];
    expect(contarComDescendentes(orfao, [{ local_id: "Z" }]).get("Z")).toBe(1);
  });
});

describe("as frases dizem o que vai acontecer", () => {
  it("singular e plural", () => {
    expect(fraseDeProdutos(1)).toBe("1 produto");
    expect(fraseDeProdutos(7)).toBe("7 produtos");
  });

  it("o botão sem nada marcado PEDE, em vez de dizer “Salvar”", () => {
    expect(fraseDeGuardar(0, "RUA-A-01")).toMatch(/Escolha/);
  });

  it("com itens marcados, o botão nomeia a quantidade E o destino", () => {
    // Ação que escreve endereço em coisa física: confirmar é ler o que vai
    // acontecer, não deduzir.
    expect(fraseDeGuardar(3, "RUA-A-01")).toBe("Guardar 3 produtos em RUA-A-01");
    expect(fraseDeGuardar(1, "B2")).toBe("Guardar 1 produto em B2");
  });
});
