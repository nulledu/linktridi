import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { TabletsClient } from "../tablets/TabletsClient";
import type { MarketDeviceHealth } from "../../../../lib/tridimarket/types";

// A empresa do tablet é o que decide DE QUAL ESTOQUE cada compra sai. Até aqui
// ela só se definia no pareamento: a rota PATCH aceitava `name` e `active`, e
// mais nada. Aparelho na empresa errada dava baixa no estoque errado, calado.
//
// Apareceu na fusão Galeria → Zeelux: o script move todos os `dispositivos` da
// empresa que sumiu, então o "Totem Tridi" foi parar na Zeelux junto com o
// resto, sem jeito de voltar pela interface.

const tablet = (over: Partial<MarketDeviceHealth> & { id: string; name: string }): MarketDeviceHealth => ({
  unitName: "Zeelux", active: true, lastSeenAt: new Date().toISOString(),
  minutesSinceSeen: 1, pendingOperations: 0, online: true,
  ...over,
} as MarketDeviceHealth);

const TABLETS = [
  tablet({ id: "d1", name: "Totem Tridi" }),
  tablet({ id: "d2", name: "Zeelux", minutesSinceSeen: 14 }),
];

const PERFIS = [
  { id: "u-tridi", name: "Tridi Escritório", active: true, description: null },
  { id: "u-zeelux", name: "Zeelux", active: true, description: null },
];

let chamadas: Array<{ url: string; metodo: string; body: Record<string, unknown> | null }>;

beforeEach(() => {
  localStorage.clear();
  chamadas = [];
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    chamadas.push({
      url: String(url), metodo: String(init?.method ?? "GET"),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    // A lista de tablets vem do `overview` (é lá que a saúde de cada aparelho
    // é calculada), não de `/devices` — o `/devices` só cadastra e edita.
    const dados = String(url).includes("/overview")
      ? { devices: TABLETS }
      : String(url).includes("/settings")
        ? { profiles: PERFIS, schemaReady: true }
        : String(url).includes("/devices")
          ? { devices: TABLETS, codes: [] }
          : { ok: true };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ ok: true, data: dados }) } as Response);
  }));
});
afterEach(() => vi.unstubAllGlobals());

// Escopo na folha: o filtro do topo também tem um campo "Empresa" — e essa é
// justamente a diferença que importa. O do topo escolhe o que a tela MOSTRA; o
// da folha escolhe de qual estoque o tablet TIRA.
async function abrirEdicao(nome: string) {
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(`Editar ${nome}`) }));
  const folha = await waitFor(() => {
    const f = document.querySelector("form.sheet");
    if (!f) throw new Error("folha não abriu");
    return f as HTMLElement;
  });
  return within(folha).getByLabelText("Empresa") as HTMLSelectElement;
}

describe("TridiMarket · tablet muda de empresa", () => {
  it("o modal abre com a empresa atual do aparelho", async () => {
    render(<TabletsClient />);
    const sel = await abrirEdicao("Totem Tridi");
    expect(sel.value).toBe("u-zeelux");
  });

  it("trocar a empresa manda profileId no PATCH", async () => {
    render(<TabletsClient />);
    const sel = await abrirEdicao("Totem Tridi");
    fireEvent.change(sel, { target: { value: "u-tridi" } });

    const folha = document.querySelector("form.sheet") as HTMLElement;
    fireEvent.click(within(folha).getByRole("button", { name: /^Salvar$/ }));

    await waitFor(() => {
      const patch = chamadas.find((c) => c.metodo === "PATCH" && c.body?.profileId);
      expect(patch, "não saiu PATCH com profileId").toBeTruthy();
      expect(patch!.body).toMatchObject({ id: "d1", profileId: "u-tridi" });
    });
  });

  it("só renomear não manda profileId — e vice-versa", async () => {
    render(<TabletsClient />);
    await abrirEdicao("Totem Tridi");
    fireEvent.change(screen.getByLabelText("Nome do aparelho"), { target: { value: "Totem da Fábrica" } });

    const folha = document.querySelector("form.sheet") as HTMLElement;
    fireEvent.click(within(folha).getByRole("button", { name: /^Salvar$/ }));

    await waitFor(() => {
      const patches = chamadas.filter((c) => c.metodo === "PATCH");
      expect(patches).toHaveLength(1);
      expect(patches[0].body).toMatchObject({ id: "d1", name: "Totem da Fábrica" });
      expect(patches[0].body).not.toHaveProperty("profileId");
    });
  });
});
