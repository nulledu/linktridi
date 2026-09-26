import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Contato, Fornecedor } from "@/lib/financeiro/tipos";

const chamadas: { tabela: string; colunas: string; contatoIds?: string[]; ids?: string[]; filtros: [string, string][] }[] = [];
let schemaAntigo = false;
let schemaFornecedorBase = false;
let fornecedorForaDaPagina = false;

const contatoAtual: Contato & { papeis: unknown; cnpj: string } = {
  id: "contato-1", empresa_id: "empresa-1", nome: "Atlas Aços", natureza: "empresa",
  organizacao_id: null, categoria: null, categorias: [], telefone: null, telefones: [],
  email: null, endereco: null, tipo: null, cargo: null, organizacao: null, site: null,
  observacao: null, ativo: true, papeis: ["contato", "fornecedor", "fornecedor", "invalido"],
  cnpj: "12345678000199",
};

const fornecedorAtual: Fornecedor & { contato_id: string } = {
  id: "fornecedor-1", empresa_id: "empresa-1", nome: "Atlas Aços", cnpj: "12345678000199",
  categoria: null, categorias: [], contato_nome: null, contato_email: null, contato_fone: null,
  prazo_dias: null, prazo_envio_dias: null, forma_pagamento: null, ativo: true,
  pix_tipo: null, pix_chave: null, banco: null, agencia: null, conta_numero: null,
  aceita_boleto: false, inscricao_estadual: null, site: null, whatsapp: null,
  cidade: null, uf: null, endereco: null, observacao: null, contato_id: "contato-1",
};

const contatoForaDaPagina = {
  ...contatoAtual, id: "contato-fora", nome: "Zeta Serviços", papeis: ["contato", "fornecedor"],
};

const contatoInativo = {
  ...contatoAtual, id: "contato-inativo", nome: "Arquivo Histórico", ativo: false,
  logo_url: "logos/contato-inativo.png", papeis: ["contato"],
};

const fornecedorInativo = {
  ...fornecedorAtual, id: "fornecedor-inativo", nome: "Fornecedor Histórico", ativo: false,
  contato_id: "contato-inativo", logo_url: "logos/fornecedor-inativo.png",
};

class Consulta {
  private contatoIds?: string[];
  private ids?: string[];
  private filtros: [string, string][] = [];
  constructor(private tabela: string, private colunas = "") {}
  select(colunas: string) { this.colunas = colunas; return this; }
  eq(coluna: string, valor: string) { this.filtros.push([coluna, valor]); return this; }
  in(coluna: string, valores: string[]) {
    if (coluna === "contato_id") this.contatoIds = valores;
    if (coluna === "id") this.ids = valores;
    return this;
  }
  is() { return this; }
  order() { return this; }
  limit() { return this; }
  then(resolver: (v: { data: unknown; error: unknown }) => void) {
    chamadas.push({ tabela: this.tabela, colunas: this.colunas, contatoIds: this.contatoIds, ids: this.ids, filtros: this.filtros });
    const semColunaNova = schemaAntigo && (
      (this.tabela === "fin_contatos" && /\bpapeis\b|\bcnpj\b/.test(this.colunas))
      || (this.tabela === "fin_fornecedores" && (/\bcontato_id\b/.test(this.colunas) || !!this.contatoIds))
    );
    const semColunasDeFornecedor = schemaFornecedorBase && this.tabela === "fin_fornecedores"
      && /\bcategorias\b|\bprazo_envio_dias\b/.test(this.colunas);
    if (semColunaNova || semColunasDeFornecedor) {
      resolver({ data: null, error: { code: "PGRST204", message: "column does not exist" } });
      return;
    }
    if (this.tabela === "fin_contatos") {
      if (this.ids) {
        const todos = [contatoAtual, contatoForaDaPagina, contatoInativo];
        resolver({ data: todos.filter((contato) => this.ids!.includes(contato.id)), error: null });
        return;
      }
      const contato = this.filtros.some(([coluna, valor]) => coluna === "id" && valor === "contato-fora")
        ? contatoForaDaPagina
        : contatoAtual;
      resolver({ data: [schemaAntigo ? { ...contato, papeis: undefined, cnpj: undefined } : contato], error: null });
      return;
    }
    const fornecedorLegado = schemaAntigo || schemaFornecedorBase
      ? { ...fornecedorAtual, contato_id: undefined }
      : fornecedorAtual;
    const foraDaPagina = { ...fornecedorAtual, id: "fornecedor-fora", nome: "A Primeira", contato_id: "contato-fora" };
    if (this.ids) {
      const todos = [fornecedorLegado, foraDaPagina, fornecedorInativo];
      resolver({ data: todos.filter((fornecedor) => this.ids!.includes(fornecedor.id)), error: null });
      return;
    }
    const fornecedorDireto = this.filtros.some(([coluna, valor]) => coluna === "id" && valor === "fornecedor-fora");
    const dados = fornecedorDireto || this.contatoIds?.includes("contato-fora")
      ? [foraDaPagina]
      : this.contatoIds
      ? (this.contatoIds.includes("contato-1") ? [fornecedorLegado] : [])
      : fornecedorForaDaPagina ? [foraDaPagina] : [fornecedorLegado];
    resolver({ data: dados, error: null });
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({ from: (tabela: string) => new Consulta(tabela) }),
}));

