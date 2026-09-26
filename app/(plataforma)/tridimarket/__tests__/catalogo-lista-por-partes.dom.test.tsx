import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProdutosClient } from "../produtos/ProdutosClient";
import type { MarketProduct } from "../../../../lib/tridimarket/types";

// O catálogo do mercadinho passou de 500 itens. Montando todo mundo de uma vez
// a tela chegava a 20 mil nós de DOM e trocar de categoria segurava o clique
// por ~450ms num Mac (medido no /dev-tridimarket?produtos=600) — no celular da
// loja, muito mais. A lista passou a montar por partes.
//
// O risco desta mudança é ela virar o filtro que a gente acabou de tirar: algo
// que ESCONDE produto e faz parecer que sumiu. Por isso o contrato testado
// aqui é o inverso — busca e filtros varrem o catálogo INTEIRO, e o corte é só
// de quantas linhas nascem montadas. Um produto lá no fim da lista precisa
// aparecer ao ser buscado, mesmo sem ninguém ter clicado em "Mostrar mais".

const PAGINA = 60;

const catalogo = (n: number): MarketProduct[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    companyId: 0,
    barcode: String(7890000000000 + i),
    name: `Produto ${String(i + 1).padStart(3, "0")}`,
    price: 3,
    imageUrl: null,
    categoryId: null,
    categoryName: null,
    active: true,
    stock: 10,
    minimumStock: 5,
    allowStockOverride: true,
    semCodigo: false,
    ocultoBusca: false,
    unidades: ["u1"],
  } as MarketProduct));

// 61 e não 200 de propósito: o contrato é "a primeira página tem PAGINA, o
// resto vem depois", e um item além da página basta pra provar isso. Com 200 o
// teste montava 120 linhas em jsdom e estourava os 5s do vitest quando a suíte
// cheia disputava CPU — passava sozinho e quebrava junto, que é o pior tipo de
// teste. Aumentar o timeout esconderia o custo em vez de tirá-lo.
const PRODUTOS = catalogo(PAGINA + 1);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const dados = String(url).includes("/products")
      ? PRODUTOS
      : String(url).includes("/settings")
        ? { profiles: [{ id: "u1", name: "Mercadinho" }], schemaReady: true }
        : String(url).includes("/unidades")
          ? [{ id: "u1", nome: "Mercadinho", ativo: true }]
          : { ok: true };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, data: dados }) } as Response);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const linhasNaTela = () =>
  screen.queryAllByRole("button", { name: /Ajustar estoque/i }).length;

describe("TridiMarket · catálogo grande monta por partes", () => {
  it("nasce com um pedaço, não com o catálogo inteiro", async () => {
    render(<ProdutosClient />);
    await screen.findByText("Produto 001");
    await waitFor(() => expect(linhasNaTela()).toBe(PAGINA));
  });

  it("diz quantos faltam e abre mais ao clicar", async () => {
    render(<ProdutosClient />);
    await screen.findByText("Produto 001");

    const mais = await screen.findByRole("button", { name: /Mostrar mais 1 produto$/ });
    fireEvent.click(mais);

    await waitFor(() => expect(linhasNaTela()).toBe(PRODUTOS.length));
  });

  it("a busca alcança um produto que está fora do pedaço montado", async () => {
    render(<ProdutosClient />);
    await screen.findByText("Produto 001");

    // O 061 é o único que sobra fora das 60 linhas montadas: se a busca
    // varresse só o que está na tela, ele seria inalcançável — o bug que a
    // gente acabou de tirar da tela, voltando por outra porta.
    const ultimo = `Produto ${String(PRODUTOS.length).padStart(3, "0")}`;
    expect(screen.queryByText(ultimo)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Buscar produto/), { target: { value: ultimo } });

    await waitFor(() => expect(screen.getByText(ultimo)).toBeInTheDocument());
    expect(linhasNaTela()).toBe(1);
  });

  it("trocar de filtro recomeça do primeiro pedaço", async () => {
    render(<ProdutosClient />);
    await screen.findByText("Produto 001");
    fireEvent.click(await screen.findByRole("button", { name: /Mostrar mais/ }));
    await waitFor(() => expect(linhasNaTela()).toBe(PRODUTOS.length));

    // "Produto" casa com todos: se o limite não voltasse ao início, a tela
    // seguiria com as 61 linhas já abertas.
    fireEvent.change(screen.getByPlaceholderText(/Buscar produto/), { target: { value: "Produto" } });
    await waitFor(() => expect(linhasNaTela()).toBe(PAGINA));
  });
});
