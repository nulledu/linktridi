import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * A validação vale no SERVIDOR, não só no campo da tela.
 *
 * A tela é a primeira defesa e é a única que um `fetch` na mão contorna. O que
 * sai do outro lado desta rota é papel gasto num galpão — e um código de barras
 * ilegível colado numa prateleira só é descoberto semanas depois, quando alguém
 * tenta bipar e conclui que "o leitor está ruim".
 *
 * Por isso os três casos abaixo passam por AQUI, e não só pelo compositor.
 */

const enfileirar = vi.fn(async (..._args: unknown[]) => ({ ok: true as const, id: "trab-1" }));
vi.mock("@/lib/estoque-impressao-fila", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  enfileirar: (...a: unknown[]) => enfileirar(...(a as [])),
  listarFila: async () => ({ trabalhos: [], faltaSql: false }),
  listarTablets: async () => [],
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => ({}) }));

let quem: { id: string; role: string; name?: string } | null = { id: "u1", role: "admin", name: "Ana" };
let podeConfigurar = true;
vi.mock("../../_gate", () => ({
  quemEstaPedindo: async () => quem,
  podeConfigurarImpressao: async () => podeConfigurar,
  podeLerImpressao: async () => true,
}));

const { POST } = await import("../route");

function pedido(corpo: unknown) {
  return { json: async () => corpo } as unknown as Parameters<typeof POST>[0];
}

const ETIQUETA_OK = {
  titulo: "",
  linhas: [{ texto: "A3", tamanho: "grande", negrito: true }],
  codigo: "GAL-A-C3",
  mostrarCodigo: true,
  alturaMm: 30,
  copias: 1,
};

beforeEach(() => {
  enfileirar.mockClear();
  quem = { id: "u1", role: "admin", name: "Ana" };
  podeConfigurar = true;
});

describe("POST /api/estoque/impressao/trabalhos", () => {
  it("a etiqueta certa entra na fila do tablet escolhido", async () => {
    const r = await POST(pedido({ dispositivoId: "tablet-1", trabalho: ETIQUETA_OK }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, id: "trab-1" });
    expect(enfileirar).toHaveBeenCalledOnce();
    // O nome de quem mandou vem do PERFIL, nunca do corpo — a fila é registro
    // de quem gastou o rolo.
    expect(enfileirar.mock.calls[0][1]).toMatchObject({ porId: "u1", porNome: "Ana" });
  });

  it("código com acento é RECUSADO com frase, e nada entra na fila", async () => {
    const r = await POST(pedido({ dispositivoId: "tablet-1", trabalho: { ...ETIQUETA_OK, codigo: "SEÇÃO-A" } }));
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.error).toBe("recusado");
    expect(j.detalhe).toMatch(/sem acento|sem ç/i);
    expect(enfileirar).not.toHaveBeenCalled();
  });

  it("altura que espremeria a barra abaixo do legível é recusada, com o tamanho que falta", async () => {
    const r = await POST(pedido({ dispositivoId: "tablet-1", trabalho: { ...ETIQUETA_OK, alturaMm: 15 } }));
    expect(r.status).toBe(400);
    expect((await r.json()).detalhe).toMatch(/não cabe.*\d+mm/is);
    expect(enfileirar).not.toHaveBeenCalled();
  });

  it("etiqueta vazia não vira papel", async () => {
    const r = await POST(pedido({ dispositivoId: "tablet-1", trabalho: { linhas: [{ texto: "  " }], codigo: "" } }));
    expect(r.status).toBe(400);
    expect((await r.json()).detalhe).toMatch(/vazia/i);
  });

  it("sem destino é 400 com o motivo — 'qualquer tablet' faria sair duas vezes", async () => {
    const r = await POST(pedido({ trabalho: ETIQUETA_OK }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("sem_destino");
  });

  it("quem não pode configurar impressão não manda papel sair no galpão", async () => {
    podeConfigurar = false;
    const r = await POST(pedido({ dispositivoId: "tablet-1", trabalho: ETIQUETA_OK }));
    expect(r.status).toBe(403);
    expect(enfileirar).not.toHaveBeenCalled();
  });

  it("sem sessão, 403 — a rota nunca roda sem saber quem é", async () => {
    quem = null;
    expect((await POST(pedido({ dispositivoId: "t", trabalho: ETIQUETA_OK }))).status).toBe(403);
  });

  it("sem o SQL, a resposta DIZ o que rodar em vez de um 500 mudo", async () => {
    enfileirar.mockResolvedValueOnce({ ok: false, motivo: "sem_sql" } as never);
    const r = await POST(pedido({ dispositivoId: "tablet-1", trabalho: ETIQUETA_OK }));
    expect(r.status).toBe(409);
    expect((await r.json()).detalhe).toMatch(/estoque_impressao_livre\.sql/);
  });

  it("fila cheia aponta o que provavelmente aconteceu: o tablet está fora", async () => {
    enfileirar.mockResolvedValueOnce({ ok: false, motivo: "fila_cheia" } as never);
    const r = await POST(pedido({ dispositivoId: "tablet-1", trabalho: ETIQUETA_OK }));
    expect(r.status).toBe(409);
    expect((await r.json()).detalhe).toMatch(/desligado ou sem rede/i);
  });

  it("corpo que não é JSON não derruba a rota", async () => {
    const r = await POST({ json: async () => { throw new Error("boom"); } } as unknown as Parameters<typeof POST>[0]);
    expect(r.status).toBe(400);
  });
});
