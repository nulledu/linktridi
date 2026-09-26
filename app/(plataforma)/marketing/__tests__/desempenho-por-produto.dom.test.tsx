import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { DesempenhoTrafego } from "../DesempenhoTrafego";
import type { Desempenho, CriativoDesempenho, TotaisDesempenho } from "../tipos";

/**
 * Carimbo e chancela rodam nas mesmas contas e nas mesmas campanhas. O ranking
 * de criativos somava os dois e respondia "o que mais vendeu" sem dizer DE QUE
 * PRODUTO — e quem cuida da chancela via o top ocupado por carimbo.
 *
 * O que este arquivo trava:
 *  1. o chip de produto filtra o RANKING (não só a tabela);
 *  2. o KPI muda junto — e vem dos totais que o servidor somou sobre TODOS os
 *     criativos da linha, não da soma dos poucos que entraram no ranking;
 *  3. dá pra ver o vídeo: o play abre a prévia, uma por vez.
 */

const totais = (t: Partial<TotaisDesempenho>): TotaisDesempenho => ({
  spend: 0, revenue: 0, impressions: 0, clicks: 0, purchases: 0,
  ctr: 0, cpm: 0, cpa: null, roas: null, criativos: 0, ...t,
});

const criativo = (c: Partial<CriativoDesempenho> & { chave: string; nome: string }): CriativoDesempenho => ({
  codigo: null, criativoId: null, editor: null, campanhas: [], linha: null, contaId: "1",
  anuncios: 1, adIds: ["120000000000001"], spend: 100, impressions: 5000, clicks: 100,
  purchases: 2, revenue: 300, ctr: 2, cpm: 20, cpc: 1, cpa: 50, roas: 3, ...c,
});

const DADOS: Desempenho = {
  de: "2026-08-01", ate: "2026-08-30", indisponivel: false,
  totais: totais({ spend: 1000, revenue: 4000, criativos: 3, roas: 4 }),
  criativos: [
    criativo({ chave: "jl03", nome: "JL 03", linha: "carimbo", revenue: 3000 }),
    criativo({ chave: "fv09", nome: "FV 09 CH V3 - L", linha: "chancela", revenue: 900 }),
    criativo({ chave: "c221", nome: "C2 21.01", linha: null, revenue: 100 }),
  ],
  porLinha: [
    { linha: "carimbo", totais: totais({ spend: 700, revenue: 3000, criativos: 12 }), serie: [{ dia: "2026-08-01", revenue: 3000, spend: 700, ctr: 2 }] },
    { linha: "chancela", totais: totais({ spend: 250, revenue: 900, criativos: 5 }), serie: [{ dia: "2026-08-01", revenue: 900, spend: 250, ctr: 3 }] },
    { linha: "sem", totais: totais({ spend: 50, revenue: 100, criativos: 1 }), serie: [{ dia: "2026-08-01", revenue: 100, spend: 50, ctr: 1 }] },
  ],
  serie: [{ dia: "2026-08-01", revenue: 4000, spend: 1000, ctr: 2 }],
};

const painel = () => <DesempenhoTrafego dados={DADOS} dias={30} onDias={() => {}} />;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, src: "https://facebook.example/preview" }) })));
});

describe("Desempenho no tráfego · filtro por produto", () => {
  it("mostra um chip por linha que existe no período, com a contagem", () => {
    render(painel());
    expect(screen.getByRole("button", { name: /^Carimbo/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Chancela/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Sem marca/ })).toBeTruthy();
  });

  it("filtrar por chancela tira o carimbo do ranking", () => {
    render(painel());
    // Sem filtro, os dois aparecem.
    expect(screen.getAllByText("JL 03").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /^Chancela/ }));
    expect(screen.queryByText("JL 03")).toBeNull();
    expect(screen.getAllByText("FV 09 CH V3 - L").length).toBeGreaterThan(0);
  });

  it("o KPI segue o filtro e vem do total DA LINHA, não da soma do ranking", () => {
    render(painel());
    fireEvent.click(screen.getByRole("button", { name: /^Chancela/ }));
    // 5 criativos de chancela no período, mesmo com 1 só no ranking.
    const kpi = screen.getByText("Criativos no ar").closest(".mc-card")!;
    expect(within(kpi as HTMLElement).getByText("5")).toBeTruthy();
  });

  it("o play abre a prévia do anúncio", async () => {
    render(painel());
    fireEvent.click(screen.getAllByRole("button", { name: /Ver o vídeo de JL 03/ })[0]);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    // O iframe só existe DEPOIS de pedir — nunca junto com a lista.
    await waitFor(() => expect(document.querySelector("iframe[src*='facebook.example']")).toBeTruthy());
  });

  it("a galeria não monta iframe nenhum enquanto ninguém clica", () => {
    render(painel());
    expect(document.querySelector("iframe")).toBeNull();
  });
});
