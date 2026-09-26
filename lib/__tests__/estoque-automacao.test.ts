import { describe, it, expect, vi, beforeEach } from "vitest";

// `verificarReabastecimento` é o motor de verdade (lib/requisicoes.ts) — aqui
// o que se testa é QUANDO ele é chamado, não o que ele faz por dentro. Mock
// no topo (hoisted pelo vitest) pra controlar o resumo devolvido e espiar
// quantas vezes/à volta de quê ele foi chamado.
const mockVerificar = vi.fn();
vi.mock("@/lib/requisicoes", () => ({
  verificarReabastecimento: (...a: unknown[]) => mockVerificar(...a),
}));

const {
  hojeSP, lerConfig, salvarConfig, precisaVarrer, varrerSeNecessario,
} = await import("../estoque-automacao");

// ── Banco falso ──────────────────────────────────────────────────────────────
// Suporta a cadeia usada por este arquivo: from().select().eq().maybeSingle(),
// from().upsert(), from().update().eq().eq().or().select(). Cada `await`
// consome UMA resposta da fila e fica registrado em `chamadas` (a trilha
// inteira da cadeia, útil pra confirmar QUAL filtro saiu, não só quantos).
type Resposta = { data?: unknown; error?: { message?: string } | null };

function fakeDb(fila: Resposta[]) {
  const chamadas: string[] = [];
  const from = (tabela: string) => {
    const trilha: string[] = [`from(${tabela})`];
    const builder: Record<string, unknown> = {};
    const encadeia = (nome: string) => (...args: unknown[]) => {
      trilha.push(`${nome}(${args.map((a) => JSON.stringify(a)).join(",")})`);
      return builder;
    };
    for (const m of ["select", "eq", "neq", "or", "in", "ilike", "gt", "order", "limit", "update", "upsert", "maybeSingle"]) {
      builder[m] = encadeia(m);
    }
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      chamadas.push(trilha.join("."));
      const resp = fila.shift() ?? { data: null, error: null };
      return Promise.resolve(resp).then(resolve, reject);
    };
    return builder;
  };
  return { from, chamadas };
}

beforeEach(() => { mockVerificar.mockReset(); });

