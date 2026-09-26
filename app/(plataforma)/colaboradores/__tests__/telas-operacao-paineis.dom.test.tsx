import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DispositivosPanel } from "../DispositivosPanel";
import { FuncoesPanel } from "../FuncoesPanel";
import { FUNCOES } from "@/lib/funcoes-catalog";

// Desativar tablet e tirar função: o DELETE falhava calado e a lista voltava
// igual do servidor, sem uma palavra. Quem clicou não sabia se a ação valeu.

vi.mock("../../Toast", async (original) => ({
  ...(await original<typeof import("../../Toast")>()),
  confirmar: vi.fn(() => Promise.resolve(true)),
}));

function stub(listas: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET").toUpperCase() === "DELETE") {
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: "falhou" }) } as unknown as Response);
    }
    const chave = Object.keys(listas).find((k) => String(url).startsWith(k));
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(chave ? listas[chave] : {}) } as unknown as Response);
  }));
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("remoção recusada nos painéis de Colaboradores", () => {
  it("desativar tablet que o servidor recusou diz que não desativou", async () => {
    stub({
      "/api/devices": {
        devices: [{ id: "d1", nome_mesa: "Mesa 1", setor: "Produção", ativo: true, last_sync: null, created_at: "2026-09-01T00:00:00Z", tipo: "producao" }],
        codes: [],
      },
    });
    render(<DispositivosPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "desativar" }));

    expect(await screen.findByText(/Não consegui desativar/)).toBeInTheDocument();
  });

  it("remover função que o servidor recusou diz que não removeu", async () => {
    stub({
      "/api/funcoes": { funcoes: [{ id: "f1", erp_user_id: "e1", nome: "Ana Ribeiro", foto_url: null, funcao: FUNCOES[0].key }] },
      "/api/erp-users": { users: [] },
    });
    render(<FuncoesPanel />);

    fireEvent.click(await screen.findByTitle("Remover"));

    expect(await screen.findByText(/Não foi possível remover/)).toBeInTheDocument();
  });
});
