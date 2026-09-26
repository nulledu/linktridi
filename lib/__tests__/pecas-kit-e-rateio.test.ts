// Duas regras da contagem de peças dos cards da Vega/Yampi que já mostraram
// número errado no painel, medidas nos pedidos reais do ERP (set/26).
//
// 1. KIT É UMA VENDA. O ERP explode o "KIT 4 PALAVRAS AFETIVAS" (produto_id
//    293) em 4 linhas, uma por palavra escolhida (`opcao_nome` = Fé, Sorte,
//    Sucesso, Amor), cada uma a R$ 9,47 — um quarto dos R$ 37,88 do kit. O card
//    contava linha e mostrava "8 Kit Palavras Afetivas" onde o cliente comprou
//    2 kits. Em 60 dias de Yampi: 14 pedidos com o kit, TODOS com exatamente 4
//    linhas, nunca outro número.
//
// 2. O FATURAMENTO DA PEÇA É RATEADO, não é soma de preço de item. O pedido
//    73145 fechou R$ 242,90 com uma chancela de R$ 162,70: frete/taxa moram só
//    no total. Somando item, a participação das peças nunca fecharia com o
//    faturamento mostrado no mesmo card.

import { describe, it, expect } from "vitest";
import { contarPecas, type ItemRow } from "@/lib/plataforma-vendas";
import { DEFAULT_PECAS } from "@/lib/marketing-config";

const item = (pedido_id: number, nome: string, preco: number): ItemRow => ({
  pedido_id, nome, preco, cat_prod_id: 1, decorativo: null, item_complementar: null,
});

describe("contagem de peças", () => {
  it("conta o kit de 4 palavras como 1 unidade, não como 4 linhas", () => {
    // Pedido 73144 real: carimbo + 3 decorativos + as 4 linhas do kit + letreiro.
    const itens = [
      item(73144, "Carimbo 16cm2 - Para Todas Embalagens", 97.9),
      item(73144, "Carimbo Rede Social(Brinde)", 0),
      item(73144, "Carimbo Decorativo", 13.72),
      item(73144, "Carimbo Decorativo", 13.72),
      item(73144, "Carimbo Decorativo", 13.72),
      item(73144, "KIT 4 PALAVRAS AFETIVAS", 9.47),
      item(73144, "KIT 4 PALAVRAS AFETIVAS", 9.47),
      item(73144, "KIT 4 PALAVRAS AFETIVAS", 9.47),
      item(73144, "KIT 4 PALAVRAS AFETIVAS", 9.47),
      item(73144, "Letreiro de Mesa 3D", 77.9),
    ];
    const { pecas } = contarPecas(itens, new Map([[73144, 210.7]]), DEFAULT_PECAS);
    const kit = pecas.find((p) => p.id === "palavrasafetivas")!;
    expect(kit.qtd).toBe(1);
    // As outras não mudam: carimbo decorativo continua fora, brinde também.
    expect(pecas.find((p) => p.id === "carimbo")!.qtd).toBe(1);
    expect(pecas.find((p) => p.id === "letreiro3d")!.qtd).toBe(1);
  });

  it("dois kits no mesmo pedido são 2, não 8", () => {
    const itens = Array.from({ length: 8 }, () => item(1, "KIT 4 PALAVRAS AFETIVAS", 9.47));
    const { pecas } = contarPecas(itens, new Map([[1, 75.76]]), DEFAULT_PECAS);
    expect(pecas.find((p) => p.id === "palavrasafetivas")!.qtd).toBe(2);
  });

  it("linha solta de dado sujo vira 1 unidade em vez de sumir", () => {
    const { pecas } = contarPecas([item(1, "KIT 4 PALAVRAS AFETIVAS", 9.47)], new Map([[1, 9.47]]), DEFAULT_PECAS);
    expect(pecas.find((p) => p.id === "palavrasafetivas")!.qtd).toBe(1);
  });

  it("peças + outros fecham com o faturamento do checkout", () => {
    // Chancela de 162,70 num pedido que fechou 242,90: os 80,20 de diferença
    // não podem virar faturamento da chancela nem sumir.
    const { pecas, outros } = contarPecas(
      [item(73145, "Chancela MDF", 162.7)],
      new Map([[73145, 242.9]]),
      DEFAULT_PECAS,
    );
    const chancela = pecas.find((p) => p.id === "chancela")!;
    // Item único e pago: leva o checkout inteiro, e nada sobra pra "outros".
    expect(chancela.valor).toBe(242.9);
    expect(outros).toBe(0);
  });

  it("item que não é peça acompanhada leva a fatia dele pra outros", () => {
    const itens = [item(2, "Chancela MDF", 50), item(2, "Almofada Econômica", 50)];
    const { pecas, outros } = contarPecas(itens, new Map([[2, 100]]), DEFAULT_PECAS);
    expect(pecas.find((p) => p.id === "chancela")!.valor).toBe(50);
    expect(outros).toBe(50);
    const soma = pecas.reduce((s, p) => s + p.valor, 0) + outros;
    expect(soma).toBe(100);
  });

  it("pedido com valor só no total divide o checkout entre os itens", () => {
    const itens = [item(3, "Chancela MDF", 0), item(3, "Letreiro de Mesa 3D", 0)];
    const { pecas, outros } = contarPecas(itens, new Map([[3, 200]]), DEFAULT_PECAS);
    expect(pecas.find((p) => p.id === "chancela")!.valor).toBe(100);
    expect(pecas.find((p) => p.id === "letreiro3d")!.valor).toBe(100);
    expect(outros).toBe(0);
  });
});
