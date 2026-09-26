import { describe, it, expect, vi, beforeEach } from "vitest";

// As quatro leituras que ficaram de fora do primeiro mutirão (set/2026). Nenhuma
// tranca acesso como `employees`/`profiles`, mas todas guardavam uma resposta
// ERRADA pelo TTL inteiro: empresa sem o canal Geral por 10 min, catálogo vazio
// por 1 min, "não é LinkTridi" por 30 s (que é o portão da chave
// `tridiflow:linktridi` aberto) e custo de queda contando zero por 10 min.
//
// A regra que estes testes fixam: só "coluna/tabela não existe" é resposta
// ESTÁVEL e pode ficar no cache. Timeout, 5xx e queda de conexão LANÇAM — o
// `cached()` descarta a entrada e a próxima requisição pergunta de novo.

type Resposta = { data: unknown; error: unknown };
const fila: Record<string, Resposta[]> = {};
const idas: string[] = [];

class Consulta {
  private op = "select";
  constructor(private tabela: string) {}
  select() { return this; }
  insert() { this.op = "insert"; return this; }
  upsert() { this.op = "upsert"; return this; }
  eq() { return this; }
  in() { return this; }
  is() { return this; }
  not() { return this; }
  gte() { return this; }
  order() { return this; }
  range() { return this; }
  limit() { return this; }
  maybeSingle() { return this; }
  single() { return this; }
  then<R>(res: (v: Resposta) => R, rej?: (e: unknown) => R) {
    const chave = `${this.tabela}:${this.op}`;
    idas.push(chave);
    return Promise.resolve(fila[chave]?.shift() ?? { data: null, error: null }).then(res, rej);
  }
}
const banco = { from: (t: string) => new Consulta(t) };

vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => banco }));

const { invalidate } = await import("@/lib/cache");
const { garantirGeral, idDoGeral } = await import("@/lib/chat/geral");
const { listCatalogoItens } = await import("@/lib/estoque");
const { ehLinkTridi } = await import("@/lib/tridiflow-db");
const { custoDasQuedas } = await import("@/lib/status-custo");

type Db = Parameters<typeof idDoGeral>[0];
const db = banco as unknown as Db;

const FALHA: Resposta = { data: null, error: { code: "", message: "TypeError: fetch failed" } };
const semColuna = (msg: string): Resposta => ({ data: null, error: { code: "42703", message: msg } });
const idasDe = (chave: string) => idas.filter((i) => i === chave).length;

beforeEach(() => {
  idas.length = 0;
  for (const k of Object.keys(fila)) delete fila[k];
  invalidate("chat:geral:id");
  invalidate("estoque:catalogo-itens");
  invalidate("tf-lt:");
  invalidate("status:custo:");
});

describe("idDoGeral: soluço do banco não apaga o canal de toda a empresa", () => {
  it("falha na leitura não vira criação nem fica 10 min no cache", async () => {
    fila["central_conversas:select"] = [FALHA, { data: { id: "g1" }, error: null }];
    fila["central_conversa_membros:upsert"] = [{ data: null, error: null }];

    // Ciclo do soluço: a sidebar abre sem o Geral, mas NADA foi criado…
    expect(await garantirGeral(db, "u1", [])).toEqual({ id: null, entrou: false });
    expect(idasDe("central_conversas:insert")).toBe(0);

    // …e o ciclo seguinte pergunta de novo, em vez de repetir a falha do cache.
    expect(await garantirGeral(db, "u1", [])).toEqual({ id: "g1", entrou: true });
    expect(idasDe("central_conversas:select")).toBe(2);
  });

  it("sem o esquema novo (coluna ausente) a resposta é estável e fica no cache", async () => {
    fila["central_conversas:select"] = [semColuna("column central_conversas.contexto_tipo does not exist")];
    expect(await idDoGeral(db, "u2")).toBeNull();
    expect(await idDoGeral(db, "u2")).toBeNull();
    expect(idasDe("central_conversas:select")).toBe(1);
    expect(idasDe("central_conversas:insert")).toBe(0);
  });

  it("leitura vazia de verdade continua criando o Geral", async () => {
    fila["central_conversas:select"] = [{ data: null, error: null }];
    fila["central_conversas:insert"] = [{ data: { id: "g9" }, error: null }];
    expect(await idDoGeral(db, "u3")).toBe("g9");
  });
});

describe("listCatalogoItens: falha não vira catálogo vazio por 60 s", () => {
  it("lança agora e lê de novo na próxima", async () => {
    fila["estoque_itens:select"] = [FALHA, { data: [{ nome: "Cadeira", tipo: null }], error: null }];
    await expect(listCatalogoItens()).rejects.toBeTruthy();
    expect(await listCatalogoItens()).toEqual([{ nome: "Cadeira", tipo: "produto" }]);
    expect(idasDe("estoque_itens:select")).toBe(2);
  });
});

describe("ehLinkTridi: 'não é LinkTridi' por engano abre o portão da chave", () => {
  it("falha passageira lança em vez de responder `false`", async () => {
    fila["tridiflow_bots:select"] = [FALHA, { data: { tipo: null, settings: { modo: "linktridi" } }, error: null }];
    await expect(ehLinkTridi("b1")).rejects.toBeTruthy();
    expect(await ehLinkTridi("b1")).toBe(true);
  });

  it("sem a coluna `tipo`, quem responde é o `settings.modo` — e isso fica no cache", async () => {
    fila["tridiflow_bots:select"] = [
      semColuna("column tridiflow_bots.tipo does not exist"),
      { data: { settings: { modo: "linktridi" } }, error: null },
    ];
    expect(await ehLinkTridi("b2")).toBe(true);
    expect(await ehLinkTridi("b2")).toBe(true);
    expect(idasDe("tridiflow_bots:select")).toBe(2);   // as duas da 1ª chamada
  });
});

describe("custoDasQuedas: página que não veio não pode virar 'custou zero'", () => {
  const queda = {
    id: 7, key: "funis_x", nome: "x", tipo: null, motivo: null,
    inicio: "2026-09-01T10:00:00.000Z", fim: "2026-09-01T11:00:00.000Z", duracao_s: 3600,
  };

  it("falha ao ler os funis lança (quem chama já trata com `.catch`)", async () => {
    fila["tridiflow_bots:select"] = [FALHA];
    await expect(custoDasQuedas([queda])).rejects.toBeTruthy();
  });

  it("falha ao paginar as sessões lança", async () => {
    fila["tridiflow_bots:select"] = [{ data: [{ id: "b1", slug: "x" }], error: null }];
    fila["tridiflow_sessoes:select"] = [FALHA];
    await expect(custoDasQuedas([{ ...queda, id: 8 }])).rejects.toBeTruthy();
  });
});
