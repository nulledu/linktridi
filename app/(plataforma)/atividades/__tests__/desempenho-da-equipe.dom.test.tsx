import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { ProdutividadeMetas } from "../ProdutividadeMetas";
import type { Atividade, Colaborador } from "@/lib/atividades-catalog";

/**
 * O pódio, os destaques e a qualidade na tela de desempenho.
 *
 * A regra que estes testes seguram é UMA: **nada é inventado**. A tela ganhou
 * blocos que APONTAM ("quem mais fez", "ponto de atenção", "Excelente") e
 * apontar sem dado é pior do que não apontar — um "0% · Péssimo" na linha de
 * quem nunca foi conferido é uma acusação escrita pelo layout.
 *
 * O caso do 403 não é hipótese: a qualidade vem de `/api/estoque/score/equipe`,
 * liberada pela ÁREA "colaboradores", enquanto a tela abre por PAPEL. Gerente
 * sem esse quadradinho vê a tabela inteira — e não pode ver zeros vermelhos.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const COLABS: Colaborador[] = [
  { id: "u1", nome: "Ana Ribeiro", setor: "Produção", departamento: "Produção" },
  { id: "u2", nome: "Carla Mendes", setor: "Design", departamento: "Design" },
];

const agora = Date.now();
const iso = (msAtras: number) => new Date(agora - msAtras).toISOString();

const atv = (id: string, para: string, nome: string, min: number): Atividade => ({
  id, categoria: "Almofadas", tarefa: `Montar ${id}`, detalhe: null,
  para_id: para, para_nome: nome, por_id: "chefe", por_nome: "Chefe",
  status: "concluida", prazo: null, quantidade_alvo: 1, quantidade_feita: 2,
  tempo_estimado_min: 30, iniciada_at: iso(min * 60000 + 60000), produto_id: null, produto_nome: null,
  estoque_lancado: false, created_at: iso(90 * 60000), concluida_at: iso(60000), foto_url: null,
});

const ATIVIDADES: Atividade[] = [
  atv("a1", "u1", "Ana Ribeiro", 20), atv("a2", "u1", "Ana Ribeiro", 22), atv("a3", "u1", "Ana Ribeiro", 21),
  atv("b1", "u2", "Carla Mendes", 40), atv("b2", "u2", "Carla Mendes", 44),
];

/** A rota da qualidade responde `corpo`; qualquer outra rota responde vazio. */
function fetchQualidade(status: number, corpo: unknown) {
  return vi.fn((url: string) => Promise.resolve({
    ok: status >= 200 && status < 300,
    status: String(url).includes("/score/equipe") ? status : 200,
    json: () => Promise.resolve(String(url).includes("/score/equipe") ? corpo : { atividades: [], devices: [], itens: [], modelos: [] }),
  } as Response));
}

const montar = () => render(
  <ProdutividadeMetas colaboradores={COLABS} atividades={ATIVIDADES} produtos={[]}
    metas={[]} erpUsers={[]} podeGerir={false} />,
);

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("Ranking do dia", () => {
  it("põe quem mais concluiu em primeiro", async () => {
    vi.stubGlobal("fetch", fetchQualidade(200, { porPessoa: {} }));
    montar();
    const ranking = (await screen.findByText("Ranking do dia")).closest("div")?.parentElement as HTMLElement;
    expect(within(ranking).getByText("1º")).toBeInTheDocument();
    // Ana fez 3, Carla fez 2 — o primeiro lugar é da Ana.
    const primeiro = within(ranking).getByText("1º").closest("button") as HTMLElement;
    expect(within(primeiro).getByText("Ana Ribeiro")).toBeInTheDocument();
  });
});

describe("Destaques", () => {
  it("sem conferência nenhuma, não existe 'ponto de atenção'", async () => {
    vi.stubGlobal("fetch", fetchQualidade(200, { porPessoa: {} }));
    montar();
    expect(await screen.findByText("Quem mais fez")).toBeInTheDocument();
    expect(screen.queryByText("Ponto de atenção")).not.toBeInTheDocument();
    expect(screen.queryByText("Fez mais certo")).not.toBeInTheDocument();
  });

  it("com retrabalho, o ponto de atenção é de quem tem mais", async () => {
    vi.stubGlobal("fetch", fetchQualidade(200, {
      porPessoa: {
        u1: { acerto: 0.98, total: 50, certos: 49, errados: 1 },
        u2: { acerto: 0.9, total: 40, certos: 36, errados: 4 },
      },
    }));
    montar();
    const cartao = (await screen.findByText("Ponto de atenção")).closest("button") as HTMLElement;
    expect(within(cartao).getByText("Carla Mendes")).toBeInTheDocument();
    expect(within(cartao).getByText("4")).toBeInTheDocument();
  });
});

describe("Qualidade na tabela", () => {
  it("sem acesso à qualidade, ninguém aparece com 0% de acerto", async () => {
    vi.stubGlobal("fetch", fetchQualidade(403, { error: "forbidden" }));
    montar();
    expect((await screen.findAllByText("Ana Ribeiro")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Péssimo")).not.toBeInTheDocument();
    // As três colunas de qualidade somem inteiras: repetir "sem conferências"
    // em cada linha faz a tabela parecer quebrada. A razão é dita UMA vez.
    expect(screen.queryByText("Acerto")).not.toBeInTheDocument();
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
    expect(screen.getByText(/Sem conferência de qualidade neste recorte/i)).toBeInTheDocument();
  });

  it("zero conferência não vira 'nada voltou pra refazer'", async () => {
    // Afirmação tirada da AUSÊNCIA de dado: com o QC desligado (ou sem a área
    // "colaboradores") a tela dizia que o dia tinha saído impecável.
    vi.stubGlobal("fetch", fetchQualidade(403, { error: "forbidden" }));
    montar();
    expect((await screen.findAllByText("Ana Ribeiro")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/nada voltou pra refazer/i)).not.toBeInTheDocument();
    const retrabalhos = screen.getByText("Retrabalhos").parentElement as HTMLElement;
    expect(within(retrabalhos).getByText("—")).toBeInTheDocument();
  });

  it("a linha abre a ficha pelo teclado, não só pelo clique", async () => {
    vi.stubGlobal("fetch", fetchQualidade(200, { porPessoa: {} }));
    montar();
    const linha = await screen.findByRole("button", { name: /Abrir a ficha de Ana Ribeiro$/ });
    expect(linha).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(linha, { key: "Enter" });
    // A ficha é um painel lateral; o subtítulo dele só existe quando abriu.
    expect(await screen.findByText(/3 concluída\(s\)/)).toBeInTheDocument();
  });

  it("com acesso, a linha mostra a taxa e o status da faixa", async () => {
    vi.stubGlobal("fetch", fetchQualidade(200, {
      porPessoa: { u1: { acerto: 0.98, total: 50, certos: 49, errados: 1 } },
    }));
    montar();
    // O pódio e a tabela mostram a mesma taxa — é o mesmo dado, dito duas vezes.
    expect((await screen.findAllByText("98%")).length).toBeGreaterThan(0);
    expect(screen.getByText("Excelente")).toBeInTheDocument();
  });
});
