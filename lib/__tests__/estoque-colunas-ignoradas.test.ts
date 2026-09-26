import { describe, it, expect } from "vitest";
import {
  avisoDeColunasIgnoradas, perdasQueImportam, listarEmPortugues,
  foiPreenchido, rotuloDaColuna,
} from "@/lib/estoque-colunas-ignoradas";

// O caso REAL de hoje: `compras.fornecedor_id` e `compras.local_id` não
// existem no banco (nascem em supabase/estoque_pendente_tudo.sql), a escrita
// tolerante descarta as duas, e a compra é gravada sem elas.
const LINHA_TIPICA = {
  item_nome: "Chapa MDF 18mm",
  fornecedor_id: "f-1",
  local_id: "l-1",
  hierarquia: null,
  quantidade_comprada: 10,
};

describe("foiPreenchido", () => {
  it("null, undefined e string vazia não contam", () => {
    expect(foiPreenchido(null)).toBe(false);
    expect(foiPreenchido(undefined)).toBe(false);
    expect(foiPreenchido("")).toBe(false);
    expect(foiPreenchido("   ")).toBe(false);
  });

  it("zero e false CONTAM — são escolhas, não ausência", () => {
    expect(foiPreenchido(0)).toBe(true);
    expect(foiPreenchido(false)).toBe(true);
  });
});

describe("perdasQueImportam", () => {
  it("só entra o que a pessoa preencheu", () => {
    // `hierarquia` foi descartada também, mas estava nula: ninguém escolheu.
    const perdas = perdasQueImportam(["fornecedor_id", "local_id", "hierarquia"], LINHA_TIPICA);
    expect(perdas).toEqual(["fornecedor_id", "local_id"]);
  });

  it("nada preenchido = nada a avisar", () => {
    expect(perdasQueImportam(["hierarquia"], LINHA_TIPICA)).toEqual([]);
  });

  it("não repete coluna citada duas vezes", () => {
    expect(perdasQueImportam(["fornecedor_id", "fornecedor_id"], LINHA_TIPICA)).toEqual(["fornecedor_id"]);
  });

  it("aguenta lista e linha ausentes", () => {
    expect(perdasQueImportam(null, null)).toEqual([]);
    expect(perdasQueImportam(undefined, LINHA_TIPICA)).toEqual([]);
  });
});

describe("listarEmPortugues", () => {
  it("junta com vírgula e 'e' no fim", () => {
    expect(listarEmPortugues(["a"])).toBe("a");
    expect(listarEmPortugues(["a", "b"])).toBe("a e b");
    expect(listarEmPortugues(["a", "b", "c"])).toBe("a, b e c");
    expect(listarEmPortugues([])).toBe("");
  });
});

describe("rotuloDaColuna", () => {
  it("traduz pro nome que está na tela", () => {
    expect(rotuloDaColuna("local_id")).toBe("onde vai ser guardado");
    expect(rotuloDaColuna("fornecedor_id")).toBe("fornecedor");
  });

  it("coluna desconhecida cai nela mesma em vez de sumir", () => {
    expect(rotuloDaColuna("coluna_nova")).toBe("coluna_nova");
  });
});

describe("avisoDeColunasIgnoradas", () => {
  it("nada descartado = nada de aviso (o caso do banco em dia)", () => {
    expect(avisoDeColunasIgnoradas([], LINHA_TIPICA)).toBeNull();
  });

  it("descartou só o que estava vazio = silêncio, pra não virar ruído", () => {
    expect(avisoDeColunasIgnoradas(["hierarquia"], LINHA_TIPICA)).toBeNull();
  });

  it("nomeia os campos perdidos pelo nome de tela", () => {
    const aviso = avisoDeColunasIgnoradas(["fornecedor_id", "local_id"], LINHA_TIPICA) ?? "";
    expect(aviso).toContain("fornecedor");
    expect(aviso).toContain("onde vai ser guardado");
    // Nunca o nome da coluna crua na cara de quem recebe mercadoria.
    expect(aviso).not.toContain("fornecedor_id");
    expect(aviso).not.toContain("local_id");
  });

  it("diz que o RESTO entrou — senão a pessoa registra a compra de novo", () => {
    const aviso = avisoDeColunasIgnoradas(["fornecedor_id"], LINHA_TIPICA) ?? "";
    expect(aviso).toContain("não registre de novo");
  });

  it("aponta o conserto: o SQL pendente", () => {
    const aviso = avisoDeColunasIgnoradas(["fornecedor_id"], LINHA_TIPICA) ?? "";
    expect(aviso).toContain("estoque_pendente_tudo.sql");
  });

  it("concorda em número: um campo no singular, dois no plural", () => {
    expect(avisoDeColunasIgnoradas(["fornecedor_id"], LINHA_TIPICA)).toContain("O campo");
    expect(avisoDeColunasIgnoradas(["fornecedor_id"], LINHA_TIPICA)).toContain("não foi salvo");
    expect(avisoDeColunasIgnoradas(["fornecedor_id", "local_id"], LINHA_TIPICA)).toContain("Os campos");
    expect(avisoDeColunasIgnoradas(["fornecedor_id", "local_id"], LINHA_TIPICA)).toContain("não foram salvos");
  });
});
