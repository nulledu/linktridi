import { describe, expect, it } from "vitest";
import { tipoPorRegras, type RegraClassificacao } from "../marketing-config";

// Regra pronta com os campos chatos preenchidos — cada teste muda só o que importa.
const R = (o: Partial<RegraClassificacao>): RegraClassificacao =>
  ({ id: "x", campo: "produto", operador: "igual", valor: "", tipo: "trafego", ativa: true, ...o });

describe("classificação de venda por regras", () => {
  it("casa produto ignorando acento e caixa", () => {
    expect(tipoPorRegras([R({ valor: "Chancela", tipo: "comercial" })], { produtos: ["CHANCELA"] })).toBe("comercial");
  });

  it("'contém' pega parte do nome; 'igual' não", () => {
    const alvo = { produtos: ["Carimbo 16cm2 - Todas Embalagens"] };
    expect(tipoPorRegras([R({ operador: "contem", valor: "carimbo" })], alvo)).toBe("trafego");
    expect(tipoPorRegras([R({ operador: "igual", valor: "carimbo" })], alvo)).toBeNull();
  });

  it("a PRIMEIRA regra que casa decide (a ordem é a prioridade)", () => {
    const regras = [R({ valor: "chancela", tipo: "comercial" }), R({ valor: "chancela", tipo: "trafego" })];
    expect(tipoPorRegras(regras, { produtos: ["Chancela"] })).toBe("comercial");
  });

  it("regra desligada não vale", () => {
    expect(tipoPorRegras([R({ valor: "chancela", tipo: "comercial", ativa: false })], { produtos: ["Chancela"] })).toBeNull();
  });

  it("pedido com vários itens casa se QUALQUER item casar", () => {
    // Um pedido misto (carimbo + chancela) precisa cair na regra da chancela.
    expect(tipoPorRegras([R({ valor: "chancela", tipo: "comercial" })], { produtos: ["Carimbo", "Chancela"] })).toBe("comercial");
  });

  it("classifica por categoria, UTM e origem", () => {
    expect(tipoPorRegras([R({ campo: "categoria", valor: "9", tipo: "comercial" })], { categorias: ["9", "1"] })).toBe("comercial");
    expect(tipoPorRegras([R({ campo: "utm", operador: "contem", valor: "black" })], { utm: "BlackFriday2026" })).toBe("trafego");
    expect(tipoPorRegras([R({ campo: "origem", valor: "Vega Checkout" })], { origem: "Vega Checkout" })).toBe("trafego");
  });

  it("sem regra que case, devolve null (a venda cai no tipo da ORIGEM)", () => {
    expect(tipoPorRegras([], { produtos: ["X"] })).toBeNull();
    expect(tipoPorRegras([R({ valor: "" })], { produtos: [""] })).toBeNull();   // valor vazio não casa com tudo
    expect(tipoPorRegras([R({ valor: "x" })], {})).toBeNull();                  // pedido sem itens não quebra
  });
});
