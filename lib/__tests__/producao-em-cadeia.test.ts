import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  explodirNecessidades, decidirCadeia, dispensaVale, fraseDeOrigem, materialNaoTrava, baixaPelaFicha,
} from "../producao-em-cadeia";

// Chancela precisa de 1 folha; folha precisa de 2 borrachas.
const FICHA = new Map([
  ["chancela", [{ componenteId: "folha", nome: "Folha", quantidade: 1 }]],
  ["folha", [{ componenteId: "borracha", nome: "Borracha", quantidade: 2 }]],
]);

describe("explodirNecessidades", () => {
  it("arredonda o TOTAL pra cima, com tolerância de float", () => {
    // 72 acolchoados × 0.013889 chapa = 1.000008 — ruído de float, é 1 chapa.
    const ficha = [{ componenteId: "chapa", nome: "Chapa", quantidade: 0.013889 }];
    expect(explodirNecessidades(72, ficha, new Map())[0].necessario).toBe(1);
    expect(explodirNecessidades(80, ficha, new Map())[0].necessario).toBe(2);
  });
  it("falta = necessário − saldo, nunca negativa", () => {
    const ficha = [{ componenteId: "x", nome: "X", quantidade: 2 }];
    const r = explodirNecessidades(10, ficha, new Map([["x", 15]]));
    expect(r[0]).toMatchObject({ necessario: 20, falta: 5 });
    const sobra = explodirNecessidades(10, ficha, new Map([["x", 100]]));
    expect(sobra[0].falta).toBe(0);
  });
});

describe("decidirCadeia", () => {
  const base = {
    fichas: FICHA,
    saldos: new Map([["folha", 0], ["borracha", 100]]),
    produziveis: new Set(["chancela", "folha"]),
  };
  it("com material pra tudo, o pai nasce pendente e sem filhos", () => {
    const r = decidirCadeia("chancela", 10, { ...base, saldos: new Map([["folha", 50]]) });
    expect(r.estado).toBe("pendente");
    expect(r.filhos).toEqual([]);
    expect(r.esperas).toEqual([]);
  });
  it("item SEM FICHA é marcado — silêncio de cadastro não é 'tem material'", () => {
    // Era o buraco que mandou "Produzir Folha de borracha A4" pro tablet com
    // zero rolo de borracha no estoque: sem ficha, o motor não achava
    // componente nenhum e concluía que não faltava nada.
    const r = decidirCadeia("avulso", 10, base);
    expect(r.semFicha).toBe(true);
    expect(r.esperas).toEqual([]);   // não é falta de material: é falta de cadastro
    // O estado segue `pendente` de propósito: como FILHO essa ordem é o
    // trabalho de cortar o insumo e tem que cair na bancada. Quem para é a
    // raiz, e quem para é o motor (ver a trava do arquivo lá embaixo).
    expect(r.estado).toBe("pendente");
  });
  it("falta componente produzível+ativado → pai aguardando, filho criado com a falta", () => {
    const r = decidirCadeia("chancela", 10, base);
    expect(r.estado).toBe("aguardando_material");
    expect(r.esperas).toEqual([{ itemId: "folha", nome: "Folha", falta: 10 }]);
    expect(r.filhos).toEqual([{ itemId: "folha", nome: "Folha", quantidade: 10 }]);
  });
  it("o filho também é verificado (recursão): borracha em falta trava a folha", () => {
    const r = decidirCadeia("chancela", 10, { ...base, saldos: new Map([["folha", 0], ["borracha", 0]]) });
    const folha = r.filhos.find((f) => f.itemId === "folha");
    expect(folha).toBeTruthy();
    expect(r.decisoesFilhos.get("folha")?.estado).toBe("aguardando_material");
    // borracha não é produzível no contexto (não está em produziveis? está não —
    // produziveis = chancela, folha) → vira compra do filho
    expect(r.decisoesFilhos.get("folha")?.esperas).toEqual([{ itemId: "borracha", nome: "Borracha", falta: 20 }]);
    expect(r.decisoesFilhos.get("folha")?.comprar).toEqual([{ itemId: "borracha", nome: "Borracha", falta: 20 }]);
  });
  it("componente NÃO produzível em falta → espera sem filho (aviso de compra)", () => {
    const r = decidirCadeia("chancela", 10, { ...base, produziveis: new Set(["chancela"]) });
    expect(r.estado).toBe("aguardando_material");
    expect(r.filhos).toEqual([]);
    expect(r.comprar).toEqual([{ itemId: "folha", nome: "Folha", falta: 10 }]);
  });
  it("insumo produzível vira filho SEM depender do interruptor dele — quem autoriza é o pai", () => {
    // A regra antiga exigia "repor sozinho" ligado também no insumo, e parava
    // a cadeia das almofadas: "Base 11", "Tampa 11" e mais quatro peças têm
    // receita, o galpão corta, e viravam aviso de COMPRA porque ninguém tinha
    // ligado seis interruptores de peça. O contexto nem tem mais o conjunto.
    const r = decidirCadeia("chancela", 10, base);
    expect(r.filhos).toEqual([{ itemId: "folha", nome: "Folha", quantidade: 10 }]);
    expect(r.comprar).toEqual([]);
  });
  it("ciclo não roda pra sempre e não duplica ordem", () => {
    const fichas = new Map([
      ["a", [{ componenteId: "b", nome: "B", quantidade: 1 }]],
      ["b", [{ componenteId: "a", nome: "A", quantidade: 1 }]],
    ]);
    const r = decidirCadeia("a", 5, {
      fichas, saldos: new Map(), produziveis: new Set(["a", "b"]),
    });
    expect(r.filhos.length).toBeLessThanOrEqual(1);
    const b = r.decisoesFilhos.get("b");
    // b precisa de a, mas a já está na descida (visitados) → vira compra, não filho
    expect(b?.filhos ?? []).toEqual([]);
  });
});

