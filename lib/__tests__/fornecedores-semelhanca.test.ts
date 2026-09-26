import { describe, it, expect } from "vitest";
import {
  LIMIAR_PARECIDO,
  acharParecidos,
  limparNomeFornecedor,
  normalizarFornecedor,
  semelhancaFornecedor,
  separarNomes,
  triarListaFornecedores,
} from "../estoque-fornecedores-semelhanca";

// Os 17 nomes vieram da planilha real do galpão ("CONTROLE DE ESTOQUE
// TRIDI.xlsx"). O último — "FORNECEDOR" — é lixo de digitação: rótulo de
// coluna que escorregou pra dentro dos dados.
const DA_PLANILHA = [
  "AVARÉ/CERQUEIRA", "BOOK EXPRESS", "BRUNIQUÍMICA", "DS EMBALAGENS",
  "EMBALAGENS AVARÉ", "FEMA", "GLORIMAX", "LIDJA GOMES", "MARYSHOPPING",
  "ML", "MR CARIMBOS", "REVAL", "SHOPEE", "SIERRA(CERQUEIRA)",
  "TINTA MÁGICA", "UNITEC", "FORNECEDOR",
];

const parecidos = (a: string, b: string) => semelhancaFornecedor(a, b) >= LIMIAR_PARECIDO;

describe("chave do fornecedor", () => {
  it("tira acento, pontuação e caixa", () => {
    expect(normalizarFornecedor("AVARÉ/CERQUEIRA")).toBe("avare cerqueira");
    expect(normalizarFornecedor("SIERRA(CERQUEIRA)")).toBe("sierra cerqueira");
    expect(normalizarFornecedor("TINTA MÁGICA")).toBe("tinta magica");
    expect(normalizarFornecedor("BRUNIQUÍMICA")).toBe("bruniquimica");
  });

  it("tira sufixo jurídico — LTDA não é parte do nome", () => {
    expect(normalizarFornecedor("Tinta Mágica Ltda")).toBe(normalizarFornecedor("TINTA MAGICA"));
    expect(normalizarFornecedor("REVAL S/A")).toBe("reval");
    expect(normalizarFornecedor("Fema ME")).toBe("fema");
  });

  it("nome que é SÓ sufixo não vira chave vazia", () => {
    // Chave vazia casaria com qualquer outra chave vazia e criaria duplicata
    // do nada.
    expect(normalizarFornecedor("ME")).toBe("me");
    expect(normalizarFornecedor("  ")).toBe("");
  });
});

describe("semelhança entre os nomes reais da planilha", () => {
  it("só o grupo Avaré/Cerqueira levanta a mão", () => {
    const flagrados: string[] = [];
    for (let i = 0; i < DA_PLANILHA.length; i++) {
      for (let j = i + 1; j < DA_PLANILHA.length; j++) {
        if (parecidos(DA_PLANILHA[i], DA_PLANILHA[j])) flagrados.push(`${DA_PLANILHA[i]} × ${DA_PLANILHA[j]}`);
      }
    }
    expect(flagrados.sort()).toEqual([
      "AVARÉ/CERQUEIRA × EMBALAGENS AVARÉ",
      "AVARÉ/CERQUEIRA × SIERRA(CERQUEIRA)",
    ]);
  });

  it("a corrente NÃO se fecha sozinha: as duas pontas não viram parentes", () => {
    // "EMBALAGENS AVARÉ" e "SIERRA(CERQUEIRA)" só se tocam PASSANDO por
    // "AVARÉ/CERQUEIRA". Fechar isso aqui seria decidir que os três são um só
    // — exatamente o que o humano tem de decidir.
    expect(parecidos("EMBALAGENS AVARÉ", "SIERRA(CERQUEIRA)")).toBe(false);
  });

  it("ML não é MR CARIMBOS", () => {
    // Uma letra de distância entre siglas de duas letras. É o falso positivo
    // mais caro dessa base: avisar aqui ensina a ignorar o aviso.
    expect(parecidos("ML", "MR CARIMBOS")).toBe(false);
    expect(parecidos("ML", "MARYSHOPPING")).toBe(false);
  });

  it("palavra de ramo em comum não é parentesco", () => {
    expect(parecidos("DS EMBALAGENS", "EMBALAGENS AVARÉ")).toBe(false);
    expect(parecidos("TINTA MÁGICA", "TINTAS DO VALE")).toBe(false);
    expect(parecidos("MR CARIMBOS", "CARIMBOS DO BRASIL")).toBe(false);
  });

  it("MARYSHOPPING não é SHOPEE", () => {
    expect(parecidos("MARYSHOPPING", "SHOPEE")).toBe(false);
  });
});

