import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { HistoricoProducaoClient } from "../historico/HistoricoProducaoClient";
import { tempoPorProduto, resumirTempos, type AtividadeMedida } from "@/lib/atividades-tempo";
import { resumirAberturas, type Aberturas } from "@/lib/atividades-aberturas";
import type { Rastro } from "@/lib/atividades-genealogia";

/**
 * A tela tem uma obrigação que nenhum teste de `lib/` consegue cobrir: DIZER a
 * verdade em voz alta. As contas podem estar perfeitas e a tela ainda mentir
 * por omissão — é o desfecho mais provável, porque um número limpo é mais
 * bonito que um número com ressalva.
 *
 * Três omissões que este arquivo impede:
 *
 *  1. **Descarte silencioso.** Metade das ordens fora da conta, e a tela
 *     mostrando só a mediana. Quem lê replaneja o dia em cima de uma amostra
 *     que não sabe que existe.
 *  2. **Árvore vazia no lugar de "não dá pra saber".** Sem o SQL do vínculo
 *     (§6), o rastro não tem como mostrar o material — e "nenhum material"
 *     é a leitura natural de uma lista vazia.
 *  3. **Sinal forte com amostra fraca.** Duas ordens não autorizam dizer
 *     "+140% do previsto".
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock("next/link", () => ({ default: ({ children, ...p }: { children: React.ReactNode }) => <a {...p}>{children}</a> }));

const base = Date.parse("2026-08-10T12:00:00Z");
const ordem = (o: Partial<AtividadeMedida> & { min: number }): AtividadeMedida => ({
  id: Math.random().toString(36).slice(2),
  tarefa: o.tarefa ?? "Montar alavancas",
  categoria: "Chancela",
  produto_nome: o.produto_nome ?? null,
  para_id: "p1", para_nome: "Fulano",
  iniciada_at: o.iniciada_at !== undefined ? o.iniciada_at : new Date(base).toISOString(),
  concluida_at: new Date(base + o.min * 60000).toISOString(),
  tempo_estimado_min: o.tempo_estimado_min ?? 30,
  quantidade_feita: o.quantidade_feita ?? 10,
});

function tempos(lista: AtividadeMedida[]) {
  const grupos = tempoPorProduto(lista);
  return { dias: 30, grupos, resumo: resumirTempos(grupos), truncado: false, escopo: "equipe" as const };
}

beforeEach(() => { vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response))); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Tempos — o descarte não pode ficar em silêncio", () => {
  it("diz quantas ordens ficaram de fora, e por quê", async () => {
    const dados = tempos([
      ...Array.from({ length: 6 }, () => ordem({ min: 30 })),
      ...Array.from({ length: 4 }, () => ordem({ min: 30, iniciada_at: null })),
    ]);
    render(<HistoricoProducaoClient inicial={dados} />);

    // O aviso aparece sem ninguém pedir — 4 de 10 é 40%.
    expect(screen.getByText(/4 ordens \(40%\) ficaram de fora/i)).toBeTruthy();
    // E o motivo está a um clique, com nome de gente.
    fireEvent.click(screen.getByRole("button", { name: /ver por quê/i }));
    expect(screen.getByText(/ninguém apertou/i)).toBeTruthy();
  });

  it("com 40% descartado a tela relativiza os próprios números", () => {
    const dados = tempos([
      ...Array.from({ length: 6 }, () => ordem({ min: 30 })),
      ...Array.from({ length: 4 }, () => ordem({ min: 30, iniciada_at: null })),
    ]);
    render(<HistoricoProducaoClient inicial={dados} />);
    expect(screen.getByText(/não a produção inteira/i)).toBeTruthy();
  });

  it("a ordem que dormiu a noite inteira não vira o número da tela", () => {
    const dados = tempos([
      ...Array.from({ length: 9 }, () => ordem({ min: 30, quantidade_feita: 10 })),
      ordem({ min: 14 * 60, quantidade_feita: 10 }),   // esquecida aberta
    ]);
    render(<HistoricoProducaoClient inicial={dados} />);
    // 30 min / 10 peças = 3 min por peça. Com a esquecida na média seriam ~11.
    expect(screen.getAllByText("3 min").length).toBeGreaterThan(0);
    expect(screen.queryByText(/^1[01] min$/)).toBeNull();
  });

  it("não anuncia lentidão com amostra de duas ordens", () => {
    const dados = tempos([ordem({ min: 60, tempo_estimado_min: 30 }), ordem({ min: 60, tempo_estimado_min: 30 })]);
    render(<HistoricoProducaoClient inicial={dados} />);
    expect(screen.getAllByText(/poucos dados/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\+100% do previsto/)).toBeNull();
  });

  it("um grupo que só tem lixo continua na tela, com zero ordens medidas", () => {
    // Sumir é o pior desfecho: quem procura "cadê a chancela" nunca descobre
    // que o problema é ninguém apertar "iniciar" no tablet.
    const dados = tempos([
      ordem({ min: 30, produto_nome: "Chancela", iniciada_at: null }),
      ordem({ min: 30, produto_nome: "Chancela", iniciada_at: null }),
    ]);
    render(<HistoricoProducaoClient inicial={dados} />);
    expect(screen.getByText("Chancela")).toBeTruthy();
    expect(screen.getByText(/sem medição/i)).toBeTruthy();
  });

  it("sem leitura nenhuma a tela não finge que a produção parou", () => {
    render(<HistoricoProducaoClient inicial={null} />);
    expect(screen.getByText(/sem leitura dos tempos/i)).toBeTruthy();
  });
});

/**
 * A saída de emergência ("Não deu pra bipar") era gravada e NÃO ERA LIDA por
 * nada no sistema. O livro existia, correto, e invisível — que na prática é o
 * mesmo que não existir: a bancada inteira podia migrar pra saída sem que
 * aparecesse em tela nenhuma.
 */
