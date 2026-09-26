import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LancadorDeAtividade } from "../LancadorDeAtividade";
import type { Colaborador } from "@/lib/atividades-catalog";
import type { ItemDaVisao } from "@/lib/atividades-visao";

// O fluxo que o dono descreveu (11/09/2026): vai em Carimbo, aparecem os
// puxadores; seleciona o Puxador e vê se é montar ou cortar as peças — e já
// mostra se vai pra Produção ou pra Máquinas, com as pessoas de cada um.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
const aviso = vi.hoisted(() => ({ ok: vi.fn(), erro: vi.fn(), info: vi.fn() }));
vi.mock("../../Toast", async (original) => ({
  ...(await original<typeof import("../../Toast")>()),
  toast: Object.assign(vi.fn(), aviso),
  confirmar: vi.fn(() => Promise.resolve(true)),
}));

const base = { imagem_url: null, quantidade: 3, qtd_minima: 10, unidade: "un", setor_responsavel: null };
const CARIMBO: ItemDaVisao = { ...base, id: "11111111-1111-4111-8111-111111111111", nome: "Carimbo", categoria: "Carimbos", hierarquia: "produto" };
const PUXADOR: ItemDaVisao = { ...base, id: "22222222-2222-4222-8222-222222222222", nome: "Puxador", categoria: "Puxadores", hierarquia: "componente" };
const GENTE: Colaborador[] = [
  { id: "davi", nome: "Davi", setor: "Produção", especialidade: "Máquinas" },
  { id: "mikael", nome: "Mikael", setor: "Produção", especialidade: "Carimbo" },
];

let posts: Record<string, unknown>[] = [];
beforeEach(() => {
  posts = [];
  const resp = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes(`item=${CARIMBO.id}`)) return resp({ componentes: [PUXADOR], opcoes: [] });
    if (u.includes(`item=${PUXADOR.id}`)) return resp({ componentes: [], opcoes: [
      { id: "o1", item_id: PUXADOR.id, nome: "Cortar peças do puxador", setor: "Máquinas", ordem: 0 },
      { id: "o2", item_id: PUXADOR.id, nome: "Montar puxador", setor: "Produção", ordem: 1 },
    ] });
    if (u.startsWith("/api/devices/mesas")) return resp({ devices: [{ nome_mesa: "Mesa 1", ativo: true }] });
    if (u === "/api/atividades" && init?.method === "POST") {
      posts.push(JSON.parse(String(init.body)));
      return resp({ atividade: { id: "nova" } });
    }
    return resp({});
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

const abrir = () => render(
  <LancadorDeAtividade item={CARIMBO} lista={[]} modelos={[]} colaboradores={GENTE}
    podeAtribuir podeConfigurar onFechar={() => {}} onAbrirQuadro={() => {}} />,
);

async function irAoPuxador() {
  abrir();
  fireEvent.click(await screen.findByRole("button", { name: /^Puxador/ }));
  return screen.findByRole("button", { name: /^Cortar peças do puxador/ });
}

describe("pop-up do item", () => {
  it("Carimbo mostra o Puxador; no Puxador aparecem cortar (Máquinas) e montar (Produção)", async () => {
    const cortar = await irAoPuxador();
    expect(cortar).toHaveTextContent("Máquinas");
    expect(screen.getByRole("button", { name: /^Montar puxador/ })).toHaveTextContent("Produção");
    expect(screen.getByRole("button", { name: /Nova atividade/ })).toBeInTheDocument();
  });

  it("escolher a atividade já marca o setor dela e mostra as pessoas dele; trocar o setor troca as pessoas", async () => {
    fireEvent.click(await irAoPuxador());
    expect(screen.getByRole("button", { name: "Máquinas", pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Davi/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Mikael/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Produção" }));
    expect(screen.getByRole("checkbox", { name: /Mikael/ })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Davi/ })).not.toBeInTheDocument();
  });

  it("enviar leva a faixa escolhida, o item como categoria, e não marca o item como produzido", async () => {
    fireEvent.click(await irAoPuxador());
    fireEvent.click(screen.getByRole("checkbox", { name: /Davi/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Enviar/ }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      tarefa: "Cortar peças do puxador", categoria: "Puxador", para_id: "davi", faixa: "maquinas", produto_nome: null,
    });
    await waitFor(() => expect(aviso.ok).toHaveBeenCalled());
  });
});
