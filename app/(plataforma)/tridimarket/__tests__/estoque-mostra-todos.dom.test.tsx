import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ProdutosClient } from "../produtos/ProdutosClient";
import type { MarketProduct } from "../../../../lib/tridimarket/types";

// A aba Estoque abria com "Só os que precisam repor" LIGADO e o filtro era
// `stock <= minimumStock` (mínimo nasce em 5). Quem adicionava estoque via o
// produto SUMIR da lista no instante em que passava do mínimo — o ajuste tinha
// gravado, mas na tela parecia que "não salvou" e que "não atualiza em tempo
// real". Às vezes atualizava: quando a entrada era pequena e o produto seguia
// abaixo do mínimo, ele continuava visível.
//
// A lista agora mostra tudo, sempre. O que precisa repor continua em cima
// (ordem por saldo crescente no modo estoque), que era o valor real do filtro.
//
// O segundo caso: o motivo do ajuste era `required` no formulário e
// `min(3)` no servidor. Repor o que acabou de chegar não tem motivo pra
// escrever, e o campo obrigatório travava o salvar sem explicar.

const produto = (over: Partial<MarketProduct> & { id: number; name: string; stock: number }): MarketProduct => ({
  companyId: 0, barcode: null, price: 3.5, imageUrl: null,
  categoryId: null, categoryName: null, active: true,
  minimumStock: 5, allowStockOverride: true, semCodigo: false, ocultoBusca: false, unidades: ["u1"],
  ...over,
} as MarketProduct);

const PRODUTOS = [
  produto({ id: 1, name: "Bala Chita", stock: 2 }),      // abaixo do mínimo
  produto({ id: 2, name: "Doritos", stock: 40 }),        // bem acima do mínimo
];

let chamadas: Array<{ url: string; body: unknown }>;

beforeEach(() => {
  localStorage.clear();
  chamadas = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    chamadas.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    const dados = String(url).includes("/products")
      ? PRODUTOS
      : String(url).includes("/settings")
        ? { profiles: [{ id: "u1", name: "Mercadinho" }], schemaReady: true }
        : String(url).includes("/unidades")
          ? [{ id: "u1", nome: "Mercadinho", ativo: true }, { id: "u2", nome: "Escritório", ativo: true }]
          : { ok: true };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, data: dados }) } as Response);
  }));
});
afterEach(() => vi.unstubAllGlobals());

// Abre o ajuste do produto pedido pelo NOME. Por índice seria frágil: a lista
// ordena por nome, então "Bala Chita" vem antes de "Doritos" e um `[0]` mudaria
// de produto ao mexer no fixture — foi o que fez este arquivo medir o saldo
// errado na primeira tentativa.
async function abrirAjuste(nome = "Doritos") {
  // "li, tr": o DataList é tabela no computador e cartão no celular, e em jsdom
  // (sem layout) cai no ramo da tabela.
  const linha = screen.getByText(nome).closest("li, tr") as HTMLElement;
  fireEvent.click(within(linha).getByRole("button", { name: /Ajustar estoque/i }));
  await screen.findByRole("button", { name: /^Entrou$/ });
}

describe("TridiMarket · Estoque — a lista não esconde produto", () => {
  it("mostra também o que está acima do mínimo", async () => {
    render(<ProdutosClient />);

    // O crítico sempre apareceu; o abastecido é que sumia.
    await screen.findByText("Bala Chita");
    await waitFor(() => expect(screen.getByText("Doritos")).toBeInTheDocument());
  });

  it("não existe mais o botão que escondia produto abastecido", async () => {
    render(<ProdutosClient />);
    await screen.findByText("Bala Chita");
    expect(screen.queryByRole("button", { name: /precisam repor/i })).not.toBeInTheDocument();
  });

  it("ajusta o estoque sem escrever motivo", async () => {
    render(<ProdutosClient />);
    await screen.findByText("Doritos");

    await abrirAjuste();
    fireEvent.change(await screen.findByLabelText(/Quantas entraram/), { target: { value: "12" } });

    // Observação fica em branco de propósito: é o caso que travava.
    fireEvent.click(screen.getByRole("button", { name: /^Salvar$/ }));

    await waitFor(() => {
      const envio = chamadas.find((c) => c.url.includes("/inventory"));
      expect(envio).toBeTruthy();
      expect((envio!.body as { delta: number }).delta).toBe(12);
    });
  });

  // A queixa que originou o botão "Saiu": no campo único era preciso lembrar
  // do sinal de menos, e quem esquecia AUMENTAVA o estoque achando que estava
  // baixando. Agora a direção é escolhida, não digitada.
  it('"Saiu" manda baixa negativa, sem depender de digitar o sinal', async () => {
    render(<ProdutosClient />);
    await screen.findByText("Doritos");

    await abrirAjuste();
    fireEvent.click(screen.getByRole("button", { name: /^Saiu$/ }));
    fireEvent.change(await screen.findByLabelText(/Quantas saíram/), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /^Salvar$/ }));

    await waitFor(() => {
      const envio = chamadas.find((c) => c.url.includes("/inventory"));
      expect((envio!.body as { delta: number }).delta).toBe(-3);
    });
  });

  // "Contei 8" numa prateleira que o sistema achava ter 40: a diferença é
  // conta do sistema, não da pessoa.
  it('"Contei" vira a diferença até o total informado', async () => {
    render(<ProdutosClient />);
    await screen.findByText("Doritos");

    await abrirAjuste();   // Doritos tem 40 no fixture
    fireEvent.click(screen.getByRole("button", { name: /^Contei$/ }));
    fireEvent.change(await screen.findByLabelText(/Quantas tem na prateleira/), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: /^Salvar$/ }));

    await waitFor(() => {
      const envio = chamadas.find((c) => c.url.includes("/inventory"));
      expect((envio!.body as { delta: number }).delta).toBe(-32);
    });
  });

  it("a empresa do ajuste é escolhida no modal e é ela que vai no envio", async () => {
    render(<ProdutosClient />);
    await screen.findByText("Doritos");

    await abrirAjuste();
    // Escopo na folha: o filtro do topo também tem um campo "Empresa", e é
    // justamente a diferença que importa aqui — o do topo escolhe o que a
    // lista MOSTRA, o do modal escolhe onde o estoque ENTRA.
    const folha = document.querySelector("form.sheet") as HTMLElement;
    fireEvent.change(within(folha).getByLabelText("Empresa"), { target: { value: "u2" } });
    fireEvent.change(screen.getByLabelText(/Quantas entraram/), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /^Salvar$/ }));

    await waitFor(() => {
      const envio = chamadas.find((c) => c.url.includes("/inventory"));
      expect((envio!.body as { profileId: string }).profileId).toBe("u2");
    });
  });
});
