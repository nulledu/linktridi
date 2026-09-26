import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MinhasAtividadesClient } from "../MinhasAtividadesClient";
import type { Atividade } from "@/lib/atividades-catalog";

// ── "Concluir" e "+1 feito" têm que dizer a verdade ──────────────────────────
// Os dois botões mudavam a tela na hora e mandavam o PATCH sem olhar a
// resposta. A tela não tem poll, então uma recusa (sessão expirada, 403, 500)
// deixava a atividade "concluída" pra sempre só naquele navegador. E toques
// rápidos no "+1" mandavam valores ABSOLUTOS em paralelo: chegando fora de
// ordem, o 2 gravava depois do 3 e a contagem andava pra trás.

const aviso = vi.hoisted(() => ({ ok: vi.fn(), erro: vi.fn(), info: vi.fn() }));
vi.mock("../../Toast", async (original) => ({
  ...(await original<typeof import("../../Toast")>()),
  toast: Object.assign(vi.fn(), aviso),
}));

function atividade(extra: Partial<Atividade> = {}): Atividade {
  return {
    id: "a1", tarefa: "Montar carimbo", categoria: "Montagem", detalhe: null,
    status: "em_andamento", prazo: null, quantidade_alvo: 1, quantidade_feita: 0,
    por_nome: "Gestor", para_nome: "Ana", produto_nome: null, foto_url: null,
    tempo_estimado_min: null, ...extra,
  } as unknown as Atividade;
}

type Pendente = { corpo: Record<string, unknown>; soltar: (ok: boolean) => void };

/** Todo PATCH fica preso até o teste soltar; o resto responde 200 vazio. */
function fetchComPatchesPresos() {
  const patches: Pendente[] = [];
  const spy = vi.fn((url: string, init?: RequestInit) => {
    if (String(url) === "/api/atividades" && init?.method === "PATCH") {
      return new Promise<Response>((res) => patches.push({
        corpo: JSON.parse(String(init.body)) as Record<string, unknown>,
        soltar: (ok) => res({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(ok ? { ok: true } : { error: "failed" }) } as unknown as Response),
      }));
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as unknown as Response);
  });
  return { spy, patches };
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Minhas atividades — gravação que falha volta atrás", () => {
  it("Concluir recusado pelo servidor devolve a atividade às ativas e avisa", async () => {
    const { spy, patches } = fetchComPatchesPresos();
    vi.stubGlobal("fetch", spy);
    render(<MinhasAtividadesClient initial={[atividade()]} />);

    fireEvent.click(screen.getByRole("button", { name: /Concluir/ }));
    // Otimista: sai das ativas na hora.
    expect(screen.queryByText("Montar carimbo")).not.toBeInTheDocument();

    await waitFor(() => expect(patches).toHaveLength(1));
    await act(async () => { patches[0].soltar(false); });

    expect(await screen.findByText("Montar carimbo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Concluir/ })).toBeInTheDocument();
    expect(aviso.erro).toHaveBeenCalled();
  });

  it("+1 rápido: um PATCH por vez, e o último leva o valor final", async () => {
    const { spy, patches } = fetchComPatchesPresos();
    vi.stubGlobal("fetch", spy);
    render(<MinhasAtividadesClient initial={[atividade({ quantidade_alvo: 10 })]} />);

    const mais = screen.getByRole("button", { name: /1 feito/ });
    fireEvent.click(mais); fireEvent.click(mais); fireEvent.click(mais);
    expect(screen.getByText("3 / 10")).toBeInTheDocument();

    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0].corpo.quantidade_feita).toBe(1);

    await act(async () => { patches[0].soltar(true); });
    await waitFor(() => expect(patches).toHaveLength(2));
    // Os toques que chegaram com o primeiro no ar viram UM envio, com o valor
    // mais novo — nunca o 2 chegando depois do 3.
    expect(patches[1].corpo.quantidade_feita).toBe(3);

    await act(async () => { patches[1].soltar(true); });
    expect(patches).toHaveLength(2);
    expect(screen.getByText("3 / 10")).toBeInTheDocument();
    expect(aviso.erro).not.toHaveBeenCalled();
  });

  it("+1 que falha volta pro último valor que o servidor confirmou", async () => {
    const { spy, patches } = fetchComPatchesPresos();
    vi.stubGlobal("fetch", spy);
    render(<MinhasAtividadesClient initial={[atividade({ quantidade_alvo: 10 })]} />);

    const mais = screen.getByRole("button", { name: /1 feito/ });
    fireEvent.click(mais);
    await waitFor(() => expect(patches).toHaveLength(1));
    await act(async () => { patches[0].soltar(true); });

    fireEvent.click(mais);
    expect(screen.getByText("2 / 10")).toBeInTheDocument();
    await waitFor(() => expect(patches).toHaveLength(2));
    await act(async () => { patches[1].soltar(false); });

    expect(await screen.findByText("1 / 10")).toBeInTheDocument();
    expect(aviso.erro).toHaveBeenCalled();
  });
});
