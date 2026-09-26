import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O nome do item não pode virar padrão de LIKE na hora de LANÇAR ESTOQUE.
 *
 * `confirmarRecebimento` resolve o item por nome quando a compra não trouxe
 * `estoque_item_id` (importação, tablet, compra antiga). Isso é o ponto em que
 * a quantidade ENTRA no estoque — errar aqui move peça de verdade.
 *
 * O código fazia `.ilike("nome", nome).limit(1).maybeSingle()`, o que errava de
 * duas maneiras:
 *
 *  1. `ilike` é LIKE: o nome não é comparado, é INTERPRETADO. "ADESIVO 100% PP"
 *     casa qualquer item que comece com "ADESIVO 100"; `_` casa um caractere
 *     qualquer, então "ROLO_KRAFT" casa "ROLO KRAFT" e "ROLO-KRAFT".
 *  2. Com DUAS linhas de mesmo nome (não há UNIQUE em `estoque_itens.nome`), o
 *     `.limit(1)` sorteava uma. A mesma compra abastecia um item hoje e o
 *     outro amanhã, sem nada na tela.
 *
 * A mesma armadilha já tinha sido fechada em três outros pontos do módulo
 * (lib/estoque-nome.ts); estes dois ficaram de fora e são justamente os que
 * escrevem estoque.
 */

type Resposta = { data?: unknown; error?: { message?: string; code?: string } | null };
const chamadas: { tabela: string; metodo: string; args: unknown[] }[] = [];
let fila: Resposta[] = [];

function fakeDb() {
  const from = (tabela: string) => {
    const builder: Record<string, unknown> = {};
    const encadeia = (nome: string) => (...args: unknown[]) => {
      chamadas.push({ tabela, metodo: nome, args });
      return builder;
    };
    for (const m of ["select", "insert", "update", "upsert", "eq", "in", "gt", "gte", "ilike", "order", "limit", "maybeSingle", "single"]) {
      builder[m] = encadeia(m);
    }
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      const resp = fila.shift() ?? { data: null, error: null };
      return Promise.resolve(resp).then(resolve, reject);
    };
    return builder;
  };
  return { from };
}

vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => fakeDb() }));
vi.mock("@/lib/notificacoes", () => ({ notificar: async () => {} }));
vi.mock("@/lib/estoque-unidades-gerar", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  gerarUnidadesEmLotes: async () => [{ id: "u1", codigo: "PRD-1-000001", seq: 1 }],
}));

const { confirmarRecebimento, criarCompra } = await import("../recebimento");

const COMPRA = {
  id: "c1", item_nome: "ADESIVO 100% PP", categoria: null, unidade: "un",
  estoque_item_id: null, hierarquia: null,
  quantidade_comprada: 10, quantidade_recebida: 0,
  fornecedor: null, fornecedor_id: null, local_id: null,
  preco_unit: null, preco_total: null, status: "aguardando_entrega",
  solicitante_id: null, criado_por_id: null,
};

/** O argumento que foi para o `.ilike()` da busca por nome. */
function padraoDoIlike(): string | undefined {
  return chamadas.find((c) => c.metodo === "ilike")?.args[1] as string | undefined;
}

beforeEach(() => { chamadas.length = 0; fila = []; });

