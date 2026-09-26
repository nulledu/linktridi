import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CatalogoClient } from "../CatalogoClient";

/**
 * Buscar é um MODO, não um filtro da aba.
 *
 * O catálogo mostra uma hierarquia por vez. Enquanto a busca procurava dentro
 * dela, digitar "cola" estando em Peça devolvia "nada nesta hierarquia" com a
 * cola cadastrada em Insumo — pra achar era preciso primeiro adivinhar a
 * categoria, que é o contrário do que uma busca serve. A saída era uma linha
 * discreta dizendo "3 em outras abas", que a pessoa precisava notar e clicar.
 *
 * Pedido do dono, na palavra dele: "quero poder ter a barra de pesquisa pra
 * pesquisar no geral, sem ser por categoria".
 *
 * Sem geometria: jsdom não tem layout. As duas linhas das abas no computador se
 * conferem no navegador (ver rolagem-horizontal).
 */

const ITENS = [
  { id: "p1", nome: "Cavalete de madeira", hierarquia: "peca", produzido: false, serializado: false, categoria: "Madeira", imagem_url: null, unidade: "un", quantidade: 12, qtd_minima: 0, ativo: true, sku: "PEC-0001" },
  { id: "p2", nome: "Trava de encaixe", hierarquia: "peca", produzido: false, serializado: false, categoria: "Metal", imagem_url: null, unidade: "un", quantidade: 4, qtd_minima: 0, ativo: true, sku: "PEC-0002" },
  // A cola mora noutra hierarquia — é ela que a busca tinha de achar e não achava.
  { id: "i1", nome: "Cola PVA extra branca", hierarquia: "insumo_direto", produzido: false, serializado: false, categoria: "Insumos", imagem_url: null, unidade: "un", quantidade: 3, qtd_minima: 0, ativo: true, sku: "ID-0001" },
  { id: "i2", nome: "Cola bonder", hierarquia: "insumo_indireto", produzido: false, serializado: false, categoria: "Insumos", imagem_url: null, unidade: "un", quantidade: 1, qtd_minima: 0, ativo: true, sku: "II-0001" },
  // Sem hierarquia nenhuma: não está em aba alguma, e era o caso fatal.
  { id: "x1", nome: "Cola quente refil", hierarquia: null, produzido: false, serializado: false, categoria: null, imagem_url: null, unidade: "un", quantidade: 8, qtd_minima: 0, ativo: true, sku: null },
];

function rede() {
  return vi.fn((url: string) =>
    Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve(
        String(url).startsWith("/api/estoque-itens")
          ? { itens: ITENS, podeGerir: true, podeCadastrar: true, podeAjustar: true, podeVerCusto: false }
          : {},
      ),
    } as Response),
  );
}

beforeEach(() => {
  localStorage.clear();
  // A pessoa está na aba Peça — onde a cola NÃO está.
  localStorage.setItem("estoque.hierarquia", "peca");
  vi.stubGlobal("fetch", rede());
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function buscar(termo: string) {
  render(<CatalogoClient />);
  await screen.findByText("Cavalete de madeira");
  fireEvent.change(screen.getByPlaceholderText(/Buscar/i), { target: { value: termo } });
}

describe("a busca do catálogo varre TODAS as hierarquias", () => {
  it("procurar da aba Peça acha a cola que está em Insumo", async () => {
    await buscar("cola");
    await waitFor(() => {
      expect(screen.getByText("Cola PVA extra branca")).toBeTruthy();
      expect(screen.getByText("Cola bonder")).toBeTruthy();
    });
  });

  it("acha até o item SEM hierarquia — ele não está em aba nenhuma", async () => {
    // Este é o caso que a busca por aba nunca resolvia: item não classificado
    // não aparece em nenhuma das oito, então não havia aba pra onde mandar.
    await buscar("cola");
    await waitFor(() => expect(screen.getByText("Cola quente refil")).toBeTruthy());
  });

  it("o que NÃO casa some, mesmo sendo da aba aberta", async () => {
    await buscar("cola");
    await waitFor(() => expect(screen.queryByText("Trava de encaixe")).toBeNull());
  });

  it("sem termo, a aba volta a mandar — navegar por hierarquia continua o padrão", async () => {
    render(<CatalogoClient />);
    await screen.findByText("Cavalete de madeira");
    // A cola existe no catálogo e NÃO deve aparecer na aba Peça sem busca.
    expect(screen.queryByText("Cola PVA extra branca")).toBeNull();
  });

  it("os chips de categoria acompanham o resultado, não a aba", async () => {
    // Buscando "cola", o resultado é todo de "Insumos" — oferecer só "Madeira"
    // e "Metal" (as categorias da aba Peça) seria um filtro que não filtra nada
    // do que está na tela.
    await buscar("cola");
    await waitFor(() => expect(screen.getAllByText("Insumos").length).toBeGreaterThan(0));
  });

  it("o vazio da busca diz que olhou TUDO, pra ninguém caçar nas outras abas", async () => {
    await buscar("parafuso sextavado inexistente");
    await waitFor(() => {
      expect(document.body.textContent).toContain("Nada no catálogo");
      expect(document.body.textContent).toContain("olhou todas as hierarquias");
    });
  });
});
