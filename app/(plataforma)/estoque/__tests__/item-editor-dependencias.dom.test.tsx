import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ItemEditor } from "../ItemEditor";
import type { Item } from "../tipos";

// A ficha do item pergunta duas coisas que, no primeiro dia, não existem:
// fornecedor e lugar. Os dois seletores abriam com UMA linha morta ("— sem
// fornecedor —") e nenhuma saída — nada dizia que a lista está vazia porque
// ninguém cadastrou, e não havia como criar dali. A pessoa fecha o item sem
// lugar, e a aba Localização continua vazia pra sempre.
//
// O formulário de compra já resolvia a MESMA dependência criando na hora; o
// editor de item, que é onde a maior parte do cadastro acontece, não tinha
// herdado isso.

const BASE: Item = {
  id: "i1", nome: "Chapa MDF 6mm", hierarquia: "peca", produzido: false, serializado: false,
  categoria: "Insumos", imagem_url: null, unidade: "ch", quantidade: 0, qtd_minima: 0,
  ativo: true, sku: "MDF6MM",
};

function stubFetch(rotas: Record<string, { ok?: boolean; status?: number; body?: unknown }>, espia?: (url: string, init?: RequestInit) => void) {
  return vi.fn((url: string, init?: RequestInit) => {
    espia?.(String(url), init);
    const chave = Object.keys(rotas).find((k) => String(url).startsWith(k));
    const r = chave ? rotas[chave] : {};
    return Promise.resolve({ ok: r.ok ?? true, status: r.status ?? 200, json: () => Promise.resolve(r.body ?? {}) } as Response);
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("Ficha do item — a dependência se resolve aqui", () => {
  it("cadastra o lugar na hora e já deixa ele escolhido", async () => {
    const enviados: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", stubFetch({
      "/api/estoque/locais": { body: { locais: [], podeGerir: true, local: { id: "L9" } } },
      "/api/estoque/fornecedores": { body: { fornecedores: [], podeGerir: true } },
    }, (url, init) => enviados.push({ url, init })));

    render(<ItemEditor item={BASE} itens={[]} onClose={() => {}} onSaved={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /— sem local —/ }));
    fireEvent.click(await screen.findByText("Cadastrar lugar novo…"));

    fireEvent.change(screen.getByPlaceholderText(/Prateleira B2/), { target: { value: "Prateleira do fundo" } });
    fireEvent.change(screen.getByPlaceholderText(/Código/), { target: { value: "b2" } });
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar e usar/ }));

    await waitFor(() => {
      const post = enviados.find((e) => e.url.startsWith("/api/estoque/locais") && e.init?.method === "POST");
      expect(post).toBeTruthy();
      // Maiúsculo: o código vai impresso na etiqueta, e "b2"/"B2" colidem no
      // índice único do banco.
      expect(JSON.parse(String(post!.init!.body))).toMatchObject({ nome: "Prateleira do fundo", codigo: "B2" });
    });
    // O lugar recém-criado fica escolhido — sem reabrir nada.
    expect(await screen.findByRole("button", { name: /B2 · Prateleira do fundo/ })).toBeTruthy();
  });

  it("código repetido vira frase, não silêncio", async () => {
    // A leitura da lista funciona; só o POST bate no índice único do banco.
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith("/api/estoque/locais") && init?.method === "POST") {
        return Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({ error: "codigo_duplicado" }) } as Response);
      }
      const body = u.startsWith("/api/estoque/locais") ? { locais: [], podeGerir: true }
        : u.startsWith("/api/estoque/fornecedores") ? { fornecedores: [], podeGerir: true }
        : {};
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
    }));

    render(<ItemEditor item={BASE} itens={[]} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /— sem local —/ }));
    fireEvent.click(await screen.findByText("Cadastrar lugar novo…"));
    fireEvent.change(screen.getByPlaceholderText(/Prateleira B2/), { target: { value: "Prateleira nova" } });
    fireEvent.change(screen.getByPlaceholderText(/Código/), { target: { value: "B2" } });
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar e usar/ }));

    expect(await screen.findByText(/Já existe um lugar com este código/)).toBeTruthy();
  });

  it("lugar sem código não sai — é ele que vai na etiqueta", async () => {
    vi.stubGlobal("fetch", stubFetch({
      "/api/estoque/locais": { body: { locais: [], podeGerir: true } },
      "/api/estoque/fornecedores": { body: { fornecedores: [], podeGerir: true } },
    }));
    render(<ItemEditor item={BASE} itens={[]} onClose={() => {}} onSaved={() => {}} />);

    fireEvent.click(await screen.findByRole("button", { name: /— sem local —/ }));
    fireEvent.click(await screen.findByText("Cadastrar lugar novo…"));
    fireEvent.change(screen.getByPlaceholderText(/Prateleira B2/), { target: { value: "Prateleira sem código" } });
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar e usar/ }));

    expect(await screen.findByText(/Dê um código ao lugar/)).toBeTruthy();
  });

  it("cadastra o fornecedor na hora", async () => {
    const enviados: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal("fetch", stubFetch({
      "/api/estoque/locais": { body: { locais: [], podeGerir: true } },
      "/api/estoque/fornecedores": { body: { fornecedores: [], podeGerir: true, fornecedor: { id: "F7" } } },
    }, (url, init) => enviados.push({ url, init })));

    render(<ItemEditor item={BASE} itens={[]} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /— sem fornecedor —/ }));
    fireEvent.click(await screen.findByText("Cadastrar fornecedor novo…"));
    fireEvent.change(screen.getByPlaceholderText(/Razão social/), { target: { value: "REVAL" } });
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar e usar/ }));

    await waitFor(() => {
      const post = enviados.find((e) => e.url.startsWith("/api/estoque/fornecedores") && e.init?.method === "POST");
      expect(JSON.parse(String(post!.init!.body))).toMatchObject({ nome: "REVAL" });
    });
    expect(await screen.findByRole("button", { name: /REVAL/ })).toBeTruthy();
  });

  it("sem permissão de cadastrar, o seletor vazio dá lugar à frase que explica", async () => {
    vi.stubGlobal("fetch", stubFetch({
      "/api/estoque/locais": { body: { locais: [], podeGerir: false } },
      "/api/estoque/fornecedores": { body: { fornecedores: [], podeGerir: false } },
    }));
    render(<ItemEditor item={BASE} itens={[]} onClose={() => {}} onSaved={() => {}} />);

    expect(await screen.findByText(/Nenhum lugar cadastrado ainda — a aba Localização/)).toBeTruthy();
    expect(screen.getByText(/Nenhum fornecedor cadastrado ainda — a aba Fornecedores/)).toBeTruthy();
    // Nada de seletor com uma opção morta.
    expect(screen.queryByRole("button", { name: /— sem local —/ })).toBeNull();
  });
});
