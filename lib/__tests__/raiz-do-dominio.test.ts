import { describe, it, expect, vi, beforeEach } from "vitest";

// A RAIZ de um domínio próprio precisa de resposta.
//
// `www.carimbostridii.com.br` só serve tutorial, currículo e LinkTridi — não
// tem vitrine. Antes disto, `/` era reescrito pra `/l`, que no site público não
// tem banco: o visitante batia no 404 DO GAIUS, com a marca do ERP na porta de
// um domínio que deveria parecer um site independente.

type Resposta = { data: unknown; error: unknown };
const fila: Record<string, Resposta[]> = {};
const consultas: string[] = [];

class Consulta {
  private cols = "";
  private filtros: string[] = [];
  constructor(private tabela: string) {}
  select(c: string) { this.cols = c; return this; }
  eq(col: string, v: unknown) { this.filtros.push(`${col}=${String(v)}`); return this; }
  limit() { return this; }
  then<R>(res: (v: Resposta) => R, rej?: (e: unknown) => R) {
    consultas.push(`${this.tabela}[${this.cols}]{${this.filtros.join(",")}}`);
    return Promise.resolve(fila[this.tabela]?.shift() ?? { data: [], error: null }).then(res, rej);
  }
}
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => ({ from: (t: string) => new Consulta(t) }) }));

const { raizDoDominio } = await import("@/lib/tridiflow-db");
const { invalidate } = await import("@/lib/cache");

const zera = () => {
  for (const k of Object.keys(fila)) delete fila[k];
  consultas.length = 0;
  invalidate("tf-raiz:");
};
beforeEach(zera);

const COLUNA_AUSENTE = { message: 'column tridiflow_dominios.bot_id does not exist' };

describe("raizDoDominio", () => {
  it("uma publicação marcada pro domínio → a raiz abre ela", async () => {
    fila["tridiflow_dominios"] = [{ data: [{ id: "d1", bot_id: null }], error: null }];
    fila["tridiflow_bots"] = [{ data: [{ slug: "tutoriais", tipo: "page" }], error: null }];
    expect(await raizDoDominio("www.carimbostridii.com.br")).toBe("/p/tutoriais");
  });

  it("LinkTridi e quiz moram em /f, não em /p", async () => {
    fila["tridiflow_dominios"] = [{ data: [{ id: "d1", bot_id: null }], error: null }];
    fila["tridiflow_bots"] = [{ data: [{ slug: "meu-link", tipo: "linktridi" }], error: null }];
    expect(await raizDoDominio("www.carimbostridii.com.br")).toBe("/f/meu-link");
  });

  // Escolher sozinho entre duas trocaria um 404 por uma página ERRADA, que o
  // visitante não tem como perceber. Melhor dizer que não há raiz definida.
  it("duas publicações e nenhuma escolhida → null (não chuta)", async () => {
    fila["tridiflow_dominios"] = [{ data: [{ id: "d1", bot_id: null }], error: null }];
    fila["tridiflow_bots"] = [{ data: [{ slug: "a", tipo: "page" }, { slug: "b", tipo: "page" }], error: null }];
    expect(await raizDoDominio("www.carimbostridii.com.br")).toBeNull();
  });

  it("escolha explícita (bot_id) manda, mesmo com várias publicadas", async () => {
    fila["tridiflow_dominios"] = [{ data: [{ id: "d1", bot_id: "b7" }], error: null }];
    fila["tridiflow_bots"] = [{ data: [{ slug: "tutoriais", tipo: "page" }], error: null }];
    expect(await raizDoDominio("www.carimbostridii.com.br")).toBe("/p/tutoriais");
    expect(consultas.some((c) => c.includes("id=b7"))).toBe(true);
  });

  // O SQL do bot_id é opcional: sem ele rodado, o PostgREST reprova a consulta
  // INTEIRA por causa da coluna ausente. Se isso derrubasse a raiz, a feature
  // só funcionaria depois de alguém lembrar de rodar a migração.
  it("coluna bot_id ainda não existe → cai no select magro e funciona", async () => {
    fila["tridiflow_dominios"] = [{ data: null, error: COLUNA_AUSENTE }, { data: [{ id: "d1" }], error: null }];
    fila["tridiflow_bots"] = [{ data: [{ slug: "tutoriais", tipo: "page" }], error: null }];
    expect(await raizDoDominio("www.carimbostridii.com.br")).toBe("/p/tutoriais");
  });

  it("domínio não cadastrado → null", async () => {
    fila["tridiflow_dominios"] = [{ data: [], error: null }];
    expect(await raizDoDominio("nao-existe.com.br")).toBeNull();
  });

  it("host vazio não vai ao banco", async () => {
    expect(await raizDoDominio(null)).toBeNull();
    expect(consultas).toHaveLength(0);
  });

  // A raiz é a porta de entrada: sem cache, cada visita ao domínio pelado
  // custaria duas idas ao banco.
  it("segunda visita ao mesmo host não repete a consulta", async () => {
    fila["tridiflow_dominios"] = [{ data: [{ id: "d1", bot_id: null }], error: null }];
    fila["tridiflow_bots"] = [{ data: [{ slug: "tutoriais", tipo: "page" }], error: null }];
    await raizDoDominio("www.carimbostridii.com.br");
    const antes = consultas.length;
    await raizDoDominio("www.carimbostridii.com.br");
    expect(consultas.length).toBe(antes);
  });
});
