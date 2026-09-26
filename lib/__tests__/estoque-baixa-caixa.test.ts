import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";

/**
 * Bipar a caixa: ela sai INTEIRA, e o consumo sabe de qual atividade veio.
 *
 * O ciclo do galpão começa aqui — a pessoa pega a caixa lacrada de folhas
 * limpas, bipa, e nesse momento ela sai do estoque. Duas coisas que só se
 * enxergam do lado do banco:
 *
 *  1. A etiqueta pode valer 50 peças. Quem lê a baixa precisa saber quantas
 *     saíram, senão a tela diz "1 item baixado" pra uma caixa de 50.
 *  2. `baixa_atividade_id` é o que liga "esta caixa de folhas virou aquelas
 *     alavancas". Sem ele, a perda de uma reprovação não tem de onde sair.
 *
 * E as duas colunas são NOVAS: quem ainda não rodou o SQL da caixa não pode
 * ver a bipagem — o trabalho de todo dia no galpão — parar de funcionar por
 * causa disso.
 */

let db: ReturnType<typeof fakeDb>;
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => db }));

const { baixarUnidades } = await import("../estoque-baixa");

interface Op { tabela: string; metodo: string; colunas?: string; payload?: Record<string, unknown> }
type Resposta = { data?: unknown; error?: unknown };

function fakeDb(fila: Resposta[]) {
  const ops: Op[] = [];
  const from = (tabela: string) => {
    const builder: Record<string, unknown> = {};
    const passa = () => builder;
    for (const m of ["eq", "ilike", "in", "limit", "order"]) builder[m] = passa;
    builder.select = (colunas?: string) => { ops.push({ tabela, metodo: "select", colunas }); return builder; };
    builder.update = (payload: Record<string, unknown>) => { ops.push({ tabela, metodo: "update", payload }); return builder; };
    const resolver = () => Promise.resolve(fila.shift() ?? { data: null, error: null });
    builder.maybeSingle = resolver;
    builder.single = resolver;
    builder.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => resolver().then(ok, falha);
    return builder;
  };
  return { from, ops };
}

const ENTRADA = {
  codigos: ["CX-000001"],
  motivo: "consumido",
  baixadoPorId: "op-1",
  baixadoPor: "Operadora",
  ocorridoEm: "2026-08-12T12:00:00.000Z",
};

const SEM_COLUNA = { code: "42703", message: 'column estoque_unidades.quantidade does not exist' };

// Resposta de um UPDATE que PEGOU a unidade. A baixa é compare-and-swap
// (`.eq("status","em_estoque").select("id")`), então quem responde a escrita
// tem que devolver as linhas que de fato mudaram: é por elas que o código
// separa quem baixou de quem perdeu a corrida pra outro tablet. Um
// `{ error: null }` pelado aqui quer dizer "não mudou nada" — e o teste passaria a
// afirmar o contrário do que o galpão faz.
const BAIXOU = { data: [{ id: "u1" }], error: null };

const updates = (ops: Op[]) => ops.filter((o) => o.tabela === "estoque_unidades" && o.metodo === "update");

beforeEach(() => { db = fakeDb([]); });

