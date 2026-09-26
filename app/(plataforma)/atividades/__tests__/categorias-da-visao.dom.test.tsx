import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LancadorDeAtividade } from "../LancadorDeAtividade";
import { GerenciarCategorias } from "../GerenciarCategorias";
import type { ItemDaVisao } from "@/lib/atividades-visao";

// Pedido do dono (11/09/2026): criar à mão categorias como "Almofada", com
// todas as almofadas dentro. Clicar abre os tamanhos; escolher um abre as
// atividades dele.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
const aviso = vi.hoisted(() => ({ ok: vi.fn(), erro: vi.fn(), info: vi.fn() }));
vi.mock("../../Toast", async (original) => ({
  ...(await original<typeof import("../../Toast")>()),
  toast: Object.assign(vi.fn(), aviso),
  confirmar: vi.fn(() => Promise.resolve(true)),
}));

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const alm = (n: number, nome: string, quantidade: number): ItemDaVisao => ({
  id: U(n), nome, categoria: "Almofadas", hierarquia: "produto", imagem_url: null,
  quantidade, qtd_minima: 5, unidade: "un", setor_responsavel: null,
});
const ALMOFADAS = [alm(11, "Almofada 11", 141), alm(22, "Almofada 22x22", 0)];

let puts: Record<string, unknown>[] = [];
beforeEach(() => {
  puts = [];
  const resp = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes(`item=${U(22)}`)) return resp({ componentes: [], opcoes: [
      { id: "o1", item_id: U(22), nome: "Costurar capa 22x22", setor: "Produção", ordem: 0 },
    ] });
    if (u.includes("?item=")) return resp({ componentes: [], opcoes: [] });
    if (u.includes("catalogo=1")) return resp({
      itens: [...ALMOFADAS, { id: U(90), nome: "Chapa EVA", categoria: null, hierarquia: "mp_processada", imagem_url: null }],
      selecionados: [], grupos: [],
    });
    if (u === "/api/atividades/visao" && init?.method === "PUT") {
      const corpo = JSON.parse(String(init.body));
      puts.push(corpo);
      return resp({ ok: true, ...corpo });
    }
    return resp({});
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("o pop-up aberto por uma categoria", () => {
  it("mostra os tamanhos; escolher um abre as atividades dele", async () => {
    render(
      <LancadorDeAtividade grupo={{ nome: "Almofada", itens: ALMOFADAS }} lista={[]} modelos={[]} colaboradores={[]}
        podeAtribuir podeConfigurar onFechar={() => {}} onAbrirQuadro={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /^Almofada 11/ })).toHaveTextContent("Em estoque");
    fireEvent.click(screen.getByRole("button", { name: /^Almofada 22x22/ }));
    expect(await screen.findByRole("button", { name: /^Costurar capa 22x22/ })).toBeInTheDocument();
    // E dá pra voltar pra lista da categoria pelo caminho.
    fireEvent.click(screen.getByRole("button", { name: "Almofada" }));
    expect(screen.getByRole("button", { name: /^Almofada 11/ })).toBeInTheDocument();
  });
});

describe("criar uma categoria à mão", () => {
  it("nome + 'marcar os que têm o nome' + salvar grava a categoria com os itens", async () => {
    render(<GerenciarCategorias onFechar={() => {}} onSalvo={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Novo grupo/ }));
    fireEvent.change(screen.getByPlaceholderText("Ex.: Almofada"), { target: { value: "Almofada" } });
    fireEvent.click(screen.getByRole("button", { name: /Marcar os 2 que têm/ }));
    fireEvent.click(screen.getByRole("button", { name: /Salvar grupo/ }));
    await waitFor(() => expect(puts).toHaveLength(1));
    const grupos = puts[0].grupos as { nome: string; itens: string[] }[];
    expect(grupos).toHaveLength(1);
    expect(grupos[0].nome).toBe("Almofada");
    expect([...grupos[0].itens].sort()).toEqual([U(11), U(22)]);
  });
});
