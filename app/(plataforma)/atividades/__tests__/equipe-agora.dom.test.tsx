import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { VisaoGeral } from "../VisaoGeral";
import type { Atividade, Colaborador } from "@/lib/atividades-catalog";

// Pedido do dono (12/09/2026): na Visão geral, bolinha ao lado de cada pessoa
// — verde disponível, amarelo ocupado (fazendo atividade), vermelho fora da
// empresa (pelo ponto).
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

const GENTE: Colaborador[] = [
  { id: "davi", nome: "Davi", setor: "Produção", especialidade: "Máquinas" },
  { id: "bruno", nome: "Bruno", setor: "Produção", especialidade: "Máquinas" },
  { id: "joao", nome: "João", setor: "Produção", especialidade: "Preparo" },
];
const EM_ANDAMENTO = {
  id: "a1", categoria: "Puxador", tarefa: "Cortar peças do puxador", detalhe: null, para_id: "bruno", para_nome: "Bruno",
  por_id: "g", por_nome: "Gestor", status: "em_andamento", prazo: null, quantidade_alvo: 1, quantidade_feita: 0,
  tempo_estimado_min: 40, iniciada_at: new Date().toISOString(), produto_id: null, produto_nome: null,
  estoque_lancado: false, created_at: new Date().toISOString(), concluida_at: null, foto_url: null,
} as Atividade;
const PRESENCA = { registrados: ["davi", "bruno", "joao"], presentes: ["davi", "bruno"] };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response)));
});
afterEach(() => vi.unstubAllGlobals());

describe("Equipe agora — as bolinhas", () => {
  it("cada pessoa com a cor do seu estado, e a legenda conta", () => {
    render(
      <VisaoGeral lista={[EM_ANDAMENTO]} colaboradores={GENTE} modelos={[]} itens={[]} podeAtribuir
        presenca={PRESENCA} onAbrirQuadro={() => {}} onNovaAtividade={() => {}} />,
    );
    const secao = screen.getByRole("heading", { name: "Equipe agora" }).closest("section")!;
    // nome → bloco nome+subtítulo → a linha (bolinha, avatar, bloco).
    const linhaDe = (nome: string) => within(secao).getByText(nome).parentElement!.parentElement!;
    expect(within(linhaDe("Davi")).getByRole("img", { name: "Disponível" })).toBeInTheDocument();
    expect(within(linhaDe("Bruno")).getByRole("img", { name: "Ocupado" })).toBeInTheDocument();
    expect(within(secao).getByText("Fazendo: Cortar peças do puxador")).toBeInTheDocument();
    expect(within(linhaDe("João")).getByRole("img", { name: "Não está na empresa" })).toBeInTheDocument();
    // Só três colunas: o Preparo (João) entra na Produção e não vira coluna.
    expect(within(secao).getByText("Produção")).toBeInTheDocument();
    expect(within(secao).getByText("Máquinas")).toBeInTheDocument();
    expect(within(secao).getByText("Logística")).toBeInTheDocument();
    expect(within(secao).queryByText("Preparo")).toBeNull();
    expect(within(secao).getByText("Ninguém nesta equipe.")).toBeInTheDocument();
  });
});
