import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock("../../Toast", () => ({
  toast: Object.assign((t: string, tipo = "ok") => toastSpy(t, tipo), {
    ok: (t: string) => toastSpy(t, "ok"),
    erro: (t: string) => toastSpy(t, "erro"),
    info: (t: string) => toastSpy(t, "info"),
  }),
  confirmar: async () => true,
  ToastHost: () => null,
}));

import { PedidosAuto } from "../PedidosAuto";

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

const PEDIDO = {
  ref: "P1", id_proprio: null, cliente: "Maria", telefone: "", valor: 100, data: "2026-09-10T12:00:00Z",
  plataforma: null, etapa: null, responsavel_id: "v1", responsavel_nome: "Ana",
  dias_conversa: 3, fonte: null, ocupacao: "contador", origem: "gaia",
};

function servidor(patch: () => Response) {
  const f = vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === "PATCH") return Promise.resolve(patch());
    if (u.startsWith("/api/comercial/responsaveis")) {
      return Promise.resolve(json({ responsaveis: [], podeGerir: true, meErpId: "v1" }));
    }
    if (u.startsWith("/api/comercial/pedidos")) return Promise.resolve(json({ pedidos: [PEDIDO] }));
    return Promise.resolve(json({}));
  });
  vi.stubGlobal("fetch", f);
  return f;
}

beforeEach(() => { toastSpy.mockClear(); });
afterEach(() => vi.unstubAllGlobals());

describe("Pedidos · campo extra salvo de verdade", () => {
  it("servidor recusa (403) → o valor anterior volta e o toast diz", async () => {
    servidor(() => json({ error: "forbidden" }, 403));
    render(<PedidosAuto />);

    const campo = await screen.findByDisplayValue("contador");
    fireEvent.change(campo, { target: { value: "dentista" } });
    fireEvent.blur(campo);

    await vi.waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.any(String), "erro"));
    await vi.waitFor(() => expect(screen.getByDisplayValue("contador")).toBeInTheDocument());
    expect(screen.queryByDisplayValue("dentista")).not.toBeInTheDocument();
  });

  it("dias de conversa: 500 → volta ao número anterior", async () => {
    servidor(() => json({ error: "failed" }, 500));
    render(<PedidosAuto />);

    const campo = await screen.findByDisplayValue("3");
    fireEvent.change(campo, { target: { value: "9" } });
    fireEvent.blur(campo);

    await vi.waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.any(String), "erro"));
    await vi.waitFor(() => expect(screen.getByDisplayValue("3")).toBeInTheDocument());
  });

  it("deu certo → o valor novo fica, sem toast de erro", async () => {
    const f = servidor(() => json({ ok: true }));
    render(<PedidosAuto />);

    const campo = await screen.findByDisplayValue("contador");
    fireEvent.change(campo, { target: { value: "dentista" } });
    fireEvent.blur(campo);

    await vi.waitFor(() => expect(f.mock.calls.some(([, i]) => i?.method === "PATCH")).toBe(true));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByDisplayValue("dentista")).toBeInTheDocument();
    expect(toastSpy).not.toHaveBeenCalledWith(expect.any(String), "erro");
  });
});
