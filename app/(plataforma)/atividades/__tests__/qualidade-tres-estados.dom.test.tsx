import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PessoaProdutividadeDrawer } from "../PessoaProdutividadeDrawer";
import type { LinhaProdutividade } from "../ProdutividadeMetas";

/**
 * "Ainda sem conferências registradas" é uma afirmação sobre a PESSOA.
 *
 * O painel de qualidade tratava qualquer resposta não-ok como ausência de
 * dado — 403, 500 e queda de rede caíam todos na mesma frase. E o 403 não é
 * hipótese: /atividades é liberada por PAPEL, /api/estoque/score é liberada
 * por ÁREA ("colaboradores", restrita, ligada pessoa a pessoa). Um gerente sem
 * esse quadradinho abria a ficha de qualquer colaborador e lia que ninguém
 * nunca conferiu o trabalho dele, podendo haver quarenta conferências.
 *
 * Nenhum desses três fatos é o mesmo, e só um deles fala da pessoa.
 */

const LINHA: LinhaProdutividade = {
  id: "u1", nome: "Ana Ribeiro", setor: "Produção",
  concluidas: 4, abertas: 1, pecas: 12, mediaMin: 38, eficiencia: 1.1, meta: null,
};

function montar() {
  return render(
    <PessoaProdutividadeDrawer linha={LINHA} atividades={[]} metas={[]} periodo="7d" onFechar={() => {}} />,
  );
}

const respostaDe = (status: number, corpo: unknown) => vi.fn(() => Promise.resolve({
  ok: status >= 200 && status < 300, status, json: () => Promise.resolve(corpo),
} as Response));

afterEach(() => vi.unstubAllGlobals());

describe("Qualidade na ficha da pessoa", () => {
  it("sem permissão diz que é sobre o ACESSO, não sobre a pessoa", async () => {
    vi.stubGlobal("fetch", respostaDe(403, { error: "forbidden" }));
    montar();
    expect(await screen.findByText(/não tem acesso à qualidade desta pessoa/i)).toBeInTheDocument();
    expect(screen.queryByText(/sem conferências registradas/i)).not.toBeInTheDocument();
  });

  it("erro de rede não vira 'ninguém nunca conferiu'", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    montar();
    expect(await screen.findByText(/não deu pra carregar a qualidade agora/i)).toBeInTheDocument();
  });

  it("500 também não vira ausência de conferência", async () => {
    vi.stubGlobal("fetch", respostaDe(500, { error: "failed" }));
    montar();
    expect(await screen.findByText(/não deu pra carregar a qualidade agora/i)).toBeInTheDocument();
  });

  it("sem amostra de verdade fala do recorte que está na tela", async () => {
    // O `desde` do período vai na consulta, então o número É do recorte. Sem
    // dizer isso, "4,2 · 3 conferências" lia como o histórico inteiro.
    vi.stubGlobal("fetch", respostaDe(200, { score: { media: null, total: 0 } }));
    montar();
    expect(await screen.findByText(/sem conferências registradas nos 7 dias/i)).toBeInTheDocument();
  });

  it("com nota, o título diz de qual período está falando", async () => {
    vi.stubGlobal("fetch", respostaDe(200, {
      score: { media: 4.2, total: 3, aprovadas: 10, recusadas: 2, taxaAprovacao: 0.83, rotulo: "Bom", defeitosMaisComuns: [] },
    }));
    montar();
    expect(await screen.findByText("Qualidade nos 7 dias")).toBeInTheDocument();
    expect(screen.getByText("4,2")).toBeInTheDocument();
  });
});
