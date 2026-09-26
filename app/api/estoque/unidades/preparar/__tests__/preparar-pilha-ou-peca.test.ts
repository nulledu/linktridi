import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Preparar pra etiqueta tem DUAS formas, e quem escolhe é quem está de frente
 * pra prateleira.
 *
 * A pilha de 191 folhas do galpão pode ser duas coisas diferentes:
 *
 *   • 191 etiquetas de 1 peça (`modo: "peca"`, o comportamento de sempre) —
 *     serve pra coisa que sai uma a uma;
 *   • UMA etiqueta valendo 191 (`modo: "pilha"`) — a caixa lacrada, que é como
 *     a conferência da produção já cunha e como o galpão de fato guarda.
 *
 * A rota não pode decidir isso sozinha, e o modo novo não pode afrouxar nada
 * do que já estava de pé: o teto por item, o rollback dos três passos e a
 * recusa de saldo fracionário continuam valendo.
 */

// ── Quem chamou ──────────────────────────────────────────────────────────────
vi.mock("@/lib/require-auth", () => ({ getProfile: async () => ({ id: "u1", role: "admin", name: "Ana" }) }));
vi.mock("@/lib/perfis", () => ({ resolveMyModuleKeys: async () => ["estoque:ajustar"] }));

// ── Banco falso ──────────────────────────────────────────────────────────────
// Só `estoque_itens` importa aqui: a geração de etiqueta é mockada logo abaixo.
let itens: Record<string, unknown>[] = [];
const updates: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({
    from: (tabela: string) => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "in", "eq", "limit"]) b[m] = () => b;
      b.update = (payload: Record<string, unknown>) => { updates.push({ tabela, ...payload }); return b; };
      b.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: itens, error: null }).then(resolve);
      return b;
    },
  }),
}));

const gerar = vi.fn(async (input: { quantidade: number; pecasPorUnidade?: number }) =>
  Array.from({ length: input.quantidade }, (_, i) => ({
    id: `u${i}`, codigo: `PRD-1-${String(i + 1).padStart(6, "0")}`, seq: i + 1,
    pecas: input.pecasPorUnidade ?? 1,
  })));

vi.mock("@/lib/estoque-unidades-gerar", async () => {
  const real = await vi.importActual<typeof import("@/lib/estoque-unidades-gerar")>("@/lib/estoque-unidades-gerar");
  return { ...real, gerarUnidadesEmLotes: (i: { quantidade: number; pecasPorUnidade?: number }) => gerar(i) };
});

const { POST } = await import("../route");

interface Resultado { item_id: string; ok: boolean; geradas: number; pecas: number; erro?: string }

function pedido(corpo: Record<string, unknown>) {
  return { json: async () => corpo } as unknown as Parameters<typeof POST>[0];
}

async function preparar(corpo: Record<string, unknown>): Promise<{ modo: string; resultados: Resultado[]; resumo: { etiquetas: number } }> {
  const r = await POST(pedido(corpo));
  return await r.json();
}

const ITEM = { id: "i1", nome: "Folha de alavanca limpa", sku: null, hierarquia: "produto", serializado: false, quantidade: 191 };

beforeEach(() => { itens = [ITEM]; updates.length = 0; gerar.mockClear(); });

describe("modo pilha", () => {
  it("a pilha inteira vira UMA etiqueta valendo o saldo", async () => {
    const d = await preparar({ itens: [{ item_id: "i1" }], modo: "pilha" });
    expect(gerar).toHaveBeenCalledWith(expect.objectContaining({ quantidade: 1, pecasPorUnidade: 191 }));
    expect(d.resultados[0]).toMatchObject({ ok: true, geradas: 1, pecas: 191 });
    // O resumo conta ETIQUETAS, e a caixa é uma só.
    expect(d.resumo.etiquetas).toBe(1);
  });

  it("continua fazendo a dança de três passos — zerar, ligar, gerar", async () => {
    await preparar({ itens: [{ item_id: "i1" }], modo: "pilha" });
    expect(updates[0]).toMatchObject({ tabela: "estoque_itens", quantidade: 0 });
    expect(updates[1]).toMatchObject({ tabela: "estoque_itens", serializado: true });
  });

  it("falha ao gerar desfaz os dois passos anteriores", async () => {
    gerar.mockRejectedValueOnce(new Error("o banco caiu"));
    const d = await preparar({ itens: [{ item_id: "i1" }], modo: "pilha" });
    expect(d.resultados[0].ok).toBe(false);
    // Volta ao estado de antes: sem etiqueta e com as 191 na contagem.
    expect(updates.some((u) => u.serializado === false)).toBe(true);
    expect(updates.filter((u) => u.quantidade === 191)).toHaveLength(1);
  });

  it("o teto por item não se aplica — é UMA linha pro gatilho recontar", async () => {
    itens = [{ ...ITEM, quantidade: 5000 }];
    const d = await preparar({ itens: [{ item_id: "i1" }], modo: "pilha" });
    expect(d.resultados[0]).toMatchObject({ ok: true, geradas: 1, pecas: 5000 });
  });
});