describe("Abertura das ordens — a saída de emergência precisa aparecer", () => {
  const comAberturas = (a: Partial<Aberturas>) => ({
    ...tempos([ordem({ min: 30 })]),
    aberturas: resumirAberturas([], { exigido: true, ...a }) as Aberturas,
  });

  it("diz quantas ordens abriram bipando e quantas pela saída", () => {
    const dados = {
      ...tempos([ordem({ min: 30 })]),
      aberturas: resumirAberturas([
        { atividade_id: "a1", situacao: "baixada", motivo: null },
        { atividade_id: "a2", situacao: "baixada", motivo: null },
        { atividade_id: "a3", situacao: "dispensado", motivo: "sem_etiqueta" },
      ], { exigido: true }),
    };
    render(<HistoricoProducaoClient inicial={dados} />);

    expect(screen.getByText(/2 de 3 ordens abriram bipando o material/i)).toBeTruthy();
    expect(screen.getByText(/1 \(33%\) começaram sem bipar/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /por que não bipou/i }));
    expect(screen.getByText("O material não tem etiqueta")).toBeTruthy();
  });

  it("com a maioria na saída, a tela manda mexer na configuração — não na pessoa", () => {
    const dados = {
      ...tempos([ordem({ min: 30 })]),
      aberturas: resumirAberturas([
        { atividade_id: "a1", situacao: "baixada", motivo: null },
        ...Array.from({ length: 9 }, (_, i) => ({ atividade_id: `d${i}`, situacao: "dispensado", motivo: "leitor_parado" })),
      ], { exigido: true }),
    };
    render(<HistoricoProducaoClient inicial={dados} />);
    expect(screen.getByText(/gente demais na saída de emergência/i)).toBeTruthy();
    expect(screen.getByText(/não quem apertou o botão/i)).toBeTruthy();
  });

  it("sem a tabela no banco, aponta o SQL em vez de mostrar zero e zero", () => {
    render(<HistoricoProducaoClient inicial={comAberturas({ semLivro: true })} />);
    expect(screen.getByText(/atividades_bipe_material\.sql/)).toBeTruthy();
    expect(screen.queryByText(/ordens abriram bipando/i)).toBeNull();
  });

  it("exigência ligada e nenhuma abertura registrada é sinal de fila parada, não de sucesso", () => {
    render(<HistoricoProducaoClient inicial={comAberturas({ exigido: true })} />);
    expect(screen.getByText(/nenhuma ordem registrou abertura neste período/i)).toBeTruthy();
  });

  it("exigência desligada e nada registrado não vira aviso nenhum", () => {
    // É o estado normal de hoje. Um bloco dizendo "0 dispensas" ali soaria
    // como elogio a uma regra que não está valendo.
    render(<HistoricoProducaoClient inicial={comAberturas({ exigido: false })} />);
    expect(screen.queryByText(/abriram bipando o material/i)).toBeNull();
    expect(screen.queryByText(/nenhuma ordem registrou abertura/i)).toBeNull();
  });

  it("quem vê só os próprios tempos não recebe o bloco recortado", () => {
    // `lerTempos` devolve `aberturas: null` no escopo "minhas": "3 dispensas"
    // sem saber que são só as suas seria pior que não mostrar.
    render(<HistoricoProducaoClient inicial={{ ...tempos([ordem({ min: 30 })]), aberturas: null }} />);
    expect(screen.queryByText(/abriram bipando o material/i)).toBeNull();
  });
});

