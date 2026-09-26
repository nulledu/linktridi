import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PessoasClient } from "../pessoas/PessoasClient";
import type { MarketPerson } from "../../../../lib/tridimarket/types";

// A tela de Pessoas é onde se COBRA. E quem cobra pergunta uma coisa só:
// "quanto essa pessoa deve do mês passado?" — porque no mercadinho se paga em
// setembro a fatura de agosto. Mostrar a dívida inteira (mês fechado + o que
// ela comprou ontem) numa soma só é justamente o que impedia marcar quem já
// pagou: o número nunca fechava com o que a pessoa entregava em dinheiro.
//
// Por isso a lista nasce no recorte "Até o mês passado" (closedUntil) e o mês
// novo (currentMonth) fica num número À PARTE, alcançável por um clique.

const conta = (over: Record<string, unknown>) => ({
  id: 1, profileId: "u1", companyId: 4, name: "Ana Devendo", imageUrl: null, active: true,
  normalLimit: 500, overdraftLimit: 0, open: 0, cycleOpen: 0, previousOpen: 0,
  closedUntil: 0, currentMonth: 0, overdue: 0, available: 500, status: "good",
  lastPaymentAt: null, score: 0, scoreManual: false, ...over,
});

const pessoa = (over: Partial<MarketPerson> & { name: string }): MarketPerson => ({
  key: `k-${over.name}`, imageUrl: null, accounts: [], unified: false, active: true,
  mainProfileId: "u1", mainProfileManual: false,
  open: 0, overdue: 0, cycleOpen: 0, previousOpen: 0, closedUntil: 0, currentMonth: 0,
  normalLimit: 500, overdraftLimit: 0, spent: 0, available: 500,
  status: "good", score: 0, scoreManual: false, scoreEmployeeId: 1,
  ...over,
} as MarketPerson);

// Ana deve R$ 300 de meses fechados e já gastou R$ 40 no mês novo.
const PESSOAS = [
  pessoa({
    name: "Ana Devendo", open: 340, closedUntil: 300, currentMonth: 40,
    accounts: [conta({
      open: 340, closedUntil: 300, currentMonth: 40,
      faturas: [
        { mes: "2026-07", valor: 120, aberta: false },
        { mes: "2026-08", valor: 180, aberta: false },
        { mes: "2026-09", valor: 40, aberta: true },
      ],
    })] as never,
  }),
  pessoa({ name: "Bruno Novato", open: 25, closedUntil: 0, currentMonth: 25 }),
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

describe("Pessoas — fatura do mês anterior separada do mês novo", () => {
  it("abre no recorte do mês passado, não na dívida somada", async () => {
    render(<PessoasClient />);
    await screen.findByText("Ana Devendo");

    const ateOMesPassado = await screen.findByRole("button", { name: /Até o mês passado/ });
    expect(ateOMesPassado).toHaveAttribute("aria-pressed", "true");

    // R$ 300,00 é a fatura fechada. R$ 340,00 (a soma com o mês novo) não pode
    // ser o número que a tela oferece pra cobrar.
    expect(screen.getAllByText("R$ 300,00").length).toBeGreaterThan(0);
    expect(screen.queryByText("R$ 340,00")).not.toBeInTheDocument();
  });

  it("o mês novo continua alcançável, e aí o número é o dele", async () => {
    render(<PessoasClient />);
    await screen.findByText("Ana Devendo");

    const esteMes = await screen.findByRole("button", { name: /^Este mês$/ });
    fireEvent.click(esteMes);

    // O balde do mês novo vira o número da tela; o fechado continua visível na
    // coluna ao lado (separar não é esconder). O que nunca aparece é a SOMA.
    await waitFor(() => expect(esteMes).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getAllByText("R$ 40,00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("R$ 300,00").length).toBeGreaterThan(0);
    expect(screen.queryByText("R$ 340,00")).not.toBeInTheDocument();
  });

  it("quem só comprou no mês novo não aparece devendo do mês passado", async () => {
    render(<PessoasClient />);
    await screen.findByText("Bruno Novato");

    // Bruno tem R$ 25 só no mês corrente: no recorte fechado ele é zero.
    const linha = screen.getByText("Bruno Novato").closest("tr, li, div[role='row']") ?? document.body;
    expect(linha.textContent).not.toContain("R$ 25,00");
  });
});

// formatMarketCurrency usa espaço FINO entre "R$" e o número; comparar com um
// espaço comum falha por um caractere invisível.
const dinheiro = (el: HTMLElement) => (el as HTMLInputElement).value.replace(/\s/g, " ");

describe("Receber direto da linha", () => {
  const abrirFolha = async () => {
    render(<PessoasClient />);
    await screen.findByText("Ana Devendo");
    fireEvent.pointerDown(screen.getAllByRole("button", { name: /Receber/ })[0]);
    return screen.findByRole("dialog", { name: /Receber de Ana Devendo/ });
  };

  it("um clique na linha abre a folha já com o fechado do mês anterior", async () => {
    await abrirFolha();

    // Nem painel nem aba: da lista direto pro valor a receber.
    const anterior = screen.getByRole("radio", { name: /Mês anterior/ });
    expect(anterior).toHaveAttribute("aria-checked", "true");
    expect(dinheiro(screen.getByLabelText("Valor recebido"))).toBe("R$ 300,00");
  });

  it("mês atual quita tudo, porque o pagamento é FIFO", async () => {
    await abrirFolha();
    fireEvent.click(screen.getByRole("radio", { name: /Mês atual/ }));
    expect(dinheiro(screen.getByLabelText("Valor recebido"))).toBe("R$ 340,00");
  });

  it("escolher um mês antigo cobra só até ele", async () => {
    await abrirFolha();
    fireEvent.click(screen.getByRole("radio", { name: /Escolher mês/ }));
    // O seletor de mês é o GlassSelect: abre a folha e escolhe julho.
    fireEvent.click(await screen.findByRole("button", { name: /ago\/26/ }));
    fireEvent.click(await screen.findByText(/jul\/26/));
    await waitFor(() => expect(dinheiro(screen.getByLabelText("Valor recebido"))).toBe("R$ 120,00"));
  });
});
