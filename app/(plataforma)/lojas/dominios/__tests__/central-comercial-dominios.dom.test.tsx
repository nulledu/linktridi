import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// `confirmar` responde sim na hora; o toast é o que se observa.
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock("../../../Toast", () => ({
  toast: Object.assign((t: string, tipo = "ok") => toastSpy(t, tipo), {
    ok: (t: string) => toastSpy(t, "ok"),
    erro: (t: string) => toastSpy(t, "erro"),
    info: (t: string) => toastSpy(t, "info"),
  }),
  confirmar: async () => true,
  ToastHost: () => null,
}));

import { DominiosClient } from "../DominiosClient";

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

const HOST = "loja.exemplo.com.br";
// Verificado: a checagem automática da montagem só roda nos NÃO verificados.
const DOMINIOS = [{ id: "d1", host: HOST, verificado: true, lojaId: null }];

beforeEach(() => { toastSpy.mockClear(); });
afterEach(() => vi.unstubAllGlobals());

describe("Domínios · remover não pode mentir", () => {
  it("servidor falha → o endereço fica na lista e o toast diz que não saiu", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(init?.method === "DELETE" ? json({ error: "falhou no banco" }, 500) : json({}))));

    render(<DominiosClient dominios={DOMINIOS} lojas={[]} podeEscrever />);
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));

    await vi.waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.any(String), "erro"));
    expect(screen.getByRole("heading", { name: HOST })).toBeInTheDocument();
    expect(toastSpy).not.toHaveBeenCalledWith("Endereço removido.", "ok");
  });

  it("sem permissão (403) → continua na lista", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(init?.method === "DELETE" ? json({ error: "forbidden" }, 403) : json({}))));

    render(<DominiosClient dominios={DOMINIOS} lojas={[]} podeEscrever />);
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));

    await vi.waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.any(String), "erro"));
    expect(screen.getByRole("heading", { name: HOST })).toBeInTheDocument();
  });

  it("deu certo → sai da lista e confirma", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(init?.method === "DELETE" ? json({ ok: true }) : json({}))));

    render(<DominiosClient dominios={DOMINIOS} lojas={[]} podeEscrever />);
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));

    await vi.waitFor(() => expect(screen.queryByRole("heading", { name: HOST })).not.toBeInTheDocument());
    expect(toastSpy).toHaveBeenCalledWith("Endereço removido.", "ok");
    expect(toastSpy).not.toHaveBeenCalledWith(expect.any(String), "erro");
  });
});
