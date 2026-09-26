import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ProdutosClient } from "../produtos/ProdutosClient";
import type { MarketProduct } from "../../../../lib/tridimarket/types";

// "Fora da busca" e "Sem código" saíram da linha do produto e agora só existem
// dentro de Editar. Isso expôs um buraco que o atalho escondia: o formulário
// lê `produto.ocultoBusca` para acender o Toggle, mas a lista NÃO mandava esse
// campo. O Toggle nascia apagado, e salvar qualquer outra coisa (o preço, a
// foto) enviava `ocultoBusca: false` junto — o produto voltava calado para a
// busca do tablet. Antes dava para desfazer pelo atalho da linha; sem ele, o
// único jeito de esconder de novo seria adivinhar que foi o "Salvar" que
// desfez.

const produto = (over: Partial<MarketProduct> & { id: number; name: string }): MarketProduct => ({
  companyId: 0, barcode: "7891000100103", price: 5, imageUrl: null, stock: 9,
  categoryId: null, categoryName: null, active: true, minimumStock: 5,
  allowStockOverride: true, semCodigo: false, ocultoBusca: false, unidades: ["u1"],
  ...over,
} as MarketProduct);

const PRODUTOS = [produto({ id: 1, name: "Leite Ninho", ocultoBusca: true })];

let chamadas: Array<{ url: string; metodo: string; body: Record<string, unknown> | null }>;

beforeEach(() => {
  localStorage.clear();
  chamadas = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    chamadas.push({
      url: String(url), metodo: String(init?.method ?? "GET"),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const dados = String(url).includes("/products")
      ? PRODUTOS
      : String(url).includes("/settings")
        ? { profiles: [{ id: "u1", name: "Mercadinho" }], schemaReady: true }
        : String(url).includes("/unidades")
          ? [{ id: "u1", nome: "Mercadinho", ativo: true }]
          : String(url).includes("/categorias") ? [] : { ok: true };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, data: dados }) } as Response);
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("TridiMarket · Editar produto — o que já estava marcado continua marcado", () => {
  it("salvar sem mexer em nada mantém o produto fora da busca", async () => {
    render(<ProdutosClient />);
    await screen.findByText("Leite Ninho");

    fireEvent.click(screen.getAllByRole("button", { name: /^Editar$/ })[0]);
    const folha = await waitFor(() => {
      const f = document.querySelector("form, .apple-modal, [role=dialog]");
      if (!f) throw new Error("modal não abriu");
      return f as HTMLElement;
    });

    fireEvent.click(within(folha).getByRole("button", { name: /^Salvar/ }));

    await waitFor(() => {
      const patch = chamadas.find((c) => c.metodo === "PATCH" && c.url.includes("/products"));
      expect(patch, "o PATCH de edição não saiu").toBeTruthy();
      expect(patch!.body!.ocultoBusca).toBe(true);
    });
  });
});
