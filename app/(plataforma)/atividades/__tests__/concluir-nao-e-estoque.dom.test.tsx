import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { AtividadesClient } from "../AtividadesClient";
import { MinhasAtividadesClient } from "../../minhas-atividades/MinhasAtividadesClient";
import { ToastHost } from "../../Toast";
import type { Atividade, Colaborador } from "@/lib/atividades-catalog";

/**
 * Concluir FECHA a atividade — e não mexe no estoque.
 *
 * Em 11/09/2026 o dono tirou a conferência de atividade: "quando termina uma
 * atividade não adiciona nada no estoque, tudo é conferência e adição no
 * estoque" (lib/conferencia-de-atividade.ts). Não existe mais fila "A conferir"
 * nem espera: peça produzida entra pelo próprio Estoque, à mão.
 *
 * O passado continua legível: atividade conferida ANTES da mudança diz que as
 * peças entraram, e é isso que faz "reabrir" avisar.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const COLABS: Colaborador[] = [{ id: "u1", nome: "Ana Ribeiro", setor: "Produção", departamento: "Produção" }];

const base: Atividade = {
  id: "a1", categoria: "Almofadas", tarefa: "Montar estrutura da almofada 6",
  detalhe: null, para_id: "u1", para_nome: "Ana Ribeiro", por_id: "g1", por_nome: "Gestora",
  status: "concluida", prazo: null, quantidade_alvo: 3, quantidade_feita: 3,
  tempo_estimado_min: 40, iniciada_at: new Date(Date.now() - 3 * 3600e3).toISOString(),
  produto_id: null, produto_nome: "Almofada 6", estoque_lancado: false,
  created_at: new Date(Date.now() - 4 * 3600e3).toISOString(),
  concluida_at: new Date(Date.now() - 2 * 3600e3).toISOString(),
  foto_url: null, impedida: false, motivo_impedimento: null,
} as Atividade;

const concluida = base;
const conferidaAntes: Atividade = { ...base, id: "a2", tarefa: "Colar o EVA na base", estoque_lancado: true };

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
    ok: true, status: 200, json: () => Promise.resolve({ atividades: [], devices: [], itens: [], modelos: [], score: null }),
  } as Response)));
});
afterEach(() => vi.unstubAllGlobals());

// O filtro nasce em "Ativas" — concluída não é trabalho a fazer. Abrir a aba é
// o gesto de quem quer ver o que já saiu das mãos.
function abrirAba(nome: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: nome }));
}

describe("Minhas atividades — concluir fecha", () => {
  it("não existe mais filtro 'A conferir' nem 'esperando conferência'", () => {
    render(<MinhasAtividadesClient initial={[concluida]} />);
    expect(screen.queryByRole("button", { name: /A conferir/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/esperando conferência/)).not.toBeInTheDocument();
  });

  it("a concluída que produz peça é só 'Concluída' — e pode ser reaberta", () => {
    render(<MinhasAtividadesClient initial={[concluida]} />);
    abrirAba(/Concluídas/);
    expect(screen.getByText("Concluída")).toBeInTheDocument();
    expect(screen.queryByText(/Aguardando conferência/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reabrir/ })).toBeInTheDocument();
  });

  it("a conferida antes da mudança continua dizendo que as peças entraram", () => {
    render(<MinhasAtividadesClient initial={[conferidaAntes]} />);
    abrirAba(/Concluídas/);
    expect(screen.getByText("Conferida")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reabrir/ })).not.toBeInTheDocument();
    expect(screen.getByText(/fechada pela conferência/)).toBeInTheDocument();
  });
});

describe("Quadro do gestor — sem coluna de conferência", () => {
  it("não tem coluna 'A conferir': a concluída vai pra Concluída (hoje)", () => {
    render(<AtividadesClient colaboradores={COLABS} initial={[concluida]} roleLabel="admin" produtos={[]} />);
    expect(screen.queryByText("A conferir")).not.toBeInTheDocument();
    expect(screen.queryByText(/na caixa há/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Montar estrutura da almofada 6")).toHaveLength(1);
  });

  it("a conferida antes da mudança aparece marcada", () => {
    render(<AtividadesClient colaboradores={COLABS} initial={[conferidaAntes]} roleLabel="admin" produtos={[]} />);
    expect(screen.getByText("Conferida")).toBeInTheDocument();
  });

  it("a atividade da reposição automática se identifica sem roubar a instrução", () => {
    // `detalhe` é o texto que o operador LÊ e segue. A procedência é selo.
    const daAutomacao: Atividade = {
      ...base, id: "a4", status: "pendente", concluida_at: null,
      por_id: null as unknown as string, por_nome: "Sistema (requisição)",
      detalhe: "Colar as três travas nas laterais com cola bonder",
    };
    render(<AtividadesClient colaboradores={COLABS} initial={[daAutomacao]} roleLabel="admin" produtos={[]} />);
    expect(screen.getByText(/reposição/)).toBeInTheDocument();
    expect(screen.getByText("Colar as três travas nas laterais com cola bonder")).toBeInTheDocument();
  });
});

describe("Reabrir uma conferida avisa antes", () => {
  it("o botão Pendente pede confirmação quando as peças já entraram", async () => {
    const { container } = render(
      <>
        <AtividadesClient colaboradores={COLABS} initial={[conferidaAntes]} roleLabel="admin" produtos={[]} />
        <ToastHost />
      </>,
    );
    fireEvent.click(within(container).getByRole("button", { name: /^Pendente$/ }));
    // O diálogo do sistema (confirmar) monta em portal no body.
    expect(await screen.findByText(/foi conferida e as peças já entraram no estoque/)).toBeInTheDocument();
  });
});
