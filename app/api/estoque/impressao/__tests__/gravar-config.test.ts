import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * A rota RECUSA, com frase — ela não apara em silêncio.
 *
 * Antes, um corpo com 200mm de largura era simplesmente preso na faixa e
 * gravado como 72, e a resposta era `ok`. Quem mandou 200 voltava pro galpão
 * achando que a etiqueta tinha mudado de tamanho, e o papel dizia outra coisa.
 * Conserto silencioso numa ESCRITA é mentira com cara de sucesso — e o custo
 * dele é um rolo inteiro impresso errado antes de alguém desconfiar.
 *
 * A leitura continua aparando, e isso não é incoerência: lá o valor certo é
 * conhecido (o padrão do desenho) e a impressão do galpão não pode parar por
 * causa de uma linha antiga fora da faixa. Aqui não há valor a supor — há
 * alguém pedindo uma coisa que não existe.
 */

const gravar = vi.fn(async (..._args: unknown[]) => ({
  ok: true as const, config: { alturaMm: 15, larguraMm: 72, copias: 1, ocultos: [] },
}));
vi.mock("@/lib/estoque-etiqueta-config", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  gravarConfigImpressao: (...a: unknown[]) => gravar(...(a as [])),
  lerConfigImpressao: async () => ({
    alturaMm: 15, larguraMm: 72, copias: 1, ocultos: [],
    definida: true, faltaSql: false, atualizadoEm: null,
  }),
  lerSkusDeCaixa: async () => ({ skus: [], faltaSql: false }),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => ({}) }));

let quem: { id: string; role: string } | null = { id: "u1", role: "admin" };
let podeConfigurar = true;
vi.mock("../_gate", () => ({
  quemEstaPedindo: async () => quem,
  podeConfigurarImpressao: async () => podeConfigurar,
  podeLerImpressao: async () => true,
}));

const { GET, PATCH } = await import("../route");

function pedido(corpo: unknown) {
  return { json: async () => corpo } as unknown as Parameters<typeof PATCH>[0];
}

beforeEach(() => {
  gravar.mockClear();
  quem = { id: "u1", role: "admin" };
  podeConfigurar = true;
});

describe("PATCH /api/estoque/impressao", () => {
  it("grava o que está na faixa", async () => {
    const r = await PATCH(pedido({ alturaMm: 30, larguraMm: 48, copias: 2 }));
    expect(r.status).toBe(200);
    expect(gravar).toHaveBeenCalledOnce();
    expect(gravar.mock.calls[0][1]).toMatchObject({ alturaMm: 30, larguraMm: 48, copias: 2 });
  });

  it("largura maior que a cabeça térmica leva 400 com a frase — e NÃO grava", async () => {
    // O caso que motivou o teste: 200mm "salvo" como 72 é a pessoa descobrindo
    // no papel o que a resposta devia ter dito na hora.
    const r = await PATCH(pedido({ larguraMm: 200 }));
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.detalhe).toMatch(/largura vai de 25 a 72mm/);
    expect(j.detalhe).toMatch(/cabeça térmica/);
    expect(gravar).not.toHaveBeenCalled();
  });

  it("altura e vias fora da faixa também são recusadas, cada uma com a sua frase", async () => {
    expect((await PATCH(pedido({ alturaMm: 500 }))).status).toBe(400);
    expect((await PATCH(pedido({ copias: 40 }))).status).toBe(400);
    const j = await (await PATCH(pedido({ alturaMm: 0, larguraMm: 0, copias: 0 }))).json();
    expect(j.problemas).toHaveLength(3);
    expect(gravar).not.toHaveBeenCalled();
  });

  it("campo ausente mantém o que já estava — a tela salva um ajuste por vez", async () => {
    const r = await PATCH(pedido({ larguraMm: 48 }));
    expect(r.status).toBe(200);
    // Sem isto, mudar a largura devolveria a altura pra 15mm sem ninguém pedir.
    expect(gravar.mock.calls[0][1]).toMatchObject({ alturaMm: 15, larguraMm: 48, copias: 1 });
  });

  it("campo de etiqueta que não existe leva 400 com a lista do que existe", async () => {
    // No tablet a mesma chave é IGNORADA, e a assimetria é de propósito: lá não
    // há ninguém pra corrigir, e derrubar um lote offline por uma palavra seria
    // pior. Aqui há alguém esperando resposta — gravar "codigolegivel" faria o
    // ajuste sumir na leitura seguinte e a tela pareceria não salvar.
    const r = await PATCH(pedido({ ocultos: ["codigolegivel"] }));
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.detalhe).toContain("“codigolegivel”");
    expect(j.detalhe).toContain("codigo_legivel");
    expect(gravar).not.toHaveBeenCalled();
  });

  it("lista VAZIA é um pedido (liga tudo de novo), não uma ausência", async () => {
    // Se o `??` do route olhasse o tamanho em vez de `undefined`, desmarcar a
    // última caixinha seria impossível: a tela mandaria `[]`, o servidor leria
    // "não mexeu" e regravaria a lista antiga. A pessoa marcaria, salvaria, e
    // veria a caixinha voltar sozinha.
    const r = await PATCH(pedido({ ocultos: [] }));
    expect(r.status).toBe(200);
    expect(gravar.mock.calls[0][1]).toMatchObject({ ocultos: [] });
  });

  it("quem não pode configurar não passa, nem com o corpo certo", async () => {
    podeConfigurar = false;
    expect((await PATCH(pedido({ larguraMm: 48 }))).status).toBe(403);
    quem = null;
    expect((await PATCH(pedido({ larguraMm: 48 }))).status).toBe(403);
    expect(gravar).not.toHaveBeenCalled();
  });
});

describe("GET /api/estoque/impressao", () => {
  it("devolve a largura junto — é dela que a folha A4 e o tablet tiram o tamanho", async () => {
    const j = await (await GET()).json();
    expect(j.config).toEqual({ alturaMm: 15, larguraMm: 72, copias: 1, ocultos: [] });
  });
});
