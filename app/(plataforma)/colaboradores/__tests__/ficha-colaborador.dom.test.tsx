import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ColaboradoresClient, type ColabRow } from "../ColaboradoresClient";

// jsdom não tem layout: offsetParent e rect são sempre 0. Estes testes checam
// COMPORTAMENTO (o que aparece e o que some), nunca geometria.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const pessoa = (over: Partial<ColabRow> = {}): ColabRow => ({
  id: "c1", username: "leticia", name: "Letícia Valentim", email: null, role: "colaborador",
  active: true, password_set: true, created_at: "2025-01-01",
  employees: {
    photo_url: null, cargo: null, departamento: "Comercial", perfil: "Vendedor", perfis: ["Vendedor"],
    especialidade: null, escala: null, nivel: 1, setor: null, tablet: false, mesa: null, mesas: null,
    telefone: null, data_admissao: null, observacoes: null, erp_user_id: null, permissoes: null,
  },
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)));
});
afterEach(() => vi.unstubAllGlobals());

const abrirFicha = () => fireEvent.click(screen.getByText("Letícia Valentim"));

describe("Ficha do colaborador", () => {
  it("os ajustes da empresa vivem na lista e somem quando a tela vira de UMA pessoa", () => {
    render(
      <ColaboradoresClient initial={[pessoa()]} meId="eu" isAdmin
        ajustes={<div>Turnos da empresa</div>} />,
    );
    expect(screen.getByText("Turnos da empresa")).toBeInTheDocument();

    abrirFicha();
    // Era este o vazamento: quatro sanfonas sobre a empresa inteira desenhadas
    // embaixo do perfil de um colaborador, em todas as abas.
    expect(screen.queryByText("Turnos da empresa")).not.toBeInTheDocument();
    expect(screen.queryByText("Ajustes da empresa")).not.toBeInTheDocument();
  });

  it("são três assuntos, não seis abas — e as antigas caem no assunto que as engoliu", () => {
    localStorage.setItem("pessoas.det.tab", "metricas");
    render(<ColaboradoresClient initial={[pessoa()]} meId="eu" isAdmin />);
    abrirFicha();

    expect(screen.getByRole("tab", { name: /Ponto & jornada/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Acesso/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Desempenho/ })).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    // "Métricas" salva do desenho antigo abre em Desempenho, não numa tela vazia.
    expect(screen.getByRole("tab", { name: /Desempenho/ })).toHaveAttribute("aria-selected", "true");
  });

  it("quem é a pessoa não sai da vista ao trocar de assunto", () => {
    render(<ColaboradoresClient initial={[pessoa()]} meId="eu" isAdmin />);
    abrirFicha();
    expect(screen.getByRole("heading", { name: "Letícia Valentim" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Acesso/ }));
    expect(screen.getByRole("heading", { name: "Letícia Valentim" })).toBeInTheDocument();
    expect(screen.getByText(/Acesso às áreas/)).toBeInTheDocument();
  });

  it("editar toma a coluna do assunto — é tarefa, não uma sétima aba", () => {
    render(<ColaboradoresClient initial={[pessoa()]} meId="eu" isAdmin />);
    abrirFicha();
    fireEvent.click(screen.getByRole("button", { name: /Editar dados/ }));

    expect(screen.getByText("Editar cadastro")).toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    // A identidade continua ali: edita-se sabendo de quem é o cadastro.
    expect(screen.getByRole("heading", { name: "Letícia Valentim" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Cancelar/ }));
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("sem a área de admin não existe aba de acesso — nem por valor salvo", () => {
    localStorage.setItem("pessoas.det.tab", "permissoes");
    render(<ColaboradoresClient initial={[pessoa()]} meId="eu" isAdmin={false} />);
    abrirFicha();

    expect(screen.queryByRole("tab", { name: /Acesso/ })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Ponto & jornada/ })).toHaveAttribute("aria-selected", "true");
  });
});
