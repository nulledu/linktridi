import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConsultarPanel } from "../ConsultarPanel";

/**
 * "Que peça é esta?"
 *
 * A diferença que este painel existe pra ter: bipar uma etiqueta de UNIDADE
 * responde sobre AQUELA etiqueta, não sobre o saldo. Quem chega com um adesivo
 * velho na mão não quer saber que temos 40 — quer saber onde ESTA foi parar.
 *
 * jsdom não tem câmera nem layout: a leitura por vídeo e a geometria se
 * conferem no navegador.
 */

const ALMOFADA = {
  id: "i1", nome: "Almofada 22x22", sku: "PRD-0001", unidade: "un",
  quantidade: 40, qtdMinima: 10, serializado: false, categoria: "Produto",
  ativo: true, cor: "Branco", local: "GAL-A · C3",
};

function rede(corpo: Record<string, unknown>, status = 200) {
  return vi.fn(() => Promise.resolve({
    ok: status < 400, status, json: () => Promise.resolve(corpo),
  } as Response));
}

function urls(): string[] {
  return (globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock.calls.map((c) => String(c[0]));
}

beforeEach(() => { vi.stubGlobal("fetch", rede({ ok: true, itens: [ALMOFADA], via: "produto" })); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function digitar(texto: string) {
  fireEvent.change(screen.getByPlaceholderText(/Bipe a etiqueta/i), { target: { value: texto } });
}

describe("um campo só, duas perguntas", () => {
  it("Enter pergunta por CÓDIGO — é o que a pistola manda", () => {
    render(<ConsultarPanel />);
    digitar("PRD-0001");
    fireEvent.keyDown(screen.getByPlaceholderText(/Bipe a etiqueta/i), { key: "Enter" });
    expect(urls().some((u) => u.includes("codigo=PRD-0001"))).toBe(true);
  });

  it("enviar o formulário sem Enter no campo pergunta por BUSCA", () => {
    // Quem não tem leitor digita um pedaço do nome e clica. "almofada" não é
    // código, e responder como se fosse devolveria "não achei".
    render(<ConsultarPanel />);
    digitar("almofada");
    fireEvent.submit(screen.getByPlaceholderText(/Bipe a etiqueta/i).closest("form")!);
    expect(urls().some((u) => u.includes("busca=almofada"))).toBe(true);
  });

  it("campo vazio não gasta requisição", () => {
    render(<ConsultarPanel />);
    fireEvent.keyDown(screen.getByPlaceholderText(/Bipe a etiqueta/i), { key: "Enter" });
    expect(urls()).toHaveLength(0);
  });
});

describe("o cartão responde o que a pessoa veio perguntar", () => {
  it("saldo, unidade e onde fica", async () => {
    render(<ConsultarPanel />);
    digitar("PRD-0001");
    fireEvent.keyDown(screen.getByPlaceholderText(/Bipe a etiqueta/i), { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByText("Almofada 22x22")).toBeTruthy();
      expect(screen.getByText("40")).toBeTruthy();
      expect(screen.getByText("GAL-A · C3")).toBeTruthy();
    });
  });

  it("abaixo do mínimo é AVISADO, não deixado pra quem souber comparar", async () => {
    vi.stubGlobal("fetch", rede({ ok: true, itens: [{ ...ALMOFADA, quantidade: 4 }], via: "produto" }));
    render(<ConsultarPanel />);
    digitar("PRD-0001");
    fireEvent.keyDown(screen.getByPlaceholderText(/Bipe a etiqueta/i), { key: "Enter" });
    await waitFor(() => expect(document.body.textContent).toMatch(/no mínimo \(10\)/));
  });

  it("item sem lugar definido DIZ isso, em vez de deixar o campo vazio", async () => {
    vi.stubGlobal("fetch", rede({ ok: true, itens: [{ ...ALMOFADA, local: null }], via: "produto" }));
    render(<ConsultarPanel />);
    digitar("PRD-0001");
    fireEvent.keyDown(screen.getByPlaceholderText(/Bipe a etiqueta/i), { key: "Enter" });
    await waitFor(() => expect(document.body.textContent).toMatch(/sem lugar definido/));
  });
});

describe("a etiqueta bipada — a resposta que só existe aqui", () => {
  it("etiqueta que já saiu conta QUANDO, POR QUEM e POR QUÊ", async () => {
    // Um saldo de 40 não encerra a busca por uma peça específica. "Expedida em
    // 12/08 por João" encerra.
    vi.stubGlobal("fetch", rede({
      ok: true, via: "unidade",
      itens: [{
        ...ALMOFADA, serializado: true, etiquetasEmEstoque: 31,
        unidadeLida: {
          codigo: "PRD-0001-000042", status: "expedido", quantidade: 1,
          baixaMotivo: "pedido 8812", baixadoEm: "2026-08-12T14:30:00Z", baixadoPor: "João",
        },
      }],
    }));
    render(<ConsultarPanel />);
    digitar("PRD-0001-000042");
    fireEvent.keyDown(screen.getByPlaceholderText(/Bipe a etiqueta/i), { key: "Enter" });

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/A ETIQUETA QUE VOCÊ BIPOU/);
      expect(document.body.textContent).toMatch(/PRD-0001-000042 · Expedida pro cliente/);
      expect(document.body.textContent).toMatch(/João/);
      expect(document.body.textContent).toMatch(/pedido 8812/);
    });
  });

  it("caixa lacrada diz quantas peças tem dentro", async () => {
    // É a informação que quem pega a caixa não consegue obter sem romper o lacre.
    vi.stubGlobal("fetch", rede({
      ok: true, via: "unidade",
      itens: [{ ...ALMOFADA, serializado: true, unidadeLida: { codigo: "PRD-0001-000007", status: "em_estoque", quantidade: 50, baixaMotivo: null, baixadoEm: null, baixadoPor: null } }],
    }));
    render(<ConsultarPanel />);
    digitar("PRD-0001-000007");
    fireEvent.keyDown(screen.getByPlaceholderText(/Bipe a etiqueta/i), { key: "Enter" });
    await waitFor(() => expect(document.body.textContent).toMatch(/Caixa lacrada · 50 peças/));
  });

  it("item serializado mostra a contagem de etiquetas, que é outro número", async () => {
    vi.stubGlobal("fetch", rede({ ok: true, via: "produto", itens: [{ ...ALMOFADA, serializado: true, etiquetasEmEstoque: 31 }] }));
    render(<ConsultarPanel />);
    digitar("PRD-0001");
    fireEvent.keyDown(screen.getByPlaceholderText(/Bipe a etiqueta/i), { key: "Enter" });
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/ETIQUETAS EM ESTOQUE/);
      expect(document.body.textContent).toMatch(/por etiqueta, uma a uma/);
    });
  });
});

