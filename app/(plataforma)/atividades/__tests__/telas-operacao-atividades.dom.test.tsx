import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AtividadesClient } from "../AtividadesClient";
import { ProdutividadeMetas } from "../ProdutividadeMetas";
import type { Atividade, Colaborador } from "@/lib/atividades-catalog";
import type { MetaProgresso } from "@/lib/metas";

// ── Remoção otimista que o servidor recusou tem que VOLTAR, com aviso ─────────
// O card sumia na hora, o DELETE falhava calado e o card reaparecia sozinho no
// próximo ciclo do poll, sem uma palavra — parecia assombração, e quem tentou
// remover achava que o sistema tinha desfeito a ação por conta própria.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const aviso = vi.hoisted(() => ({ ok: vi.fn(), erro: vi.fn(), info: vi.fn() }));
vi.mock("../../Toast", async (original) => ({
  ...(await original<typeof import("../../Toast")>()),
  toast: Object.assign(vi.fn(), aviso),
  confirmar: vi.fn(() => Promise.resolve(true)),
}));

const COLABS: Colaborador[] = [
  { id: "u1", nome: "Ana Ribeiro", setor: "Produção", departamento: "Produção" },
];

const ATV = {
  id: "a1", tarefa: "Cortar MDF", categoria: "Corte", detalhe: null, status: "pendente",
  prazo: null, quantidade_alvo: 1, quantidade_feita: 0, para_id: "u1", para_nome: "Ana Ribeiro",
  por_nome: "Gestor", produto_nome: null, foto_url: null, tempo_estimado_min: 40,
  created_at: "2026-09-10T12:00:00Z", iniciada_at: null, concluida_at: null, estoque_lancado: false,
} as unknown as Atividade;

const META = {
  id: "m1", titulo: "Carimbos do dia", setor: "Produção", periodicidade: "diaria", janelaLabel: "hoje",
  atual: 3, alvo: 10, pct: 30, bateu: false, colaborador_id: null,
} as unknown as MetaProgresso;

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET").toUpperCase() === "DELETE") {
      return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: "failed" }) } as unknown as Response);
    }
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ atividades: String(url).startsWith("/api/atividades") ? [ATV] : [], devices: [], itens: [], modelos: [] }),
    } as unknown as Response);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("remoção que o servidor recusou", () => {
  it("atividade: o card volta e a pessoa é avisada", async () => {
    render(<AtividadesClient colaboradores={COLABS} initial={[ATV]} roleLabel="admin" produtos={[]} />);

    fireEvent.click(screen.getAllByTitle("Remover")[0]);

    await waitFor(() => expect(aviso.erro).toHaveBeenCalled());
    expect(screen.getAllByText("Cortar MDF").length).toBeGreaterThan(0);
  });

  it("meta do setor: a linha volta e a pessoa é avisada", async () => {
    render(
      <ProdutividadeMetas colaboradores={COLABS} atividades={[]} produtos={[]}
        metas={[META]} erpUsers={[{ id: "u1", nome: "Ana Ribeiro" }]} podeGerir />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Excluir a meta Carimbos do dia" }));

    await waitFor(() => expect(aviso.erro).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Excluir a meta Carimbos do dia" })).toBeInTheDocument();
  });
});
