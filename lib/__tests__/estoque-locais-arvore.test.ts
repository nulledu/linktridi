import { describe, it, expect } from "vitest";
import {
  acharPorCodigo, caminhoDe, descendentesDe, filhosDe, type LocalDaArvore,
} from "@/lib/estoque-locais-arvore";

// O que este arquivo trava: a página pública /g/<codigo> é aberta por QUALQUER
// celular que aponte pro QR da prateleira, sem login. As duas falhas que ela
// não pode ter: (1) o código impresso não achar a linha por diferença de caixa
// — o índice do banco é em lower(codigo), a busca daqui tem que espelhar; e
// (2) dado sujo no pai_id (um ciclo A→B→A) virar loop infinito servindo
// request público — as caminhadas param, nunca rodam pra sempre.

const local = (
  id: string, codigo: string, pai: string | null = null, extra: Partial<LocalDaArvore> = {},
): LocalDaArvore => ({ id, nome: `Nome ${id}`, codigo, pai_id: pai, ...extra });

// Rua C › Estante Cinza › Nível 1/Nível 2, mais uma Rua D vazia.
const GALPAO: LocalDaArvore[] = [
  local("rua-c", "RUA-C"),
  local("est-cinza", "EST-CZ", "rua-c"),
  local("n1", "EST-CZ-N1", "est-cinza", { ordem: 1 }),
  local("n2", "EST-CZ-N2", "est-cinza", { ordem: 2 }),
  local("rua-d", "RUA-D"),
];

describe("acharPorCodigo casa como o índice do banco (lower)", () => {
  it("ignora caixa e espaço nas pontas", () => {
    expect(acharPorCodigo("rua-c", GALPAO)?.id).toBe("rua-c");
    expect(acharPorCodigo("  RUA-C  ", GALPAO)?.id).toBe("rua-c");
    expect(acharPorCodigo("Est-Cz-N2", GALPAO)?.id).toBe("n2");
  });

  it("código desconhecido ou vazio é null, nunca um chute", () => {
    expect(acharPorCodigo("RUA-Z", GALPAO)).toBeNull();
    expect(acharPorCodigo("", GALPAO)).toBeNull();
    expect(acharPorCodigo("   ", GALPAO)).toBeNull();
  });
});

describe("descendentesDe é o `in (...)` da consulta de itens", () => {
  it("inclui o próprio lugar e tudo abaixo", () => {
    expect(descendentesDe("rua-c", GALPAO).sort()).toEqual(["est-cinza", "n1", "n2", "rua-c"]);
  });

  it("folha devolve só ela mesma; irmão não entra", () => {
    expect(descendentesDe("n1", GALPAO)).toEqual(["n1"]);
    expect(descendentesDe("rua-d", GALPAO)).toEqual(["rua-d"]);
  });
});

describe("caminhoDe monta o cabeçalho Rua › Móvel › Nível", () => {
  it("vai do topo até o lugar, nessa ordem", () => {
    expect(caminhoDe("n2", GALPAO).map((l) => l.id)).toEqual(["rua-c", "est-cinza", "n2"]);
  });

  it("raiz é caminho de um; id inexistente é caminho vazio", () => {
    expect(caminhoDe("rua-c", GALPAO).map((l) => l.id)).toEqual(["rua-c"]);
    expect(caminhoDe("fantasma", GALPAO)).toEqual([]);
  });
});

describe("filhosDe lista as prateleiras na ordem da aba Localização", () => {
  it("ordem primeiro, nome como desempate", () => {
    const bagunca: LocalDaArvore[] = [
      local("pai", "PAI"),
      local("b", "B", "pai", { ordem: 2, nome: "Beta" }),
      local("a", "A", "pai", { ordem: 1, nome: "Alfa" }),
      local("c", "C", "pai", { ordem: 1, nome: "Zeta" }),
    ];
    expect(filhosDe("pai", bagunca).map((l) => l.id)).toEqual(["a", "c", "b"]);
  });
});

// A parte que protege a página pública: pai_id sujo NÃO pode travar o servidor.
describe("ciclo de pai_id não vira loop infinito", () => {
  const CICLO: LocalDaArvore[] = [
    local("a", "A", "b"),          // A aponta pra B…
    local("b", "B", "a"),          // …e B aponta de volta pra A.
    local("c", "C", "a"),
    local("solto", "SOLTO", "solto"), // pai de si mesmo (o banco recusa, mas SQL na mão não)
  ];

  it("descendentesDe termina e não repete ninguém", () => {
    const ids = descendentesDe("a", CICLO);
    expect(ids.sort()).toEqual(["a", "b", "c"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("caminhoDe para onde a repetição começaria", () => {
    const caminho = caminhoDe("c", CICLO).map((l) => l.id);
    // c → a → b, e o próximo passo seria o `a` de novo: para ali.
    expect(caminho).toEqual(["b", "a", "c"]);
  });

  it("pai de si mesmo não se lista como filho nem se repete no caminho", () => {
    expect(descendentesDe("solto", CICLO)).toEqual(["solto"]);
    expect(caminhoDe("solto", CICLO).map((l) => l.id)).toEqual(["solto"]);
    expect(filhosDe("solto", CICLO)).toEqual([]);
  });
});
