import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { MeuPontoClient } from "../MeuPontoClient";
import { ToastHost } from "../../Toast";

/**
 * A lista da equipe no banco de horas: BUSCAR uma pessoa e TIRAR uma pessoa.
 *
 * · A busca filtra só a lista — os cards de resumo continuam falando do time
 *   inteiro, senão procurar um nome faria o total do time "mudar" na cara de
 *   quem está conferindo.
 * · Tirar do banco não apaga nada: marca o cadastro do ponto como inativo
 *   (PUT com `ativo: false`), e as batidas continuam guardadas.
 *
 * jsdom não tem layout (ver testes-de-componente no CLAUDE.md): aqui se verifica
 * texto e o corpo da requisição, nunca medida renderizada.
 */
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const mesBanco = (m: string) => ({ mes: m, geradoMin: 60, devidoMin: 0, creditoMin: 60, debitoMin: 0, pagoMin: 0, saldoMin: 60, corrente: true, geradoEspecialMin: 0, creditoEspecialMin: 0, pagoEspecialMin: 0 });
const pessoa = (id: string, nome: string) => ({
  pessoaId: id, nome, fotoUrl: null, jornadaMin: 480,
  entradaPrevista: "08:00", saidaPrevista: "17:00", almocoInicio: "12:00", almocoFim: "13:00",
  mes: "2026-08", de: "2026-08-01", ate: "2026-08-31",
  trabalhadoMin: 480, metaMin: 480, saldoMin: 60, saldoMesMin: 60, diasTrabalhados: 1, faltas: 0, dias: [],
  ledger: {
    desde: "2026-07-15", saldoMin: 60, creditoMin: 60, debitoMin: 0, creditos: [], debitos: [],
    creditoExpiraEm: null, debitoVenceEm: null, creditoExpiradoMin: 0, debitoVencidoMin: 0,
    creditoEspecialMin: 0, pagoMin: 0, pagoEspecialMin: 0, pagamentos: [], faltasNaoJustificadas: [],
    meses: [mesBanco("2026-08")],
  },
});

const EQUIPE = {
  escopo: "todos", mes: "2026-08", metaHoras: 8, isAdmin: true, feriados: [],
  pessoas: [pessoa("p1", "Beatriz Souza"), pessoa("p2", "Gustavo Lima"), pessoa("p3", "Letícia Barros")],
};

/** Rede falsa: GET devolve a equipe; o resto o teste inspeciona. */
function mockRede(extra?: (url: string, init?: RequestInit) => unknown) {
  const chamadas: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    chamadas.push({ url: String(url), init });
    const corpo = extra?.(String(url), init) ?? (String(url).includes("/api/ponto/banco-horas") ? EQUIPE : { ok: true });
    return { ok: true, json: async () => corpo } as unknown as Response;
  }));
  return chamadas;
}

const montar = async () => {
  render(<><MeuPontoClient isAdmin nome="Teste" /><ToastHost /></>);
  await waitFor(() => expect(screen.getByText("Beatriz Souza")).toBeTruthy());
};

describe("banco de horas — lista da equipe", () => {
  it("busca filtra a lista sem mexer no total do time", async () => {
    mockRede();
    await montar();
    expect(screen.getByText(/3 pessoa\(s\)/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Buscar pessoa"), { target: { value: "gust" } });
    expect(screen.queryByText("Beatriz Souza")).toBeNull();
    expect(screen.getByText("Gustavo Lima")).toBeTruthy();
    expect(screen.getByText("1 de 3")).toBeTruthy();
    // O card de resumo continua contando o time inteiro.
    expect(screen.getByText(/3 pessoa\(s\)/)).toBeTruthy();
  });

  it("busca ignora acento — quem digita 'leticia' acha 'Letícia'", async () => {
    mockRede();
    await montar();
    fireEvent.change(screen.getByLabelText("Buscar pessoa"), { target: { value: "leticia" } });
    expect(screen.getByText("Letícia Barros")).toBeTruthy();
    expect(screen.queryByText("Gustavo Lima")).toBeNull();
  });

  it("sem resultado, diz o que foi procurado", async () => {
    mockRede();
    await montar();
    fireEvent.change(screen.getByLabelText("Buscar pessoa"), { target: { value: "zzz" } });
    expect(screen.getByText(/Ninguém com/)).toBeTruthy();
  });

  it("limpar a busca traz todo mundo de volta", async () => {
    mockRede();
    await montar();
    const campo = screen.getByLabelText("Buscar pessoa");
    fireEvent.change(campo, { target: { value: "gust" } });
    fireEvent.click(screen.getByLabelText("Limpar busca"));
    expect(screen.getByText("Beatriz Souza")).toBeTruthy();
    expect(screen.getByText("Letícia Barros")).toBeTruthy();
  });

  it("tirar do banco marca o cadastro como inativo — e não apaga batida nenhuma", async () => {
    // Abrir uma pessoa refaz a busca com `pessoaId` — aí a resposta é o banco
    // dela, não a lista da equipe.
    const chamadas = mockRede((url) => {
      if (!String(url).includes("/api/ponto/banco-horas")) return { ok: true };
      return String(url).includes("pessoaId=p2")
        ? { escopo: "pessoa", mes: "2026-08", metaHoras: 8, isAdmin: true, feriados: [], banco: pessoa("p2", "Gustavo Lima") }
        : EQUIPE;
    });
    await montar();
    fireEvent.click(screen.getByText("Gustavo Lima"));
    await waitFor(() => expect(screen.getByText("Tirar do banco de horas")).toBeTruthy());
    fireEvent.click(screen.getByText("Tirar do banco de horas"));

    // O aviso explica o que acontece ANTES de confirmar.
    await waitFor(() => expect(screen.getByText(/Tirar Gustavo Lima do banco de horas/)).toBeTruthy());
    expect(screen.getByText(/batidas e o saldo ficam guardados/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => {
      const put = chamadas.find((c) => c.init?.method === "PUT" && String(c.url).includes("/api/ponto/pessoas"));
      expect(put).toBeTruthy();
      expect(JSON.parse(String(put!.init!.body))).toEqual({ id: "p2", ativo: false });
    });
    // Nada de DELETE: o histórico continua de pé.
    expect(chamadas.some((c) => c.init?.method === "DELETE")).toBe(false);
  });

  it("quem está vendo o próprio banco não vê o botão de tirar", async () => {
    mockRede((url) => (String(url).includes("/api/ponto/banco-horas") ? { escopo: "eu", mes: "2026-08", metaHoras: 8, isAdmin: false, banco: pessoa("p9", "Eu Mesmo") } : { ok: true }));
    render(<MeuPontoClient isAdmin={false} nome="Eu Mesmo" />);
    await waitFor(() => expect(screen.getByText(/banco desde/)).toBeTruthy());
    expect(screen.queryByText("Tirar do banco de horas")).toBeNull();
  });
});
