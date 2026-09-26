import { describe, it, expect } from "vitest";
import {
  chaveFrouxaDeNome, chaveDeFornecedor, lerPlanilha, planejarImportacao,
  type ItemDoCatalogo,
} from "@/lib/estoque-importacao";
import { normalizarUnidade } from "@/lib/estoque-unidade-compra";
import { normalizarFornecedor } from "@/lib/estoque-fornecedores-semelhanca";

// ── Os três buracos que a revisão achou na importação ────────────────────────
//
// Os três davam na mesma coisa: a rota /api/estoque/importar escreve DIRETO em
// `estoque_itens`, então nada do que as outras telas normalizam vale ali.
//
//  1. "ROLO-KRAFT" entrava ao lado de "ROLO KRAFT". `chaveDeNome` ignora acento,
//     caixa e espaço, mas não pontuação — e o `unique` do Postgres é literal.
//     Como `lib/recebimento.ts` resolve item por `ilike("nome")`, o estoque
//     racharia em dois itens e nenhum dos dois números fecharia.
//  2. A unidade da planilha ("UNIDADE", "PARES", "GALÃO") era gravada crua, e
//     ainda passava por cima do 'un' correto dos itens que já existem.
//  3. Fornecedor era casado por `chaveDeNome`, não pela chave da tela de
//     Fornecedores — "TINTA MÁGICA LTDA" viraria um cadastro novo ao lado de
//     "TINTA MAGICA".

const item = (p: Partial<ItemDoCatalogo> & { id: string; nome: string }): ItemDoCatalogo => ({
  serializado: false, quantidade: 0, qtd_minima: 0, unidade: "un", fornecedor_id: null, ...p,
});

describe("chave frouxa: a segunda opinião sobre o nome", () => {
  it("junta o que só difere por pontuação, espaço ou acento", () => {
    const mesmos: [string, string][] = [
      ["ROLO-KRAFT", "ROLO KRAFT"],
      ["SIERRA(CERQUEIRA)", "SIERRA (CERQUEIRA)"],
      ["MDF 6mm", "MDF 6 mm"],
      ["Cola Bonder.", "Cola Bonder"],
      ["ROLO – KRAFT", "ROLO - KRAFT"], // travessão que o Excel troca sozinho
      ["Café 3/4", "CAFE 34"],
    ];
    for (const [a, b] of mesmos) expect(chaveFrouxaDeNome(a)).toBe(chaveFrouxaDeNome(b));
  });

  it("NÃO junta produtos de verdade diferentes", () => {
    expect(chaveFrouxaDeNome("Cola branca")).not.toBe(chaveFrouxaDeNome("Cola bonder"));
    expect(chaveFrouxaDeNome("MDF 3mm")).not.toBe(chaveFrouxaDeNome("MDF 6mm"));
    expect(chaveFrouxaDeNome("Almofada 11")).not.toBe(chaveFrouxaDeNome("Almofada 16"));
  });

  it("nome só de pontuação vira chave vazia — vazio não pode casar com vazio", () => {
    expect(chaveFrouxaDeNome("---")).toBe("");
    expect(chaveFrouxaDeNome("")).toBe("");
  });
});

describe("criar item que só difere por pontuação é RECUSADO", () => {
  it("contra o catálogo: a linha não vira item novo, e diz com quem parece", () => {
    const { linhas } = lerPlanilha("ROLO-KRAFT\t50\t10");
    const p = planejarImportacao({ linhas, itens: [item({ id: "k", nome: "ROLO KRAFT", quantidade: 229 })] });

    expect(p.novos).toHaveLength(0);
    expect(p.descartes).toHaveLength(1);
    expect(p.descartes[0].motivo).toBe("quase_duplicata");
    // O nome do catálogo tem que aparecer: sem ele a pessoa não sabe o que fazer.
    expect(p.descartes[0].detalhe).toContain("ROLO KRAFT");
  });

  it("dentro do MESMO arquivo: as duas grafias não viram dois itens", () => {
    const { linhas } = lerPlanilha("ROLO KRAFT\t50\nROLO-KRAFT\t20");
    const p = planejarImportacao({ linhas, itens: [] });

    expect(p.novos.map((n) => n.nome)).toEqual(["ROLO KRAFT"]);
    expect(p.descartes.map((d) => d.motivo)).toEqual(["quase_duplicata"]);
    expect(p.descartes[0].detalhe).toContain("linha 1");
  });

  it("o caminho normal segue igual: nome que casa de verdade continua ATUALIZANDO", () => {
    // A recusa é só pra CRIAR. "ROLO  KRAFT" x "Rolo Kraft" casa por chaveDeNome
    // e tem que virar atualização, não descarte.
    const { linhas } = lerPlanilha("ROLO  KRAFT\t229");
    const p = planejarImportacao({ linhas, itens: [item({ id: "k", nome: "Rolo Kraft", quantidade: 0 })] });

    expect(p.descartes).toHaveLength(0);
    expect(p.atualizados.map((a) => a.nome)).toEqual(["Rolo Kraft"]);
  });

  it("item de verdade diferente continua sendo criado", () => {
    const { linhas } = lerPlanilha("MDF 3mm\t10\nMDF 6mm\t20");
    const p = planejarImportacao({ linhas, itens: [item({ id: "a", nome: "Cola branca" })] });
    expect(p.novos.map((n) => n.nome)).toEqual(["MDF 3mm", "MDF 6mm"]);
    expect(p.descartes).toHaveLength(0);
  });
});

