import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { FornecedoresPanel } from "../FornecedoresPanel";

// "Nenhum fornecedor cadastrado ainda." é verdade e não serve pra nada: não
// diz o que muda com o cadastro nem que dá pra colar os dezessete da planilha
// numa vez só. O primeiro dia inteiro do Estoque é feito de telas assim.

function resposta(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
}

function rede(podeGerir: boolean) {
  return vi.fn((url: string) => {
    const u = String(url);
    if (u.startsWith("/api/estoque/fornecedores")) return resposta({ fornecedores: [], podeGerir });
    if (u.startsWith("/api/estoque-itens")) return resposta({ itens: [] });
    return resposta({ fornecedores: [], materiais: [], podeVerCusto: false });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("Fornecedores — o vazio ensina", () => {
  it("diz pra que serve a aba e oferece a porta larga primeiro", async () => {
    vi.stubGlobal("fetch", rede(true));
    render(<FornecedoresPanel />);

    expect(await screen.findByText(/Nenhum fornecedor cadastrado ainda/)).toBeTruthy();
    expect(screen.getByText(/de onde cada item vem/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Cadastrar vários/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Um fornecedor só/ })).toBeTruthy();
  });

  it("sem permissão, explica em vez de oferecer botão que não existe", async () => {
    vi.stubGlobal("fetch", rede(false));
    render(<FornecedoresPanel />);

    expect(await screen.findByText(/Nenhum fornecedor cadastrado ainda/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Cadastrar vários/ })).toBeNull();
    // O recado mudou de dono: a linha nasce no Financeiro, então é a permissão
    // DE LÁ que falta — dizer "peça ao estoque" mandaria a pessoa para quem não
    // pode resolver.
    expect(screen.getByText(/nasce dentro do Financeiro/)).toBeTruthy();
  });

  it("falha de carga não é desenhada como cadastro vazio", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (String(url).startsWith("/api/estoque/fornecedores")) {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
      }
      return resposta({ itens: [] });
    }));
    render(<FornecedoresPanel />);

    expect(await screen.findByText(/Não deu pra carregar os fornecedores/)).toBeTruthy();
    expect(screen.queryByText(/Nenhum fornecedor cadastrado ainda/)).toBeNull();
  });
});
