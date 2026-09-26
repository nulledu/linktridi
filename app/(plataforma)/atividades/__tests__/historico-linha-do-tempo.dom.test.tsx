import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { Historico } from "../Historico";
import { estadoNoHistorico, linhaDoTempo, abertasDeAntes, momentoNoDia } from "@/lib/atividades-linha-do-tempo";
import type { Atividade, Colaborador } from "@/lib/atividades-catalog";

// Pedido do dono (21/09/2026): o Histórico é a linha do tempo do dia, em
// blocos de uma hora. Cada atividade cai no bloco do seu momento naquele dia
// (conclusão > início > lançamento), com os status que o sistema já tinha.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const GENTE: Colaborador[] = [
  { id: "p1", nome: "Ana", setor: "Produção" },
  { id: "p2", nome: "Bruno", setor: "Produção" },
];

const at = (p: Partial<Atividade> & { id: string }): Atividade => ({
  categoria: "Carimbo", tarefa: "Montar carimbo", detalhe: null, para_id: "p1", para_nome: "Ana",
  por_id: "g", por_nome: "Gestor", status: "pendente", prazo: null, quantidade_alvo: 1, quantidade_feita: 0,
  tempo_estimado_min: 40, iniciada_at: null, produto_id: null, produto_nome: null, estoque_lancado: false,
  created_at: "2026-09-16T12:00:00.000Z", concluida_at: null, foto_url: null, ...p,
});

const LISTA = [
  at({ id: "a1", tarefa: "Cortar borracha" }),
  at({ id: "a2", tarefa: "Gravar a laser", status: "em_andamento", iniciada_at: "2026-09-16T13:00:00.000Z" }),
  at({ id: "a3", tarefa: "Embalar carimbos", status: "concluida", concluida_at: "2026-09-16T15:00:00.000Z" }),
  at({ id: "a4", tarefa: "Pintar chapa", para_id: "p2", para_nome: "Bruno", impedida: true, motivo_impedimento: "Máquina parada" }),
];
const CANCELADAS = [at({ id: "a5", tarefa: "Montar alavancas", status: "cancelada", motivo_impedimento: "Pedido cancelado pelo cliente" })];

beforeEach(() => {
  // 16/09/2026 15h em São Paulo.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-16T18:00:00.000Z"));
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true }) } as Response)));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const quadro = (extra: Partial<Parameters<typeof Historico>[0]> = {}) =>
  render(<Historico lista={LISTA} canceladas={CANCELADAS} colaboradores={GENTE} itens={[]} modelos={[]} podeAtribuir {...extra} />);

describe("Histórico — linha do tempo do dia", () => {
  it("cada atividade cai no bloco do seu momento, em horário de São Paulo", () => {
    const blocos = linhaDoTempo([...LISTA, ...CANCELADAS], "2026-09-16");
    const em = (h: number) => blocos.find((b) => b.hora === h)!.itens.map((e) => e.a.id);
    expect(em(9)).toEqual(["a1", "a4", "a5"]);   // lançadas 12:00Z = 09:00
    expect(em(10)).toEqual(["a2"]);               // iniciada 13:00Z
    expect(em(12)).toEqual(["a3"]);               // concluída 15:00Z
    // O expediente aparece inteiro mesmo vazio.
    expect(blocos[0].hora).toBe(7);
    expect(blocos.at(-1)!.hora).toBe(18);
  });

  it("aparece uma vez só por dia, e só no dia em que algo aconteceu", () => {
    expect(momentoNoDia(LISTA[2], "2026-09-16")?.momento).toBe("concluida");
    expect(momentoNoDia(LISTA[2], "2026-09-15")).toBeNull();
    const total = linhaDoTempo(LISTA, "2026-09-16").reduce((n, b) => n + b.itens.length, 0);
    expect(total).toBe(LISTA.length);
  });

  it("status: os do sistema, com recusada como cancelada e prazo vencido como atrasada", () => {
    const hoje = "2026-09-16";
    expect(estadoNoHistorico(LISTA[0], hoje)).toBe("pendente");
    expect(estadoNoHistorico(LISTA[1], hoje)).toBe("em_andamento");
    expect(estadoNoHistorico(LISTA[2], hoje)).toBe("concluida");
    expect(estadoNoHistorico(LISTA[3], hoje)).toBe("cancelada");
    expect(estadoNoHistorico(at({ id: "x", prazo: "2026-09-15" }), hoje)).toBe("atrasada");
    expect(estadoNoHistorico(at({ id: "y", prazo: "2026-09-15", status: "concluida" }), hoje)).toBe("concluida");
  });

  it("aberta de dia anterior entra em 'Antes de hoje'", () => {
    const velha = at({ id: "v", created_at: "2026-09-14T12:00:00.000Z" });
    expect(abertasDeAntes([velha, ...LISTA], "2026-09-16").map((a) => a.id)).toEqual(["v"]);
  });

  it("os blocos de hora aparecem com a contagem", () => {
    quadro();
    expect(screen.getByRole("group", { name: "09:00 — 10:00 · 3" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "12:00 — 13:00 · 1" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "07:00 — 08:00 · 0" })).toBeInTheDocument();
  });

  it("dia anterior esvazia; Hoje volta", () => {
    quadro();
    fireEvent.click(screen.getByRole("button", { name: "Dia anterior" }));
    expect(screen.queryByText("Cortar borracha")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hoje" }));
    expect(screen.getByText("Cortar borracha")).toBeInTheDocument();
  });

  it("o card mostra o motivo curto da cancelada", () => {
    quadro();
    expect(screen.getByText("Pedido cancelado pelo cliente")).toBeInTheDocument();
    expect(screen.getByText("Máquina parada")).toBeInTheDocument();
  });

  it("a busca filtra por tarefa, item ou pessoa", () => {
    quadro();
    fireEvent.change(screen.getByLabelText("Buscar no histórico"), { target: { value: "laser" } });
    expect(screen.getByText("Gravar a laser")).toBeInTheDocument();
    expect(screen.queryByText("Cortar borracha")).toBeNull();
  });

  it("clicar no card abre o detalhe; cancelar pede o motivo e manda pra rota", async () => {
    quadro();
    fireEvent.click(screen.getByRole("button", { name: /Cortar borracha/ }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Responsável")).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Cancelar$/ }));
    fireEvent.change(await screen.findByPlaceholderText(/pedido cancelado/i), { target: { value: "Cliente desistiu" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar atividade" }));
    const chamada = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .find(([u]: unknown[]) => String(u) === "/api/atividades");
    expect(JSON.parse(String(chamada![1].body))).toMatchObject({ id: "a1", status: "cancelada", motivo: "Cliente desistiu" });
  });

  it("sem Atribuir é só leitura: nem enviar nem mover", async () => {
    quadro({ podeAtribuir: false });
    expect(screen.queryByRole("button", { name: /Nova atividade/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Cortar borracha/ }));
    await screen.findByRole("dialog");
    expect(screen.queryByRole("button", { name: /Concluir/ })).toBeNull();
  });

  it("Nova atividade abre o pop-up de escolher o item (o mesmo da Visão geral)", () => {
    quadro();
    fireEvent.click(screen.getByRole("button", { name: /Nova atividade/ }));
    expect(screen.getByLabelText("Buscar item")).toBeInTheDocument();
  });
});