describe("baixa da caixa", () => {
  it("uma caixa de 50 baixa 50 peças, não 1 etiqueta", async () => {
    db = fakeDb([
      { data: [{ id: "u1", codigo: "CX-000001", status: "em_estoque", item_id: "item-1", quantidade: 50 }] },
      { data: [{ id: "item-1", nome: "Folha de alavanca" }] },
      BAIXOU,
    ]);

    const r = await baixarUnidades(ENTRADA);
    expect(r[0].situacao).toBe("baixada");
    expect(r[0].pecas, "bipou a caixa e contou 1 peça: a caixa sai inteira").toBe(50);
    expect(r[0].item).toBe("Folha de alavanca");
  });

  it("código já baixado não conta peça nenhuma — somar o lote dá o que saiu agora", async () => {
    db = fakeDb([
      { data: [{ id: "u1", codigo: "CX-000001", status: "consumido", item_id: "item-1", quantidade: 50 }] },
      { error: null },
    ]);

    const r = await baixarUnidades(ENTRADA);
    expect(r[0].situacao).toBe("ja_baixada");
    expect(r[0].pecas).toBe(0);
    expect(updates(db.ops), "não havia nada pra baixar e mesmo assim escreveu").toHaveLength(0);
  });

  it("código desconhecido: 0 peças e nenhuma escrita", async () => {
    db = fakeDb([{ data: [] }]);
    const r = await baixarUnidades(ENTRADA);
    expect(r[0]).toMatchObject({ situacao: "desconhecida", pecas: 0, item: null });
  });

  it("com atividade, o consumo fica amarrado a ela", async () => {
    db = fakeDb([
      { data: [{ id: "u1", codigo: "CX-000001", status: "em_estoque", item_id: "item-1", quantidade: 50 }] },
      { data: [{ id: "item-1", nome: "Folha de alavanca" }] },
      BAIXOU,
    ]);

    await baixarUnidades({ ...ENTRADA, atividadeId: "ativ-9" });
    expect(updates(db.ops)[0].payload).toMatchObject({
      status: "consumido", baixa_atividade_id: "ativ-9", baixado_em: ENTRADA.ocorridoEm,
    });
  });

  it("baixa avulsa não inventa vínculo com atividade", async () => {
    db = fakeDb([
      { data: [{ id: "u1", codigo: "CX-000001", status: "em_estoque", item_id: "item-1", quantidade: 1 }] },
      { data: [{ id: "item-1", nome: "Chapa" }] },
      BAIXOU,
    ]);

    await baixarUnidades(ENTRADA);
    expect(Object.keys(updates(db.ops)[0].payload!)).not.toContain("baixa_atividade_id");
  });

  describe("banco sem o SQL da caixa (a bipagem do galpão não pode parar)", () => {
    it("a leitura cai pro formato antigo e cada etiqueta vale 1", async () => {
      db = fakeDb([
        { error: SEM_COLUNA },                                                                 // select com `quantidade`
        { data: [{ id: "u1", codigo: "CX-000001", status: "em_estoque", item_id: "item-1" }] }, // select sem
        { data: [{ id: "item-1", nome: "Chapa" }] },
        BAIXOU,
      ]);

      const r = await baixarUnidades(ENTRADA);
      expect(r[0].situacao).toBe("baixada");
      expect(r[0].pecas).toBe(1);
      expect(updates(db.ops), "a baixa em si tem que acontecer").toHaveLength(1);
    });

    it("o vínculo com a atividade é abandonado, mas a baixa acontece", async () => {
      db = fakeDb([
        { error: SEM_COLUNA },
        { data: [{ id: "u1", codigo: "CX-000001", status: "em_estoque", item_id: "item-1" }] },
        { data: [{ id: "item-1", nome: "Chapa" }] },
        { error: SEM_COLUNA },   // update COM baixa_atividade_id
        BAIXOU,                  // update sem
      ]);

      await baixarUnidades({ ...ENTRADA, atividadeId: "ativ-9" });
      const us = updates(db.ops);
      expect(us).toHaveLength(2);
      expect(
        Object.keys(us[1].payload!),
        "perder o vínculo é uma informação a menos; perder a baixa é a peça " +
        "continuar contando como estoque",
      ).not.toContain("baixa_atividade_id");
      expect(us[1].payload).toMatchObject({ status: "consumido" });
    });

    it("sem a TABELA (não só a coluna) o erro sobe como schema desatualizado", async () => {
      const { ErroSchemaDesatualizado } = await import("../estoque-unidades-gerar");
      db = fakeDb([
        { error: { code: "42P01", message: 'relation "estoque_unidades" does not exist' } },
        { error: { code: "42P01", message: 'relation "estoque_unidades" does not exist' } },
      ]);
      await expect(baixarUnidades(ENTRADA)).rejects.toBeInstanceOf(ErroSchemaDesatualizado);
    });
  });
});
