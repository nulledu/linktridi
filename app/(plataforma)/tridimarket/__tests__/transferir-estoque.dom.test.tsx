import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ProdutosClient } from "../produtos/ProdutosClient";
import type { MarketProduct } from "../../../../lib/tridimarket/types";

// Transferir é "sai de A, entra em B" — e o jeito errado de fazer isso é mandar
// duas chamadas do cliente, porque a primeira pode gravar e a segunda falhar: as
// unidades desaparecem do sistema. O contrato travado aqui é que a tela manda UMA
// requisição, com origem (`profileId`) e destino (`toProfileId`) juntos, e quem
// aplica as duas pontas é o servidor.

const produto = (over: Partial<MarketProduct> & { id: number; name: string; stock: number }): MarketProduct => ({
  companyId: 0, barcode: "789", price: 3, imageUrl: null,
  categoryId: null, categoryName: null, active: true, minimumStock: 5,
  allowStockOverride: true, semCodigo: false, ocultoBusca: false, unidades: ["u1"],
  ...over,
} as MarketProduct);

const PRODUTOS = [produto({ id: 1, name: "Doritos", stock: 40 })];
const UNIDADES = [
  { id: "u1", nome: "Tridi Escritório", ativo: true },
  { id: "u2", nome: "Zeelux", ativo: true },
];

let chamadas: Array<{ url: string; body: Record<string, unknown> | null }>;

beforeEach(() => {
  localStorage.clear();
  chamadas = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    chamadas.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    const dados = String(url).includes("/products")
      ? PRODUTOS
      : String(url).includes("/settings")
        ? { profiles: UNIDADES.map((u) => ({ id: u.id, name: u.nome })), schemaReady: true }
        : String(url).includes("/unidades")
          ? UNIDADES
          : String(url).includes("/inventory")
            ? { origem: 32, destino: 8, semPrecoNoDestino: false }
            : { ok: true };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, data: dados }) } as Response);
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function abrirAjuste() {
  const linha = screen.getByText("Doritos").closest("li, tr") as HTMLElement;
  fireEvent.click(within(linha).getByRole("button", { name: /Ajustar estoque/i }));
  await screen.findByRole("button", { name: /^Entrou$/ });
  return document.querySelector("form.sheet") as HTMLElement;
}

describe("TridiMarket · transferir estoque entre empresas", () => {
  it("manda origem e destino numa requisição só", async () => {
    render(<ProdutosClient />);
    await screen.findByText("Doritos");
    const folha = await abrirAjuste();

    fireEvent.click(screen.getByRole("button", { name: /^Transferi$/ }));
    fireEvent.change(await screen.findByLabelText(/Para \(entra aqui\)/), { target: { value: "u2" } });
    fireEvent.change(screen.getByLabelText(/Quantas vão/), { target: { value: "8" } });
    fireEvent.click(within(folha).getByRole("button", { name: /^Salvar$/ }));

    await waitFor(() => {
      const envios = chamadas.filter((c) => c.url.includes("/inventory"));
      // UMA chamada, não duas: é o ponto todo.
      expect(envios).toHaveLength(1);
      expect(envios[0].body).toMatchObject({ productId: 1, profileId: "u1", toProfileId: "u2" });
      // `delta` negativo = sai da origem; o servidor aplica a outra ponta.
      expect(envios[0].body!.delta).toBe(-8);
    });
  });

  it("sem escolher o destino o Salvar fica travado", async () => {
    render(<ProdutosClient />);
    await screen.findByText("Doritos");
    const folha = await abrirAjuste();

    fireEvent.click(screen.getByRole("button", { name: /^Transferi$/ }));
    fireEvent.change(screen.getByLabelText(/Quantas vão/), { target: { value: "8" } });

    const salvar = within(folha).getByRole("button", { name: /^Salvar$/ }) as HTMLButtonElement;
    await waitFor(() => expect(salvar.disabled).toBe(true));
    expect(screen.getByText(/Falta dizer para onde as 8 un\. vão/)).toBeInTheDocument();
  });

  it("o aviso final diz quanto ficou em cada ponta", async () => {
    render(<ProdutosClient />);
    await screen.findByText("Doritos");
    const folha = await abrirAjuste();

    fireEvent.click(screen.getByRole("button", { name: /^Transferi$/ }));
    fireEvent.change(await screen.findByLabelText(/Para \(entra aqui\)/), { target: { value: "u2" } });
    fireEvent.change(screen.getByLabelText(/Quantas vão/), { target: { value: "8" } });
    fireEvent.click(within(folha).getByRole("button", { name: /^Salvar$/ }));

    await waitFor(() => {
      expect(screen.getByText(/Ficou 32 aqui e 8 lá/)).toBeInTheDocument();
    });
  });
});
