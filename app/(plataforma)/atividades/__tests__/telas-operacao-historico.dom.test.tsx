import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { HistoricoProducaoClient } from "../historico/HistoricoProducaoClient";
import type { Tempos } from "@/lib/atividades-tempo";

// ── Resposta atrasada não pode vencer o período novo ─────────────────────────
// Trocar 90 → 7 rápido: a leitura de 90 dias é a mais lenta e chega por
// último. Sem guarda, ela escrevia por cima e a tela mostrava os números de
// 90 dias embaixo do chip "7 dias" — num relatório sem poll, até recarregar.

function tempos(dias: number, ordens: number): Tempos {
  return {
    dias, grupos: [], truncado: false, escopo: "equipe", aberturas: null,
    resumo: { ordensMedidas: ordens, ordensDescartadas: 0, fracaoDescartada: 0, pecas: 0, horas: 0, acimaDoPrevisto: 0, maiorDescarte: null },
  };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("Tempos — troca de período", () => {
  it("90 dias chegando DEPOIS de 7 dias não sobrescreve a tela", async () => {
    const presos = new Map<number, (t: Tempos) => void>();
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      const dias = Number(new URL(String(url), "http://x").searchParams.get("dias"));
      return new Promise<Response>((res) => presos.set(dias, (t) => res({ ok: true, status: 200, json: () => Promise.resolve(t) } as unknown as Response)));
    }));
    render(<HistoricoProducaoClient inicial={tempos(30, 3030)} />);

    fireEvent.click(screen.getByRole("button", { name: "90 dias" }));
    fireEvent.click(screen.getByRole("button", { name: "7 dias" }));
    await waitFor(() => expect(presos.size).toBe(2));

    await act(async () => { presos.get(7)!(tempos(7, 7777)); });
    await act(async () => { presos.get(90)!(tempos(90, 9090)); });

    expect(screen.getByText("7777")).toBeInTheDocument();
    expect(screen.queryByText("9090")).not.toBeInTheDocument();
  });
});
