import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ColaboradoresClient, type ColabRow } from "../ColaboradoresClient";

// jsdom não tem layout: estes testes checam COMPORTAMENTO (o que aparece na
// lista de destinos), nunca geometria.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const pessoa = (permissoes: Record<string, boolean> | null, pagina_inicial: string | null = null): ColabRow => ({
  id: "c1", username: "neiva", name: "Neiva", email: null, role: "colaborador",
  active: true, password_set: true, created_at: "2025-01-01",
  employees: {
    photo_url: null, cargo: null, departamento: null, perfil: null, perfis: [],
    especialidade: null, escala: null, nivel: 1, setor: null, tablet: false, mesa: null, mesas: null,
    telefone: null, data_admissao: null, observacoes: null, erp_user_id: null, permissoes, pagina_inicial,
  },
});

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)));
});
afterEach(() => vi.unstubAllGlobals());

function abrirAcesso(row: ColabRow) {
  render(<ColaboradoresClient initial={[row]} meId="eu" isAdmin />);
  fireEvent.click(screen.getByText("Neiva"));
  fireEvent.click(screen.getByRole("tab", { name: /Acesso/ }));
}

// O gatilho do GlassSelect é um <button> com o rótulo da opção atual; a lista
// abre no `.gp-pop`. Escopar nela importa: a grade de áreas acima tem botões com
// os mesmos nomes ("Comercial", "Estoque"), e sem escopo o teste passaria por
// encontrar o card da área em vez da opção.
const abrirSeletor = (rotuloAtual = "Padrão (Central)") => {
  fireEvent.click(screen.getByRole("button", { name: rotuloAtual }));
  return within(document.querySelector(".gp-pop") as HTMLElement);
};

describe("Página inicial da pessoa", () => {
  it("nasce no padrão e oferece só as áreas que a pessoa tem", () => {
    abrirAcesso(pessoa({ tridimarket: true }));

    expect(screen.getByText(/Onde esta pessoa cai ao entrar/)).toBeInTheDocument();
    const lista = abrirSeletor();
    expect(lista.getByRole("button", { name: "Padrão (Central)" })).toBeInTheDocument();
    expect(lista.getByRole("button", { name: "TridiMarket" })).toBeInTheDocument();
    // Área que ela NÃO tem não pode virar destino — entrar direto num 403 é pior
    // que entrar na Central.
    expect(lista.queryByRole("button", { name: "Comercial" })).not.toBeInTheDocument();
  });

  it("escolher o destino libera o salvar e manda a chave do módulo", () => {
    const fetchMock = vi.fn((_url?: unknown, _init?: RequestInit) =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response));
    vi.stubGlobal("fetch", fetchMock);
    abrirAcesso(pessoa({ tridimarket: true }));

    expect(screen.getByRole("button", { name: "Tudo salvo" })).toBeInTheDocument();
    fireEvent.click(abrirSeletor().getByRole("button", { name: "TridiMarket" }));

    fireEvent.click(screen.getByRole("button", { name: "Salvar acesso" }));
    // A ficha também BUSCA (histórico de permissões); o save é o que leva corpo.
    const salvou = fetchMock.mock.calls.find((c) => String(c[0]).includes("/api/colaboradores/c1") && c[1]?.body);
    expect(salvou).toBeTruthy();
    const body = JSON.parse(String(salvou![1]!.body));
    expect(body.pagina_inicial).toBe("tridimarket");   // CHAVE do módulo, nunca a URL
  });

  it("área tirada depois: a escolha órfã aparece como tal, sem sumir calada", () => {
    abrirAcesso(pessoa({ tridimarket: false }, "tridimarket"));
    expect(screen.getByText(/Área removida/)).toBeInTheDocument();
  });
});
