import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O bipe que abre a atividade, do lado do servidor.
 *
 * A pessoa bipa a etiqueta do material ANTES de aceitar. A caixa sai do estoque
 * naquele instante e fica amarrada à atividade — é isso que responde "fulano
 * fez chancela usando a folha que ciclano fez".
 *
 * O que estes testes seguram é o que dói se quebrar em silêncio:
 *
 *  1. O VÍNCULO. Se `atividadeId` não descer pra baixa, a caixa sai do estoque
 *     e ninguém nunca mais sabe em que peça ela virou. O estoque fecha certo, o
 *     galpão não reclama, e o histórico que o dono pediu nasce vazio.
 *
 *  2. A OPERAÇÃO NÃO PODE FICAR PRESA NA FILA. O tablet só tira da fila offline
 *     o que voltou "ok" ou "conflito"; "erro" é reenviado pra SEMPRE. Então
 *     falha permanente (id que não é uuid, tabela que não existe) tem que sair
 *     como conflito, e só falha transitória (banco fora do ar) pode voltar erro.
 *
 *  3. A SAÍDA REGISTRADA. Começar sem bipar é permitido — tem que ser, senão
 *     etiqueta descolada prende gente na bancada — mas nunca é silencioso.
 */

type Resposta = { data?: unknown; error?: unknown };
interface Op { tabela: string; metodo: string; payload?: unknown }

let db: ReturnType<typeof fakeDb>;
function fakeDb(fila: Resposta[] = []) {
  const ops: Op[] = [];
  const from = (tabela: string) => {
    const b: Record<string, unknown> = {};
    const passa = () => b;
    for (const m of ["select", "eq", "in", "is", "not", "or", "ilike", "limit", "order", "gte"]) b[m] = passa;
    for (const m of ["insert", "update", "upsert"]) {
      b[m] = (payload: unknown) => { ops.push({ tabela, metodo: m, payload }); return b; };
    }
    const resolver = () => Promise.resolve(fila.shift() ?? { data: null, error: null });
    b.maybeSingle = resolver;
    b.single = resolver;
    b.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => resolver().then(ok, falha);
    return b;
  };
  return { from, ops };
}
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => db }));

const processados = new Set<string>();
vi.mock("@/lib/device", () => ({
  autenticarDevice: async () => ({ ok: true as const, device: { id: "dev-1", setor: "Produção", nome_mesa: "Mesa 1" } }),
  jaProcessados: async () => processados,
  marcarProcessado: async (id: string) => { processados.add(id); },
  touchDevice: async () => {},
}));

const baixar = vi.fn();
vi.mock("@/lib/estoque-baixa", async () => {
  const real = await vi.importActual<typeof import("@/lib/estoque-baixa")>("@/lib/estoque-baixa");
  return { ...real, baixarUnidades: (...a: unknown[]) => baixar(...(a as [])) };
});

const { POST } = await import("@/app/api/device/push/route");
const { ErroSchemaDesatualizado } = await import("@/lib/estoque-unidades-gerar");

const ATIV = "11111111-1111-1111-1111-111111111111";
const PESSOA = "22222222-2222-2222-2222-222222222222";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pedido(item: Record<string, unknown>): any {
  return { headers: { get: () => "token" }, json: async () => ({ items: [item] }) };
}

const consumir = (extra: Record<string, unknown> = {}) => pedido({
  client_id: `c-${Math.random()}`,
  tipo: "consumir",
  atividade_id: ATIV,
  colaborador_id: PESSOA,
  colaborador_nome: "Fulano",
  codigos: ["FOLHA-000012"],
  ocorrido_em: "2026-08-15T11:00:00.000Z",
  ...extra,
});

const bipesGravados = () => db.ops.filter((o) => o.tabela === "atividade_bipes" && o.metodo === "insert");

beforeEach(() => {
  db = fakeDb();
  processados.clear();
  baixar.mockReset();
  baixar.mockResolvedValue([{ codigo: "FOLHA-000012", situacao: "baixada", item: "Folha de alavanca", pecas: 50 }]);
});

