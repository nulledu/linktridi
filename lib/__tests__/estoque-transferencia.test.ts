import { describe, it, expect } from "vitest";
import {
  montarLugares, semLugar, precisaPerguntarLugar, quantoTirarDoLugar,
  problemaDaTransferencia, fraseDoErroDeTransferencia, MAX_POR_TRANSFERENCIA,
} from "../estoque-transferencia";

const ARVORE = [
  { id: "rua-c", nome: "Rua C", codigo: "RUA-C", pai_id: null },
  { id: "mov-1", nome: "Estante Cinza", codigo: "EC", pai_id: "rua-c" },
  { id: "niv-2", nome: "Nível 2", codigo: "EC-2", pai_id: "mov-1" },
  { id: "rua-e", nome: "Rua E", codigo: "RUA-E", pai_id: null },
];

describe("montarLugares", () => {
  it("traz nome e caminho do topo até o lugar, ordenado por saldo", () => {
    const lugares = montarLugares(
      [{ local_id: "niv-2", quantidade: 5 }, { local_id: "rua-e", quantidade: 30 }],
      ARVORE,
    );
    expect(lugares).toEqual([
      { id: "rua-e", nome: "Rua E", caminho: "Rua E", quantidade: 30 },
      { id: "niv-2", nome: "Nível 2", caminho: "Rua C › Estante Cinza › Nível 2", quantidade: 5 },
    ]);
  });
  it("lugar que sumiu da árvore não derruba a lista — sai com o id como nome", () => {
    const lugares = montarLugares([{ local_id: "fantasma", quantidade: 2 }], ARVORE);
    expect(lugares[0].quantidade).toBe(2);
    expect(lugares[0].nome).toBeTruthy();
  });
});

describe("semLugar", () => {
  it("é o total menos o alocado, nunca negativo", () => {
    const lugares = [{ id: "a", nome: "A", caminho: "A", quantidade: 30 }];
    expect(semLugar(50, lugares)).toBe(20);
    expect(semLugar(10, lugares)).toBe(0);
  });
});

describe("precisaPerguntarLugar", () => {
  it("só com 2 ou mais lugares", () => {
    const l = (n: number) => Array.from({ length: n }, (_, i) =>
      ({ id: `l${i}`, nome: `L${i}`, caminho: `L${i}`, quantidade: 1 }));
    expect(precisaPerguntarLugar(l(0))).toBe(false);
    expect(precisaPerguntarLugar(l(1))).toBe(false);
    expect(precisaPerguntarLugar(l(2))).toBe(true);
  });
});

describe("quantoTirarDoLugar", () => {
  it("nunca tira mais do que o lugar tem — o resto sai do balde sem-lugar", () => {
    const lugares = [{ id: "a", nome: "A", caminho: "A", quantidade: 3 }];
    expect(quantoTirarDoLugar(lugares, "a", 10)).toBe(3);
    expect(quantoTirarDoLugar(lugares, "a", 2)).toBe(2);
    expect(quantoTirarDoLugar(lugares, "b", 2)).toBe(0);
  });
});

describe("problemaDaTransferencia", () => {
  const lugares = [
    { id: "a", nome: "Rua A", caminho: "Rua A", quantidade: 30 },
    { id: "b", nome: "Rua B", caminho: "Rua B", quantidade: 20 },
  ];
  const base = { total: 60, lugares, deLocalId: "a", paraLocalId: "b", quantidade: 5 };
  it("transferência válida passa", () => {
    expect(problemaDaTransferencia(base)).toBeNull();
  });
  it("quantidade tem que ser inteiro positivo dentro do limite", () => {
    expect(problemaDaTransferencia({ ...base, quantidade: 0 })).toMatch(/quantidade/i);
    expect(problemaDaTransferencia({ ...base, quantidade: 2.5 })).toMatch(/quantidade/i);
    expect(problemaDaTransferencia({ ...base, quantidade: MAX_POR_TRANSFERENCIA + 1 }))
      .toMatch(/limite/i);
  });
  it("origem igual ao destino não anda", () => {
    expect(problemaDaTransferencia({ ...base, paraLocalId: "a" })).toMatch(/mesmo lugar/i);
  });
  it("sem destino nenhum e sem origem nenhuma não é transferência", () => {
    expect(problemaDaTransferencia({ ...base, deLocalId: null, paraLocalId: null }))
      .toMatch(/lugar/i);
  });
  it("origem sem saldo suficiente explica com números", () => {
    const p = problemaDaTransferencia({ ...base, deLocalId: "b", paraLocalId: "a", quantidade: 25 });
    expect(p).toMatch(/20/);
  });
  it("do balde sem-lugar só sai o que está no balde", () => {
    // total 60, alocado 50 → sem lugar = 10
    expect(problemaDaTransferencia({ ...base, deLocalId: null, quantidade: 10 })).toBeNull();
    expect(problemaDaTransferencia({ ...base, deLocalId: null, quantidade: 11 }))
      .toMatch(/sem lugar/i);
  });
});

describe("fraseDoErroDeTransferencia", () => {
  it("traduz os códigos da função SQL em frase", () => {
    expect(fraseDoErroDeTransferencia("saldo_insuficiente_na_origem")).toMatch(/origem/i);
    expect(fraseDoErroDeTransferencia("qualquer_outra_coisa")).toMatch(/transferir/i);
  });
});
