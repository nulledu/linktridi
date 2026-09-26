import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A MESMA caixa não pode entrar no estoque duas vezes.
 *
 * `registrarConferencia` protege contra a duplicata perguntando antes se já
 * existe APROVAÇÃO para aquela atividade (ErroAtividadeJaConferida). Essa
 * pergunta tinha dois furos, e os dois terminavam no mesmo lugar: estoque
 * contado em dobro, etiqueta repetida no item serializado, quantidade somada de
 * novo no que não é. Nada disso dá erro em lugar nenhum: as duas linhas são
 * válidas, o gestor vê "conferido" nas duas vezes, e a diferença só aparece
 * quando alguém for contar a prateleira.
 *
 *  1. O erro do SELECT era descartado. `data: null` significa tanto "não há
 *     conferência" quanto "a consulta falhou", e o código lia as duas como a
 *     primeira. Um timeout naquele SELECT liberava a duplicata.
 *
 *  2. Entre o SELECT e o INSERT cabe outra requisição. Dois gestores na mesma
 *     caixa, ou o reenvio da fila offline do tablet chegando junto com o toque
 *     na web, passavam os dois pela checagem antes de qualquer um gravar. Quem
 *     fecha essa janela é o índice único de `atividade_id`
 *     (supabase/estoque_conferencias.sql) — e o 23505 dele tem que virar o
 *     MESMO 409 de sempre, não um 500 com texto de constraint do Postgres.
 *
 * O índice (e a pergunta) é PARCIAL: `where resultado = 'certo'`. Reprovar a
 * mesma atividade várias vezes é o REFAZER, e travar isso travaria metade do
 * ciclo do galpão.
 */

const mockGerarUnidades = vi.fn(async () => [] as { id: string; codigo: string }[]);
vi.mock("@/lib/estoque-unidades-gerar", async () => {
  const real = await vi.importActual<typeof import("@/lib/estoque-unidades-gerar")>("@/lib/estoque-unidades-gerar");
  return { ...real, gerarUnidades: (...a: unknown[]) => mockGerarUnidades(...(a as [])) };
});

let db: ReturnType<typeof fakeDb>;
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => db }));

const { registrarConferencia, ErroAtividadeJaConferida, ErroSchemaDesatualizado } =
  await import("../estoque-conferencia");

interface Op { tabela: string; metodo: string; payload?: Record<string, unknown>; args?: unknown[] }
type Resposta = { data?: unknown; error?: unknown };

function fakeDb(fila: Resposta[]) {
  const ops: Op[] = [];
  const from = (tabela: string) => {
    const builder: Record<string, unknown> = {};
    const passa = () => builder;
    for (const m of ["select", "ilike", "in", "limit", "order", "not", "gte"]) builder[m] = passa;
    // `eq` guarda os argumentos: é por ele que se vê se a pergunta da
    // duplicata foi feita só pras APROVAÇÕES.
    builder.eq = (...args: unknown[]) => { ops.push({ tabela, metodo: "eq", args }); return builder; };
    for (const m of ["insert", "update", "upsert"]) {
      builder[m] = (payload: Record<string, unknown>) => { ops.push({ tabela, metodo: m, payload }); return builder; };
    }
    const resolver = () => Promise.resolve(fila.shift() ?? { data: null, error: null });
    builder.maybeSingle = resolver;
    builder.single = resolver;
    builder.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => resolver().then(ok, falha);
    return builder;
  };
  return { from, ops };
}

const ENTRADA = {
  atividadeId: "ativ-1",
  resultado: "certo",
  defeitos: [],
  obs: null,
  conferidoPorId: "gestor-1",
  conferidoPorNome: "Gestora",
  ocorridoEm: null,
};

const ATIVIDADE = {
  para_id: "operador-1", para_nome: "Operador",
  produto_nome: "Almofada 6", quantidade_alvo: 3, quantidade_feita: 3,
  status: "concluida",
};

const ITEM_SIMPLES = {
  id: "item-1", nome: "Almofada 6", serializado: false,
  quantidade: 10, local_id: null, cor: null, largura_mm: null, altura_mm: null,
};

