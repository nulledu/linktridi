import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ItemEditor } from "../ItemEditor";
import type { Item } from "../tipos";

// ── A ficha técnica só é regravada depois de ter sido LIDA ────────────────────
// A rota PUT /api/ficha-tecnica apaga todas as linhas do item e insere as que
// chegaram. A ficha nascia `[]` e o GET que a enche leva 250–700 ms (ou falha,
// com um `.catch` mudo) — então quem salvava nessa janela, ou depois de a
// leitura falhar, mandava a lista VAZIA e apagava a composição do item sem uma
// palavra. Com a ficha apagada, a produção em cadeia para de criar ordem.

const aviso = vi.hoisted(() => ({ ok: vi.fn(), erro: vi.fn(), info: vi.fn() }));
vi.mock("../../Toast", async (original) => ({
  ...(await original<typeof import("../../Toast")>()),
  toast: Object.assign(vi.fn(), aviso),
}));

const ITEM: Item = {
  id: "i1",
  nome: "Carimbo 40mm",
  hierarquia: "peca",
  produzido: true,
  serializado: false,
  categoria: "Carimbos",
  imagem_url: null,
  unidade: "un",
  quantidade: 0,
  qtd_minima: 0,
  ativo: true,
  sku: "PRD-0100",
};

const CATALOGO = [
  { id: "i1", nome: "Carimbo 40mm", hierarquia: "peca", sku: "PRD-0100" },
  { id: "i2", nome: "Borracha 40mm", hierarquia: "materia_prima", sku: "PRD-0101" },
];

type Resposta = { ok?: boolean; status?: number; body?: unknown };

/** GET da ficha vem de `ficha()`; o resto responde 200. */
function montarFetch(ficha: () => Promise<Resposta>) {
  return vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    const metodo = (init?.method ?? "GET").toUpperCase();
    const r: Promise<Resposta> = u.startsWith("/api/ficha-tecnica") && metodo === "GET"
      ? ficha()
      : Promise.resolve({ body: u.startsWith("/api/estoque-itens") ? { ok: true } : {} });
    return r.then((x) => ({
      ok: x.ok ?? true,
      status: x.status ?? 200,
      json: () => Promise.resolve(x.body ?? {}),
    }) as unknown as Response);
  });
}

const putsDaFicha = (f: ReturnType<typeof montarFetch>) =>
  f.mock.calls.filter(([u, init]) => String(u).startsWith("/api/ficha-tecnica") && (init?.method ?? "GET").toUpperCase() === "PUT");

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("ficha técnica: salvar não apaga o que não foi lido", () => {
  it("salvar ANTES de a ficha chegar não manda a lista vazia por cima da gravada", async () => {
    let soltar: (r: Resposta) => void = () => {};
    const fetchSpy = montarFetch(() => new Promise<Resposta>((res) => { soltar = res; }));
    vi.stubGlobal("fetch", fetchSpy);
    const onSaved = vi.fn();
    render(<ItemEditor item={ITEM} itens={CATALOGO} onClose={() => {}} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(putsDaFicha(fetchSpy)).toHaveLength(0);
    soltar({ body: { ficha: [] } });
  });

  it("ficha que NÃO carregou não é regravada — e a tela diz isso", async () => {
    const fetchSpy = montarFetch(() => Promise.resolve({ ok: false, status: 500, body: { error: "falhou" } }));
    vi.stubGlobal("fetch", fetchSpy);
    const onSaved = vi.fn();
    render(<ItemEditor item={ITEM} itens={CATALOGO} onClose={() => {}} onSaved={onSaved} />);

    expect(await screen.findByText(/Não foi possível carregar a ficha técnica/)).toBeInTheDocument();
    // Sem a lista de verdade não há o que editar: adicionar componente numa
    // ficha "vazia" que não é vazia seria a mesma armadilha por outra porta.
    expect(screen.queryByRole("button", { name: /Adicionar componente/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(putsDaFicha(fetchSpy)).toHaveLength(0);
    expect(aviso.info).toHaveBeenCalledWith(expect.stringMatching(/ficha técnica/));
  });

  it("tentar de novo: carregada, a ficha volta a ser gravada com o que veio", async () => {
    let tentativa = 0;
    const fetchSpy = montarFetch(() => Promise.resolve(++tentativa === 1
      ? { ok: false, status: 500 }
      : { body: { ficha: [{ componente_id: "i2", quantidade: 2, desconta: false, nome: "Borracha 40mm" }] } }));
    vi.stubGlobal("fetch", fetchSpy);
    const onSaved = vi.fn();
    render(<ItemEditor item={ITEM} itens={CATALOGO} onClose={() => {}} onSaved={onSaved} />);

    fireEvent.click(await screen.findByRole("button", { name: /Tentar de novo/ }));
    expect(await screen.findByText("Borracha 40mm")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const puts = putsDaFicha(fetchSpy);
    expect(puts).toHaveLength(1);
    expect(JSON.parse(String(puts[0][1]?.body)).linhas).toEqual([{ componente_id: "i2", quantidade: 2, desconta: false }]);
  });
});