describe("confirmarRecebimento — resolver o item pelo nome", () => {
  it("escapa % e _ antes de mandar pro banco", async () => {
    fila = [
      { data: COMPRA },
      { data: null },                                  // insert em recebimentos
      { data: [{ id: "i1", nome: "ADESIVO 100% PP" }] }, // busca por nome
      { data: { nome: "ADESIVO 100% PP", quantidade: 0, serializado: false } },
      { data: null },                                  // update da quantidade
      { data: { ...COMPRA, status: "recebido" } },
    ];

    await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 10, correto: true });

    expect(padraoDoIlike(), "sem escapar, o % casa item que não é o comprado")
      .toBe("ADESIVO 100\\% PP");
  });

  it("nome parecido que só casaria pelo coringa NÃO recebe a mercadoria", async () => {
    // O banco devolveu um vizinho (é o que o coringa arrastaria). O casamento
    // refeito em JS descarta, então o item não é encontrado e a compra cria um
    // item novo em vez de somar no errado.
    fila = [
      { data: COMPRA },
      { data: null },
      { data: [{ id: "i-outro", nome: "ADESIVO 1000 XYZ PP" }] },
      { data: { id: "i-novo", nome: "ADESIVO 100% PP", quantidade: 10 } }, // cria o item
      { data: { ...COMPRA, status: "recebido" } },
    ];

    const r = await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 10, correto: true });

    expect(r.estoque?.criado, "somar no vizinho é o defeito que este teste tranca").toBe(true);
    expect(r.estoque_falhou).toBeNull();
  });

  it("duas linhas com o mesmo nome PARAM a entrada em vez de sortear uma", async () => {
    fila = [
      { data: COMPRA },
      { data: null },
      { data: [{ id: "i1", nome: "ADESIVO 100% PP" }, { id: "i2", nome: "adesivo 100% pp" }] },
      { data: { ...COMPRA, status: "divergencia" } },
    ];

    const r = await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 10, correto: true });

    expect(r.status, "a compra volta pros pendentes em vez de fechar torta").toBe("divergencia");
    expect(r.estoque).toBeNull();
    expect(r.estoque_falhou, "a frase tem que dizer o que fazer").toContain("apague o repetido");
    expect(r.estoque_falhou).toContain("2 itens");
    // E nada foi escrito em estoque_itens: nem soma, nem item novo.
    expect(chamadas.some((c) => c.tabela === "estoque_itens" && (c.metodo === "insert" || c.metodo === "update")))
      .toBe(false);
  });
});

describe("criarCompra — vínculo com o catálogo", () => {
  it("nome duplicado deixa o vínculo NULO em vez de grudar no item errado", async () => {
    fila = [
      { data: [{ id: "i1", nome: "ADESIVO 100% PP" }, { id: "i2", nome: "ADESIVO 100% pp" }] },
      { data: { id: "c9" } }, // insert da compra
    ];

    await criarCompra({ item_nome: "ADESIVO 100% PP", quantidade_comprada: 5 });

    const insert = chamadas.find((c) => c.tabela === "compras" && c.metodo === "insert")
      ?.args[0] as Record<string, unknown>;
    expect(insert.estoque_item_id, "chutar aqui gruda o custo da compra no item errado").toBeNull();
  });

  it("nome único gruda o vínculo normalmente", async () => {
    fila = [
      { data: [{ id: "i1", nome: "ADESIVO 100% PP" }] },
      { data: { id: "c9" } },
    ];

    await criarCompra({ item_nome: "adesivo 100% pp", quantidade_comprada: 5 });

    const insert = chamadas.find((c) => c.tabela === "compras" && c.metodo === "insert")
      ?.args[0] as Record<string, unknown>;
    expect(insert.estoque_item_id, "a diferença é só de caixa — é o mesmo item").toBe("i1");
  });
});

describe("criarCompra — coluna que o banco ainda não tem", () => {
  it("avisa quando o fornecedor escolhido foi descartado na escrita", async () => {
    fila = [
      { data: [] },                                                   // busca por nome
      { data: null, error: { message: 'column "fornecedor_id" of relation "compras" does not exist' } },
      { data: { id: "c9" } },                                          // 2ª tentativa, sem a coluna
    ];

    const { compra, aviso } = await criarCompra({
      item_nome: "Chapa MDF", quantidade_comprada: 5, fornecedor_id: "f-1",
    });

    expect(compra.id, "a compra ENTRA — o aviso não é erro").toBe("c9");
    expect(aviso, "sem isto a escolha da pessoa sumia calada").toContain("fornecedor");
    expect(aviso).toContain("não registre de novo");
  });

  it("sem descarte, sem aviso", async () => {
    fila = [{ data: [] }, { data: { id: "c9" } }];
    const { aviso } = await criarCompra({ item_nome: "Chapa MDF", quantidade_comprada: 5, fornecedor_id: "f-1" });
    expect(aviso).toBeNull();
  });
});
