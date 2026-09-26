import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Ler o vínculo "esta caixa virou aquelas alavancas".
 *
 * Três coisas que só quebram em silêncio:
 *
 *  1. **Peça é soma, etiqueta é contagem.** Uma caixa de 50 mais uma avulsa são
 *     2 etiquetas e 51 peças. Contar etiqueta no lugar de peça faz a atividade
 *     dizer "consumiu 2" pra 51 folhas.
 *  2. **"Não consumiu nada" ≠ "não dá pra saber".** Enquanto o SQL da caixa não
 *     rodar, `baixa_atividade_id` não existe: a resposta certa é `semVinculo`,
 *     não uma lista vazia. Lista vazia faria a tela jurar que a atividade está
 *     limpa enquanto o vínculo nem chega a ser gravado.
 *  3. **Id ruim não pode virar exceção.** Ele entra na baixa, que é escrita —
 *     um 22P02 ali derrubaria a saída da caixa do estoque por causa de um campo
 *     opcional.
 */

let db: ReturnType<typeof fakeDb>;
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => db }));

const {
  atividadeIdValido, idsDaQuery, resumirConsumo,
  lerEtiquetas, consumoDaAtividade, consumoPorAtividade,
} = await import("../estoque-consumo");

interface Op { tabela: string; metodo: string; colunas?: string }
type Resposta = { data?: unknown; error?: unknown };

function fakeDb(fila: Resposta[]) {
  const ops: Op[] = [];
  const from = (tabela: string) => {
    const builder: Record<string, unknown> = {};
    const passa = () => builder;
    for (const m of ["eq", "in", "limit", "order"]) builder[m] = passa;
    builder.select = (colunas?: string) => { ops.push({ tabela, metodo: "select", colunas }); return builder; };
    const resolver = () => Promise.resolve(fila.shift() ?? { data: null, error: null });
    builder.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => resolver().then(ok, falha);
    return builder;
  };
  return { from, ops };
}

const UM_UUID = "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b";
const OUTRO_UUID = "7a2b3c4d-5e6f-4071-9b8c-1d2e3f4a5b6c";
const SEM_COLUNA = { code: "42703", message: "column estoque_unidades.baixa_atividade_id does not exist" };

beforeEach(() => { db = fakeDb([]); });

describe("id de atividade que vem de fora", () => {
  it("uuid passa, lixo vira null (nunca exceção)", () => {
    expect(atividadeIdValido(UM_UUID)).toBe(UM_UUID);
    expect(atividadeIdValido(` ${UM_UUID} `)).toBe(UM_UUID);
    expect(atividadeIdValido("ativ-9")).toBeNull();
    expect(atividadeIdValido("")).toBeNull();
    expect(atividadeIdValido(undefined)).toBeNull();
    expect(atividadeIdValido({ id: UM_UUID })).toBeNull();
  });

  it("lista da query descarta o que não é uuid e não repete", () => {
    expect(idsDaQuery(`${UM_UUID},lixo,${UM_UUID},${OUTRO_UUID}`)).toEqual([UM_UUID, OUTRO_UUID]);
    expect(idsDaQuery(null)).toEqual([]);
  });

  it("a lista tem teto — o quadro inteiro não vira um `in` de mil ids", () => {
    const muitos = Array.from({ length: 40 }, (_, i) => UM_UUID.slice(0, -2) + String(i).padStart(2, "0"));
    expect(idsDaQuery(muitos.join(","), 10)).toHaveLength(10);
  });
});

describe("resumo do consumo", () => {
  it("peça soma, etiqueta conta", () => {
    expect(resumirConsumo([{ quantidade: 50 }, { quantidade: 1 }])).toEqual({ etiquetas: 2, pecas: 51 });
  });

  it("sem a coluna da caixa cada etiqueta vale 1 — nunca 0", () => {
    expect(resumirConsumo([{}, { quantidade: null }])).toEqual({ etiquetas: 2, pecas: 2 });
  });
});