describe("Rastro — falta de vínculo é aviso, não árvore vazia", () => {
  const RASTRO_SEM_VINCULO: Rastro = {
    direcao: "tras",
    raiz: {
      id: "u1", codigo: "BASE-000042", item: "Base da chancela", pecas: 4, status: "em_estoque",
      criadoPor: "Beltrano", criadoEm: "2026-08-10T16:40:00Z", baixadoPor: null, baixadoEm: null,
    },
    niveis: [{
      profundidade: 0,
      elos: [{
        atividade: { id: "a1", tarefa: "Montar base da chancela", categoria: "Chancela", quem: "Beltrano", quemId: "p1", produto: null, quando: "2026-08-10T16:40:00Z" },
        unidades: [],
      }],
    }],
    truncado: false,
    semVinculo: true,
    consultas: 6,
  };

  it("avisa qual SQL falta em vez de dizer que a peça não usou material", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve(RASTRO_SEM_VINCULO),
    } as Response)));

    render(<HistoricoProducaoClient inicial={null} />);
    fireEvent.click(screen.getByRole("tab", { name: /rastro/i }));
    fireEvent.change(screen.getByLabelText(/código da etiqueta/i), { target: { value: "BASE-000042" } });
    fireEvent.click(screen.getByRole("button", { name: /ver história/i }));

    await waitFor(() => expect(screen.getByText(/estoque_pendente_tudo\.sql/)).toBeTruthy());
    // Quem fez continua visível — meia corrente honesta vale mais que nenhuma.
    expect(screen.getByText("Montar base da chancela")).toBeTruthy();
    expect(screen.getByText(/falta o SQL/i)).toBeTruthy();
  });

  /**
   * "Onde foi parar" caminha SÓ por `baixa_atividade_id`. Sem o §6 a resposta é
   * sempre uma lista vazia — e a frase de fim de corrente afirmava, nessa exata
   * situação, que a caixa "está parada no estoque". É uma afirmação sobre o
   * mundo físico feita a partir de uma coluna que não existe, e ela contradizia
   * a própria tarja do §6 logo acima. A tarja não basta: quem lê acredita na
   * frase específica, não no aviso genérico.
   */
  it("sem o §6, 'onde foi parar' não afirma que a caixa está parada no estoque", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({
        ...RASTRO_SEM_VINCULO, direcao: "frente", niveis: [],
      } as Rastro),
    } as Response)));

    render(<HistoricoProducaoClient inicial={null} />);
    fireEvent.click(screen.getByRole("tab", { name: /rastro/i }));
    fireEvent.change(screen.getByLabelText(/código da etiqueta/i), { target: { value: "BASE-000042" } });
    fireEvent.click(screen.getByRole("button", { name: /onde foi parar/i }));
    fireEvent.click(screen.getByRole("button", { name: /ver história/i }));

    await waitFor(() => expect(screen.getByText(/não dá para saber onde esta caixa foi parar/i)).toBeTruthy());
    // A afirmação proibida é a do fim de corrente ("ainda não foi consumida por
    // atividade nenhuma"). A frase nova cita "parada no estoque" só pra NEGAR,
    // então é por este trecho que se pergunta.
    expect(
      screen.queryByText(/ainda não foi consumida por atividade nenhuma/i),
      "a afirmação que a tela não pode fazer sem a coluna",
    ).toBeNull();
  });

  it("com o §6 no banco, a corrente vazia pra frente volta a ser resposta", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({
        ...RASTRO_SEM_VINCULO, direcao: "frente", niveis: [], semVinculo: false,
      } as Rastro),
    } as Response)));

    render(<HistoricoProducaoClient inicial={null} />);
    fireEvent.click(screen.getByRole("tab", { name: /rastro/i }));
    fireEvent.change(screen.getByLabelText(/código da etiqueta/i), { target: { value: "BASE-000042" } });
    fireEvent.click(screen.getByRole("button", { name: /onde foi parar/i }));
    fireEvent.click(screen.getByRole("button", { name: /ver história/i }));

    await waitFor(() => expect(screen.getByText(/está parada no estoque/i)).toBeTruthy());
  });

  it("código inexistente diz que não existe, e não desenha corrente nenhuma", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ direcao: "tras", raiz: null, niveis: [], truncado: false, semVinculo: false, consultas: 1 }),
    } as Response)));

    render(<HistoricoProducaoClient inicial={null} />);
    fireEvent.click(screen.getByRole("tab", { name: /rastro/i }));
    fireEvent.change(screen.getByLabelText(/código da etiqueta/i), { target: { value: "NAO-EXISTE" } });
    fireEvent.click(screen.getByRole("button", { name: /ver história/i }));

    await waitFor(() => expect(screen.getByText(/Nenhuma etiqueta com o código/i)).toBeTruthy());
  });

  it("a direção troca sem perder o código já buscado", async () => {
    const chamadas: string[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      chamadas.push(String(url));
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(RASTRO_SEM_VINCULO) } as Response);
    }));

    render(<HistoricoProducaoClient inicial={null} />);
    fireEvent.click(screen.getByRole("tab", { name: /rastro/i }));
    fireEvent.change(screen.getByLabelText(/código da etiqueta/i), { target: { value: "BASE-000042" } });
    fireEvent.click(screen.getByRole("button", { name: /ver história/i }));
    await waitFor(() => expect(chamadas.length).toBe(1));

    fireEvent.click(screen.getByRole("button", { name: /onde foi parar/i }));
    await waitFor(() => expect(chamadas.length).toBe(2));
    expect(chamadas[1]).toContain("direcao=frente");
    expect(chamadas[1]).toContain("BASE-000042");
  });
});

