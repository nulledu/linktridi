import { describe, it, expect } from "vitest";
import {
  TIPOS_ETIQUETA, TIPO_ETIQUETA_PADRAO, mostraContagem, tipoDeEtiqueta, tipoDoItem,
} from "../estoque-etiqueta";

// ── Os dois tipos de etiqueta ────────────────────────────────────────────────
//
// O dono pediu dois tipos: "uma pra quando o produto tem mais de uma unidade
// por caixa/conjunto e uma quando é uma coisa só". O comportamento já
// acontecia por ACIDENTE (o selo era desenhado quando `quantidade > 1`), e o
// acidente errava nos dois casos que importam: a caixa de chancelas com UMA
// chancela dentro saía pelada, e não havia como declarar que uma chapa nunca é
// caixa.

describe("tipoDeEtiqueta — o padrão é a peça avulsa", () => {
  it("lê 'caixa' quando é caixa", () => {
    expect(tipoDeEtiqueta("caixa")).toBe("caixa");
  });

  it("nulo, ausente e lixo caem no padrão — nunca em undefined", () => {
    // É o que dispensa preencher os 192 itens à mão: item nenhum tem a coluna
    // preenchida hoje e todos continuam se comportando exatamente como antes.
    expect(tipoDeEtiqueta(null)).toBe("unica");
    expect(tipoDeEtiqueta(undefined)).toBe("unica");
    expect(tipoDeEtiqueta("")).toBe("unica");
    expect(tipoDeEtiqueta("pallet")).toBe("unica");
    expect(tipoDeEtiqueta(7)).toBe("unica");
    expect(TIPO_ETIQUETA_PADRAO).toBe("unica");
  });

  it("o tipo vem do ITEM, e o item sem coluna é peça avulsa", () => {
    expect(tipoDoItem({ etiqueta_tipo: "caixa" })).toBe("caixa");
    expect(tipoDoItem({})).toBe("unica");
    expect(tipoDoItem(null)).toBe("unica");
  });

  it("as duas opções da tela têm ícone do Tabler e explicam o efeito", () => {
    expect(TIPOS_ETIQUETA.map((t) => t.key)).toEqual(["unica", "caixa"]);
    for (const t of TIPOS_ETIQUETA) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.efeito.length).toBeGreaterThan(0);
      // Nada de emoji fazendo papel de ícone — a regra do projeto.
      expect(t.icone).toMatch(/^[a-z-]+$/);
    }
  });
});

describe("mostraContagem — o tipo decide o caso do 1, e só ele", () => {
  it("CAIXA escreve o número mesmo quando tem uma peça dentro", () => {
    // É o pedido do dono na letra: "caixa de chancelas: número de unidades
    // presentes na caixa". Uma caixa lacrada com uma chancela dentro continua
    // sendo um lacre, e quem a pega não tem como conferir sem rompê-lo.
    expect(mostraContagem({ tipo: "caixa", quantidade: 1 })).toBe(true);
    expect(mostraContagem({ tipo: "caixa", quantidade: 100 })).toBe(true);
  });

  it("PEÇA ÚNICA não escreve '1 un'", () => {
    // Um campo que repete o mesmo valor em quase toda etiqueta para de ser
    // lido — e aí o dia em que ele diz 50 passa batido.
    expect(mostraContagem({ tipo: "unica", quantidade: 1 })).toBe(false);
    expect(mostraContagem({ quantidade: 1 })).toBe(false);
    expect(mostraContagem({})).toBe(false);
  });

  it("PEÇA ÚNICA ainda assim NUNCA esconde uma quantidade de verdade", () => {
    // A trava. "Peça única" quer dizer "não invente um 1 un", não "esconda o
    // número": se uma etiqueta de chapa vier valendo 4, a pilha tem 4 peças e o
    // papel precisa dizer isso. Informação que existe na prateleira e não
    // existe no papel é como inventário fecha errado.
    expect(mostraContagem({ tipo: "unica", quantidade: 4 })).toBe(true);
  });

  it("etiqueta antiga (sem coluna de quantidade, sem tipo) segue sem selo", () => {
    expect(mostraContagem({ quantidade: null })).toBe(false);
    expect(mostraContagem({ quantidade: undefined, tipo: null })).toBe(false);
  });
});
