import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EditorClient } from "../EditorClient";
import { TEMA_PADRAO } from "@/lib/vitrine/modelos";
import { lojaPorId, produtosDaLoja } from "@/lib/lojas-demo";

// "Voltou ao tema publicado" com o rascunho ainda salvo no servidor é a
// interface mentindo: ao recarregar, o rascunho volta.

const LOJA = "carimbos-tridi";
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

function montar() {
  return render(
    <EditorClient
      loja={lojaPorId(LOJA)!}
      produtos={produtosDaLoja(LOJA)}
      publicado={TEMA_PADRAO()}
      rascunho={TEMA_PADRAO()}
      persistido
      previaUrl="/previa/dev"
    />,
  );
}

beforeEach(() => { vi.stubGlobal("confirm", () => true); });
afterEach(() => vi.unstubAllGlobals());

describe("Aparência · descartar", () => {
  it("servidor falha → não diz que voltou, e o rascunho continua na tela", async () => {
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(init?.method === "DELETE" ? json({ error: "boom" }, 500) : json({}))));

    montar();
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));

    await vi.waitFor(() => expect(screen.getByText(/rascunho continua salvo/i)).toBeInTheDocument());
    expect(screen.queryByText("Voltou ao tema publicado.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descartar" })).toBeInTheDocument();
  });

  it("sem conexão → idem", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));

    montar();
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));

    await vi.waitFor(() => expect(screen.getByText(/rascunho continua salvo/i)).toBeInTheDocument());
    expect(screen.queryByText("Voltou ao tema publicado.")).not.toBeInTheDocument();
  });

  it("deu certo → volta ao publicado", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(json({ ok: true }))));

    montar();
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));

    await vi.waitFor(() => expect(screen.getByText("Voltou ao tema publicado.")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Descartar" })).not.toBeInTheDocument();
  });
});