describe("Previsto — a coluna não pode virar acusação", () => {
  it("avisa quando todo previsto é o mesmo padrão de 40 min", () => {
    // É o caso REAL: gerar produção em lote grava TEMPO_PADRAO_MIN em toda
    // ordem. "+140% do previsto" aí não diz que a bancada é lenta — diz que a
    // tarefa não leva 40 minutos, o que ninguém nunca afirmou.
    const dados = tempos([
      ...Array.from({ length: 5 }, () => ordem({ min: 90, produto_nome: "Chancela", tempo_estimado_min: 40 })),
      ...Array.from({ length: 5 }, () => ordem({ min: 90, produto_nome: "Carimbo", tempo_estimado_min: 40 })),
      ...Array.from({ length: 5 }, () => ordem({ min: 90, produto_nome: "Almofada", tempo_estimado_min: 40 })),
    ]);
    render(<HistoricoProducaoClient inicial={dados} />);
    expect(screen.getByText(/ninguém cadastrou\s+tempo por tarefa ainda/i)).toBeTruthy();
  });

  it("some sozinho quando as tarefas têm tempos diferentes", () => {
    const dados = tempos([
      ...Array.from({ length: 5 }, () => ordem({ min: 90, produto_nome: "Chancela", tempo_estimado_min: 40 })),
      ...Array.from({ length: 5 }, () => ordem({ min: 90, produto_nome: "Carimbo", tempo_estimado_min: 75 })),
      ...Array.from({ length: 5 }, () => ordem({ min: 90, produto_nome: "Almofada", tempo_estimado_min: 20 })),
    ]);
    render(<HistoricoProducaoClient inicial={dados} />);
    expect(screen.queryByText(/ninguém cadastrou/i)).toBeNull();
  });
});