const moduloPartes = await import("@/lib/financeiro/partes");
const {
  normalizarPapeis, comporParte, incluirParteNaPagina, idsDeFornecedoresReferenciados,
  mesclarPartesRelacionadas, mesclarPorId,
} = moduloPartes;
const { partes, partePorId, contatoCanonicoDoFornecedor, partesReferenciadas } = await import("@/lib/financeiro/db");

beforeEach(() => {
  chamadas.length = 0;
  schemaAntigo = false;
  schemaFornecedorBase = false;
  fornecedorForaDaPagina = false;
});

describe("papéis de uma parte financeira", () => {
  it("descarta papéis inválidos e duplicados sem inventar um papel", () => {
    expect(normalizarPapeis(["fornecedor", "fornecedor", "invalido"])).toEqual(["fornecedor"]);
    expect(normalizarPapeis("fornecedor")).toEqual([]);
  });

  it("mantém o papel canônico explícito quando a extensão está inativa", () => {
    const fornecedorInativo = { ...fornecedorAtual, ativo: false };

    expect(comporParte(contatoAtual, fornecedorInativo)).toMatchObject({
      id: contatoAtual.id,
      papeis: ["contato", "fornecedor"],
      fornecedor: fornecedorInativo,
    });
  });

  it("infere o papel de fornecedor legado quando a extensão está ativa", () => {
    const contatoSemPapel = { ...contatoAtual, papeis: ["contato"] };

    expect(comporParte(contatoSemPapel, fornecedorAtual)).toMatchObject({
      id: contatoAtual.id,
      papeis: ["contato", "fornecedor"],
      fornecedor: fornecedorAtual,
    });
  });

  it("não infere o papel de fornecedor quando a extensão está inativa", () => {
    const contatoSemPapel = { ...contatoAtual, papeis: ["contato"] };
    const fornecedorInativo = { ...fornecedorAtual, ativo: false };

    expect(comporParte(contatoSemPapel, fornecedorInativo)).toMatchObject({
      id: contatoAtual.id,
      papeis: ["contato"],
      fornecedor: fornecedorInativo,
    });
  });
});