describe("o que esta etiqueta é (antes de bipar)", () => {
  it("devolve o tamanho da caixa e o nome do item", async () => {
    db = fakeDb([
      { data: [{ codigo: "CX-000001", status: "em_estoque", item_id: "item-1", quantidade: 50 }] },
      { data: [{ id: "item-1", nome: "Folha de alavanca" }] },
    ]);
    expect(await lerEtiquetas(["CX-000001"])).toEqual([
      { codigo: "CX-000001", item: "Folha de alavanca", pecas: 50, status: "em_estoque" },
    ]);
  });

  it("banco sem a coluna da caixa ainda responde — cada etiqueta vale 1", async () => {
    db = fakeDb([
      { error: { code: "42703", message: "column estoque_unidades.quantidade does not exist" } },
      { data: [{ codigo: "CX-000001", status: "em_estoque", item_id: "item-1" }] },
      { data: [{ id: "item-1", nome: "Folha de alavanca" }] },
    ]);
    expect((await lerEtiquetas(["CX-000001"]))[0].pecas).toBe(1);
  });

  it("lista vazia não vai ao banco", async () => {
    expect(await lerEtiquetas([])).toEqual([]);
    expect(db.ops).toHaveLength(0);
  });
});

describe("o que esta atividade consumiu", () => {
  it("soma peças, não etiquetas", async () => {
    db = fakeDb([
      { data: [
        { codigo: "CX-000001", item_id: "item-1", quantidade: 50, baixa_motivo: "consumido", baixado_por: "Ana", baixado_em: "2026-08-12T12:00:00.000Z" },
        { codigo: "CX-000002", item_id: "item-1", quantidade: 1, baixa_motivo: "consumido", baixado_por: "Ana", baixado_em: "2026-08-12T11:00:00.000Z" },
      ] },
      { data: [{ id: "item-1", nome: "Folha de alavanca" }] },
    ]);

    const r = await consumoDaAtividade(UM_UUID);
    expect(r.etiquetas).toBe(2);
    expect(r.pecas, "51 folhas saíram da prateleira; 2 é o número de etiquetas").toBe(51);
    expect(r.semVinculo).toBe(false);
    expect(r.lista[0]).toMatchObject({ codigo: "CX-000001", item: "Folha de alavanca", pecas: 50 });
  });

  it("banco sem `baixa_atividade_id` diz `semVinculo`, não 'consumiu nada'", async () => {
    db = fakeDb([{ error: SEM_COLUNA }, { error: SEM_COLUNA }]);
    const r = await consumoDaAtividade(UM_UUID);
    expect(r.semVinculo).toBe(true);
    expect(r.lista).toEqual([]);
    expect(r.pecas).toBe(0);
  });

  it("erro de verdade continua sendo erro", async () => {
    db = fakeDb([{ error: { code: "08006", message: "connection failure" } }]);
    await expect(consumoDaAtividade(UM_UUID)).rejects.toThrow(/connection failure/);
  });
});

describe("consumo de várias atividades numa consulta", () => {
  it("agrupa por atividade e some quem não consumiu", async () => {
    db = fakeDb([{ data: [
      { baixa_atividade_id: UM_UUID, quantidade: 50 },
      { baixa_atividade_id: UM_UUID, quantidade: 1 },
      { baixa_atividade_id: OUTRO_UUID, quantidade: 3 },
    ] }]);

    const r = await consumoPorAtividade([UM_UUID, OUTRO_UUID, "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a00"]);
    expect(r.porAtividade[UM_UUID]).toEqual({ etiquetas: 2, pecas: 51 });
    expect(r.porAtividade[OUTRO_UUID]).toEqual({ etiquetas: 1, pecas: 3 });
    expect(Object.keys(r.porAtividade)).toHaveLength(2);
  });

  it("sem ids não vai ao banco", async () => {
    expect(await consumoPorAtividade([])).toEqual({ porAtividade: {}, semVinculo: false });
    expect(db.ops).toHaveLength(0);
  });

  it("banco sem a coluna: `semVinculo`, e o quadro não quebra", async () => {
    db = fakeDb([{ error: SEM_COLUNA }, { error: SEM_COLUNA }]);
    expect(await consumoPorAtividade([UM_UUID])).toEqual({ porAtividade: {}, semVinculo: true });
  });

  it("nenhuma consulta sai sem colunas nomeadas", async () => {
    db = fakeDb([{ data: [] }]);
    await consumoPorAtividade([UM_UUID]);
    for (const op of db.ops) expect(op.colunas).not.toBe("*");
  });
});
