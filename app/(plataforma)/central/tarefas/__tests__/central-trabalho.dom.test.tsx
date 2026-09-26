import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CentralTrabalhoClient } from "../CentralTrabalhoClient";
import type { Tarefa } from "@/lib/tarefas";

// jsdom não tem layout: offsetParent e rect são sempre 0. Estes testes checam
// COMPORTAMENTO (o que aparece, o que é escrito) — nunca geometria.
const base = (id: string, over: Partial<Tarefa> = {}): Tarefa => ({
  id, titulo: `Tarefa ${id}`, descricao: null, status: "pendente", prioridade: "media",
  responsavelId: "dev", responsavelNome: "Teste", criadorId: "dev", criadorNome: "Teste",
  prazo: null, lembrarEm: null, origemTipo: "personal", origemRef: null, origemLabel: null,
  origemUrl: null, setor: null, tags: [], lista: null, subtarefas: [], anexos: [],
  bloqueadaPor: null, gravidade: null, importancia: null, urgencia: null,
  avisarConclusao: false, concluidaAt: null, createdAt: "", updatedAt: "", ...over,
});

let chamadas: { url: string; init?: RequestInit }[] = [];
let respondeOk = true;

beforeEach(() => {
  chamadas = []; respondeOk = true;
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    chamadas.push({ url: String(url), init });
    if (String(url).startsWith("/api/tarefas") && (!init || init.method === undefined)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ erro: "sem sessão" }) } as Response);
    }
    return Promise.resolve({ ok: respondeOk, json: () => Promise.resolve(respondeOk ? { ok: true, tarefa: base("novo") } : { error: "falha" }) } as Response);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const corpoDo = (c: { init?: RequestInit }) => JSON.parse(String(c.init!.body));

describe("Central de Trabalho · criar pela frase", () => {
  it("a frase inteira vira campos — uma interação, não sete", () => {
    render(<CentralTrabalhoClient userId="dev" inicial={[]} />);
    const campo = screen.getByPlaceholderText(/adicionar tarefa/i);
    fireEvent.change(campo, { target: { value: "Ligar pro fornecedor amanhã às 14h !urgente #compras" } });
    fireEvent.keyDown(campo, { key: "Enter" });

    const post = chamadas.find((c) => c.init?.method === "POST")!;
    expect(post).toBeTruthy();
    const b = corpoDo(post);
    expect(b.titulo).toBe("Ligar pro fornecedor");
    expect(b.prioridade).toBe("urgente");
    expect(b.lista).toBe("compras");
    expect(b.prazo).toBeTruthy();
  });

  it("mostra o que entendeu ANTES do Enter", () => {
    render(<CentralTrabalhoClient userId="dev" inicial={[]} />);
    fireEvent.change(screen.getByPlaceholderText(/adicionar tarefa/i), { target: { value: "Pagar boleto amanhã !alta" } });
    expect(screen.getByText("Amanhã")).toBeInTheDocument();
    expect(screen.getByText("Alta")).toBeInTheDocument();
    // E nada foi gravado ainda — pré-visualizar não é decidir.
    expect(chamadas.some((c) => c.init?.method === "POST")).toBe(false);
  });
});

describe("Central de Trabalho · adiar", () => {
  it("tarefa sem prazo oferece definir um — senão é ela que nunca ganha data", () => {
    render(<CentralTrabalhoClient userId="dev" inicial={[base("t1")]} />);
    expect(screen.getByRole("button", { name: /definir prazo/i })).toBeInTheDocument();
  });

  it("adiar leva UMA interação e conserva a hora marcada", () => {
    const prazo = new Date(Date.parse("2026-08-06T14:00:00Z") + 3 * 3600e3).toISOString();
    render(<CentralTrabalhoClient userId="dev" inicial={[base("t1", { prazo })]} />);
    fireEvent.click(screen.getByRole("button", { name: /adiar/i }));
    fireEvent.click(screen.getByRole("button", { name: "Amanhã" }));

    const patch = chamadas.find((c) => c.init?.method === "PATCH")!;
    const novo = new Date(new Date(corpoDo(patch).prazo).getTime() - 3 * 3600e3).toISOString();
    expect(novo.slice(11, 16)).toBe("14:00");   // a reunião das 14h não vira meia-noite
  });

  it("«Sem prazo» apaga a data", () => {
    render(<CentralTrabalhoClient userId="dev" inicial={[base("t1", { prazo: new Date().toISOString() })]} />);
    fireEvent.click(screen.getByRole("button", { name: /adiar/i }));
    fireEvent.click(screen.getByRole("button", { name: "Sem prazo" }));
    expect(corpoDo(chamadas.find((c) => c.init?.method === "PATCH")!).prazo).toBeNull();
  });
});

// A fila de pedidos saiu daqui pra `/central/solicitacoes`. A separação é fácil
// de desfazer sem querer — basta alguém "reaproveitar" a lista pra mostrar mais
// um tipo de item. Estes testes seguram a porta.
describe("Central de Trabalho · tarefa não é solicitação", () => {
  it("não oferece abrir solicitação ao criar", () => {
    render(<CentralTrabalhoClient userId="dev" inicial={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /criar a partir de outra origem/i }));
    expect(screen.queryByText(/abrir solicita/i)).not.toBeInTheDocument();
  });

  it("não tem filtro de Solicitações na fileira", () => {
    render(<CentralTrabalhoClient userId="dev" inicial={[base("t1")]} />);
    expect(screen.queryByRole("button", { name: /^Solicitações/ })).not.toBeInTheDocument();
  });
});

describe("Central de Trabalho · a lista não repete o padrão", () => {
  it("prioridade média não vira etiqueta — ela é a cor da caixinha", () => {
    // "Média" é o padrão de TODA tarefa. Escrito em cada linha, era a palavra
    // mais frequente da tela e não distinguia nada.
    render(<CentralTrabalhoClient userId="dev" inicial={[base("t1"), base("t2")]} />);
    expect(screen.queryByText("Média")).not.toBeInTheDocument();
  });

  it("origem só aparece quando NÃO é tarefa pessoal", () => {
    render(<CentralTrabalhoClient userId="dev" inicial={[base("t1"), base("t2", { origemTipo: "order", origemLabel: "Pedido #10432" })]} />);
    expect(screen.queryByText("Tarefa pessoal")).not.toBeInTheDocument();
    expect(screen.getByText("Pedido #10432")).toBeInTheDocument();
  });
});

describe("Central de Trabalho · a interface não pode mentir", () => {
  it("escrita que falha volta ao valor anterior", async () => {
    respondeOk = false;
    render(<CentralTrabalhoClient userId="dev" inicial={[base("t1", { titulo: "Conferir nota" })]} />);
    fireEvent.click(screen.getByRole("button", { name: /concluir tarefa/i }));

    // O servidor recusou → o check volta a ficar vazio. Senão a tarefa some da
    // lista e ninguém nunca mais olha pra ela.
    await vi.waitFor(() => expect(screen.getByRole("button", { name: /concluir tarefa/i })).toBeInTheDocument());
  });
});