describe("modo peça (o de sempre)", () => {
  it("é o default — quem não manda `modo` continua recebendo N etiquetas de 1", async () => {
    const d = await preparar({ itens: [{ item_id: "i1" }] });
    expect(d.modo).toBe("peca");
    expect(gerar).toHaveBeenCalledWith(expect.objectContaining({ quantidade: 191 }));
    // O que importa é NÃO VIRAR CAIXA. `undefined` e `1` são o mesmo pro
    // motor (`gerarUnidades` só grava a coluna `quantidade` quando pecas > 1),
    // e travar a forma exata da chamada impedia a caixa de existir sem que
    // nada de fato mudasse aqui.
    expect(gerar.mock.calls[0][0].pecasPorUnidade ?? 1).toBe(1);
    expect(d.resultados[0]).toMatchObject({ ok: true, geradas: 191, pecas: 1 });
  });

  it("EM CAIXAS: 93 travas de 50 viram 2 etiquetas, não 93", async () => {
    // O caso do dono: "a etiqueta vai ser por caixa, uma caixa cabem muitas
    // unidades". O item tem 93 em estoque e nenhuma etiqueta; etiquetar peça a
    // peça gastaria 93 papéis pra coisa que mora em duas caixas.
    gerar.mockClear();
    await POST(pedido({ itens: [{ item_id: "i1", quantidade: 93 }], pecasPorEtiqueta: 50 }));
    // Dois lotes: a caixa cheia e o resto. A última DIZ 43 — a trigger do banco
    // soma PEÇA, e uma segunda etiqueta de 50 inventaria 7 travas.
    expect(gerar.mock.calls.map((c) => c[0])).toEqual([
      expect.objectContaining({ quantidade: 1, pecasPorUnidade: 50 }),
      expect.objectContaining({ quantidade: 1, pecasPorUnidade: 43 }),
    ]);
  });

  it("a caixa que divide exato não gera lote de sobra", async () => {
    gerar.mockClear();
    await POST(pedido({ itens: [{ item_id: "i1", quantidade: 100 }], pecasPorEtiqueta: 50 }));
    expect(gerar.mock.calls).toHaveLength(1);
    expect(gerar.mock.calls[0][0]).toEqual(expect.objectContaining({ quantidade: 2, pecasPorUnidade: 50 }));
  });

  it("caixa MAIOR que o saldo é uma etiqueta com o saldo — não uma caixa mentindo", async () => {
    // 93 travas numa caixa de 500 não são 500 travas: a etiqueta diz 93.
    gerar.mockClear();
    await POST(pedido({ itens: [{ item_id: "i1", quantidade: 93 }], pecasPorEtiqueta: 500 }));
    expect(gerar.mock.calls[0][0]).toEqual(expect.objectContaining({ quantidade: 1, pecasPorUnidade: 93 }));
  });

  it("o teto de 2000 continua de pé, e a frase agora oferece a saída", async () => {
    itens = [{ ...ITEM, quantidade: 5000 }];
    const d = await preparar({ itens: [{ item_id: "i1" }] });
    expect(d.resultados[0].ok).toBe(false);
    expect(d.resultados[0].erro).toMatch(/máximo 2000/);
    expect(d.resultados[0].erro).toMatch(/uma caixa só/);
    expect(gerar).not.toHaveBeenCalled();
  });
});

describe("o que nenhum dos modos pode fazer", () => {
  it("saldo fracionário é recusado com frase, antes de zerar coisa nenhuma", async () => {
    itens = [{ ...ITEM, quantidade: 2.5, unidade: "kg" }];
    for (const modo of ["peca", "pilha"]) {
      updates.length = 0;
      const d = await preparar({ itens: [{ item_id: "i1" }], modo });
      expect(d.resultados[0].ok, modo).toBe(false);
      expect(d.resultados[0].erro, modo).toContain("2,5");
      // O passo 1 zera a contagem: se ele tivesse rodado, o meio quilo já era.
      expect(updates, modo).toHaveLength(0);
    }
    expect(gerar).not.toHaveBeenCalled();
  });

  it("quantidade fracionária DIGITADA é recusada do mesmo jeito", async () => {
    const d = await preparar({ itens: [{ item_id: "i1", quantidade: "10,5" }] });
    expect(d.resultados[0].ok).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("item que JÁ é etiquetado não é preparado de novo — isso dobraria o estoque", async () => {
    // Num item serializado a `quantidade` é a contagem das etiquetas (gatilho).
    // Usá-la como alvo cunharia uma segunda leva do mesmo saldo — o segundo
    // clique no botão da Conferir.
    itens = [{ ...ITEM, serializado: true }];
    const d = await preparar({ itens: [{ item_id: "i1" }], modo: "pilha" });
    expect(d.resultados[0].ok).toBe(false);
    expect(d.resultados[0].erro).toMatch(/já é etiquetado/);
    expect(gerar).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });
});

describe("quem pode", () => {
  it("modo nenhum abre porta lateral: sem poder de ajuste, 403", async () => {
    vi.resetModules();
    vi.doMock("@/lib/require-auth", () => ({ getProfile: async () => ({ id: "u2", role: "colaborador", name: "Beto" }) }));
    vi.doMock("@/lib/perfis", () => ({ resolveMyModuleKeys: async () => ["estoque:itens"] }));
    const { POST: POST2 } = await import("../route");
    const r = await POST2(pedido({ itens: [{ item_id: "i1" }], modo: "pilha" }));
    expect(r.status).toBe(403);
    vi.doUnmock("@/lib/require-auth");
    vi.doUnmock("@/lib/perfis");
  });
});
