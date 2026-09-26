import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { PagarHorasAcao } from "../PagarHoras";
import type { BancoResumo } from "@/lib/banco-horas";

/**
 * Pagar horas POR MÊS. A conta do banco fecha por mês, então a folha é sempre
 * "as horas do mês tal" — e o painel tem que avisar quando existe crédito em
 * OUTROS meses: sem esse aviso, o admin paga "tudo" e o saldo continua de pé.
 *
 * jsdom não tem layout (ver testes-de-componente no CLAUDE.md): aqui se verifica
 * texto e o corpo da requisição, nunca medida renderizada.
 */
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const credito = (dia: string, min: number) => ({ dia, min, venceEm: "2026-10-16", vencido: false });
const mes = (m: string, creditoMin: number) =>
  ({ mes: m, geradoMin: creditoMin, devidoMin: 0, creditoMin, debitoMin: 0, pagoMin: 0, saldoMin: creditoMin, corrente: m === "2026-08" });

// 1h em 16/07, 2h em 17/07 (julho = 3h) e 45min em 05/08 — duas folhas.
const BANCO = {
  pessoaId: "p1", nome: "Beatriz", fotoUrl: null, jornadaMin: 480,
  entradaPrevista: "08:00", saidaPrevista: "17:00", almocoInicio: "12:00", almocoFim: "13:00",
  mes: "2026-08", de: "2026-08-01", ate: "2026-08-31",
  trabalhadoMin: 0, metaMin: 0, saldoMin: 225, saldoMesMin: 0, diasTrabalhados: 0, faltas: 0, dias: [],
  ledger: {
    desde: "2026-07-15", saldoMin: 225, creditoMin: 225, debitoMin: 0,
    creditos: [credito("2026-07-16", 60), credito("2026-07-17", 120), credito("2026-08-05", 45)],
    debitos: [], creditoExpiraEm: "2026-10-16", debitoVenceEm: null,
    creditoExpiradoMin: 0, debitoVencidoMin: 0, pagoMin: 0, pagamentos: [], faltasNaoJustificadas: [],
    meses: [mes("2026-07", 180), mes("2026-08", 45)],
  },
} as unknown as BancoResumo;

const abrirPainel = (mesAberto = "2026-08") => {
  render(<PagarHorasAcao banco={BANCO} mes={mesAberto} onFeito={() => {}} />);
  fireEvent.click(screen.getByText("Pagar horas"));
};

describe("pagar horas — por mês", () => {
  it("abre no mês da tela e oferece só o extra dele", () => {
    abrirPainel("2026-08");
    expect(screen.getByText("Tudo · 0h45")).toBeTruthy();
  });

  it("avisa que existe crédito de OUTRO mês — senão \"paguei tudo\" mente", () => {
    abrirPainel("2026-08");
    // 3h45 no banco − 45min de agosto = 3h00 de julho, que ficam de fora.
    expect(screen.getByText(/3h00/)).toBeTruthy();
    expect(screen.getByText(/fora/)).toBeTruthy();
  });

  it("trocar de mês troca o teto e o valor acompanha", () => {
    abrirPainel("2026-08");
    fireEvent.click(screen.getByText("jul/26"));
    expect(screen.getByText("Tudo · 3h00")).toBeTruthy();
  });

  it("no banco inteiro não sobra aviso de mês de fora", () => {
    abrirPainel("2026-08");
    fireEvent.click(screen.getByText("Banco inteiro"));
    expect(screen.getByText("Tudo · 3h45")).toBeTruthy();
    expect(screen.queryByText(/a favor .*fora.* desse mês/)).toBeNull();
  });

  it("manda a janela do MÊS no corpo do POST — é ela que o servidor usa pra quitar", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    abrirPainel("2026-07");
    fireEvent.click(screen.getByText(/^Pagar \d/));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const corpo = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(corpo.de).toBe("2026-07-01");
    expect(corpo.ate).toBe("2026-07-31");
    expect(corpo.minutos).toBe(180);
  });

  it("banco inteiro não carrega janela (o servidor volta ao FIFO)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    abrirPainel("2026-08");
    fireEvent.click(screen.getByText("Banco inteiro"));
    fireEvent.click(screen.getByText(/^Pagar \d/));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const corpo = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(corpo.de).toBeUndefined();
    expect(corpo.ate).toBeUndefined();
    expect(corpo.minutos).toBe(225);
  });
});