describe("as diferenças de escrita que criam fornecedor duplicado", () => {
  it("acento e sufixo: mesma coisa (1.0)", () => {
    expect(semelhancaFornecedor("TINTA MAGICA LTDA", "TINTA MÁGICA")).toBe(1);
    expect(semelhancaFornecedor("bruniquimica", "BRUNIQUÍMICA")).toBe(1);
  });

  it("espaço a mais ou a menos", () => {
    expect(parecidos("BOOKEXPRESS", "BOOK EXPRESS")).toBe(true);
    expect(parecidos("MARY SHOPPING", "MARYSHOPPING")).toBe(true);
    expect(parecidos("BRUNI QUIMICA", "BRUNIQUÍMICA")).toBe(true);
  });

  it("nome curto dentro do nome longo", () => {
    expect(parecidos("REVAL", "REVAL PAPELARIA")).toBe(true);
    expect(parecidos("GLORIMAX", "GLORIMAX TINTAS")).toBe(true);
    expect(parecidos("MR CARIMBOS", "MR CARIMBOS E BORRACHAS")).toBe(true);
  });

  it("uma letra trocada em palavra longa", () => {
    expect(parecidos("UNITEC", "UNITEK")).toBe(true);
    expect(parecidos("LIDJA GOMES", "LIDIA GOMES")).toBe(true);
  });

  it("uma palavra identificadora em comum já pede conferência", () => {
    expect(parecidos("AVARÉ/CERQUEIRA", "SIERRA(CERQUEIRA)")).toBe(true);
    expect(semelhancaFornecedor("AVARÉ/CERQUEIRA", "SIERRA(CERQUEIRA)")).toBeGreaterThanOrEqual(LIMIAR_PARECIDO);
  });
});

describe("acharParecidos", () => {
  it("devolve do mais parecido pro menos, com o cadastro que casou", () => {
    const base = DA_PLANILHA.map((nome, i) => ({ id: `f${i}`, nome }));
    const r = acharParecidos("AVARE CERQUEIRA LTDA", base);
    expect(r[0]).toMatchObject({ nome: "AVARÉ/CERQUEIRA", id: "f0", score: 1 });
    expect(r.map((x) => x.nome)).toContain("SIERRA(CERQUEIRA)");
    expect(r.map((x) => x.nome)).toContain("EMBALAGENS AVARÉ");
  });

  it("não inventa parentesco quando não tem", () => {
    const base = DA_PLANILHA.map((nome) => ({ nome }));
    expect(acharParecidos("PAPELARIA CENTRAL", base)).toEqual([]);
  });

  it("nome vazio não casa com ninguém", () => {
    expect(acharParecidos("   ", [{ nome: "REVAL" }])).toEqual([]);
  });
});

