import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ModalNota } from "../estoque/ModalNota";
import type { MarketProduct } from "../../../../lib/tridimarket/types";

// Ler a foto da nota depende de um worker rodando num PC da empresa. Na prática
// ele fica desligado, e aí a nota entra na fila e a entrada de estoque
// simplesmente não acontece — foi o que travou o lançamento de um cupom de seis
// itens. Digitar à mão é mais trabalhoso e SEMPRE funciona, então tem que ser um
// caminho de primeira classe, não uma alternativa escondida.
//
// O que este teste trava: a porta existe na tela de upload, ela leva direto pra
// conferência, dá pra acrescentar linha, e o envio NÃO leva `jobId` (não há job).
// Esse último detalhe importa porque o zod `.optional()` recusa `null`: mandar
// `jobId: null` reprovava tudo com "invalid_confirm".

const PRODUTOS: MarketProduct[] = [
  { id: 1, name: "Nutry cereal coco", barcode: "7891331014513", price: 2.5, stock: 0 } as MarketProduct,
];

let chamadas: Array<{ url: string; body: Record<string, unknown> | null }>;

beforeEach(() => {
  chamadas = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    chamadas.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ ok: true, data: { entrouEstoque: 1, criados: 0 } }),
    } as Response);
  }));
});
afterEach(() => vi.unstubAllGlobals());

function abrir(onDone = vi.fn()) {
  render(<ModalNota profileId="11111111-1111-1111-1111-111111111111" companyId={0}
    produtos={PRODUTOS} onClose={() => {}} onDone={onDone} />);
  return onDone;
}

describe("Adicionar nota · digitar os itens à mão", () => {
  it("a porta aparece junto do botão de foto", () => {
    abrir();
    expect(screen.getByRole("button", { name: /Digitar os itens à mão/ })).toBeInTheDocument();
  });

  it("leva direto pra conferência, sem passar pelo worker", async () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: /Digitar os itens à mão/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Acrescentar item/ })).toBeInTheDocument());
    // Nenhuma requisição: digitar não sobe imagem nem cria job.
    expect(chamadas).toHaveLength(0);
  });

  it("dá pra acrescentar linha — o cupom que motivou isso tinha seis itens", async () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: /Digitar os itens à mão/ }));
    const acrescentar = await screen.findByRole("button", { name: /Acrescentar item/ });
    // "Nome do produto" é um por linha. `spinbutton` não serve: a quantidade
    // usa inputMode="decimal" sem type="number", então não tem esse papel.
    const antes = screen.getAllByPlaceholderText("Nome do produto").length;
    fireEvent.click(acrescentar);
    await waitFor(() => expect(screen.getAllByPlaceholderText("Nome do produto").length).toBe(antes + 1));
  });

  it("o envio não leva jobId — mandar null reprovava no zod", async () => {
    abrir();
    fireEvent.click(screen.getByRole("button", { name: /Digitar os itens à mão/ }));
    await screen.findByRole("button", { name: /Acrescentar item/ });

    // Casa a linha com um produto existente pra o item ser válido.
    fireEvent.click(screen.getByRole("button", { name: /Dar entrada no estoque/ }));

    await waitFor(() => {
      const envio = chamadas.find((c) => c.url.includes("notas/confirmar"));
      expect(envio, "não saiu a confirmação").toBeTruthy();
      expect(envio!.body).not.toHaveProperty("jobId");
    });
  });
});