/** Escreveu estoque? É isso que a duplicata custa caro. */
const mexeuNoEstoque = (ops: Op[]) =>
  ops.some((o) => o.tabela === "estoque_itens" && o.metodo === "update") || mockGerarUnidades.mock.calls.length > 0;

beforeEach(() => { mockGerarUnidades.mockClear(); });

describe("conferência não conta a mesma caixa duas vezes", () => {
  it("falha ao consultar a duplicata NÃO é lida como 'pode gravar'", async () => {
    db = fakeDb([
      { data: ATIVIDADE },                                   // lê a atividade
      { error: { code: "57014", message: "canceling statement due to statement timeout" } },
      { data: [ITEM_SIMPLES] },                                // (não deveria chegar aqui)
      { error: null }, { error: null }, { error: null },
    ]);

    await expect(registrarConferencia(ENTRADA)).rejects.toThrow();
    expect(
      mexeuNoEstoque(db.ops),
      "o SELECT de duplicata falhou e mesmo assim a conferência somou estoque: " +
      "é assim que a mesma caixa entra duas vezes",
    ).toBe(false);
  });

  it("sem a tabela, o erro é o schema — não uma conferência gravada pela metade", async () => {
    // Estado de HOJE: supabase/estoque_conferencias.sql ainda não rodou.
    db = fakeDb([
      { data: ATIVIDADE },
      { error: { code: "42P01", message: 'relation "estoque_conferencias" does not exist' } },
      { data: [ITEM_SIMPLES] }, { error: null }, { error: null }, { error: null },
    ]);

    await expect(registrarConferencia(ENTRADA)).rejects.toBeInstanceOf(ErroSchemaDesatualizado);
    expect(mexeuNoEstoque(db.ops)).toBe(false);
  });

  it("a corrida barrada pelo índice único vira 409, não 500", async () => {
    // Os dois passaram pela checagem antes de qualquer um gravar; o segundo
    // INSERT bate no índice único de atividade_id.
    db = fakeDb([
      { data: ATIVIDADE },
      { data: null },                                        // nenhuma conferência ainda
      { data: [ITEM_SIMPLES] },
      { error: { code: "23505", message: 'duplicate key value violates unique constraint "estoque_conferencias_atividade_uidx"' } },
      { error: null }, { error: null },
    ]);

    await expect(registrarConferencia(ENTRADA)).rejects.toBeInstanceOf(ErroAtividadeJaConferida);
    expect(
      mexeuNoEstoque(db.ops),
      "a conferência perdeu a corrida e ainda assim somou estoque",
    ).toBe(false);
  });

  it("o caminho limpo continua gravando e somando uma vez", async () => {
    // Sem isto os testes acima passariam com uma função que nunca faz nada.
    db = fakeDb([
      { data: ATIVIDADE }, { data: null }, { data: [ITEM_SIMPLES] },
      { error: null }, { error: null }, { error: null },
    ]);

    await registrarConferencia(ENTRADA);
    expect(db.ops.filter((o) => o.tabela === "estoque_conferencias" && o.metodo === "insert")).toHaveLength(1);
    expect(mexeuNoEstoque(db.ops)).toBe(true);
  });

  it("uma atividade JÁ REPROVADA pode ser conferida de novo — é o refazer", async () => {
    // A pergunta da duplicata olha só as APROVAÇÕES. Se ela contasse qualquer
    // conferência, a caixa que voltou pra bancada nunca mais poderia ser
    // aprovada: a pessoa refaz, o gestor confere e leva "já foi conferida".
    db = fakeDb([
      { data: ATIVIDADE },
      { data: null },              // nenhuma APROVAÇÃO (a reprovação anterior não conta)
      { data: [ITEM_SIMPLES] },
      { error: null }, { error: null }, { error: null },
    ]);

    const r = await registrarConferencia(ENTRADA);
    expect(r.resultado).toBe("certo");
    expect(mexeuNoEstoque(db.ops)).toBe(true);

    // E a pergunta tem que ser feita com o filtro certo, senão o "já reprovada"
    // volta a bloquear.
    const filtros = db.ops.filter((o) => o.tabela === "estoque_conferencias" && o.metodo === "eq").map((o) => o.args);
    expect(filtros).toContainEqual(["resultado", "certo"]);
  });
});