describe("hojeSP", () => {
  it("formata como YYYY-MM-DD", () => {
    expect(hojeSP(new Date("2026-08-11T15:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // O caso que interessa: um instante DEPOIS da meia-noite UTC mas ANTES da
  // meia-noite em São Paulo (UTC-3). Se a função usasse toISOString().slice(0,10)
  // (UTC puro), este teste pegaria a data errada — é exatamente o bug de fuso
  // que o CLAUDE.md pede pra nunca deixar passar.
  it("01h UTC ainda é o dia anterior em São Paulo (UTC-3)", () => {
    expect(hojeSP(new Date("2026-08-11T01:00:00Z"))).toBe("2026-08-10");
  });

  it("04h UTC já virou o dia em São Paulo", () => {
    expect(hojeSP(new Date("2026-08-11T04:00:00Z"))).toBe("2026-08-11");
  });
});

describe("precisaVarrer (pura)", () => {
  it("desligada: nunca precisa, mesmo sem varredura nenhuma", () => {
    expect(precisaVarrer({ automacao_ativa: false, ultima_varredura: null }, "2026-08-11")).toBe(false);
  });

  it("ligada e nunca varreu: precisa", () => {
    expect(precisaVarrer({ automacao_ativa: true, ultima_varredura: null }, "2026-08-11")).toBe(true);
  });

  it("ligada e já varreu HOJE: não precisa", () => {
    expect(precisaVarrer({ automacao_ativa: true, ultima_varredura: "2026-08-11" }, "2026-08-11")).toBe(false);
  });

  it("ligada e a última varredura foi ONTEM: precisa de novo", () => {
    expect(precisaVarrer({ automacao_ativa: true, ultima_varredura: "2026-08-10" }, "2026-08-11")).toBe(true);
  });
});

describe("lerConfig", () => {
  it("linha existe: devolve os valores do banco", async () => {
    const db = fakeDb([{ data: { automacao_ativa: true, ultima_varredura: "2026-08-10" }, error: null }]);
    expect(await lerConfig(db)).toEqual({ automacao_ativa: true, ultima_varredura: "2026-08-10", bipe_para_iniciar: false });
  });

  it("linha ainda não inserida (SQL rodou mas o insert padrão não): devolve o padrão desligado", async () => {
    const db = fakeDb([{ data: null, error: null }]);
    expect(await lerConfig(db)).toEqual({ automacao_ativa: false, ultima_varredura: null, bipe_para_iniciar: false });
  });

  it("tabela ainda não existe (SQL não rodado): devolve o padrão em vez de derrubar a tela", async () => {
    const db = fakeDb([{ data: null, error: { message: 'relation "estoque_config" does not exist' } }]);
    expect(await lerConfig(db)).toEqual({ automacao_ativa: false, ultima_varredura: null, bipe_para_iniciar: false });
  });

  it("erro de verdade (não é tabela ausente) sobe pra quem chamou", async () => {
    const db = fakeDb([{ data: null, error: { message: "JWT expired" } }]);
    await expect(lerConfig(db)).rejects.toBeTruthy();
  });
});

describe("salvarConfig", () => {
  it("grava e relê a config", async () => {
    const db = fakeDb([
      { error: null }, // upsert
      { data: { automacao_ativa: true, ultima_varredura: null }, error: null }, // lerConfig
    ]);
    const r = await salvarConfig(db, { automacao_ativa: true }, "user-1");
    expect(r).toEqual({ automacao_ativa: true, ultima_varredura: null, bipe_para_iniciar: false });
    expect(db.chamadas[0]).toContain("upsert(");
  });

  it("tabela ausente no upsert não derruba — cai pro padrão na releitura", async () => {
    const db = fakeDb([
      { error: { message: "Could not find the table 'public.estoque_config'" } },
      { data: null, error: { message: "Could not find the table 'public.estoque_config'" } },
    ]);
    const r = await salvarConfig(db, { automacao_ativa: true });
    expect(r).toEqual({ automacao_ativa: false, ultima_varredura: null, bipe_para_iniciar: false });
  });
});

describe("varrerSeNecessario", () => {
  it("automação desligada: não lê nem tenta reivindicar nada além da config", async () => {
    const db = fakeDb([
      { data: { automacao_ativa: false, ultima_varredura: null }, error: null }, // lerConfig
    ]);
    const r = await varrerSeNecessario(db, "2026-08-11");
    expect(r).toEqual({ varreu: false, resumo: null });
    expect(mockVerificar).not.toHaveBeenCalled();
    expect(db.chamadas).toHaveLength(1); // só a leitura — nada de UPDATE
  });

  it("ligada mas já varreu hoje: não repete", async () => {
    const db = fakeDb([
      { data: { automacao_ativa: true, ultima_varredura: "2026-08-11" }, error: null },
    ]);
    const r = await varrerSeNecessario(db, "2026-08-11");
    expect(r).toEqual({ varreu: false, resumo: null });
    expect(mockVerificar).not.toHaveBeenCalled();
  });

  it("ligada e não varreu hoje: reivindica (UPDATE condicional) ANTES de rodar o motor", async () => {
    const resumo = { verificados: 3, abaixo: 1, criadas: 1, itens: [] };
    mockVerificar.mockResolvedValue(resumo);
    const db = fakeDb([
      { data: { automacao_ativa: true, ultima_varredura: null }, error: null }, // lerConfig
      { data: [{ id: true }], error: null }, // reivindicarVarredura: 1 linha afetada = venceu
    ]);
    const r = await varrerSeNecessario(db, "2026-08-11", "user-9");
    expect(r).toEqual({ varreu: true, resumo });
    expect(mockVerificar).toHaveBeenCalledTimes(1);
    // A trilha do UPDATE inclui o WHERE que só casa "ainda não carimbado hoje".
    expect(db.chamadas[1]).toContain("update(");
    expect(db.chamadas[1]).toContain('eq("automacao_ativa",true)');
    expect(db.chamadas[1]).toMatch(/or\(.*ultima_varredura\.is\.null.*ultima_varredura\.neq\.2026-08-11.*\)/);
  });

  it("duas aberturas simultâneas: a que perde o UPDATE condicional (0 linhas) NÃO roda o motor de novo", async () => {
    const db = fakeDb([
      { data: { automacao_ativa: true, ultima_varredura: null }, error: null }, // lerConfig
      { data: [], error: null }, // reivindicarVarredura: a outra requisição já carimbou — 0 linhas
    ]);
    const r = await varrerSeNecessario(db, "2026-08-11");
    expect(r).toEqual({ varreu: false, resumo: null });
    expect(mockVerificar).not.toHaveBeenCalled();
  });
});
