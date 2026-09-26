import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { AtividadesClient } from "../AtividadesClient";
import type { Atividade, Colaborador } from "@/lib/atividades-catalog";

/**
 * O material entra pela ATIVIDADE — é o começo do ciclo do galpão.
 *
 * "pega a caixa lacrada de folhas de alavanca limpa, BIPA ELA, nesse momento é
 * removido do estoque, e a pessoa rompe o lacre e monta."
 *
 * Antes, bipar era uma aba solta do Estoque: a baixa saía sem dono e ninguém
 * que olhasse a atividade sabia o que tinha entrado nela. Sem esse vínculo o
 * gerente confere sem saber com que material a peça foi feita, e a perda de uma
 * reprovação não tem de onde sair.
 *
 * O que este arquivo trava:
 *  1. o card DIZ o que já saiu do estoque por conta da atividade (em peças, não
 *     em etiquetas: 2 caixas de 50 são 100 folhas);
 *  2. existe uma porta pra bipar de dentro da atividade, e ela abre já amarrada;
 *  3. o quadro NÃO quebra quando o vínculo ainda não existe no banco.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

// Câmera não existe no jsdom; o que interessa é o que a tela faz com o código.
vi.mock("../../ui/LeitorCodigo", () => ({ LeitorCodigo: () => <div data-testid="leitor-falso" /> }));

const COLABS: Colaborador[] = [{ id: "u1", nome: "Ana Ribeiro", setor: "Produção", departamento: "Produção" }];

const ATIV: Atividade = {
  id: "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b", categoria: "Chancela", tarefa: "Montar alavanca",
  detalhe: null, para_id: "u1", para_nome: "Ana Ribeiro", por_id: "g1", por_nome: "Gestora",
  status: "em_andamento", prazo: null, quantidade_alvo: 20, quantidade_feita: 0,
  tempo_estimado_min: 40, iniciada_at: new Date(Date.now() - 3600e3).toISOString(),
  produto_id: null, produto_nome: "Alavanca", estoque_lancado: false,
  created_at: new Date(Date.now() - 2 * 3600e3).toISOString(),
  concluida_at: null, foto_url: null, impedida: false, motivo_impedimento: null,
} as Atividade;

/** Servidor de mentira. `consumo` = o que o vínculo devolve pra esta atividade. */
function rede(consumo: { etiquetas: number; pecas: number } | null, semVinculo = false) {
  return vi.fn((url: string) => {
    const u = String(url);
    const ok = (corpo: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corpo) } as Response);
    if (u.includes("atividades=")) {
      return ok(semVinculo ? { porAtividade: {}, semVinculo: true } : { porAtividade: consumo ? { [ATIV.id]: consumo } : {}, semVinculo: false });
    }
    if (u.includes("unidades?atividade=")) {
      return ok(semVinculo
        ? { lista: [], etiquetas: 0, pecas: 0, semVinculo: true }
        : {
          lista: [{ codigo: "FOLHA-000007", item: "Folha de alavanca limpa", pecas: 50, motivo: "consumido", baixadoPor: "Ana Ribeiro", baixadoEm: new Date().toISOString() }],
          ...(consumo ?? { etiquetas: 0, pecas: 0 }), semVinculo: false,
        });
    }
    return ok({ atividades: [], devices: [], itens: [], modelos: [] });
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("Material da atividade", () => {
  it("o card diz quantas PEÇAS já saíram, não quantas etiquetas", async () => {
    // 2 caixas de 50 são 100 folhas. Dizer "2" faria a conta parecer 50× menor.
    vi.stubGlobal("fetch", rede({ etiquetas: 2, pecas: 100 }));
    render(<AtividadesClient colaboradores={COLABS} initial={[ATIV]} roleLabel="admin" />);
    expect(await screen.findByText(/Material: 2 etiquetas · 100 peças/)).toBeInTheDocument();
  });

  it("atividade sem material bipado não ganha selo nenhum", async () => {
    vi.stubGlobal("fetch", rede(null));
    render(<AtividadesClient colaboradores={COLABS} initial={[ATIV]} roleLabel="admin" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText(/Material:/)).not.toBeInTheDocument();
  });

  it("o botão Material abre a bipagem já amarrada à atividade", async () => {
    vi.stubGlobal("fetch", rede({ etiquetas: 1, pecas: 50 }));
    render(<AtividadesClient colaboradores={COLABS} initial={[ATIV]} roleLabel="admin" />);

    fireEvent.click(screen.getByRole("button", { name: /Material/ }));
    const painel = await screen.findByRole("dialog");

    // A atividade é a razão de estar bipando: nada de escolher de novo.
    expect(within(painel).getByText(/Montar alavanca · Ana Ribeiro/)).toBeInTheDocument();
    expect(within(painel).queryByRole("button", { name: /Vincular a uma atividade/ })).not.toBeInTheDocument();
    // E o que já saiu aparece com o tamanho da caixa.
    expect(within(painel).getByText("FOLHA-000007")).toBeInTheDocument();
    expect(within(painel).getByText(/Caixa · 50 un/)).toBeInTheDocument();
  });

  it("banco sem o vínculo ainda: avisa em vez de jurar que nada foi consumido", async () => {
    // `semVinculo` não é "consumiu zero" — é "não dá pra saber". A baixa até
    // funciona; o que não é gravado é de qual atividade ela veio.
    vi.stubGlobal("fetch", rede(null, true));
    render(<AtividadesClient colaboradores={COLABS} initial={[ATIV]} roleLabel="admin" />);
    fireEvent.click(screen.getByRole("button", { name: /Material/ }));
    const painel = await screen.findByRole("dialog");
    expect(within(painel).getByText(/estoque_pendente_tudo\.sql/)).toBeInTheDocument();
  });
});
