import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { UnidadesDoItem } from "../UnidadesDoItem";
import { CatalogoClient } from "../CatalogoClient";
import type { Item } from "../tipos";

// PEÇAS e ETIQUETAS são dois números, e só coincidem quando não há caixa.
//
// A caixa lacrada é UMA etiqueta valendo N peças — ninguém etiqueta 50 folhas
// de alavanca uma a uma. Quem confere a prateleira conta PEÇAS; a contagem por
// status desta tela conta ETIQUETAS. Chamar os dois de "unidades" foi o que
// permitiu 8 caixas de 50 aparecerem como "8".
//
// Sem geometria: jsdom não tem motor de layout — 320px e alvo de toque se
// conferem no navegador (/dev-mobile?ws=estoque).

/** `/api/estoque/unidades` devolve a lista e a contagem por STATUS. */
function stubUnidades(unidades: Record<string, unknown>[], contagem: Record<string, number>) {
  return vi.fn(() => Promise.resolve({
    ok: true, status: 200, json: () => Promise.resolve({ unidades, contagem }),
  } as Response));
}

const CAIXA = { id: "u1", codigo: "ALV-0001-000001", status: "em_estoque", criado_em: "2026-08-10T12:00:00.000Z", quantidade: 50 };
const AVULSA = { id: "u2", codigo: "ALV-0001-000002", status: "em_estoque", criado_em: "2026-08-10T12:00:00.000Z", quantidade: 1 };

afterEach(() => vi.unstubAllGlobals());

describe("Unidades do item — peças e etiquetas são números diferentes", () => {
  it("com caixa no meio, a frase diz as peças E as etiquetas", async () => {
    vi.stubGlobal("fetch", stubUnidades([CAIXA, AVULSA], { em_estoque: 2, consumido: 3 }));
    // 51 peças (uma caixa de 50 + uma avulsa) em 2 etiquetas.
    render(<UnidadesDoItem itemId="i1" pecasEmEstoque={51} />);

    expect(await screen.findByText(/51 peças em 2 etiquetas/)).toBeTruthy();
    // As baixas continuam contadas em etiquetas, com o rótulo de sempre.
    expect(screen.getByText(/3 consumidas/)).toBeTruthy();
  });

  it("uma baixa só não diz 'consumidas'", async () => {
    vi.stubGlobal("fetch", stubUnidades([CAIXA], { em_estoque: 1, consumido: 1 }));
    render(<UnidadesDoItem itemId="i1" />);
    expect(await screen.findByText(/1 consumida(?!s)/)).toBeTruthy();
  });

  it("sem caixa nenhuma os dois números seriam iguais — e a frase é a de sempre", async () => {
    vi.stubGlobal("fetch", stubUnidades([AVULSA], { em_estoque: 1 }));
    render(<UnidadesDoItem itemId="i1" pecasEmEstoque={1} />);

    expect(await screen.findByText(/1 em estoque/)).toBeTruthy();
    expect(screen.queryByText(/peças em/)).toBeNull();
  });

  it("número do cadastro atrasado (logo depois de gerar) não inventa diferença", async () => {
    // O editor carregou o item quando ele tinha 0 peças; a pessoa gerou 4
    // etiquetas e a lista já sabe disso. 0 > 4 é falso, então a tela mostra o
    // que ela sabe de verdade em vez de anunciar "0 peças em 4 etiquetas".
    vi.stubGlobal("fetch", stubUnidades([AVULSA], { em_estoque: 4 }));
    render(<UnidadesDoItem itemId="i1" pecasEmEstoque={0} />);

    expect(await screen.findByText(/4 em estoque/)).toBeTruthy();
    expect(screen.queryByText(/0 peças/)).toBeNull();
  });

  it("a linha da caixa mostra quantas peças ela vale; a avulsa não repete 1", async () => {
    vi.stubGlobal("fetch", stubUnidades([CAIXA, AVULSA], { em_estoque: 2 }));
    const { container } = render(<UnidadesDoItem itemId="i1" />);

    // `findAll`: TabelaOuCards renderiza a tabela E os cards, e é o CSS que
    // esconde um dos dois — no jsdom, sem layout, os dois estão no documento.
    expect((await screen.findAllByText("ALV-0001-000001")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("50 un").length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/1 un/);
  });

  it("etiqueta antiga (sem a coluna quantidade) vale uma peça e não ganha selo", async () => {
    const semColuna = { id: "u3", codigo: "ALV-0001-000003", status: "em_estoque", criado_em: "2026-08-10T12:00:00.000Z" };
    vi.stubGlobal("fetch", stubUnidades([semColuna], { em_estoque: 1 }));
    const { container } = render(<UnidadesDoItem itemId="i1" />);

    expect((await screen.findAllByText("ALV-0001-000003")).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/ un/);
    expect(container.textContent).not.toMatch(/Peças na caixa/);
  });
});

describe("Catálogo — o número do item etiquetado é de peças", () => {
  const ITENS: Item[] = [
    { id: "a", nome: "Alavanca montada", hierarquia: "peca", produzido: true, serializado: true, categoria: "Metal", imagem_url: null, unidade: "un", quantidade: 312, qtd_minima: 0, ativo: true, sku: "ALV-0001" },
    { id: "b", nome: "Cola branca", hierarquia: "peca", produzido: false, serializado: false, categoria: "Metal", imagem_url: null, unidade: "kg", quantidade: 12, qtd_minima: 0, ativo: true, sku: null },
  ];

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("estoque.hierarquia", "peca");
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve({ itens: ITENS, podeGerir: true, podeCadastrar: true, podeAjustar: true, podeVerCusto: false }),
    } as Response)));
  });

  it('item etiquetado diz "peças" — ao lado do selo "etiqueta", "un" se lia como contagem de tiras de papel', async () => {
    render(<CatalogoClient />);
    expect(await screen.findByText("312")).toBeTruthy();
    expect(screen.getByText("peças")).toBeTruthy();
  });

  it("item a granel mantém a unidade do cadastro, que é onde ela descreve o número", async () => {
    render(<CatalogoClient />);
    expect(await screen.findByText("12")).toBeTruthy();
    expect(screen.getByText("kg")).toBeTruthy();
  });
});