describe("unidade passa pelo vocabulário único", () => {
  it("as cinco unidades da planilha do galpão entram como código", () => {
    const texto = [
      "Item\tEstoque\tMínimo\tUnidade",
      "Cola X\t5\t2\tUNIDADE",
      "Fita Y\t3\t1\tPARES",
      "Tinta Z\t2\t1\tGALÃO",
      "Papel W\t9\t3\tROLO",
      "Saco V\t4\t1\tPCT",
    ].join("\n");
    const p = planejarImportacao({ linhas: lerPlanilha(texto).linhas, itens: [] });
    expect(p.novos.map((n) => n.escrita.campos.unidade)).toEqual(["un", "par", "galao", "rolo", "pct"]);
  });

  it("não sobrescreve o 'un' certo de um item que já existe com o 'UNIDADE' da planilha", () => {
    const { linhas } = lerPlanilha("Item\tEstoque\tMínimo\tUnidade\nCola X\t5\t2\tUNIDADE");
    const p = planejarImportacao({ linhas, itens: [item({ id: "c", nome: "Cola X", quantidade: 5, unidade: "un" })] });

    const mudou = p.atualizados[0]?.mudancas.map((m) => m.campo) ?? [];
    expect(mudou).not.toContain("unidade");
    expect(p.atualizados[0]?.escrita.campos.unidade).toBeUndefined();
  });

  it("unidade que muda de verdade grava o CÓDIGO, não o texto da planilha", () => {
    const { linhas } = lerPlanilha("Item\tEstoque\tMínimo\tUnidade\nPapel W\t5\t2\tROLO");
    const p = planejarImportacao({ linhas, itens: [item({ id: "w", nome: "Papel W", quantidade: 5, unidade: "un" })] });
    expect(p.atualizados[0].escrita.campos.unidade).toBe("rolo");
    expect(p.atualizados[0].mudancas.find((m) => m.campo === "unidade")?.para).toBe("rolo");
  });

  it("célula de unidade ilegível não apaga a unidade que o item já tem", () => {
    const p = planejarImportacao({
      linhas: [{ linha: 2, nome: "Cola X", quantidade: null, qtd_minima: 4, unidade: "-", fornecedor: null }],
      itens: [item({ id: "c", nome: "Cola X", unidade: "galao", qtd_minima: 0 })],
    });
    expect(p.atualizados[0].escrita.campos.unidade).toBeUndefined();
  });

  it("unidade inventada pelo galpão não é descartada — só padronizada", () => {
    // Vale a mesma regra de /api/estoque-itens: nada é engolido.
    expect(normalizarUnidade("Bisnaga")).toBe("bisnaga");
    const { linhas } = lerPlanilha("Item\tEstoque\tMínimo\tUnidade\nCola X\t5\t2\tBISNAGA");
    const p = planejarImportacao({ linhas, itens: [] });
    expect(p.novos[0].escrita.campos.unidade).toBe("bisnaga");
  });
});

describe("fornecedor usa a chave da tela de Fornecedores", () => {
  it("é a MESMA função — duas chaves seriam duas regras", () => {
    expect(chaveDeFornecedor("TINTA MÁGICA LTDA")).toBe(normalizarFornecedor("TINTA MAGICA"));
  });

  it("sufixo jurídico não cria um cadastro paralelo", () => {
    const { linhas } = lerPlanilha("Item\tEstoque\tMínimo\tUnidade\tFornecedor\nCola X\t5\t2\tun\tTINTA MÁGICA LTDA");
    const p = planejarImportacao({
      linhas, itens: [],
      fornecedores: [{ id: "f1", nome: "TINTA MAGICA" }],
      podeCriarFornecedor: true,
    });
    expect(p.fornecedoresNovos).toEqual([]);
    expect(p.novos[0].fornecedor).toBe("TINTA MAGICA"); // vincula no que já existe
  });

  it("fornecedor que de fato não existe continua sendo criado", () => {
    const { linhas } = lerPlanilha("Item\tEstoque\tMínimo\tUnidade\tFornecedor\nCola X\t5\t2\tun\tDS EMBALAGENS");
    const p = planejarImportacao({
      linhas, itens: [],
      fornecedores: [{ id: "f1", nome: "EMBALAGENS AVARÉ" }],
      podeCriarFornecedor: true,
    });
    expect(p.fornecedoresNovos).toEqual(["DS EMBALAGENS"]);
  });
});

describe("o que já funcionava continua funcionando", () => {
  it("serializado: a quantidade sai do plano e o item é dito em voz alta", () => {
    const { linhas } = lerPlanilha("Carimbo A\t400\t50");
    const p = planejarImportacao({
      linhas, itens: [item({ id: "s", nome: "Carimbo A", quantidade: 312, serializado: true })],
    });
    expect(p.atualizados[0].escrita.campos.quantidade).toBeUndefined();
    expect(p.atualizados[0].estoqueTravado).toBe(true);
  });

  it("item novo nasce SEM hierarquia — a coluna nem entra na escrita", () => {
    const p = planejarImportacao({ linhas: lerPlanilha("Pallet PBR\t8\t2").linhas, itens: [] });
    expect(Object.keys(p.novos[0].escrita.campos).sort()).toEqual(["nome", "qtd_minima", "quantidade", "unidade"]);
  });
});
