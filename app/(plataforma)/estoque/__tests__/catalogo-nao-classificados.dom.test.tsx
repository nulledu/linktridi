import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { CatalogoClient } from "../CatalogoClient";
import { ItemEditor } from "../ItemEditor";
import type { Item } from "../tipos";
import { HIERARQUIA_DEFS } from "@/lib/estoque-hierarquia";

// "Deixa sem categoria por enquanto que eu vou adicionando depois" — só que
// item com `hierarquia` nula não aparece em NENHUMA das oito abas: importar 81
// itens assim é enterrar 81 itens. Este arquivo trava as quatro coisas que
// desfazem isso: o aviso que revela, a aba que reúne, a busca que não perde e a
// triagem em lote que resolve. Mais a armadilha do editor, que classificava
// como Matéria-Prima calado.
//
// Sem geometria: jsdom não tem motor de layout. Celular se confere no
// navegador (/dev-mobile?ws=estoque).

const ITENS = [
  { id: "a", nome: "Chapa MDF", hierarquia: "peca", produzido: false, serializado: true, categoria: "Madeira", imagem_url: null, unidade: "ch", quantidade: 5, qtd_minima: 0, ativo: true, sku: "PEC-0001" },
  { id: "b", nome: "Cavalete", hierarquia: "peca", produzido: false, serializado: false, categoria: "Madeira", imagem_url: null, unidade: "un", quantidade: 12, qtd_minima: 0, ativo: true, sku: null },
  // Os três da planilha do galpão: sem hierarquia nenhuma.
  { id: "x", nome: "Fita adesiva 48mm", hierarquia: null, produzido: false, serializado: false, categoria: "Logística", imagem_url: null, unidade: "cx", quantidade: 14, qtd_minima: 0, ativo: true, sku: null },
  { id: "y", nome: "Graxa de lítio", hierarquia: null, produzido: false, serializado: false, categoria: null, imagem_url: null, unidade: "un", quantidade: 3, qtd_minima: 0, ativo: true, sku: null },
  { id: "z", nome: "Pallet PBR", hierarquia: null, produzido: false, serializado: false, categoria: "Logística", imagem_url: null, unidade: "un", quantidade: 8, qtd_minima: 0, ativo: true, sku: null },
];

function stub() {
  return vi.fn((url: string, _init?: RequestInit) => {
    const u = String(url);
    const body = u.startsWith("/api/estoque-itens/classificar")
      ? { ok: true, atualizados: 3 }
      : u.startsWith("/api/estoque-itens")
        ? { itens: ITENS, podeGerir: true, podeCadastrar: true, podeAjustar: true, podeVerCusto: false }
        : {};
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
  });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("estoque.hierarquia", "peca"); // a aba é lembrada — ver useSticky
  vi.stubGlobal("fetch", stub());
});
afterEach(() => vi.unstubAllGlobals());

describe("Catálogo — item sem hierarquia não é item invisível", () => {
  it("avisa no topo, de qualquer aba, que há itens esperando classificação", async () => {
    render(<CatalogoClient />);
    // A aba aberta é Peça; o aviso fala do catálogo inteiro.
    expect(await screen.findByText(/3 itens ainda sem hierarquia/)).toBeTruthy();
  });

  it("um toque no aviso leva aos três, e eles aparecem", async () => {
    render(<CatalogoClient />);
    await screen.findByText(/3 itens ainda sem hierarquia/);
    expect(screen.queryByText("Fita adesiva 48mm")).toBeNull(); // invisível na aba Peça

    fireEvent.click(screen.getByRole("button", { name: /Ver e classificar/ }));

    expect(screen.getByText("Fita adesiva 48mm")).toBeTruthy();
    expect(screen.getByText("Graxa de lítio")).toBeTruthy();
    expect(screen.getByText("Pallet PBR")).toBeTruthy();
    expect(screen.queryByText("Chapa MDF")).toBeNull(); // agora o filtro é o inverso
  });

  it("a tela explica que hierarquia e categoria são eixos diferentes", async () => {
    render(<CatalogoClient />);
    await screen.findByText(/3 itens ainda sem hierarquia/);
    fireEvent.click(screen.getByRole("button", { name: /Ver e classificar/ }));

    expect(screen.getByText(/Do que o item é feito/)).toBeTruthy();
    expect(screen.getByText(/Pra que serve, de quem é/)).toBeTruthy();
  });

  it("busca por nome não perde o item não classificado — diz onde ele está", async () => {
    render(<CatalogoClient />);
    await screen.findByText(/3 itens ainda sem hierarquia/);

    fireEvent.change(screen.getByPlaceholderText(/Buscar/), { target: { value: "graxa" } });
    // Estando em Peça, a lista fica vazia — mas a linha aponta a aba certa.
    const atalho = screen.getByRole("button", { name: /Não classificados 1/ });
    fireEvent.click(atalho);
    expect(screen.getByText("Graxa de lítio")).toBeTruthy();
  });

  it("classificados, somem do balde: a aba some quando não é a aberta", async () => {
    const so2 = ITENS.filter((i) => i.hierarquia !== null);
    vi.stubGlobal("fetch", vi.fn((_url: string, _init?: RequestInit) => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ itens: so2, podeGerir: true, podeCadastrar: true, podeAjustar: true, podeVerCusto: false }),
    } as Response)));
    render(<CatalogoClient />);
    await screen.findByText(/1 de 2/); // bloco de etiquetagem da aba Peça
    expect(screen.queryByText(/ainda sem hierarquia/)).toBeNull();
    expect(screen.queryByRole("tab", { name: /Não classificados/ })).toBeNull();
  });
});

