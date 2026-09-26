import { describe, it, expect, vi, beforeEach } from "vitest";

// Leitura cacheada que FALHA não pode ficar no cache como resposta. O
// supabase-js não lança em timeout/5xx/queda: devolve `{ data: null, error }`,
// e o `cached()` só descarta Promise rejeitada. Sem o `throw`, um soluço do
// banco virava "sem ficha" / "sem canal" / "esquema antigo" pelo TTL inteiro.

type Resposta = { data: unknown; error: unknown };
const fila: Record<string, Resposta[]> = {};
const idas: string[] = [];

class Consulta {
  private cols = "";
  constructor(private tabela: string) {}
  select(c: string) { this.cols = c; return this; }
  eq() { return this; }
  limit() { return this; }
  maybeSingle() { return this; }
  then<R>(res: (v: Resposta) => R, rej?: (e: unknown) => R) {
    idas.push(`${this.tabela}:${this.cols}`);
    return Promise.resolve(fila[this.tabela]?.shift() ?? { data: null, error: null }).then(res, rej);
  }
}
const banco = { from: (t: string) => new Consulta(t) };

vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => banco }));
vi.mock("@/lib/superusuario", () => ({ ehSuperusuario: () => false }));
vi.mock("@/lib/require-auth", () => ({ getProfile: async () => null, getProfileSemAcesso: async () => null }));

const { acessoBruto, meuNivel } = await import("@/lib/perfis");
const { paginaInicialDe } = await import("@/lib/pagina-inicial");
const { meusCanais, temEsquemaNovo } = await import("@/lib/chat/servidor");

type Db = Parameters<typeof meusCanais>[0];
const db = banco as unknown as Db;
const FALHA: Resposta = { data: null, error: { code: "", message: "TypeError: fetch failed" } };
const idasDe = (t: string) => idas.filter((i) => i.startsWith(`${t}:`)).length;

beforeEach(() => {
  idas.length = 0;
  for (const k of Object.keys(fila)) delete fila[k];
});

describe("acessoBruto (emp-acesso): falha de employees não rebaixa ninguém por 30s", () => {
  it("1ª leitura falha → fallback do papel só agora; a 2ª lê de novo e vale a grade", async () => {
    fila.employees = [FALHA, { data: { permissoes: { admin: true } }, error: null }];
    const antes = await meuNivel({ id: "u-emp", role: "colaborador" });
    expect(antes.permissoes).toBeNull();
    const depois = await meuNivel({ id: "u-emp", role: "colaborador" });
    expect(depois.permissoes).toEqual({ admin: true });
    expect(depois.nivel).toBe(5);
    expect(idasDe("employees")).toBe(2);
  });

  it("a foto do avatar vem na mesma linha (o layout não faz ida própria)", async () => {
    fila.employees = [{ data: { photo_url: "https://x/ana.jpg" }, error: null }];
    expect((await acessoBruto("u-foto"))?.photo_url).toBe("https://x/ana.jpg");
    expect(idas).toEqual([expect.stringContaining("photo_url")]);
  });
});

describe("paginaInicialDe: erro passageiro não vira 'sem preferência' por 1 min", () => {
  it("timeout → null agora, a preferência na próxima", async () => {
    fila.employees = [FALHA, { data: { pagina_inicial: "estoque" }, error: null }];
    expect(await paginaInicialDe("u-pi")).toBeNull();
    expect(await paginaInicialDe("u-pi")).toBe("estoque");
  });

  it("coluna ausente (SQL pendente) é resposta estável e fica no cache", async () => {
    fila.employees = [{ data: null, error: { code: "42703", message: "column employees.pagina_inicial does not exist" } }];
    expect(await paginaInicialDe("u-pi2")).toBeNull();
    expect(await paginaInicialDe("u-pi2")).toBeNull();
    expect(idasDe("employees")).toBe(1);
  });
});

describe("meusCanais: falha não vira 'não estou em canal nenhum' por 30s", () => {
  it("falha → lista vazia só agora; a próxima lê de novo", async () => {
    fila.central_conversa_membros = [FALHA, { data: [{ conversa_id: "c1" }], error: null }];
    expect(await meusCanais(db, "u-can")).toEqual([]);
    expect(await meusCanais(db, "u-can")).toEqual(["c1"]);
  });
});

describe("temEsquemaNovo: só coluna ausente decide 'esquema antigo'", () => {
  it("erro passageiro não fica memorizado pelo processo; 42703 fica", async () => {
    fila.central_conversas = [
      FALHA,
      { data: null, error: { code: "42703", message: "column central_conversas.privado does not exist" } },
    ];
    expect(await temEsquemaNovo(db)).toBe(true);      // passageiro: supõe o atual, sem memorizar
    expect(await temEsquemaNovo(db)).toBe(false);     // perguntou de novo: coluna ausente
    expect(await temEsquemaNovo(db)).toBe(false);     // e essa resposta sim fica
    expect(idasDe("central_conversas")).toBe(2);
  });
});
