import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O singular e a lista contam a MESMA história.
 *
 * `fin_contatos` tem `telefone` (legado, um) e `telefones` (a lista que a TELA
 * mostra) — e o mesmo par em `categoria`/`categorias`. A função de gravação
 * escreve a lista só quando o pedido a traz, e a tela de FORNECEDORES não traz:
 * ela manda `contato_fone`, que é o campo da extensão comercial.
 *
 * Medido em produção: editar o telefone pelo Fornecedores mudava `telefone` e
 * deixava `telefones` com o número ANTIGO. Como a ficha e o formulário leem a
 * lista, a tela mostrava o número velho depois de salvar. É o "não está
 * salvando" que não é escrita nenhuma — é duas colunas discordando.
 *
 * O que este arquivo guarda é o que uma correção apressada quebraria: alinhar
 * NÃO pode apagar os outros números. Um contato tem o WhatsApp pessoal e o da
 * empresa, e trocar um não pode custar o outro.
 */

const supa = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => supa }));

/** O que a tabela devolve quando alguém lê as listas atuais. */
function contatoTem(listas: { telefones?: string[] | null; categorias?: string[] | null }) {
  supa.from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: listas, error: null }) }) }),
  });
}

/** O `p_entrada` que chegou na função de gravação. */
const entradaEnviada = () => supa.rpc.mock.calls.at(-1)![1].p_entrada as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  supa.rpc.mockResolvedValue({ data: { contato_id: "c1", fornecedor_id: null }, error: null });
  contatoTem({ telefones: [], categorias: [] });
});

const salvar = async (entrada: Record<string, unknown>) => {
  const { salvarParte } = await import("@/lib/financeiro/salvar-parte");
  return salvarParte({ entrada: { empresa_id: "e1", nome: "Packit", ...entrada }, userId: "u1" });
};

describe("Telefone vindo da extensão comercial", () => {
  it("`contato_fone` alimenta a LISTA, que é o que a tela mostra", async () => {
    contatoTem({ telefones: ["11 4538-5909"] });
    await salvar({ id: "c1", papeis: ["fornecedor"], fornecedor: { contato_fone: "11 93333-4444" } });
    expect(entradaEnviada().telefones).toEqual(["11 93333-4444", "11 4538-5909"]);
  });

  it("o número novo fica na FRENTE — é o principal", async () => {
    contatoTem({ telefones: ["11 1111-1111", "11 2222-2222"] });
    await salvar({ id: "c1", papeis: ["fornecedor"], fornecedor: { contato_fone: "11 9999-9999" } });
    expect(entradaEnviada().telefones![0 as never]).toBe("11 9999-9999");
  });

  it("NÃO apaga os outros números", async () => {
    // O contato tem o WhatsApp pessoal e o da empresa; trocar um não pode
    // custar o outro. É o erro que uma correção apressada cometeria.
    contatoTem({ telefones: ["pessoal", "empresa"] });
    await salvar({ id: "c1", papeis: ["fornecedor"], fornecedor: { contato_fone: "novo" } });
    expect(entradaEnviada().telefones).toEqual(["novo", "pessoal", "empresa"]);
  });

  it("não duplica quando o número já estava na lista", async () => {
    contatoTem({ telefones: ["a", "b"] });
    await salvar({ id: "c1", papeis: ["fornecedor"], fornecedor: { contato_fone: "b" } });
    expect(entradaEnviada().telefones).toEqual(["b", "a"]);
  });

  it("cadastro NOVO não vai ao banco procurar lista que não existe", async () => {
    await salvar({ papeis: ["fornecedor"], fornecedor: { contato_fone: "11 90000-0000" } });
    expect(entradaEnviada().telefones).toEqual(["11 90000-0000"]);
    expect(supa.from, "leu o banco para um contato que ainda não existe").not.toHaveBeenCalled();
  });
});

describe("Quem manda a lista, manda", () => {
  it("`telefones` explícito não é tocado", async () => {
    // A tela de Contatos manda a lista inteira, na ordem que a pessoa arrumou.
    contatoTem({ telefones: ["velho"] });
    await salvar({ id: "c1", telefones: ["um", "dois"], telefone: "outro" });
    expect(entradaEnviada().telefones).toEqual(["um", "dois"]);
  });

  it("lista vazia é uma decisão, não ausência", async () => {
    contatoTem({ telefones: ["velho"] });
    await salvar({ id: "c1", telefones: [] });
    expect(entradaEnviada().telefones).toEqual([]);
  });
});

describe("O mesmo vale para categoria", () => {
  it("`categoria` singular alimenta a lista", async () => {
    contatoTem({ categorias: ["Embalagem"] });
    await salvar({ id: "c1", categoria: "Frete" });
    expect(entradaEnviada().categorias).toEqual(["Frete", "Embalagem"]);
  });

  it("os dois pares são alinhados na MESMA ida ao banco", async () => {
    contatoTem({ telefones: ["t"], categorias: ["c"] });
    await salvar({ id: "c1", telefone: "novo-t", categoria: "novo-c" });
    expect(entradaEnviada().telefones).toEqual(["novo-t", "t"]);
    expect(entradaEnviada().categorias).toEqual(["novo-c", "c"]);
    expect(supa.from, "duas leituras para alinhar o mesmo contato").toHaveBeenCalledTimes(1);
  });
});

describe("Quando não dá para ler", () => {
  it("deixa como estava — perder um telefone é pior que a divergência", async () => {
    supa.from.mockImplementation(() => { throw new Error("sem rede"); });
    await salvar({ id: "c1", papeis: ["fornecedor"], fornecedor: { contato_fone: "novo" } });
    expect(entradaEnviada().telefones).toBeUndefined();
  });
});

describe("Sem telefone no pedido, nada acontece", () => {
  it("não inventa lista nem vai ao banco", async () => {
    await salvar({ id: "c1", email: "a@b.c" });
    expect(entradaEnviada().telefones).toBeUndefined();
    expect(supa.from).not.toHaveBeenCalled();
  });
});