describe("o bipe amarra o material à atividade", () => {
  it("a baixa desce COM a atividade — é o vínculo do histórico inteiro", async () => {
    const r = await POST(consumir());
    expect((await r.json()).results[0].status).toBe("ok");

    expect(baixar).toHaveBeenCalledTimes(1);
    const entrada = baixar.mock.calls[0][0];
    expect(entrada.atividadeId, "sem isto a caixa sai do estoque e vira anônima").toBe(ATIV);
    expect(entrada.codigos).toEqual(["FOLHA-000012"]);
    // "consumido" é a MESMA palavra que o galpão já usa na baixa pela tela. Um
    // motivo próprio seria um quinto `status` significando o que este já
    // significa, e a soma do relatório passaria a esquecer metade.
    expect(entrada.motivo).toBe("consumido");
  });

  it("o carimbo é do TABLET, não do momento em que a fila subiu", async () => {
    await POST(consumir());
    expect(baixar.mock.calls[0][0].ocorridoEm).toBe("2026-08-15T11:00:00.000Z");
    const linhas = bipesGravados()[0].payload as Record<string, unknown>[];
    expect(linhas[0].ocorrido_em).toBe("2026-08-15T11:00:00.000Z");
  });

  it("a caixa lacrada entra no livro valendo 50, não 1", async () => {
    await POST(consumir());
    const linhas = bipesGravados()[0].payload as Record<string, unknown>[];
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      atividade_id: ATIV, colaborador_id: PESSOA, colaborador_nome: "Fulano",
      codigo: "FOLHA-000012", situacao: "baixada", item: "Folha de alavanca", pecas: 50,
    });
  });

  it("o gatilho segurado não manda a mesma etiqueta duas vezes", async () => {
    await POST(consumir({ codigos: ["FOLHA-000012", "FOLHA-000012", "CHAPA-000003"] }));
    expect(baixar.mock.calls[0][0].codigos).toEqual(["FOLHA-000012", "CHAPA-000003"]);
  });

  it("etiqueta que o banco não conhece fica registrada — não vira silêncio", async () => {
    baixar.mockResolvedValue([{ codigo: "XPTO-999", situacao: "desconhecida", item: null, pecas: 0 }]);
    const r = await POST(consumir({ codigos: ["XPTO-999"] }));
    expect((await r.json()).results[0].status).toBe("ok");
    const linhas = bipesGravados()[0].payload as Record<string, unknown>[];
    expect(linhas[0]).toMatchObject({ codigo: "XPTO-999", situacao: "desconhecida", pecas: 0 });
  });
});

describe("a saída registrada", () => {
  it("começar sem bipar é permitido, e o motivo fica escrito", async () => {
    const r = await POST(consumir({ codigos: [], dispensa_motivo: "etiqueta_ilegivel" }));
    expect((await r.json()).results[0].status).toBe("ok");
    expect(baixar, "sem etiqueta não há baixa nenhuma").not.toHaveBeenCalled();

    const linhas = bipesGravados()[0].payload as Record<string, unknown>[];
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      atividade_id: ATIV, codigo: null, situacao: "dispensado",
      motivo: "etiqueta_ilegivel", colaborador_nome: "Fulano", pecas: 0,
    });
  });

  it("dispensa sem motivo AINDA deixa rastro", async () => {
    // Um app mais velho, ou um toque que não passou o motivo: a linha entra
    // assim mesmo. Uma abertura sem bipe que não aparece em lugar nenhum é
    // exatamente como a saída de emergência vira o caminho normal.
    await POST(consumir({ codigos: [] }));
    const linhas = bipesGravados()[0].payload as Record<string, unknown>[];
    expect(linhas[0]).toMatchObject({ situacao: "dispensado", motivo: "sem_motivo" });
  });
});

describe("a operação nunca fica presa na fila do tablet", () => {
  it("id que não é uuid sai como CONFLITO (nunca vira uuid esperando)", async () => {
    const r = await POST(consumir({ atividade_id: "atividade-do-joão" }));
    expect((await r.json()).results[0].status).toBe("conflito");
    expect(baixar).not.toHaveBeenCalled();
  });

  it("banco sem as tabelas do estoque sai como CONFLITO", async () => {
    baixar.mockRejectedValue(new ErroSchemaDesatualizado());
    const r = await POST(consumir());
    expect((await r.json()).results[0].status).toBe("conflito");
  });

  it("banco fora do ar volta ERRO — este a fila DEVE reenviar", async () => {
    baixar.mockRejectedValue(new Error("connection reset"));
    const r = await POST(consumir());
    expect((await r.json()).results[0].status).toBe("erro");
  });

  it("o livro que não grava não derruba a operação", async () => {
    // A tabela roda à mão. Enquanto ninguém rodou o SQL, a BAIXA continua
    // valendo — perder o registro é uma informação a menos; devolver a operação
    // pra fila é ela sendo reenviada pra sempre.
    db = fakeDb([{ error: { message: 'relation "public.atividade_bipes" does not exist' } }]);
    const r = await POST(consumir());
    expect((await r.json()).results[0].status).toBe("ok");
    expect(baixar).toHaveBeenCalledTimes(1);
  });

  it("reenvio do mesmo client_id não baixa a caixa duas vezes", async () => {
    const req = consumir({ client_id: "op-fixa" });
    await POST(req);
    expect(baixar).toHaveBeenCalledTimes(1);
    await POST(consumir({ client_id: "op-fixa" }));
    expect(baixar, "a caixa sairia do estoque de novo a cada retry de rede").toHaveBeenCalledTimes(1);
  });
});

describe("colunas uuid não recebem string vazia", () => {
  it("colaborador sem id vira NULL, e a baixa acontece do mesmo jeito", async () => {
    // `""` numa coluna `uuid` é 22P02 — derrubaria a baixa inteira por causa de
    // uma coluna de auditoria. NULL passa, e a linha continua sabendo o NOME.
    await POST(consumir({ colaborador_id: "" }));
    expect(baixar.mock.calls[0][0].baixadoPorId).toBeNull();
    const linhas = bipesGravados()[0].payload as Record<string, unknown>[];
    expect(linhas[0].colaborador_id).toBeNull();
    expect(linhas[0].colaborador_nome).toBe("Fulano");
  });
});
