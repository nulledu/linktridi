import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A conferência não pode reescrever a hora em que o OPERADOR terminou.
 *
 * `concluida_at` é o carimbo de quem produziu. Todo tempo do sistema sai de
 * `concluida_at - iniciada_at`: o "Levou 1h20" do card, a eficiência da tabela
 * de produtividade, o tempo médio da ficha, o agrupamento por dia do histórico
 * e a coluna "Concluída (hoje)" do quadro.
 *
 * A conferência acontece DEPOIS — às vezes no dia seguinte, às vezes na semana
 * seguinte. Quando ela carimbava `concluida_at` de novo, a espera do gestor
 * virava tempo de trabalho do operador: peça começada segunda 09:00, terminada
 * 10:00 e conferida quinta 14:00 passava a dizer "levou 77h · 4560min acima da
 * meta", a eficiência caía pra 1% e o trabalho de segunda reaparecia como
 * quinta em todo lugar. E não havia como reparar: nenhuma coluna guardava a
 * hora original.
 *
 * Quando a conferência aconteceu vive em `estoque_conferencias.conferido_em`,
 * que é o campo dela. Este teste existe porque a linha que quebra isso tem
 * quinze caracteres e entra num commit sobre outro assunto.
 */

const mockGerarUnidades = vi.fn(async () => [] as { id: string; codigo: string }[]);
vi.mock("@/lib/estoque-unidades-gerar", async () => {
  const real = await vi.importActual<typeof import("@/lib/estoque-unidades-gerar")>("@/lib/estoque-unidades-gerar");
  return { ...real, gerarUnidades: (...a: unknown[]) => mockGerarUnidades(...(a as [])) };
});

let db: ReturnType<typeof fakeDb>;
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => db }));

const { registrarConferencia } = await import("../estoque-conferencia");

// ── Banco falso ──────────────────────────────────────────────────────────────
// Registra cada operação com a tabela e o payload, e devolve as respostas na
// ordem em que `registrarConferencia` as pede.
interface Op { tabela: string; metodo: string; payload?: Record<string, unknown> }
type Resposta = { data?: unknown; error?: unknown };

function fakeDb(fila: Resposta[]) {
  const ops: Op[] = [];
  const from = (tabela: string) => {
    const builder: Record<string, unknown> = {};
    const passa = () => builder;
    for (const m of ["select", "eq", "ilike", "in", "limit", "order", "not", "gte"]) builder[m] = passa;
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
  ocorridoEm: "2026-08-13T17:00:00.000Z",   // quinta, 14:00 em São Paulo
};

// A atividade como ela chega à fila: JÁ concluída pelo operador na segunda.
const CONCLUIDA_NA_SEGUNDA = {
  para_id: "operador-1", para_nome: "Operador",
  produto_nome: "Almofada 6", quantidade_alvo: 3, quantidade_feita: 3,
  status: "concluida",
};

const ITEM_SIMPLES = {
  id: "item-1", nome: "Almofada 6", serializado: false,
  quantidade: 10, local_id: null, cor: null, largura_mm: null, altura_mm: null,
};

// Respostas na ordem em que registrarConferencia consulta o banco.
function filaPadrao(atividade: Record<string, unknown>): Resposta[] {
  return [
    { data: atividade },      // 1. lê a atividade
    { data: null },           // 2. já existe conferência? não
    // 3. resolve o item pelo nome — LISTA: a resolução pede várias linhas
    // pra poder detectar a duplicata de nome, em vez de sortear com limit(1).
    { data: [ITEM_SIMPLES] },
    { error: null },          // 4. insert em estoque_conferencias
    { error: null },          // 5. soma a quantidade no item (não serializado)
    { error: null },          // 6. fecha a atividade
  ];
}

const updateDaAtividade = (ops: Op[]) => ops.find((o) => o.tabela === "atividades" && o.metodo === "update");

beforeEach(() => { mockGerarUnidades.mockClear(); });

describe("conferência preserva a hora do operador", () => {
  it("não toca em concluida_at quando a atividade já estava concluída", async () => {
    db = fakeDb(filaPadrao(CONCLUIDA_NA_SEGUNDA));
    await registrarConferencia(ENTRADA);

    const update = updateDaAtividade(db.ops);
    expect(update, "a conferência tem que fechar a atividade").toBeTruthy();
    expect(
      Object.keys(update!.payload!),
      "a conferência reescreveu concluida_at: a espera do gestor vira tempo de " +
      "trabalho do operador em todos os cálculos de tempo e eficiência",
    ).not.toContain("concluida_at");
  });

  it("ainda carimba a conclusão quando a atividade NÃO estava concluída", async () => {
    // Caminho que a fila de hoje não produz (ela filtra status='concluida'),
    // mas que existiria numa conferência disparada de outro lugar: aí a
    // conferência É o momento em que o trabalho terminou.
    db = fakeDb(filaPadrao({ ...CONCLUIDA_NA_SEGUNDA, status: "em_andamento" }));
    await registrarConferencia(ENTRADA);

    expect(updateDaAtividade(db.ops)!.payload!.concluida_at).toBe(ENTRADA.ocorridoEm);
  });

  it("continua marcando estoque_lancado e a quantidade que a PESSOA registrou", async () => {
    // O resto do fechamento não pode ter sido perdido junto: sem
    // `estoque_lancado` a atividade volta pra fila e é conferida duas vezes.
    // A quantidade vem do banco (o que a pessoa registrou ao concluir), não do
    // gerente — ele só diz certo ou errado.
    db = fakeDb(filaPadrao(CONCLUIDA_NA_SEGUNDA));
    await registrarConferencia(ENTRADA);

    expect(updateDaAtividade(db.ops)!.payload).toMatchObject({
      status: "concluida", quantidade_feita: 3, estoque_lancado: true,
    });
  });
});
