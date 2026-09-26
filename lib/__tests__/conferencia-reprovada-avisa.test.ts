import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * REPROVAR ERA MUDO.
 *
 * O errado devolve a atividade pra `em_andamento` e zera `concluida_at` — e
 * pronto. Em /minhas-atividades ela reaparece como uma tarefa comum: sem selo
 * de recusa, sem os defeitos marcados, sem a observação que o gestor digitou. A
 * pessoa ia embora achando que tinha fechado e voltava no dia seguinte com uma
 * tarefa "em andamento" que jurava ter concluído, sem saber o que corrigir. Os
 * defeitos e a `obs` eram write-only justamente pra quem mais precisava deles.
 *
 * Nenhum arquivo de lib/estoque-* ou app/api/estoque/ importava
 * lib/notificacoes.ts — ao contrário da reposição automática, que avisa quem
 * recebe trabalho novo (lib/requisicoes.ts).
 */

type Aviso = Record<string, unknown>;
const mockNotificar = vi.fn(async (_aviso: Aviso) => {});
vi.mock("@/lib/notificacoes", () => ({ notificar: (n: unknown) => mockNotificar(n as Aviso) }));
/** O aviso da n-ésima chamada, já tipado — `mock.calls[0][0]` sai `never` sem isto. */
const avisoDe = (i = 0): Aviso => mockNotificar.mock.calls[i][0];

const mockGerarUnidades = vi.fn(async () => [{ id: "u-1", codigo: "PC-0007-000001", seq: 1, pecas: 50 }]);
vi.mock("@/lib/estoque-unidades-gerar", async () => {
  const real = await vi.importActual<typeof import("@/lib/estoque-unidades-gerar")>("@/lib/estoque-unidades-gerar");
  return { ...real, gerarUnidades: () => mockGerarUnidades() };
});

let db: ReturnType<typeof fakeDb>;
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => db }));

const { registrarConferencia, ErroNomeAmbiguo } = await import("../estoque-conferencia");

type Resposta = { data?: unknown; error?: unknown };
interface Op { tabela: string; metodo: string; payload?: Record<string, unknown> }

function fakeDb(fila: Resposta[]) {
  const ops: Op[] = [];
  const from = (tabela: string) => {
    const builder: Record<string, unknown> = {};
    const passa = () => builder;
    for (const m of ["select", "eq", "ilike", "in", "limit", "order", "not", "gte"]) builder[m] = passa;
    for (const m of ["insert", "update", "upsert"]) {
      builder[m] = (payload: Record<string, unknown>) => { ops.push({ tabela, metodo: m, payload }); return builder; };
    }
    builder.delete = () => { ops.push({ tabela, metodo: "delete" }); return builder; };
    const resolver = () => Promise.resolve(fila.shift() ?? { data: null, error: null });
    builder.maybeSingle = resolver;
    builder.single = resolver;
    builder.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => resolver().then(ok, falha);
    return builder;
  };
  return { from, ops };
}

const BASE = {
  atividadeId: "ativ-1",
  defeitos: [] as string[],
  obs: null as string | null,
  conferidoPorId: "gestor-1",
  conferidoPorNome: "Gestora",
  ocorridoEm: "2026-08-12T18:00:00.000Z",
};

const ATIVIDADE = {
  para_id: "operador-1", para_nome: "Operador",
  produto_nome: "Alavanca montada", quantidade_alvo: 60, quantidade_feita: 50,
  status: "concluida",
};

const ITEM = {
  id: "item-1", nome: "Alavanca montada", serializado: true,
  quantidade: 0, local_id: null, cor: null, largura_mm: null, altura_mm: null,
};

/** Respostas na ordem em que registrarConferencia consulta o banco. O item vem
 *  como LISTA agora — a resolução por nome pede várias linhas pra poder
 *  detectar a duplicata em vez de sortear com `.limit(1)`. */
function fila(itens: unknown[]): Resposta[] {
  return [
    { data: ATIVIDADE },        // 1. lê a atividade
    { data: null },             // 2. já existe APROVAÇÃO? não
    { data: itens },            // 3. resolve o item pelo nome
    { data: { id: "conf-1" } }, // 4. insert em estoque_conferencias
    { error: null },            // 5. estoque
    { error: null },            // 6. fecha/reabre a atividade
    { error: null },
  ];
}

beforeEach(() => { mockNotificar.mockClear(); mockGerarUnidades.mockClear(); });

