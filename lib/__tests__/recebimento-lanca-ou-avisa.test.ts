import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Recebimento: ou lança no estoque, ou AVISA que não lançou.
 *
 * Dois defeitos moravam na mesma dúzia de linhas de `confirmarRecebimento`:
 *
 * 1. O item criado a partir da compra nascia com `tipo: "insumo"` — um dos três
 *    eixos que a fundação nova aposentou, e cujo CHECK no banco só aceita
 *    componente/peca/produto. O INSERT voltava 23514 e o item NUNCA existia.
 *    Sem `hierarquia` ele também não apareceria em nenhuma das 8 abas do
 *    Catálogo nem conseguiria gerar SKU.
 *
 * 2. Todo o passo do estoque vivia dentro de um `catch {}` vazio, e o passo
 *    seguinte marcava a compra como `recebido` de qualquer jeito. Ou seja: o
 *    painel escrevia "Recebido e lançado", a compra saía dos pendentes e o
 *    estoque não tinha mexido. Ninguém reconferia, porque a compra já estava
 *    fechada.
 *
 * Os dois voltam com uma linha só, num commit sobre outro assunto — por isso a
 * trava é um teste.
 */

// ── Banco falso ──────────────────────────────────────────────────────────────
// Fila de respostas na ordem em que `confirmarRecebimento` consulta. Cada
// `await` consome UMA resposta e deixa na trilha a cadeia inteira (com os
// argumentos), que é o que os testes inspecionam.
type Resposta = { data?: unknown; error?: { message?: string; code?: string } | null; count?: number };

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
const mockGerar = vi.fn(async () => [{ id: "u1", codigo: "PRD-1-000001", seq: 1 }]);
vi.mock("@/lib/estoque-unidades-gerar", () => ({
  gerarUnidadesEmLotes: (...a: unknown[]) => mockGerar(...(a as [])),
}));

const { confirmarRecebimento } = await import("../recebimento");

const COMPRA = {
  id: "c1", item_nome: "Almofada N.3", categoria: "Almofadas", unidade: "un",
  estoque_item_id: null, hierarquia: null,
  quantidade_comprada: 10, quantidade_recebida: 0,
  fornecedor: null, fornecedor_id: null, local_id: null,
  preco_unit: 7.5, preco_total: 75, status: "aguardando_entrega",
  solicitante_id: null, criado_por_id: null,
};

/** O payload do `insert`/`update` que saiu para uma tabela. */
function payload(tabela: string, metodo: "insert" | "update"): Record<string, unknown> | undefined {
  return chamadas.find((c) => c.tabela === tabela && c.metodo === metodo)?.args[0] as Record<string, unknown> | undefined;
}

beforeEach(() => { chamadas.length = 0; fila = []; mockGerar.mockClear(); });

describe("item criado pela compra", () => {
  it("nasce com hierarquia — e sem o eixo morto `tipo`", async () => {
    fila = [
      { data: COMPRA },                       // busca a compra
      { data: null },                          // insert em recebimentos
      { data: null },                          // procura o item pelo nome — não achou
      { data: { id: "i9", nome: "Almofada N.3", quantidade: 4 } }, // cria o item
      { data: { ...COMPRA, status: "recebido", quantidade_recebida: 4 } }, // update da compra
    ];

    const r = await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 4, correto: true });

    const item = payload("estoque_itens", "insert")!;
    expect(item.hierarquia, "item sem hierarquia não aparece em nenhuma das 8 abas do Catálogo").toBe("insumo_indireto");
    expect(item, "`tipo` é eixo morto e o CHECK do banco recusa 'insumo'").not.toHaveProperty("tipo");
    expect(r.estoque?.criado).toBe(true);
    expect(r.estoque_falhou).toBeNull();
  });

  it("herda a hierarquia escolhida na compra quando ela existe", async () => {
    fila = [
      { data: { ...COMPRA, hierarquia: "materia_prima" } },
      { data: null }, { data: null },
      { data: { id: "i9", nome: "MDF 6mm", quantidade: 4 } },
      { data: { ...COMPRA, status: "recebido" } },
    ];
    await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 4, correto: true });
    expect(payload("estoque_itens", "insert")!.hierarquia).toBe("materia_prima");
  });
});

