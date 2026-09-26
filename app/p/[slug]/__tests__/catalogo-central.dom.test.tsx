import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogoCentral, type ProdutoCatalogo } from "../CatalogoCentral";
import { CentralTutoriais } from "../CentralTutoriais";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const produto = (extra: Partial<ProdutoCatalogo> = {}): ProdutoCatalogo => ({
  id: "p1", titulo: "Carimbo automático", preco: 89.9, precoDe: null, imagemUrl: "",
  paginaHref: "/l/loja/p/carimbo-p1", comprarHref: "/l/loja/carrinho?add=p1", comprarPeloZap: false, ...extra,
});
const respondeCom = (produtos: ProdutoCatalogo[]) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ produtos }), { status: 200 })));

describe("catálogo dentro da central", () => {
  it("mostra preço e leva o botão direto ao checkout", async () => {
    respondeCom([produto({ precoDe: 119.9 })]);
    render(<CatalogoCentral lojaSlug="loja" />);
    expect(await screen.findByText("Carimbo automático")).toBeTruthy();
    expect(screen.getByText(/89,90/)).toBeTruthy();
    // "de/por" só quando há desconto de verdade.
    expect(screen.getByText(/119,90/)).toBeTruthy();
    const comprar = screen.getByRole("link", { name: /Comprar/ });
    expect(comprar.getAttribute("href")).toBe("/l/loja/carrinho?add=p1");
    // Checkout da própria vitrine continua na mesma aba.
    expect(comprar.getAttribute("target")).toBeNull();
  });

  it("compra por WhatsApp abre em aba nova — é outro aplicativo", async () => {
    respondeCom([produto({ comprarHref: "https://wa.me/5511999?text=oi", comprarPeloZap: true })]);
    render(<CatalogoCentral lojaSlug="loja" />);
    const comprar = await screen.findByRole("link", { name: /Comprar pelo WhatsApp/ });
    expect(comprar.getAttribute("target")).toBe("_blank");
    expect(comprar.getAttribute("rel")).toContain("noreferrer");
  });

  it("catálogo vazio não deixa a gaveta em branco", async () => {
    respondeCom([]);
    render(<CatalogoCentral lojaSlug="loja" />);
    expect(await screen.findByText("Catálogo a caminho")).toBeTruthy();
  });

  // A lista é buscada SÓ quando a gaveta abre: toda visita à central pagaria
  // por um catálogo que a maioria não abre.
  it("a central não busca o catálogo antes de alguém abrir", async () => {
    const espia = vi.fn(async (_url: RequestInfo | URL) => new Response(JSON.stringify({ produtos: [] }), { status: 200 }));
    vi.stubGlobal("fetch", espia);
    window.history.replaceState(null, "", "/p/t");
    render(<CentralTutoriais titulo="C" subtitulo="" slug="t" catalogoLoja="loja"
      categorias={[{ id: "c", nome: "Máquinas", imagemUrl: "", ordem: 0, ativa: true }]}
      tutoriais={[{ id: "a", categoriaId: "c", titulo: "Guia", handle: "a", descricao: "", capaUrl: "", selo: null, destaque: false, ordem: 0, meta: { icone: "clock", texto: "1 min", passos: 0, minutos: 1, video: false } }]} />);
    expect(screen.getByRole("button", { name: /^Catálogo Produtos da loja$/ })).toBeTruthy();
    expect(espia).not.toHaveBeenCalled();

    screen.getByRole("button", { name: /^Catálogo Produtos da loja$/ }).click();
    await waitFor(() => expect(espia).toHaveBeenCalledTimes(1));
    expect(String(espia.mock.calls[0][0])).toContain("/api/f/catalogo?loja=loja");
  });
});
