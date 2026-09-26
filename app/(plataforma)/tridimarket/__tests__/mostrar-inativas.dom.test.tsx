import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PessoasClient } from "../pessoas/PessoasClient";
import type { MarketPerson } from "../../../../lib/tridimarket/types";

// Inativar uma pessoa é o jeito de tirá-la do tablet sem apagar o histórico —
// e a lista esconde inativas por padrão, de propósito. O botão "Mostrar
// inativas (N)" é a ÚNICA porta de volta: sem ele não há como reativar
// ninguém nem abrir o histórico de quem saiu.
//
// O `useMemo` que monta a lista lia `mostrarInativas` mas não o declarava nas
// dependências. Clicar acendia o botão (o estado mudava de verdade) e a lista
// devolvia o valor memoizado antigo — a pessoa inativa nunca aparecia. Só
// reaparecia por acidente, se logo depois alguém digitasse na busca ou
// atualizasse os dados, que era o que mexia nas outras dependências.

const pessoa = (over: Partial<MarketPerson> & { name: string; active: boolean }): MarketPerson => ({
  key: `k-${over.name}`, imageUrl: null, accounts: [], unified: false,
  mainProfileId: "u1", mainProfileManual: false,
  open: 0, overdue: 0, normalLimit: 500, overdraftLimit: 0, spent: 0, available: 500,
  status: "good", score: 0, scoreManual: false, scoreEmployeeId: 1,
  ...over,
} as MarketPerson);

const PESSOAS = [
  pessoa({ name: "Ana Ativa", active: true }),
  pessoa({ name: "Bruno Inativo", active: false }),
];

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    const dados = String(url).includes("/employees")
      ? PESSOAS
      : String(url).includes("/settings")
        ? { profiles: [{ id: "u1", name: "Tridi Escritório" }], schemaReady: true }
        : { total: 2, semCodigo: 0, conflitos: [], pessoasEmConflito: 0 };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, data: dados }) } as Response);
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("Pessoas — chegar nos cadastros inativos", () => {
  it("o botão revela a pessoa inativa no primeiro clique", async () => {
    render(<PessoasClient />);

    // Estado normal: a inativa está escondida, a ativa aparece.
    await screen.findByText("Ana Ativa");
    expect(screen.queryByText("Bruno Inativo")).not.toBeInTheDocument();

    const botao = await screen.findByRole("button", { name: /Mostrar inativas \(1\)/ });
    fireEvent.click(botao);

    // Um clique, sem digitar nada nem recarregar: tem que aparecer.
    await waitFor(() => expect(screen.getByText("Bruno Inativo")).toBeInTheDocument());
    expect(screen.getByText("Ana Ativa")).toBeInTheDocument();
  });

  it("clicar de novo volta a esconder", async () => {
    render(<PessoasClient />);
    const botao = await screen.findByRole("button", { name: /Mostrar inativas/ });
    fireEvent.click(botao);
    await waitFor(() => expect(screen.getByText("Bruno Inativo")).toBeInTheDocument());
    fireEvent.click(botao);
    await waitFor(() => expect(screen.queryByText("Bruno Inativo")).not.toBeInTheDocument());
  });
});
