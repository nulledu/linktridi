import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InicioClient, type Destino, type ItemBusca } from "../InicioClient";

// jsdom não tem layout: offsetParent e rect são sempre 0. Aqui se testa
// COMPORTAMENTO — o que aparece, o que é buscado, pra onde o Enter leva.

const empurrou: string[] = [];
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: (h: string) => { empurrou.push(h); } }),
}));

const DESTINOS: Destino[] = [
  { href: "/central/tarefas", icon: "checklist", titulo: "Tarefas & Chamados", linha: "O que precisa de você.", numero: 3, unidade: "precisam de você" },
  { href: "/central/suporte", icon: "lifebuoy", titulo: "Suporte", linha: "Como se faz cada coisa.", numero: null, unidade: null },
];

const LOCAIS: ItemBusca[] = [
  { id: "pg_estoque", tipo: "pagina", titulo: "Estoque", sub: "Ir para", href: "/estoque", icon: "box" },
  { id: "tf_1", tipo: "tarefa", titulo: "Conferir a nota do fornecedor", sub: "Tarefa", href: "/central/tarefas", icon: "checklist" },
  { id: "tf_2", tipo: "tarefa", titulo: "Ligar pro cliente", sub: "Pedido #2841", href: "/central/tarefas", icon: "checklist" },
];

function montar(over: Partial<React.ComponentProps<typeof InicioClient>> = {}) {
  return render(
    <InicioClient
      nome="Caio" destinos={DESTINOS} locais={LOCAIS}
      podeBuscarPessoas={false} podeBuscarEstoque={false} podeBuscarPedidos={false}
      {...over}
    />,
  );
}

const campoBusca = () => screen.getByLabelText("Buscar na Central");
const digitar = (v: string) => fireEvent.change(campoBusca(), { target: { value: v } });

let chamadas: string[] = [];
beforeEach(() => {
  empurrou.length = 0;
  chamadas = [];
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    chamadas.push(String(url));
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ itens: [] }) } as Response);
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Início da Central · destinos", () => {
  it("número vivo aparece; destino sem novidade mostra a linha, não um zero", () => {
    montar();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("precisam de você")).toBeInTheDocument();
    // Suporte não tem número: mostra a descrição. Badge de zero é ruído que
    // treina a pessoa a ignorar badge.
    expect(screen.getByText("Como se faz cada coisa.")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("cada destino é um link de verdade", () => {
    montar();
    expect(screen.getByText("Tarefas & Chamados").closest("a")).toHaveAttribute("href", "/central/tarefas");
  });
});

describe("Início da Central · busca local", () => {
  it("sem termo digitado não existe lista de resultados", () => {
    montar();
    expect(screen.queryByText("Ir para")).not.toBeInTheDocument();
  });

  it("acha por título e agrupa por tipo", () => {
    montar();
    digitar("o");
    // Duas vezes: o rótulo do grupo e o subtítulo da própria página.
    expect(screen.getAllByText("Ir para")).toHaveLength(2);
    expect(screen.getByText("Tarefas")).toBeInTheDocument();
    expect(screen.getByText("Estoque")).toBeInTheDocument();
    expect(screen.getByText("Conferir a nota do fornecedor")).toBeInTheDocument();
  });

  it("acha pelo subtítulo — quem lembra do número do pedido, não do título", () => {
    montar();
    digitar("2841");
    expect(screen.getByText("Ligar pro cliente")).toBeInTheDocument();
    expect(screen.queryByText("Estoque")).not.toBeInTheDocument();
  });

  it("ignora acento e caixa", () => {
    montar();
    digitar("FORNECEDOR");
    expect(screen.getByText("Conferir a nota do fornecedor")).toBeInTheDocument();
  });

  it("sem resultado diz o que foi procurado", () => {
    montar();
    digitar("zzzz");
    expect(screen.getByText(/Nada encontrado para .zzzz./)).toBeInTheDocument();
  });
});

describe("Início da Central · teclado", () => {
  it("Enter abre o primeiro resultado", () => {
    montar();
    digitar("estoque");
    fireEvent.keyDown(campoBusca(), { key: "Enter" });
    expect(empurrou).toEqual(["/estoque"]);
  });

  it("↓ desce na ordem em que a lista aparece", () => {
    montar();
    digitar("o");
    const campo = campoBusca();
    fireEvent.keyDown(campo, { key: "ArrowDown" });
    fireEvent.keyDown(campo, { key: "Enter" });
    // "Estoque" é o primeiro (grupo "Ir para" vem antes); um ↓ leva à tarefa.
    expect(empurrou).toEqual(["/central/tarefas"]);
  });

  it("Esc limpa o campo", () => {
    montar();
    digitar("estoque");
    fireEvent.keyDown(campoBusca(), { key: "Escape" });
    expect((campoBusca() as HTMLInputElement).value).toBe("");
  });
});

describe("Início da Central · camada remota", () => {
  it("uma letra não vai ao servidor", async () => {
    montar({ podeBuscarEstoque: true });
    digitar("c");
    await vi.advanceTimersByTimeAsync(400);
    expect(chamadas).toEqual([]);
  });

  it("sem nenhum acesso remoto, nunca chama a rota", async () => {
    montar();
    digitar("cadeira");
    await vi.advanceTimersByTimeAsync(400);
    expect(chamadas).toEqual([]);
  });

  it("digitação corrida vira UMA requisição, com o termo final", async () => {
    montar({ podeBuscarEstoque: true });
    for (const t of ["ca", "cad", "cade", "cadeira"]) {
      digitar(t);
      await vi.advanceTimersByTimeAsync(80);       // mais rápido que o debounce
    }
    await vi.advanceTimersByTimeAsync(400);
    await waitFor(() => expect(chamadas).toHaveLength(1));
    expect(chamadas[0]).toContain("q=cadeira");
  });
});