describe("dispensaVale", () => {
  it("segura enquanto o saldo não caiu abaixo do saldo da dispensa", () => {
    expect(dispensaVale(10, 10)).toBe(true);
    expect(dispensaVale(12, 10)).toBe(true);
    expect(dispensaVale(9, 10)).toBe(false);
    expect(dispensaVale(10, null)).toBe(false);
    expect(dispensaVale(10, undefined)).toBe(false);
  });
});

describe("fraseDeOrigem", () => {
  it("explica a conta pra quem está na bancada", () => {
    const f = fraseDeOrigem(8, 20, 50);
    expect(f).toMatch(/8/);
    expect(f).toMatch(/20/);
    expect(f).toMatch(/50/);
  });
});

describe("MDF não trava a ordem", () => {
  it("reconhece a chapa pelo nome, com ou sem caixa", () => {
    expect(materialNaoTrava("Chapa de MDF Cru 6mm")).toBe(true);
    expect(materialNaoTrava("mdf 3mm pintado 1 face")).toBe(true);
    expect(materialNaoTrava("Rolo de borracha")).toBe(false);
    expect(materialNaoTrava("Tinta papel preta")).toBe(false);
    expect(materialNaoTrava(null)).toBe(false);
  });

  it("MDF em falta vira COMPRA, não espera — a ordem cai na bancada", () => {
    const ctx = {
      fichas: new Map([["caixa", [
        { componenteId: "mdf", nome: "Chapa de MDF Cru 6mm", quantidade: 1 },
      ]]]),
      saldos: new Map<string, number>([["mdf", 0]]),
      produziveis: new Set<string>(),
    };
    const r = decidirCadeia("caixa", 5, ctx);
    expect(r.estado).toBe("pendente");
    expect(r.esperas).toEqual([]);
    expect(r.comprar.map((c) => c.nome)).toEqual(["Chapa de MDF Cru 6mm"]);
  });

  it("mas outro material em falta ao lado do MDF ainda segura", () => {
    const ctx = {
      fichas: new Map([["peca", [
        { componenteId: "mdf", nome: "MDF 3mm", quantidade: 1 },
        { componenteId: "rolo", nome: "Rolo de borracha", quantidade: 1 },
      ]]]),
      saldos: new Map<string, number>(),
      produziveis: new Set<string>(),
    };
    const r = decidirCadeia("peca", 2, ctx);
    expect(r.estado).toBe("aguardando_material");
    expect(r.esperas.map((e) => e.nome)).toEqual(["Rolo de borracha"]);
  });
});

// A assimetria raiz × filho não é pura (mora no motor, que fala com o banco),
// então a trava é sobre o CÓDIGO — mesmo recurso de folha-mensal-tela.test.ts.
// Ela existe porque as duas metades já se atropelaram uma vez no mesmo dia:
// bloquear a raiz sem ficha resolveu "Folha de borracha A4 caiu sem rolo de
// borracha", e o mesmo bloqueio aplicado ao FILHO teria parado a cadeia do
// Puxador, que é a coisa que a cadeia existe pra fazer.
describe("motor: raiz sem ficha para, filho sem ficha anda", () => {
  const MOTOR = readFileSync(new URL("../requisicoes.ts", import.meta.url), "utf8");

  it("a raiz sem ficha não vira ordem", () => {
    expect(MOTOR).toContain("if (decisao.semFicha) {");
    expect(MOTOR).toContain('resultado: "sem_ficha"');
  });

  it("o filho sem ficha NÃO é pulado — a cadeia despacha o insumo", () => {
    expect(MOTOR).not.toContain("dFilho.semFicha");
  });
});


describe("baixaPelaFicha — o toggle 'desconta' da ficha", () => {
  const ficha = [
    { componenteId: "chapa", nome: "Chapa EVA", quantidade: 1 / 72, desconta: true },
    { componenteId: "cola", nome: "Cola", quantidade: 0.5, desconta: false },
    { componenteId: "parafuso", nome: "Parafuso", quantidade: 3 },   // sem toggle
  ];

  it("por padrão NADA desconta — só a linha ligada entra", () => {
    const b = baixaPelaFicha(80, ficha);
    expect(b.map((x) => x.nome)).toEqual(["Chapa EVA"]);
  });

  it("fração arredonda o TOTAL: 80 peças de 'rende 72' tiram 2 chapas", () => {
    expect(baixaPelaFicha(80, ficha)[0].quantidade).toBe(2);
    expect(baixaPelaFicha(72, ficha)[0].quantidade).toBe(1);   // 72 × 0.013889 = 1.000008 → 1
  });

  it("o que já saiu por bipe nesta atividade não sai de novo", () => {
    expect(baixaPelaFicha(80, ficha, new Set(["chapa"]))).toEqual([]);
  });

  it("zero aprovadas não tira nada", () => {
    expect(baixaPelaFicha(0, ficha)).toEqual([]);
  });
});