describe("separar a lista colada", () => {
  it("uma por linha, com marcador, numeração e aspas", () => {
    const texto = `- AVARÉ/CERQUEIRA\n1. BOOK EXPRESS\n  "BRUNIQUÍMICA"  \n\n• DS EMBALAGENS`;
    expect(separarNomes(texto)).toEqual([
      "AVARÉ/CERQUEIRA", "BOOK EXPRESS", "BRUNIQUÍMICA", "DS EMBALAGENS",
    ]);
  });

  it("barra NUNCA separa — AVARÉ/CERQUEIRA é um nome só", () => {
    expect(separarNomes("AVARÉ/CERQUEIRA")).toEqual(["AVARÉ/CERQUEIRA"]);
  });

  it("ponto-e-vírgula e tabulação separam", () => {
    expect(separarNomes("FEMA; GLORIMAX\tREVAL")).toEqual(["FEMA", "GLORIMAX", "REVAL"]);
  });

  it("vírgula só separa quando veio tudo numa linha", () => {
    expect(separarNomes("FEMA, GLORIMAX, REVAL")).toEqual(["FEMA", "GLORIMAX", "REVAL"]);
    // Em lista de várias linhas a vírgula é parte do nome ("EMPRESA X, LTDA").
    expect(separarNomes("EMPRESA X, LTDA\nREVAL")).toEqual(["EMPRESA X, LTDA", "REVAL"]);
  });

  it("limpa sem mudar a caixa — a planilha é MAIÚSCULA e fica", () => {
    expect(limparNomeFornecedor("  MR   CARIMBOS ")).toBe("MR CARIMBOS");
  });
});

describe("triagem da lista colada", () => {
  const colado = DA_PLANILHA.join("\n");

  it("cadastro vazio: 16 entram, o rótulo 'FORNECEDOR' fica de fora", () => {
    const t = triarListaFornecedores(colado, []);
    expect(t.linhas).toHaveLength(17);
    expect(t.novos).toBe(16);
    const lixo = t.linhas.find((l) => l.nome === "FORNECEDOR")!;
    expect(lixo.situacao).toBe("suspeito");
    expect(lixo.marcar).toBe(false);
    expect(lixo.aviso).toMatch(/planilha/i);
  });

  it("avisa dentro da própria lista, sem juntar nada", () => {
    const t = triarListaFornecedores(colado, []);
    const embalagens = t.linhas.find((l) => l.nome === "EMBALAGENS AVARÉ")!;
    const sierra = t.linhas.find((l) => l.nome === "SIERRA(CERQUEIRA)")!;
    expect(embalagens.situacao).toBe("novo");
    expect(embalagens.marcar).toBe(true);
    expect(embalagens.parecidos.map((p) => p.nome)).toEqual(["AVARÉ/CERQUEIRA"]);
    expect(sierra.parecidos.map((p) => p.nome)).toEqual(["AVARÉ/CERQUEIRA"]);
  });

  it("quem já está cadastrado não entra de novo, nem com acento diferente", () => {
    const t = triarListaFornecedores("TINTA MAGICA LTDA\nREVAL", [
      { id: "a", nome: "Tinta Mágica" },
    ]);
    expect(t.linhas[0].situacao).toBe("existente");
    expect(t.linhas[0].existente).toMatchObject({ id: "a", nome: "Tinta Mágica" });
    expect(t.linhas[0].marcar).toBe(false);
    expect(t.linhas[1].situacao).toBe("novo");
    expect(t.novos).toBe(1);
  });

  it("parecido com um cadastrado ainda entra — com o aviso junto", () => {
    const t = triarListaFornecedores("REVAL PAPELARIA", [{ id: "b", nome: "REVAL" }]);
    expect(t.linhas[0].situacao).toBe("novo");
    expect(t.linhas[0].marcar).toBe(true);
    expect(t.linhas[0].parecidos[0]).toMatchObject({ id: "b", nome: "REVAL" });
  });

  it("linha repetida na mesma colagem cai fora uma vez só", () => {
    const t = triarListaFornecedores("UNITEC\nunitec\nUnitec Ltda", []);
    expect(t.linhas.map((l) => l.situacao)).toEqual(["novo", "repetido", "repetido"]);
    expect(t.novos).toBe(1);
    expect(t.linhas[1].aviso).toContain("UNITEC");
  });

  it("texto vazio não vira linha nenhuma", () => {
    expect(triarListaFornecedores("\n\n   \n", [])).toEqual({ linhas: [], novos: 0 });
  });
});