describe("Catálogo — triagem em lote", () => {
  it("manda os marcados num pedido só, com hierarquia e categoria", async () => {
    const espiao = stub();
    vi.stubGlobal("fetch", espiao);
    render(<CatalogoClient />);
    await screen.findByText(/3 itens ainda sem hierarquia/);
    fireEvent.click(screen.getByRole("button", { name: /Ver e classificar/ }));
    fireEvent.click(screen.getByRole("button", { name: /Classificar 3 de uma vez/ }));

    const painel = await screen.findByRole("dialog");
    fireEvent.click(within(painel).getByRole("button", { name: /Marcar todos \(3\)/ }));
    fireEvent.click(within(painel).getByRole("button", { name: "Insumo Indireto" }));
    fireEvent.click(within(painel).getByRole("button", { name: "Logística" })); // sugestão do galpão
    fireEvent.click(within(painel).getByRole("button", { name: /Classificar 3 itens/ }));

    await waitFor(() => expect(screen.getByText(/passaram a ser/)).toBeTruthy());
    const chamada = espiao.mock.calls.find((c) => String(c[0]).startsWith("/api/estoque-itens/classificar"));
    expect(chamada).toBeTruthy();
    expect(JSON.parse(String((chamada![1] as RequestInit).body))).toEqual({
      ids: ["x", "y", "z"],
      hierarquia: "insumo_indireto",
      categoria: "Logística",
    });
  });

  it("sem categoria escolhida, a categoria de quem já tem uma não é tocada", async () => {
    const espiao = stub();
    vi.stubGlobal("fetch", espiao);
    render(<CatalogoClient />);
    await screen.findByText(/3 itens ainda sem hierarquia/);
    fireEvent.click(screen.getByRole("button", { name: /Ver e classificar/ }));
    fireEvent.click(screen.getByRole("button", { name: /Classificar 3 de uma vez/ }));

    const painel = await screen.findByRole("dialog");
    fireEvent.click(within(painel).getByRole("button", { name: /Marcar todos \(3\)/ }));
    fireEvent.click(within(painel).getByRole("button", { name: "Peça" }));
    fireEvent.click(within(painel).getByRole("button", { name: /Classificar 3 itens/ }));

    await waitFor(() => expect(screen.getByText(/passaram a ser/)).toBeTruthy());
    const corpo = JSON.parse(String((espiao.mock.calls.find((c) => String(c[0]).startsWith("/api/estoque-itens/classificar"))![1] as RequestInit).body));
    expect(corpo.categoria).toBeUndefined();
  });

  it("não deixa classificar sem escolher a hierarquia", async () => {
    render(<CatalogoClient />);
    await screen.findByText(/3 itens ainda sem hierarquia/);
    fireEvent.click(screen.getByRole("button", { name: /Ver e classificar/ }));
    fireEvent.click(screen.getByRole("button", { name: /Classificar 3 de uma vez/ }));

    const painel = await screen.findByRole("dialog");
    fireEvent.click(within(painel).getByRole("button", { name: /Marcar todos \(3\)/ }));
    expect(within(painel).getByRole("button", { name: /Classificar 3 itens/ })).toBeDisabled();
  });
});

describe("Editor — item não classificado não vira matéria-prima calado", () => {
  const SEM: Item = {
    id: "y", nome: "Graxa de lítio", hierarquia: null, produzido: false, serializado: false,
    categoria: null, imagem_url: null, unidade: "un", quantidade: 3, qtd_minima: 0, ativo: true, sku: null,
  };

  it("abre sem nenhuma hierarquia marcada e diz por que o item não aparece", async () => {
    render(<ItemEditor item={SEM} itens={[]} onClose={() => {}} onSaved={() => {}} />);
    expect(await screen.findByText(/não tem hierarquia/)).toBeTruthy();
    // O bug era este: `?? "materia_prima"` pintava a primeira como escolhida —
    // e o Salvar seguinte gravava a escolha que ninguém fez.
    //
    // A varredura é da FILEIRA DE HIERARQUIA, não do modal inteiro: "Como
    // etiquetar este item" também usa `aria-pressed`, e ali nascer marcado é
    // certo (código fixo é o padrão do sistema, decisão do dono). Varrer tudo
    // media duas perguntas diferentes com a mesma régua.
    for (const rotulo of HIERARQUIA_DEFS.map((h) => h.label)) {
      expect(screen.getByRole("button", { name: rotulo }).getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("salvar sem classificar não manda hierarquia — o item continua nulo, não vira MP", async () => {
    const espiao = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response));
    vi.stubGlobal("fetch", espiao);
    render(<ItemEditor item={SEM} itens={[]} onClose={() => {}} onSaved={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(espiao.mock.calls.some((c) => (c[1] as RequestInit)?.method === "PATCH")).toBe(true));
    const patch = espiao.mock.calls.find((c) => (c[1] as RequestInit)?.method === "PATCH")!;
    const corpo = JSON.parse(String((patch[1] as RequestInit).body));
    expect(corpo.hierarquia).toBe(""); // a API ignora o que não é hierarquia válida
  });
});
