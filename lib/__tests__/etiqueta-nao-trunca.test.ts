import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Etiqueta não se parte pela metade — e cortar calado é pior que recusar.
 *
 * `gerarUnidades` abria com `Math.trunc(input.quantidade)`. Parecia defesa
 * ("a coluna é int, então garanto que é int"), mas era o contrário: 2,5 kg de
 * cola viravam 2 etiquetas, o banco aceitava feliz e o meio quilo sumia PRA
 * SEMPRE — sem erro, sem log, sem ninguém pra reconferir. O mesmo valia pra
 * `pecasPorUnidade` (a caixa lacrada) e pro fatiador `gerarUnidadesEmLotes`,
 * que truncava ANTES de `gerarUnidades` ter chance de ver o número original.
 *
 * Item medido em peso, volume ou comprimento não se etiqueta por unidade: a
 * contagem digitada é o instrumento dele. Recusar é o que faz alguém descobrir
 * isso no dia, em vez de num inventário meses depois.
 */

const insercoes: Record<string, unknown>[][] = [];

// Banco falso mínimo: o item existe, é serializado, tem SKU, e todo insert em
// `estoque_unidades` volta as linhas que entraram. O que importa nos testes é
// se a geração chega até aqui — quando ela recusa, `insercoes` fica vazio.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({
    from: (tabela: string) => {
      const b: Record<string, unknown> = {};
      let ultimoInsert: Record<string, unknown>[] = [];
      for (const m of ["select", "eq", "order", "limit", "update", "ilike"]) b[m] = () => b;
      b.maybeSingle = async () => ({ data: { id: "i1", sku: "PRD-1", hierarquia: "produto", serializado: true }, error: null });
      b.insert = (linhas: Record<string, unknown>[]) => {
        ultimoInsert = linhas;
        insercoes.push(linhas);
        return b;
      };
      b.then = (resolve: (v: unknown) => unknown) => {
        // `select("seq")` da corrida de sequencial (lista) × insert (lista).
        const data = tabela === "estoque_unidades" && ultimoInsert.length
          ? ultimoInsert.map((l, i) => ({ id: `u${i}`, codigo: String(l.codigo), seq: l.seq }))
          : [];
        return Promise.resolve({ data, error: null }).then(resolve);
      };
      return b;
    },
  }),
}));

const { gerarUnidades, gerarUnidadesEmLotes, ErroQuantidadeFracionaria, fraseQuantidadeFracionaria } =
  await import("../estoque-unidades-gerar");

const PEDIDO = { item_id: "i1", origem: "manual" as const };

beforeEach(() => { insercoes.length = 0; });

describe("gerarUnidades", () => {
  it("recusa quantidade fracionária em vez de truncar", async () => {
    await expect(gerarUnidades({ ...PEDIDO, quantidade: 2.5 })).rejects.toBeInstanceOf(ErroQuantidadeFracionaria);
    // A prova de que não cortou: nenhuma linha chegou ao banco.
    expect(insercoes).toHaveLength(0);
  });

  it("carrega a quantidade original no erro — a frase precisa dizer QUAL número", async () => {
    const erro = await gerarUnidades({ ...PEDIDO, quantidade: 2.5 }).catch((e) => e);
    expect(erro.quantidade).toBe(2.5);
    expect(erro.frase).toContain("2,5"); // vírgula: quem lê está no galpão
  });

  it("recusa quantidade que nem número é", async () => {
    await expect(gerarUnidades({ ...PEDIDO, quantidade: Number("abc") })).rejects.toBeInstanceOf(ErroQuantidadeFracionaria);
    expect(insercoes).toHaveLength(0);
  });

  it("recusa CAIXA fracionária — a mesma coluna int, o mesmo saldo apagado", async () => {
    await expect(gerarUnidades({ ...PEDIDO, quantidade: 1, pecasPorUnidade: 190.5 }))
      .rejects.toBeInstanceOf(ErroQuantidadeFracionaria);
    expect(insercoes).toHaveLength(0);
  });

  it("inteiro continua passando, e a caixa continua sendo UMA etiqueta de N peças", async () => {
    const uma = await gerarUnidades({ ...PEDIDO, quantidade: 1, pecasPorUnidade: 191 });
    expect(uma).toHaveLength(1);
    expect(uma[0].pecas).toBe(191);
    expect(insercoes[0][0].quantidade).toBe(191);
  });

  it("quantidade zero continua sendo silêncio, não erro", async () => {
    await expect(gerarUnidades({ ...PEDIDO, quantidade: 0 })).resolves.toEqual([]);
  });
});

describe("gerarUnidadesEmLotes", () => {
  it("recusa a fração ANTES de fatiar — senão o fatiador esconde o número original", async () => {
    await expect(gerarUnidadesEmLotes({ ...PEDIDO, quantidade: 1200.5 }))
      .rejects.toBeInstanceOf(ErroQuantidadeFracionaria);
    expect(insercoes).toHaveLength(0);
  });

  it("lote grande inteiro continua fatiado no teto de 500", async () => {
    const geradas = await gerarUnidadesEmLotes({ ...PEDIDO, quantidade: 1200 });
    expect(geradas).toHaveLength(1200);
    expect(insercoes.map((l) => l.length)).toEqual([500, 500, 200]);
  });
});

describe("a frase", () => {
  it("diz o que fazer, não o nome do erro", () => {
    const f = fraseQuantidadeFracionaria(2.5);
    expect(f).toContain("2,5");
    expect(f).toMatch(/contagem digitada/);
    expect(f).not.toMatch(/quantidade_fracionaria/);
  });

  it("aguenta um número que não é número", () => {
    expect(fraseQuantidadeFracionaria(Number("abc"))).toMatch(/não é um número/);
  });
});