describe("reprovar avisa quem produziu", () => {
  it("manda a notificação pra quem FEZ, com link pra onde ela vai refazer", async () => {
    db = fakeDb(fila([ITEM]));
    await registrarConferencia({ ...BASE, resultado: "errado", defeitos: ["avaria"] });

    expect(mockNotificar).toHaveBeenCalledTimes(1);
    const aviso = avisoDe();
    expect(aviso.user_id, "avisou o gestor em vez de quem produziu").toBe("operador-1");
    expect(aviso.link).toBe("/minhas-atividades");
    expect(String(aviso.titulo)).toContain("Alavanca montada");
    expect(aviso.de_nome).toBe("Gestora");
  });

  it("o corpo leva os DEFEITOS e a observação — é o que a pessoa precisa pra corrigir", async () => {
    db = fakeDb(fila([ITEM]));
    await registrarConferencia({
      ...BASE, resultado: "errado",
      defeitos: ["medida_errada", "acabamento_ruim"],
      obs: "a borda ficou lascada no canto",
    });

    const corpo = String(avisoDe().corpo);
    expect(corpo).toContain("Medida errada");
    expect(corpo).toContain("Acabamento ruim");
    expect(corpo).toContain("a borda ficou lascada no canto");
  });

  it("aprovar NÃO notifica — não há nada pra refazer", async () => {
    db = fakeDb(fila([ITEM]));
    await registrarConferencia({ ...BASE, resultado: "certo" });
    expect(mockNotificar).not.toHaveBeenCalled();
  });

  it("avisa DEPOIS de a atividade voltar: se o update falha, ninguém é mandado pra tela vazia", async () => {
    db = fakeDb([
      { data: ATIVIDADE },
      { data: null },
      { data: [ITEM] },
      { data: { id: "conf-1" } },
      { error: { message: "falhou ao reabrir a atividade" } },
    ]);
    await expect(registrarConferencia({ ...BASE, resultado: "errado", defeitos: ["avaria"] }))
      .rejects.toThrow(/reabrir/);
    expect(mockNotificar).not.toHaveBeenCalled();
  });
});

describe("item resolvido por nome não é sorteado", () => {
  it("nome com % não vira coringa: o vizinho que o LIKE trouxe é descartado", async () => {
    // "ADESIVO 100% PP" como padrão de LIKE casa "ADESIVO 100" + qualquer coisa.
    const atividade = { ...ATIVIDADE, produto_nome: "ADESIVO 100% PP" };
    db = fakeDb([
      { data: atividade },
      { data: null },
      { data: [{ ...ITEM, id: "errado", nome: "ADESIVO 100 GRAMAS" }, { ...ITEM, id: "certo", nome: "ADESIVO 100% PP" }] },
      { data: { id: "conf-1" } },
      { error: null },
      { error: null },
      { error: null },
    ]);
    await registrarConferencia({ ...BASE, resultado: "certo" });
    const insert = db.ops.find((o) => o.tabela === "estoque_conferencias" && o.metodo === "insert")!;
    expect(insert.payload!.item_id).toBe("certo");
  });

  it("DOIS itens com o mesmo nome: recusa a aprovação em vez de escolher um", async () => {
    db = fakeDb(fila([{ ...ITEM, id: "a", nome: "Alavanca montada" }, { ...ITEM, id: "b", nome: "ALAVANCA MONTADA" }]));
    await expect(registrarConferencia({ ...BASE, resultado: "certo" })).rejects.toBeInstanceOf(ErroNomeAmbiguo);
    expect(db.ops.find((o) => o.tabela === "estoque_conferencias"), "gravou antes de recusar").toBeUndefined();
  });

  it("mas REPROVAR com nome duplicado continua valendo — a caixa errada não fica presa na fila", async () => {
    db = fakeDb(fila([{ ...ITEM, id: "a", nome: "Alavanca montada" }, { ...ITEM, id: "b", nome: "ALAVANCA MONTADA" }]));
    const r = await registrarConferencia({ ...BASE, resultado: "errado", defeitos: ["avaria"] });
    expect(r.reaberta).toBe(true);
    const insert = db.ops.find((o) => o.tabela === "estoque_conferencias" && o.metodo === "insert")!;
    expect(insert.payload!.item_id).toBeNull();
    expect(mockNotificar).toHaveBeenCalledTimes(1);
  });
});
