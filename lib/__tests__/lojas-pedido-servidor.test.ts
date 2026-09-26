import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O SERVIDOR precifica. O cliente só diz o que quer.
 *
 * Esta é a regra que sustenta o checkout inteiro. A rota é a única escrita do
 * sistema aberta a quem não tem sessão, e o corpo dela é público: quem abre o
 * DevTools consegue mandar o JSON que quiser. Se o preço viesse de lá, um
 * `precoUnitario: 0.01` entraria bonitinho na lista do lojista e ninguém
 * perceberia até conferir o caixa.
 *
 * O teste mente o banco (não a rota) e confere o que foi GRAVADO — é o único
 * lugar onde a diferença entre "confia" e "recalcula" aparece.
 */

const insercoes: Record<string, unknown>[] = [];
let produtosNoBanco: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({
    from(tabela: string) {
      if (tabela === "loja_produtos") {
        const q = {
          select: () => q, eq: () => q, in: () => q,
          limit: () => Promise.resolve({ data: produtosNoBanco, error: null }),
        };
        return q;
      }
      // loja_pedidos
      return {
        insert(linha: Record<string, unknown>) {
          insercoes.push(linha);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { numero: 1, total: linha.total }, error: null }),
            }),
          };
        },
      };
    },
  }),
}));

const { criarPedidoDaVitrine, PedidoRecusado } = await import("../lojas-db");

const LOJA = {
  id: "11111111-1111-4111-8111-111111111111",
  nome: "Carimbos Tridi", slug: "carimbos-tridi", dominio: null,
  status: "publicada", checkout: "proprio", whatsapp: "", cor: "", criadaEm: "",
} as unknown as Parameters<typeof criarPedidoDaVitrine>[0];

const CONTATO = { nome: "Marina", telefone: "14998544623", email: "", observacao: "" };
const ID = "22222222-2222-4222-8222-222222222222";

const produto = (extra: Record<string, unknown> = {}) => ({
  id: ID, titulo: "Carimbo de Cera", preco: "157.90", preco_promocional: "115.90",
  estoque: 10, vender_sem_estoque: false, status: "ativo", ...extra,
});

beforeEach(() => { insercoes.length = 0; produtosNoBanco = [produto()]; });

describe("o preço vem do banco, nunca do corpo", () => {
  it("ignora qualquer preço que o cliente tenha mandado", async () => {
    // O corpo aceito pela função tem SÓ produtoId e quantidade — é a própria
    // assinatura que fecha a porta. Este teste trava isso: se alguém um dia
    // acrescentar `precoUnitario` à entrada, o gravado deixa de bater.
    const r = await criarPedidoDaVitrine(LOJA, [{ produtoId: ID, quantidade: 2 }], CONTATO);
    // 115,90 (promocional do BANCO) × 2 — não 157,90 e não 0,01.
    expect(r.total).toBeCloseTo(231.8, 2);
    expect(insercoes[0].total).toBeCloseTo(231.8, 2);
    const itens = insercoes[0].itens as { precoUnitario: number; titulo: string }[];
    expect(itens[0].precoUnitario).toBeCloseTo(115.9, 2);
  });

  it("o TÍTULO gravado também é o do banco", async () => {
    // Senão o pedido guardaria o nome que o navegador inventou, e a lista do
    // lojista mostraria um produto que não existe.
    await criarPedidoDaVitrine(LOJA, [{ produtoId: ID, quantidade: 1 }], CONTATO);
    const itens = insercoes[0].itens as { titulo: string }[];
    expect(itens[0].titulo).toBe("Carimbo de Cera");
  });

  it("sem promoção, vale o preço cheio", async () => {
    produtosNoBanco = [produto({ preco_promocional: null })];
    const r = await criarPedidoDaVitrine(LOJA, [{ produtoId: ID, quantidade: 1 }], CONTATO);
    expect(r.total).toBeCloseTo(157.9, 2);
  });

  it("o pedido nasce pendente e marcado como vindo da vitrine", async () => {
    await criarPedidoDaVitrine(LOJA, [{ produtoId: ID, quantidade: 1 }], CONTATO);
    expect(insercoes[0].pagamento).toBe("pendente");
    expect(insercoes[0].envio).toBe("nao_enviado");
    expect(insercoes[0].origem).toBe("vitrine");
    // `numero` fica de fora: quem preenche é o gatilho, com trava por loja.
    expect(insercoes[0].numero).toBeUndefined();
  });
});

describe("o que o servidor recusa", () => {
  const pedir = (itens: { produtoId: string; quantidade: number }[], contato = CONTATO) =>
    criarPedidoDaVitrine(LOJA, itens, contato);

  it("produto que saiu do ar", async () => {
    produtosNoBanco = [produto({ status: "rascunho" })];
    await expect(pedir([{ produtoId: ID, quantidade: 1 }])).rejects.toThrow(PedidoRecusado);
  });

  it("produto de outra loja (não veio na consulta filtrada por loja)", async () => {
    produtosNoBanco = [];
    await expect(pedir([{ produtoId: ID, quantidade: 1 }])).rejects.toThrow(PedidoRecusado);
  });

  it("quantidade acima do estoque", async () => {
    produtosNoBanco = [produto({ estoque: 3 })];
    await expect(pedir([{ produtoId: ID, quantidade: 4 }])).rejects.toThrow(/só restam 3/i);
  });

  it("esgotado diz esgotado, não 'restam 0'", async () => {
    produtosNoBanco = [produto({ estoque: 0 })];
    await expect(pedir([{ produtoId: ID, quantidade: 1 }])).rejects.toThrow(/esgotado/i);
  });

  it("sob encomenda passa mesmo com estoque zero", async () => {
    produtosNoBanco = [produto({ estoque: 0, vender_sem_estoque: true })];
    await expect(pedir([{ produtoId: ID, quantidade: 5 }])).resolves.toBeDefined();
  });

  it("quantidade zero, negativa ou absurda", async () => {
    await expect(pedir([{ produtoId: ID, quantidade: 0 }])).rejects.toThrow(PedidoRecusado);
    await expect(pedir([{ produtoId: ID, quantidade: -3 }])).rejects.toThrow(PedidoRecusado);
    await expect(pedir([{ produtoId: ID, quantidade: 5000 }])).rejects.toThrow(PedidoRecusado);
  });

  it("carrinho vazio e contato faltando", async () => {
    await expect(pedir([])).rejects.toThrow(/vazio/i);
    await expect(pedir([{ produtoId: ID, quantidade: 1 }], { ...CONTATO, nome: "  " })).rejects.toThrow(/nome/i);
    await expect(pedir([{ produtoId: ID, quantidade: 1 }], { ...CONTATO, telefone: "" })).rejects.toThrow(/telefone/i);
  });
});