describe("estoque que não sobe", () => {
  it("não deixa a compra virar 'Recebido e lançado'", async () => {
    fila = [
      { data: COMPRA },
      { data: null },
      { data: null },
      // O banco recusa a criação do item (é exatamente o 23514 do CHECK).
      { data: null, error: { code: "23514", message: 'new row violates check constraint "estoque_itens_tipo_chk"' } },
      { data: { ...COMPRA, status: "divergencia" } },
    ];

    const r = await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 10, correto: true });

    expect(r.status, "chegada que não entrou no estoque não pode fechar a compra").toBe("divergencia");
    expect(r.estoque_falhou).toContain("check constraint");
    const up = payload("compras", "update")!;
    expect(up.status).toBe("divergencia");
    expect(up.estoque_erro).toContain("check constraint");
  });

  it("erro do UPDATE que somava a quantidade não passa mais batido", async () => {
    fila = [
      { data: { ...COMPRA, estoque_item_id: "i1" } },
      { data: null },
      { data: { nome: "Almofada N.3", quantidade: 2, serializado: false } },
      // A guarda do banco recusa a escrita — antes o erro era ignorado e a
      // compra fechava como "Recebido e lançado".
      { data: null, error: { message: "estoque_itens_guarda: quantidade nao bate com a contagem" } },
      { data: { ...COMPRA, status: "divergencia" } },
    ];

    const r = await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 10, correto: true });

    expect(r.status).toBe("divergencia");
    expect(r.estoque_falhou).toContain("guarda");
  });

  it("item apagado entre a compra e a chegada vira aviso, não soma fantasma", async () => {
    fila = [
      { data: { ...COMPRA, estoque_item_id: "i1" } },
      { data: null },
      { data: null },                     // o item não existe mais
      { data: { ...COMPRA, status: "divergencia" } },
    ];

    const r = await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 10, correto: true });

    expect(r.estoque_falhou).toContain("não existe mais no catálogo");
    expect(r.status).toBe("divergencia");
  });

  it("falha ao gerar etiqueta de item serializado também avisa", async () => {
    mockGerar.mockRejectedValueOnce(new Error("schema_desatualizado"));
    fila = [
      { data: { ...COMPRA, estoque_item_id: "i1" } },
      { data: null },
      { data: { nome: "Chapa", quantidade: 0, serializado: true } }, // item serializado
      { data: { ...COMPRA, status: "divergencia" } },
    ];

    const r = await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 10, correto: true });

    expect(r.status).toBe("divergencia");
    expect(r.estoque_falhou, "o motivo tem que chegar em português na tela").toContain("estoque_hierarquia_unidades.sql");
    expect(r.estoque).toBeNull();
  });

  // O mesmo defeito do `catch {}` vazio, por outra porta: SEM erro nenhum.
  // `gerarUnidadesEmLotes` devolve `[]` quando nada virou etiqueta, o código
  // relia a quantidade do item (que não tinha mudado), montava `estoque`, e a
  // tela escrevia "Recebido e lançado" com ZERO etiqueta no galpão — e a compra
  // saía dos pendentes, que é o que impede alguém de reconferir.
  it("lista de etiquetas VAZIA não é sucesso", async () => {
    mockGerar.mockResolvedValueOnce([]);
    fila = [
      { data: { ...COMPRA, estoque_item_id: "i1" } },
      { data: null },
      { data: { nome: "Chapa", quantidade: 0, serializado: true } },
      { data: { ...COMPRA, status: "divergencia" } },
    ];

    const r = await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 10, correto: true });

    expect(r.status).toBe("divergencia");
    expect(r.estoque_falhou).toContain("nenhuma etiqueta");
    expect(r.estoque, "não pode montar o resumo de estoque de um lançamento que não aconteceu").toBeNull();
  });

  it("quantidade que não fecha em etiqueta inteira vira aviso em português", async () => {
    mockGerar.mockRejectedValueOnce(new Error("quantidade_fracionaria"));
    fila = [
      { data: { ...COMPRA, estoque_item_id: "i1" } },
      { data: null },
      { data: { nome: "Cola", quantidade: 0, serializado: true } },
      { data: { ...COMPRA, status: "divergencia" } },
    ];

    const r = await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 2.5, correto: true });

    // 2,5 de 10 compradas: a compra fica parcial de qualquer jeito — o que
    // este teste guarda é a FRASE, que é a única coisa que diz o que fazer.
    expect(r.status).not.toBe("recebido");
    expect(r.estoque_falhou).toContain("unidade de compra");
    expect(r.estoque_falhou, "nome de erro não é frase").not.toContain("quantidade_fracionaria");
  });
});

describe("recebimento que dá certo", () => {
  it("fecha a compra, soma no item e limpa o aviso de erro", async () => {
    fila = [
      { data: { ...COMPRA, estoque_item_id: "i1" } },
      { data: null },
      { data: { nome: "Almofada N.3", quantidade: 2, serializado: false } },
      { data: null },                       // update da quantidade do item
      { data: null },                       // update do custo
      { data: { ...COMPRA, status: "recebido" } },
    ];

    const r = await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 10, correto: true });

    expect(r.status).toBe("recebido");
    expect(r.estoque).toEqual({ nome: "Almofada N.3", quantidade: 12, criado: false });
    expect(r.estoque_falhou).toBeNull();
    const up = payload("compras", "update")!;
    expect(up.estoque_erro, "compra que deu certo não pode ficar com aviso velho").toBeNull();
    expect(up.estoque_item_id).toBe("i1");
  });

  it("grava o custo da compra no item mesmo quando o vínculo só apareceu agora", async () => {
    fila = [
      { data: COMPRA },                     // sem estoque_item_id
      { data: null },
      // Achado pelo nome. A busca virou LISTA (`.limit(TETO_NOMES)`) e o
      // casamento é refeito em JS por `umItemPeloNome` — por isso vem `nome`
      // junto, e por isso é array: com `.limit(1)` a duplicata era sorteada.
      { data: [{ id: "i7", nome: "Almofada N.3" }] },
      { data: { nome: "Almofada N.3", quantidade: 1, serializado: false } },
      { data: null },                       // update da quantidade
      { data: null },                       // update do custo
      { data: { ...COMPRA, status: "recebido" } },
    ];

    await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 3, correto: true });

    const custos = chamadas.filter((c) => c.tabela === "estoque_itens" && c.metodo === "update")
      .map((c) => c.args[0] as Record<string, unknown>);
    expect(custos.some((u) => u.custo === 7.5), "sem isto o custo do item envelhece calado").toBe(true);
  });
});
