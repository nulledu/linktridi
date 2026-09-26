import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ModalPessoa } from "../Cadastro";

// O campo "Limite próprio" reusava a máscara de dinheiro do lançamento de
// pagamento — dígitos entrando pela direita em CENTAVOS. Quem digitava 100,
// que é o número na cabeça de quem libera crédito, saía com limite de R$ 1,00;
// pra chegar em cem reais era preciso teclar 10000. Não havia como perceber:
// o campo mostrava exatamente o que a pessoa "pediu".
//
// Limite não tem centavo — é 50, 100, 150, 500. Aqui cada dígito vale um real.

const UNIDADES = [{ id: "u1", nome: "Tridi Escritório", ativo: true, cnpj: null }];

let corpos: Record<string, unknown>[] = [];

beforeEach(() => {
  corpos = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    if (init?.body) corpos.push(JSON.parse(String(init.body)));
    // A lista de usuários do Gaius é buscada ao abrir; devolver [] basta.
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) } as Response);
  }));
});
afterEach(() => vi.unstubAllGlobals());

function abrir(limiteProprio: number | null) {
  render(
    <ModalPessoa
      pessoa={{ id: 7, nome: "Luiz Fernando Santos", fotoUrl: null, unidadeId: "u1", ativo: true, limiteProprio, usuarioId: null }}
      unidades={UNIDADES as never}
      onFechar={() => {}}
      onSalvo={() => {}}
    />,
  );
  return screen.getByPlaceholderText("R$ 500") as HTMLInputElement;
}

describe("limite próprio é em reais inteiros", () => {
  it("digitar 500 vale R$ 500 — não R$ 5,00", async () => {
    const campo = abrir(null);
    fireEvent.change(campo, { target: { value: "500" } });
    expect(campo.value.replace(/\s/g, " ")).toBe("R$ 500");

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(corpos.some((c) => c.normalLimit === 500)).toBe(true));
  });

  it("o limite que já existe abre sem centavo fantasma", () => {
    expect(abrir(400).value.replace(/\s/g, " ")).toBe("R$ 400");
  });

  it("campo vazio continua significando “usa o limite padrão”", async () => {
    const campo = abrir(null);
    expect(campo.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    // Sem valor digitado, nada de normalLimit no PATCH: quem manda é o padrão.
    await waitFor(() => expect(corpos.length).toBeGreaterThan(0));
    expect(corpos.every((c) => !("normalLimit" in c))).toBe(true);
  });
});