describe("consulta de partes", () => {
  it("lê cada tabela uma vez e relaciona a extensão pelo contato", async () => {
    const resultado = await partes("empresa-1");

    expect(resultado).toMatchObject({ pendente: false, dados: [{
      id: "contato-1", papeis: ["contato", "fornecedor"], cnpj: "12345678000199",
      fornecedor: { id: "fornecedor-1", contato_id: "contato-1" },
    }] });
    expect(chamadas.map((chamada) => chamada.tabela)).toEqual(["fin_contatos", "fin_fornecedores"]);
  });

  it("mantém a lista funcional quando a migração das novas colunas está pendente", async () => {
    schemaAntigo = true;

    const resultado = await partes("empresa-1");

    expect(resultado).toMatchObject({ pendente: false, dados: [{
      id: "contato-1", papeis: ["contato"], cnpj: null, fornecedor: null,
    }] });
    expect(chamadas).toHaveLength(4);
  });

  it("recua até o fornecedor base quando as colunas intermediárias não existem", async () => {
    schemaFornecedorBase = true;

    const resultado = await partes("empresa-1");

    expect(resultado).toMatchObject({ pendente: false, dados: [{ id: "contato-1", fornecedor: null }] });
    expect(chamadas.filter((chamada) => chamada.tabela === "fin_fornecedores")).toHaveLength(3);
  });

  it("busca extensões apenas dos contatos da página, sem perdê-las pela ordenação global", async () => {
    fornecedorForaDaPagina = true;

    const resultado = await partes("empresa-1", { limite: 1 });

    expect(resultado.dados[0].fornecedor).toMatchObject({ id: "fornecedor-1", contato_id: "contato-1" });
    // A primeira leitura sai SEM filtro, junto com os contatos (uma ida a
    // menos na tela). Como ela encostou no teto, não é o conjunto inteiro —
    // e só então vem a segunda, estreitada aos contatos da página.
    expect(chamadas.filter((chamada) => chamada.tabela === "fin_fornecedores").map((chamada) => chamada.contatoIds))
      .toEqual([undefined, ["contato-1"]]);
  });

  it("resolve o contato de um fornecedor diretamente, dentro do escopo", async () => {
    const resultado = await contatoCanonicoDoFornecedor("empresa-1", "fornecedor-fora");

    expect(resultado).toEqual({ dados: "contato-fora", pendente: false });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]).toMatchObject({
      tabela: "fin_fornecedores",
      filtros: expect.arrayContaining([["empresa_id", "empresa-1"], ["id", "fornecedor-fora"]]),
    });
  });

  it("carrega uma parte fora da primeira página pelo id canônico", async () => {
    const resultado = await partePorId("empresa-1", "contato-fora");

    expect(resultado).toMatchObject({
      pendente: false,
      dados: { id: "contato-fora", fornecedor: { id: "fornecedor-fora", contato_id: "contato-fora" } },
    });
    expect(chamadas.map((chamada) => chamada.tabela)).toEqual(["fin_contatos", "fin_fornecedores"]);
  });

  it("mantém o alvo canônico quando a extensão ainda não tem contato_id", async () => {
    schemaAntigo = true;

    const resultado = await partePorId("empresa-1", "contato-1");

    expect(resultado).toMatchObject({ pendente: false, dados: { id: "contato-1", fornecedor: null } });
  });

  it("carrega em lote identidade e extensão inativas referenciadas pelo histórico", async () => {
    const resultado = await partesReferenciadas(
      "empresa-1", ["contato-inativo"], ["fornecedor-inativo"],
    );

    expect(resultado).toMatchObject({
      pendente: false,
      dados: {
        partes: [{
          id: "contato-inativo", ativo: false, logo_url: "logos/contato-inativo.png",
          fornecedor: { id: "fornecedor-inativo", ativo: false },
        }],
        fornecedores: [{ id: "fornecedor-inativo", ativo: false }],
      },
    });
    expect(chamadas.map((chamada) => ({ tabela: chamada.tabela, ids: chamada.ids }))).toEqual([
      { tabela: "fin_fornecedores", ids: ["fornecedor-inativo"] },
      { tabela: "fin_contatos", ids: ["contato-inativo"] },
    ]);
  });

  it("busca diretamente IDs referenciados que ficaram fora do catálogo paginado", async () => {
    const resultado = await partesReferenciadas(
      "empresa-1", ["contato-fora"], ["fornecedor-fora"],
    );

    expect(resultado).toMatchObject({
      pendente: false,
      dados: {
        partes: [{ id: "contato-fora", fornecedor: { id: "fornecedor-fora" } }],
        fornecedores: [{ id: "fornecedor-fora" }],
      },
    });
    expect(chamadas.every((chamada) => !!chamada.ids?.length)).toBe(true);
  });
});

describe("contrato da página de contatos", () => {
  it("une o catálogo ativo aos fornecedores históricos fora do recorte", () => {
    expect(idsDeFornecedoresReferenciados(
      [{ id: "fornecedor-ativo" }],
      [
        { fornecedor_id: "fornecedor-inativo" },
        { fornecedor_id: "fornecedor-ativo" },
      ],
      [
        { fornecedor_id: "fornecedor-fora-do-catalogo" },
        { fornecedor_id: null },
      ],
    )).toEqual([
      "fornecedor-ativo",
      "fornecedor-inativo",
      "fornecedor-fora-do-catalogo",
    ]);
  });

  it("anexa o alvo do deep-link quando ele não pertence à página inicial", () => {
    const diretorio = [comporParte(contatoAtual, fornecedorAtual)];
    const fornecedorFora: Fornecedor & { contato_id: string } = {
      ...fornecedorAtual, id: "fornecedor-fora", contato_id: "contato-fora",
    };
    const alvo = comporParte(contatoForaDaPagina, fornecedorFora);

    expect(incluirParteNaPagina(diretorio, alvo).map((parte) => parte.id)).toEqual(["contato-1", "contato-fora"]);
  });

  it("mescla o alvo histórico e enriquece uma parte ativa com sua extensão inativa", () => {
    const ativa = comporParte(contatoInativo, null);
    const historica = comporParte(contatoInativo, fornecedorInativo);

    expect(mesclarPartesRelacionadas([ativa], [historica])).toMatchObject([{
      id: "contato-inativo",
      fornecedor: { id: "fornecedor-inativo", ativo: false },
    }]);
    expect(mesclarPartesRelacionadas([], [historica])).toHaveLength(1);
    expect(mesclarPorId([fornecedorAtual], [fornecedorInativo]).map((item) => item.id))
      .toEqual(["fornecedor-1", "fornecedor-inativo"]);
  });
});
