import { describe, it, expect } from "vitest";
import {
  assinaturaDoCatalogo, montarCatalogo, quantidadeDoItem, rotuloDoLocal,
} from "../estoque-catalogo-consulta";

describe("rotuloDoLocal", () => {
  it("junta código e nome — um sozinho não resolve pra quem chegou hoje", () => {
    expect(rotuloDoLocal({ id: "1", codigo: "COR-A", nome: "Corredor A" })).toBe("COR-A · Corredor A");
  });

  it("não repete quando código e nome são a mesma coisa", () => {
    expect(rotuloDoLocal({ id: "1", codigo: "Galpão", nome: "galpão" })).toBe("Galpão");
  });

  it("aceita só um dos dois, e devolve null quando não há local", () => {
    expect(rotuloDoLocal({ id: "1", codigo: "P-12", nome: null })).toBe("P-12");
    expect(rotuloDoLocal({ id: "1", codigo: "", nome: "Mezanino" })).toBe("Mezanino");
    expect(rotuloDoLocal(null)).toBe(null);
    expect(rotuloDoLocal({ id: "1", codigo: " ", nome: " " })).toBe(null);
  });
});

describe("quantidadeDoItem", () => {
  it("aceita o numeric do Postgres em string, inclusive fracionário", () => {
    expect(quantidadeDoItem("20.00")).toBe(20);
    expect(quantidadeDoItem("2.5")).toBe(2.5);
    expect(quantidadeDoItem(7)).toBe(7);
  });

  it("nunca devolve NaN — o que não é número é zero", () => {
    expect(quantidadeDoItem(null)).toBe(0);
    expect(quantidadeDoItem(undefined)).toBe(0);
    expect(quantidadeDoItem("abc")).toBe(0);
  });
});

describe("montarCatalogo", () => {
  const locais = [{ id: "L1", codigo: "COR-A", nome: "Corredor A" }];

  it("monta a linha que o tablet guarda, com o local já pronto pra tela", () => {
    const [linha] = montarCatalogo(
      [{ id: "i1", nome: "MDF 6mm", sku: "MDF6MM", categoria: "Insumos", unidade: "ch", quantidade: "12", local_id: "L1" }],
      locais,
    );
    expect(linha).toEqual({
      id: "i1", nome: "MDF 6mm", sku: "MDF6MM", categoria: "Insumos",
      unidade: "ch", quantidade: 12, local: "COR-A · Corredor A",
    });
  });

  it("item sem local vira linha sem local — a pergunta principal continua respondida", () => {
    const [linha] = montarCatalogo([{ id: "i1", nome: "Cola", quantidade: 3 }], []);
    expect(linha.local).toBe(null);
    expect(linha.quantidade).toBe(3);
    // Default da coluna: o galpão fala "un" quando ninguém disse outra coisa.
    expect(linha.unidade).toBe("un");
  });

  it("descarta item sem id ou sem nome — na busca ele seria um resultado em branco", () => {
    const linhas = montarCatalogo(
      [{ id: "", nome: "Sem id" }, { id: "i2", nome: "  " }, { id: "i3", nome: "Feltro" }],
      [],
    );
    expect(linhas.map((l) => l.nome)).toEqual(["Feltro"]);
  });

  it("local_id que não existe na tabela de locais não inventa rótulo", () => {
    const [linha] = montarCatalogo([{ id: "i1", nome: "EVA", local_id: "sumiu" }], locais);
    expect(linha.local).toBe(null);
  });

  it("os nomes dos campos são contrato com o tablet", () => {
    // Do outro lado desta linha há um app Kotlin que decodifica exatamente
    // estas chaves (ItemCatalogoDto, em estoque-app/.../net/Contracts.kt, com
    // CatalogoContratoTest travando o formato). Renomear "quantidade" pra
    // "qtd" aqui não quebra nada no TypeScript: quebra a consulta de estoque
    // do galpão, em silêncio, no tablet — que está em lock task e não dá pra
    // depurar. Se este teste falhar, o app tem que mudar no MESMO commit.
    const [linha] = montarCatalogo([{ id: "i1", nome: "Feltro" }], []);
    expect(Object.keys(linha).sort()).toEqual(
      ["categoria", "id", "local", "nome", "quantidade", "sku", "unidade"],
    );
  });
});

describe("assinaturaDoCatalogo", () => {
  const base = [
    { id: "a", nome: "Item A", sku: null, categoria: null, unidade: "un", quantidade: 1, local: null },
    { id: "b", nome: "Item B", sku: null, categoria: null, unidade: "un", quantidade: 2, local: null },
  ];

  it("é estável: o mesmo catálogo assina igual", () => {
    expect(assinaturaDoCatalogo(base)).toBe(assinaturaDoCatalogo(base.map((i) => ({ ...i }))));
  });

  it("muda quando a QUANTIDADE muda — é o número que a tela existe pra mostrar", () => {
    const mexido = [base[0], { ...base[1], quantidade: 3 }];
    expect(assinaturaDoCatalogo(mexido)).not.toBe(assinaturaDoCatalogo(base));
  });

  it("muda quando o local muda", () => {
    const mexido = [{ ...base[0], local: "COR-A" }, base[1]];
    expect(assinaturaDoCatalogo(mexido)).not.toBe(assinaturaDoCatalogo(base));
  });

  it("muda quando um item some", () => {
    expect(assinaturaDoCatalogo([base[0]])).not.toBe(assinaturaDoCatalogo(base));
  });

  it("duas mudanças não se cancelam por causa da emenda entre campos", () => {
    // Sem separador, ("AB","C") e ("A","BC") virariam a mesma string — e a
    // assinatura diria "nada mudou" com o galpão remarcado.
    const um = [{ id: "x", nome: "AB", sku: "C", categoria: null, unidade: "un", quantidade: 1, local: null }];
    const outro = [{ id: "x", nome: "A", sku: "BC", categoria: null, unidade: "un", quantidade: 1, local: null }];
    expect(assinaturaDoCatalogo(um)).not.toBe(assinaturaDoCatalogo(outro));
  });

  it("catálogo vazio tem assinatura própria, não vazia", () => {
    expect(assinaturaDoCatalogo([])).toHaveLength(16);
    expect(assinaturaDoCatalogo([])).not.toBe(assinaturaDoCatalogo(base));
  });
});
