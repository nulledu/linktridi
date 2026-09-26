import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CatalogoClient } from "../CatalogoClient";

// O Catálogo é a porta do Estoque, e no primeiro dia ele está legitimamente
// vazio. Isso torna duas coisas fatais:
//
// 1. Falha de carga desenhada como vazio. Um 401 de sessão expirada devolvia
//    `{}`, o catálogo virava lista vazia, `podeGerir` virava falso e sumiam os
//    botões — indistinguível de um catálogo zerado de verdade. Quem chega
//    conclui que o sistema perdeu os itens. Pior: resposta não-JSON rejeitava o
//    `r.json()` e a tela ficava presa em "Carregando…" pra sempre.
// 2. Vazio que não ensina. "Nada nesta hierarquia." não diz o que a aba é, qual
//    é o primeiro passo, nem que existe ordem (lugares e fornecedores antes,
//    hierarquia antes do SKU, SKU antes da etiqueta).
//
// jsdom não tem motor de layout: nada de geometria aqui.

const ITENS = [
  { id: "a", nome: "Chapa MDF", hierarquia: "peca", produzido: false, serializado: true, categoria: "Madeira", imagem_url: null, unidade: "ch", quantidade: 5, qtd_minima: 3, ativo: true, sku: "PEC-0001" },
  { id: "b", nome: "Cavalete", hierarquia: "peca", produzido: false, serializado: false, categoria: "Madeira", imagem_url: null, unidade: "un", quantidade: 12, qtd_minima: 0, ativo: true, sku: null },
  { id: "c", nome: "Tampo", hierarquia: "peca", produzido: false, serializado: false, categoria: "Madeira", imagem_url: null, unidade: "un", quantidade: 0, qtd_minima: 0, ativo: true, sku: "PEC-0002" },
];

function ok(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
}

/** Rede falsa. `itens` é o catálogo; `locais`/`fornecedores` são as contagens
 *  que o mapa do primeiro dia consulta. */
function rede({ itens = ITENS as unknown[], locais = [] as unknown[], fornecedores = [] as unknown[] } = {}) {
  return vi.fn((url: string) => {
    const u = String(url);
    if (u.startsWith("/api/estoque-itens")) return ok({ itens, podeGerir: true, podeCadastrar: true, podeAjustar: true, podeVerCusto: false });
    if (u.startsWith("/api/estoque/locais")) return ok({ locais, podeGerir: true });
    if (u.startsWith("/api/estoque/fornecedores")) return ok({ fornecedores, podeGerir: true });
    if (u.startsWith("/api/estoque/reabastecer")) return ok({ criadas: 0, abaixo: 0 });
    return ok({});
  });
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => vi.unstubAllGlobals());

describe("Catálogo — falha não é o mesmo que estar vazio", () => {
  it("401 vira erro com saída, não um catálogo aparentemente zerado", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: "unauthorized" }) } as Response)));
    render(<CatalogoClient />);

    expect(await screen.findByText(/Não deu pra carregar o catálogo/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tentar de novo/ })).toBeTruthy();
    // O vazio que ensina NÃO pode aparecer aqui: seria afirmar que o catálogo
    // está zerado quando ninguém conseguiu perguntar.
    expect(screen.queryByText(/O catálogo ainda está vazio/)).toBeNull();
  });

  it("resposta que não é JSON não deixa a tela presa em Carregando", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.reject(new Error("<html>")) } as unknown as Response)));
    render(<CatalogoClient />);

    expect(await screen.findByText(/Não deu pra carregar o catálogo/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Carregando…")).toBeNull());
  });

  it("tentar de novo refaz a busca e mostra o catálogo", async () => {
    let falhar = true;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (falhar) return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response);
      return rede()(url);
    }));
    render(<CatalogoClient />);

    const botao = await screen.findByRole("button", { name: /Tentar de novo/ });
    falhar = false;
    fireEvent.click(botao);
    expect(await screen.findByText("Chapa MDF")).toBeTruthy();
  });
});

