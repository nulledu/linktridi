import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { Tarefa } from "@/lib/tarefas";

// O toast é o único canal que diz "não deu": precisa ser observável.
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock("../../../Toast", () => ({
  toast: Object.assign((t: string, tipo = "ok") => toastSpy(t, tipo), {
    ok: (t: string) => toastSpy(t, "ok"),
    erro: (t: string) => toastSpy(t, "erro"),
    info: (t: string) => toastSpy(t, "info"),
  }),
  confirmar: async () => true,
  ToastHost: () => null,
}));

import { CentralTrabalhoClient } from "../CentralTrabalhoClient";

const base = (id: string, over: Partial<Tarefa> = {}): Tarefa => ({
  id, titulo: `Tarefa ${id}`, descricao: null, status: "pendente", prioridade: "media",
  responsavelId: "dev", responsavelNome: "Teste", criadorId: "dev", criadorNome: "Teste",
  prazo: null, lembrarEm: null, origemTipo: "personal", origemRef: null, origemLabel: null,
  origemUrl: null, setor: null, tags: [], lista: null, subtarefas: [], anexos: [],
  bloqueadaPor: null, gravidade: null, importancia: null, urgencia: null,
  avisarConclusao: false, concluidaAt: null, createdAt: "", updatedAt: "", ...over,
});

// Resposta de verdade (com content-type): `respostaConfiavel` olha o tipo do corpo.
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

const coment = (id: string, texto: string) => ({ id, autorNome: "Ana", texto, createdAt: "2026-09-10T12:00:00Z" });

const esvaziarFila = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => { toastSpy.mockClear(); });
afterEach(() => vi.unstubAllGlobals());

describe("Central de Trabalho · painel de detalhe", () => {
  it("resposta atrasada da tarefa A não entra no painel da tarefa B", async () => {
    let soltarA!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      const u = String(url);
      if (u.startsWith("/api/tarefas/detalhe?id=A")) return new Promise<Response>((res) => { soltarA = res; });
      if (u.startsWith("/api/tarefas/detalhe?id=B")) {
        return Promise.resolve(json({ comentarios: [coment("cb", "Comentário de B")], historico: [] }));
      }
      return Promise.resolve(json({}));
    }));

    render(<CentralTrabalhoClient userId="dev" inicial={[base("A"), base("B")]} />);
    // A primeiro, B logo depois — antes de a resposta de A chegar.
    fireEvent.click(screen.getByRole("button", { name: "Abrir detalhes: Tarefa A" }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir detalhes: Tarefa B" }));
    fireEvent.click(screen.getByRole("button", { name: /^Comentários/ }));
    await screen.findByText("Comentário de B");

    // Agora a resposta lenta de A chega. Ela não pode ocupar o painel de B.
    await act(async () => { soltarA(json({ comentarios: [coment("ca", "Comentário de A")], historico: [] })); });
    await esvaziarFila();

    expect(screen.queryByText("Comentário de A")).not.toBeInTheDocument();
    expect(screen.getByText("Comentário de B")).toBeInTheDocument();
  });
});

describe("Central de Trabalho · excluir não pode mentir", () => {
  const abrirEExcluir = () => {
    fireEvent.click(screen.getByRole("button", { name: "Abrir detalhes: Pagar fornecedor" }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    fireEvent.click(screen.getByRole("button", { name: "Excluir mesmo" }));
  };

  it("servidor recusa (403) → a tarefa volta pra lista e o toast diz", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(init?.method === "DELETE" ? json({ error: "forbidden" }, 403) : json({}))));

    render(<CentralTrabalhoClient userId="dev" inicial={[base("t1", { titulo: "Pagar fornecedor" })]} />);
    abrirEExcluir();

    await vi.waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.any(String), "erro"));
    expect(screen.getByRole("button", { name: "Abrir detalhes: Pagar fornecedor" })).toBeInTheDocument();
  });

  it("sessão expirada (200 com HTML) também não conta como excluída", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(init?.method === "DELETE"
        ? new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } })
        : json({}))));

    render(<CentralTrabalhoClient userId="dev" inicial={[base("t1", { titulo: "Pagar fornecedor" })]} />);
    abrirEExcluir();

    await vi.waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.stringMatching(/sessão expirou/i), "erro"));
    expect(screen.getByRole("button", { name: "Abrir detalhes: Pagar fornecedor" })).toBeInTheDocument();
  });

  it("excluir que deu certo some e continua sumido, sem toast de erro", async () => {
    const f = vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(init?.method === "DELETE" ? json({ ok: true }) : json({})));
    vi.stubGlobal("fetch", f);

    render(<CentralTrabalhoClient userId="dev" inicial={[base("t1", { titulo: "Pagar fornecedor" })]} />);
    abrirEExcluir();

    await vi.waitFor(() => expect(f.mock.calls.some(([, i]) => i?.method === "DELETE")).toBe(true));
    await esvaziarFila();
    expect(screen.queryByRole("button", { name: "Abrir detalhes: Pagar fornecedor" })).not.toBeInTheDocument();
    expect(toastSpy).not.toHaveBeenCalledWith(expect.any(String), "erro");
  });
});
