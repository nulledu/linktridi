import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AdicionarPelaUrl } from "../AdicionarPelaUrl";
import type { Produto } from "@/lib/lojas";

const produto = (extra: Partial<Produto> = {}) => ({
  id: "p1", titulo: "Carimbo automático", descricao: "", preco: 89.9, precoPromocional: null,
  custo: null, estoque: null, status: "ativo", imagens: [], ...extra,
} as unknown as Produto);

const CHAVE = "vt-carrinho:loja-1";
beforeEach(() => { localStorage.clear(); });
afterEach(cleanup);

// O carrinho mora no localStorage do visitante: nenhum link escreve nele de
// fora. O botão de compra da central manda o pedido na URL e a vitrine é quem
// adiciona ao abrir — sem isso, "comprar" só levaria à página do produto.
describe("comprar por link (?add=)", () => {
  it("põe o produto na sacola e limpa a URL", async () => {
    window.history.replaceState(null, "", "/l/loja/carrinho?add=p1");
    render(<AdicionarPelaUrl lojaId="loja-1" produtos={[produto()]} />);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(CHAVE) ?? "[]")).toHaveLength(1));
    const [item] = JSON.parse(localStorage.getItem(CHAVE)!);
    expect(item).toMatchObject({ produtoId: "p1", quantidade: 1, precoUnitario: 89.9 });
    // Recarregar não pode somar de novo, e o endereço copiado não leva pedido.
    expect(window.location.search).toBe("");
  });

  it("produto inexistente ou fora do ar não vira item", async () => {
    window.history.replaceState(null, "", "/l/loja/carrinho?add=fantasma");
    render(<AdicionarPelaUrl lojaId="loja-1" produtos={[produto({ status: "inativo" })]} />);
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(localStorage.getItem(CHAVE)).toBeNull();
  });

  it("sem `add` na URL não mexe no carrinho", () => {
    window.history.replaceState(null, "", "/l/loja/carrinho");
    localStorage.setItem(CHAVE, JSON.stringify([{ produtoId: "x", titulo: "Outro", quantidade: 2, precoUnitario: 10 }]));
    render(<AdicionarPelaUrl lojaId="loja-1" produtos={[produto()]} />);
    expect(JSON.parse(localStorage.getItem(CHAVE)!)).toHaveLength(1);
  });
});