describe("Catálogo — o vazio do primeiro dia ensina", () => {
  it("diz o que o catálogo é, oferece as duas portas e conta a ordem", async () => {
    vi.stubGlobal("fetch", rede({ itens: [] }));
    render(<CatalogoClient />);

    expect(await screen.findByText(/O catálogo ainda está vazio/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Importar planilha/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Cadastrar um item/ })).toBeTruthy();
    // A ordem, com as dependências nomeadas.
    expect(screen.getByText(/Os lugares/)).toBeTruthy();
    expect(screen.getByText(/Os fornecedores/)).toBeTruthy();
    expect(screen.getByText(/Mínimo e etiqueta/)).toBeTruthy();
  });

  it("marca como feito o passo que já foi cumprido em outra aba", async () => {
    vi.stubGlobal("fetch", rede({ itens: [], locais: [{ id: "l1" }], fornecedores: [] }));
    render(<CatalogoClient />);

    // "Feito" precisa existir em texto, e não só na cor da bolinha.
    await waitFor(() => expect(screen.getAllByText(/Feito/)).toHaveLength(1));
  });

  it("sem permissão de gerir, não promete botão que não existe", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      const u = String(url);
      if (u.startsWith("/api/estoque-itens")) return ok({ itens: [], podeGerir: false, podeVerCusto: false });
      return ok({ locais: [], fornecedores: [] });
    }));
    render(<CatalogoClient />);

    expect(await screen.findByText(/O catálogo ainda está vazio/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Importar planilha/ })).toBeNull();
    expect(screen.getByText(/não cadastrar/)).toBeTruthy();
  });
});

describe("Catálogo — o mínimo é uma régua visível", () => {
  beforeEach(() => localStorage.setItem("estoque.hierarquia", "peca"));

  it("conta quantos itens da aba estão fora de toda medição", async () => {
    vi.stubGlobal("fetch", rede());
    render(<CatalogoClient />);

    // Dois dos três têm qtd_minima 0 — não entram em nenhuma verificação.
    expect(await screen.findByText(/2 sem mínimo/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Sem mínimo 2/ })).toBeTruthy();
  });

  it("o filtro mostra só quem não tem ponto de reposição", async () => {
    vi.stubGlobal("fetch", rede());
    render(<CatalogoClient />);

    fireEvent.click(await screen.findByRole("button", { name: /Sem mínimo 2/ }));
    await waitFor(() => expect(screen.queryByText("Chapa MDF")).toBeNull());
    expect(screen.getByText("Cavalete")).toBeTruthy();
  });

  it("'nada abaixo do mínimo' não vira 'tudo em dia' sobre quem ninguém mede", async () => {
    vi.stubGlobal("fetch", rede());
    render(<CatalogoClient />);

    fireEvent.click(await screen.findByRole("button", { name: /Repor estoque/ }));
    const msg = await screen.findByText(/Nada abaixo do mínimo entre/);
    expect(msg.textContent).toMatch(/1 item que tem regra/);
    expect(msg.textContent).toMatch(/2 itens ainda não têm mínimo/);
  });
});

describe("Catálogo — a aba aberta é onde o trabalho está", () => {
  it("sem escolha salva, abre na hierarquia com mais itens", async () => {
    vi.stubGlobal("fetch", rede({
      itens: [
        ...ITENS,
        { id: "d", nome: "Cola branca", hierarquia: "materia_prima", produzido: false, serializado: false, categoria: "Química", imagem_url: null, unidade: "kg", quantidade: 2, qtd_minima: 1, ativo: true, sku: null },
      ],
    }));
    render(<CatalogoClient />);

    // Peça tem 3 e Matéria-Prima tem 1: a aba aberta mostra as peças.
    expect(await screen.findByText("Cavalete")).toBeTruthy();
    expect(screen.queryByText("Cola branca")).toBeNull();
  });

  it("aba vazia num catálogo cheio diz onde o resto está", async () => {
    localStorage.setItem("estoque.hierarquia", "produto_final");
    vi.stubGlobal("fetch", rede());
    render(<CatalogoClient />);

    expect(await screen.findByText(/O catálogo tem 3 em outras hierarquias/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Peça 3/ }));
    expect(await screen.findByText("Cavalete")).toBeTruthy();
  });
});
