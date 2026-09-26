import { describe, expect, it } from "vitest";
import { idsDeRelacionados, idsDoRelacionado, marcaRelacionada } from "@/lib/financeiro/marca-relacionada";
import type { Empresa, Fornecedor, ParteFinanceira } from "@/lib/financeiro/tipos";

const CONTATO = "contato-1";
const FORNECEDOR = "fornecedor-1";
const EMPRESA = "empresa-1";

const parte = {
  id: CONTATO,
  empresa_id: EMPRESA,
  nome: "Pessoa canônica",
  natureza: "pessoa",
  logo_url: "logos/contato.png",
  icone: "user",
  fornecedor: { id: FORNECEDOR },
} as ParteFinanceira;

const fornecedor = {
  id: FORNECEDOR,
  empresa_id: EMPRESA,
  nome: "Fornecedor legado",
  logo_url: "logos/fornecedor.png",
  icone: "truck",
} as Fornecedor;

const empresa = {
  id: EMPRESA,
  nome: "Tridi",
  logo_url: "logos/empresa.png",
  icone: "building-warehouse",
} as Empresa;

const conta = {
  id: "conta-1",
  empresa_id: EMPRESA,
  nome: "Conta principal",
  logo_url: "logos/conta.png",
  icone: "wallet",
};

describe("marca relacionada a um compromisso", () => {
  it("prioriza o contato explícito sobre fornecedor e empresa", () => {
    const marca = marcaRelacionada(
      { empresa_id: EMPRESA, contato_id: CONTATO, fornecedor_id: FORNECEDOR },
      [parte],
      [fornecedor],
      empresa,
    );

    expect(marca).toEqual({
      origem: "contato",
      id: CONTATO,
      nome: "Pessoa canônica",
      logo_url: "logos/contato.png",
      icone: "user",
    });
  });

  it("resolve um fornecedor para a identidade canônica ligada", () => {
    const marca = marcaRelacionada(
      { empresa_id: EMPRESA, contato_id: null, fornecedor_id: FORNECEDOR },
      [parte],
      [fornecedor],
      empresa,
    );

    expect(marca).toEqual({
      origem: "fornecedor",
      id: CONTATO,
      nome: "Pessoa canônica",
      logo_url: "logos/contato.png",
      icone: "user",
    });
  });

  it("preserva nome e imagem do fornecedor legado sem vínculo canônico", () => {
    const marca = marcaRelacionada(
      { empresa_id: EMPRESA, contato_id: null, fornecedor_id: FORNECEDOR },
      [],
      [fornecedor],
      empresa,
    );

    expect(marca).toEqual({
      origem: "fornecedor",
      id: FORNECEDOR,
      nome: "Fornecedor legado",
      logo_url: "logos/fornecedor.png",
      icone: "truck",
    });
  });

  it("usa a empresa financeira proprietária quando não há relacionado", () => {
    const marca = marcaRelacionada(
      { empresa_id: EMPRESA, contato_id: null, fornecedor_id: null },
      [parte],
      [fornecedor],
      empresa,
    );

    expect(marca).toEqual({
      origem: "empresa",
      id: EMPRESA,
      nome: "Tridi",
      logo_url: "logos/empresa.png",
      icone: "building-warehouse",
    });
  });

  it("NÃO empresta a logo do banco pra quem não tem a sua", () => {
    const marca = marcaRelacionada(
      { empresa_id: EMPRESA, conta_id: conta.id, contato_id: CONTATO, fornecedor_id: null },
      [{ ...parte, logo_url: null }],
      [fornecedor],
      empresa,
      conta,
    );

    // Sem foto própria, a linha fica SEM foto e cai no ícone da categoria —
    // a marca do banco identificaria outra entidade que não a da linha.
    expect(marca).toEqual({
      origem: "contato",
      id: CONTATO,
      nome: "Pessoa canônica",
      logo_url: null,
      icone: "user",
    });
  });

  it("usa a conta como identidade visual quando não há relacionado explícito", () => {
    const marca = marcaRelacionada(
      { empresa_id: EMPRESA, conta_id: conta.id, contato_id: null, fornecedor_id: null },
      [parte],
      [fornecedor],
      empresa,
      conta,
    );

    expect(marca).toEqual({
      origem: "conta",
      id: conta.id,
      nome: "Conta principal",
      logo_url: "logos/conta.png",
      icone: "wallet",
    });
  });
});

describe("valor do seletor relacionado", () => {
  it("preenche somente contato_id para pessoas e empresas", () => {
    expect(idsDoRelacionado(`contato:${CONTATO}`)).toEqual({
      contato_id: CONTATO,
      fornecedor_id: "",
    });
  });

  it("preenche somente fornecedor_id para fornecedores", () => {
    expect(idsDoRelacionado(`fornecedor:${FORNECEDOR}`)).toEqual({
      contato_id: "",
      fornecedor_id: FORNECEDOR,
    });
  });

  it("limpa as duas FKs para valor vazio ou inválido", () => {
    expect(idsDoRelacionado("")).toEqual({ contato_id: "", fornecedor_id: "" });
    expect(idsDoRelacionado("outro:123")).toEqual({ contato_id: "", fornecedor_id: "" });
  });
});

describe("IDs relacionados visíveis na agenda", () => {
  it("deduplica compromissos, recorrências e previsões sem perder alvos históricos", () => {
    expect(idsDeRelacionados(
      [{ contato_id: "contato-inativo", fornecedor_id: null }],
      [{ contato_id: null, fornecedor_id: "fornecedor-fora" }],
      [{ contato_id: "contato-inativo", fornecedor_id: "fornecedor-inativo" }],
    )).toEqual({
      contatoIds: ["contato-inativo"],
      fornecedorIds: ["fornecedor-fora", "fornecedor-inativo"],
    });
  });
});
