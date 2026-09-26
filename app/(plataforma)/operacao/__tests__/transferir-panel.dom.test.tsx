import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TransferirPanel } from "../TransferirPanel";

/**
 * O contrato do painel: origem pré-escolhida quando não há dúvida, a frase do
 * que vai acontecer antes de gravar, e o POST com o corpo que a rota espera.
 */

const ITEM = {
  id: "i1", nome: "Chapa MDF 6mm", sku: "MDF6", unidade: "un", quantidade: 50,
  local: "Rua C", imagemUrl: null,
  lugares: [
    { id: "a", nome: "Rua C", caminho: "Rua C › Nível 2", quantidade: 30 },
    { id: "b", nome: "Rua E", caminho: "Rua E › Nível 1", quantidade: 20 },
  ],
  semLugar: 0,
};

function mockFetch() {
  const chamadas: { url: string; body?: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    chamadas.push({ url: u, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (u.startsWith("/api/estoque/locais")) {
      return new Response(JSON.stringify({ locais: [
        { id: "a", nome: "Rua C", pai_id: null }, { id: "b", nome: "Rua E", pai_id: null },
        { id: "c", nome: "Rua Z", pai_id: null },
      ] }));
    }
    if (u.startsWith("/api/estoque/consultar")) {
      return new Response(JSON.stringify({ ok: true, itens: [ITEM] }));
    }
    if (u.startsWith("/api/estoque/transferir")) {
      return new Response(JSON.stringify({ ok: true, lugares: ITEM.lugares, semLugar: 0 }));
    }
    return new Response("{}", { status: 404 });
  }));
  return chamadas;
}

afterEach(() => { vi.unstubAllGlobals(); });

async function acharItem() {
  const campo = screen.getByLabelText("Código ou nome do item");
  fireEvent.change(campo, { target: { value: "MDF6" } });
  fireEvent.keyDown(campo, { key: "Enter" });
  await waitFor(() => expect(screen.getByText(/Rua C › Nível 2/)).toBeTruthy());
}

describe("TransferirPanel", () => {
  it("acha o item, mostra os lugares e transfere com o corpo certo", async () => {
    const chamadas = mockFetch();
    render(<TransferirPanel />);
    await acharItem();
    // dois lugares → os dois aparecem com saldo
    expect(screen.getByText(/Rua E › Nível 1/)).toBeTruthy();

    // origem pré-escolhida: o lugar de maior saldo
    expect(screen.getByRole("button", { name: /Rua C › Nível 2/ }).getAttribute("aria-pressed")).toBe("true");

    // destino: Rua Z
    fireEvent.click(screen.getByRole("button", { name: /^Rua Z$/ }));
    fireEvent.change(screen.getByLabelText("Quantidade a transferir"), { target: { value: "5" } });

    // a frase do que vai acontecer aparece antes do clique
    await waitFor(() => expect(screen.getByText(/Vai transferir/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Transferir$/ }));
    await waitFor(() => {
      const post = chamadas.find((c) => c.url === "/api/estoque/transferir");
      expect(post?.body).toMatchObject({ itemId: "i1", deLocalId: "a", paraLocalId: "c", quantidade: 5 });
    });
  });

  it("recusa na tela quando a origem não tem saldo", async () => {
    mockFetch();
    render(<TransferirPanel />);
    await acharItem();
    fireEvent.click(screen.getByRole("button", { name: /^Rua Z$/ }));
    fireEvent.change(screen.getByLabelText("Quantidade a transferir"), { target: { value: "40" } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/30/));
  });
});
