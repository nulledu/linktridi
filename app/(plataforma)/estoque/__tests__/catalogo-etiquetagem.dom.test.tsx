import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { CatalogoClient } from "../CatalogoClient";

// Configurar 192 itens pra etiquetar era uma tarefa cega: `serializado` chegava
// da API e não era desenhado em lugar nenhum, então não dava pra saber que
// eram 0 de 192 nem retomar de onde parou — e o único caminho era abrir item
// por item, sete cliques e dois ciclos de modal cada. Este arquivo trava as
// três coisas que desfazem isso: o número, o filtro e o caminho em lote.

const ITENS = [
  { id: "a", nome: "Chapa MDF", hierarquia: "peca", produzido: false, serializado: true, categoria: "Madeira", imagem_url: null, unidade: "ch", quantidade: 5, qtd_minima: 0, ativo: true, sku: "PEC-0001" },
  { id: "b", nome: "Cavalete", hierarquia: "peca", produzido: false, serializado: false, categoria: "Madeira", imagem_url: null, unidade: "un", quantidade: 12, qtd_minima: 0, ativo: true, sku: null },
  { id: "c", nome: "Tampo", hierarquia: "peca", produzido: false, serializado: false, categoria: "Madeira", imagem_url: null, unidade: "un", quantidade: 0, qtd_minima: 0, ativo: true, sku: "PEC-0002" },
];

function stub(extra: Record<string, unknown> = {}) {
  return vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    const body = u.startsWith("/api/estoque-itens")
      ? { itens: ITENS, podeGerir: true, podeCadastrar: true, podeAjustar: true, podeVerCusto: false }
      : u.startsWith("/api/estoque/unidades/preparar")
        ? {
            ok: true,
            resultados: (JSON.parse(String(init?.body ?? "{}")).itens ?? []).map((i: { item_id: string; quantidade: number }) => ({
              item_id: i.item_id, nome: i.item_id, ok: true, geradas: i.quantidade, sku: "PEC-0003",
            })),
          }
        : extra;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
  });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("estoque.hierarquia", "peca"); // a aba é lembrada — ver useSticky
  vi.stubGlobal("fetch", stub());
});
afterEach(() => vi.unstubAllGlobals());

describe("Catálogo — dá pra ver onde a etiquetagem parou", () => {
  it("mostra o progresso da hierarquia e marca o card já etiquetado", async () => {
    render(<CatalogoClient />);

    expect(await screen.findByText(/1 de 3/)).toBeTruthy();
    // Um selo só: o item "a" é o único contado por etiqueta.
    await waitFor(() => expect(screen.getAllByText("etiqueta")).toHaveLength(1));
  });

  it("o filtro separa quem falta de quem já está pronto", async () => {
    render(<CatalogoClient />);
    await screen.findByText(/1 de 3/);

    fireEvent.click(screen.getByRole("button", { name: /Sem etiqueta 2/ }));
    expect(screen.queryByText("Chapa MDF")).toBeNull();
    expect(screen.getByText("Cavalete")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Com etiqueta 1/ }));
    expect(screen.getByText("Chapa MDF")).toBeTruthy();
    expect(screen.queryByText("Cavalete")).toBeNull();
  });

  it("a aba de hierarquia é a que ficou lembrada, não a primeira da lista", async () => {
    render(<CatalogoClient />);
    // "peca" veio do localStorage; sem isso a tela abriria em matéria-prima,
    // que no banco real tem 7 dos 192 itens.
    expect(await screen.findByText(/1 de 3/)).toBeTruthy();
    expect(screen.getByText("Cavalete")).toBeTruthy();
  });
});

describe("Catálogo — etiquetar em lote", () => {
  it("manda os marcados num pedido só, com a quantidade que está na prateleira", async () => {
    const espiao = stub();
    vi.stubGlobal("fetch", espiao);
    render(<CatalogoClient />);
    await screen.findByText(/1 de 3/);

    fireEvent.click(screen.getByRole("button", { name: /Etiquetar 2 de uma vez/ }));
    const painel = await screen.findByRole("dialog");
    fireEvent.click(within(painel).getByRole("button", { name: /Marcar todos \(2\)/ }));
    fireEvent.click(within(painel).getByRole("button", { name: /Etiquetar 2 itens/ }));

    await waitFor(() => expect(screen.getByText(/passaram a ser/)).toBeTruthy());
    const chamada = espiao.mock.calls.find((c) => String(c[0]).startsWith("/api/estoque/unidades/preparar"));
    expect(chamada).toBeTruthy();
    const enviado = JSON.parse(String((chamada![1] as RequestInit).body));
    expect(enviado.itens).toEqual([
      { item_id: "b", quantidade: 12 }, // 12 na prateleira → 12 etiquetas
      { item_id: "c", quantidade: 0 },  // sem estoque → só passa a ser contado por etiqueta
    ]);
  });

  it("item já etiquetado não entra no lote", async () => {
    render(<CatalogoClient />);
    await screen.findByText(/1 de 3/);

    fireEvent.click(screen.getByRole("button", { name: /Etiquetar 2 de uma vez/ }));
    const painel = await screen.findByRole("dialog");
    expect(within(painel).queryByText("Chapa MDF")).toBeNull();
  });
});