describe("quando não dá", () => {
  it("sem permissão, a frase diz QUAL pedir", async () => {
    vi.stubGlobal("fetch", rede({ error: "forbidden" }, 403));
    render(<ConsultarPanel />);
    digitar("PRD-0001");
    fireEvent.keyDown(screen.getByPlaceholderText(/Bipe a etiqueta/i), { key: "Enter" });
    await waitFor(() => expect(document.body.textContent).toMatch(/Ver catálogo \/ itens/));
  });

  it("o aviso do servidor é mostrado — SKU duplicado manda arrumar o cadastro", async () => {
    vi.stubGlobal("fetch", rede({
      ok: true, itens: [], via: "sku_duplicado",
      aviso: "Dois itens do catálogo têm este mesmo SKU. Arrume o cadastro em Estoque › Catálogo.",
    }));
    render(<ConsultarPanel />);
    digitar("PRD-0001");
    fireEvent.keyDown(screen.getByPlaceholderText(/Bipe a etiqueta/i), { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Arrume o cadastro/));
  });

  it("rede caída não some com a tela nem mente que não achou", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    render(<ConsultarPanel />);
    digitar("PRD-0001");
    fireEvent.keyDown(screen.getByPlaceholderText(/Bipe a etiqueta/i), { key: "Enter" });
    await waitFor(() => expect(document.body.textContent).toMatch(/Sem conexão/));
  });
});

describe("imprimir a etiqueta que se achou", () => {
  /*
   * O botão existe SEM Zebra cadastrada.
   *
   * Este teste guarda uma decisão, não um detalhe: antes o botão só aparecia
   * quando havia uma Zebra registrada nesta máquina, e o computador da bancada
   * — que não tem — simplesmente não imprimia. Quem precisava da etiqueta
   * concluía que o site não sabe imprimir, e a próxima pessoa a "consertar"
   * isso vai ser tentada a esconder o botão de novo "porque não tem
   * impressora". Sem impressora ele manda para o diálogo do sistema, que é o
   * mesmo Ctrl+P, e é uma resposta melhor que um botão ausente.
   */
  it("achou o item, dá para imprimir mesmo sem impressora cadastrada", async () => {
    render(<ConsultarPanel />);
    digitar("PRD-0001");
    fireEvent.keyDown(screen.getByPlaceholderText(/Bipe a etiqueta/i), { key: "Enter" });

    await waitFor(() => expect(screen.getByText("Almofada 22x22")).toBeTruthy());
    expect(screen.getByRole("button", { name: /Imprimir etiqueta/i })).toBeTruthy();
  });

  it("item sem SKU e sem etiqueta lida não oferece impressão", async () => {
    // Aqui o botão sumir é o certo: não há código para sair no papel, e uma
    // etiqueta em branco é pior que nenhuma.
    vi.stubGlobal("fetch", rede({ ok: true, itens: [{ ...ALMOFADA, sku: null }], via: "produto" }));
    render(<ConsultarPanel />);
    digitar("almofada");
    fireEvent.submit(screen.getByPlaceholderText(/Bipe a etiqueta/i).closest("form")!);

    await waitFor(() => expect(screen.getByText("Almofada 22x22")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Imprimir etiqueta/i })).toBeNull();
  });
});
