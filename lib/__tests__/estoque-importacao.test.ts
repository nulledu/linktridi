import { describe, it, expect } from "vitest";
import {
  chaveDeNome, nomeLimpo, parsearNumero, separadorDe, dividirLinha,
  lerPlanilha, planejarImportacao, planoEscreve,
  type ItemDoCatalogo, type LinhaPlanilha,
} from "@/lib/estoque-importacao";

// A planilha do galpão ("CONTROLE DE ESTOQUE TRIDI.xlsx") traz 81 itens novos e
// 12 que já existem. O jeito de errar aqui é caro e silencioso: casar mal um
// nome cria um item DUPLICADO, e a atividade e o recebimento resolvem produto
// POR NOME — metade das baixas iria pra um, metade pro outro, e nenhum dos dois
// números fecharia. Estes testes são os casos reais da planilha.

const item = (p: Partial<ItemDoCatalogo> & { id: string; nome: string }): ItemDoCatalogo => ({
  serializado: false, quantidade: 0, qtd_minima: 0, unidade: "un", fornecedor_id: null, ...p,
});

const linha = (p: Partial<LinhaPlanilha> & { linha: number; nome: string }): LinhaPlanilha => ({
  quantidade: null, qtd_minima: null, unidade: null, fornecedor: null, ...p,
});

describe("casamento de nome", () => {
  it("ignora acento, caixa e espaço duplo — os três de uma vez", () => {
    expect(chaveDeNome("ROLO  KRAFT")).toBe(chaveDeNome("Rolo Kraft"));
    expect(chaveDeNome("Fita Adesiva")).toBe(chaveDeNome("FITA ADESIVA"));
    expect(chaveDeNome("Graxa de lítio")).toBe(chaveDeNome("GRAXA DE LITIO"));
    expect(chaveDeNome("  Cola   Bonder ")).toBe("cola bonder");
  });

  it("engole tabulação, quebra de linha e espaço-duro colados pelo Excel", () => {
    expect(chaveDeNome("Rolo\tKraft")).toBe("rolo kraft");
    expect(chaveDeNome("Rolo Kraft")).toBe("rolo kraft");
  });

  it("não funde itens que só PARECEM iguais", () => {
    // Casar por palpite é pior que a duplicata: some um item de verdade.
    expect(chaveDeNome("MDF 6mm")).not.toBe(chaveDeNome("MDF 6 mm"));
    expect(chaveDeNome("Cola branca")).not.toBe(chaveDeNome("Cola bonder"));
  });

  it("o nome GRAVADO mantém acento e caixa, mas perde o espaço duplo", () => {
    expect(nomeLimpo("ROLO  KRAFT ")).toBe("ROLO KRAFT");
    expect(nomeLimpo("Graxa de lítio")).toBe("Graxa de lítio");
  });
});

describe("números como a planilha brasileira escreve", () => {
  it("lê vírgula decimal, ponto de milhar e os dois juntos", () => {
    expect(parsearNumero("229")).toBe(229);
    expect(parsearNumero("1,5")).toBe(1.5);
    expect(parsearNumero("1.234")).toBe(1234);
    expect(parsearNumero("1.234,5")).toBe(1234.5);
    expect(parsearNumero("1,234.5")).toBe(1234.5); // planilha em inglês
  });

  it("célula vazia é AUSÊNCIA, não zero", () => {
    // A diferença é o que impede a importação de zerar o estoque de quem a
    // planilha simplesmente não mencionou.
    expect(parsearNumero("")).toBeNull();
    expect(parsearNumero("   ")).toBeNull();
    expect(parsearNumero("-")).toBeNull();
    expect(parsearNumero(null)).toBeNull();
    expect(parsearNumero("n/a")).toBeNull();
  });

  it("tira sujeira grudada no número", () => {
    expect(parsearNumero("12 un")).toBe(12);
    expect(parsearNumero("R$ 4,50")).toBe(4.5);
  });
});

describe("leitura do texto colado", () => {
  it("Excel colado (TAB) com cabeçalho em português", () => {
    const { linhas, comCabecalho, separador } = lerPlanilha(
      "Item\tEstoque atual\tPonto de reposição\tUnidade\tFornecedor\n" +
      "ROLO KRAFT\t229\t50\trl\tPapelaria Central\n" +
      "Graxa de lítio\t3\t1\tun\tMecânica São Jorge\n",
    );
    expect(separador).toBe("\t");
    expect(comCabecalho).toBe(true);
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toEqual({
      linha: 2, nome: "ROLO KRAFT", quantidade: 229, qtd_minima: 50,
      unidade: "rl", fornecedor: "Papelaria Central",
    });
  });

  it("CSV brasileiro (;) com aspas e vírgula decimal dentro", () => {
    const { linhas, separador } = lerPlanilha(
      'Nome;Qtd;Mín\n"Fita adesiva 48mm; larga";1,5;2\n',
    );
    expect(separador).toBe(";");
    expect(linhas[0].nome).toBe("Fita adesiva 48mm; larga");
    expect(linhas[0].quantidade).toBe(1.5);
    expect(linhas[0].qtd_minima).toBe(2);
  });

  it('"QTD. MÍNIMA" cai no mínimo, não na quantidade', () => {
    // O cabeçalho de planilha real nunca é a palavra seca. Se este casasse com
    // "qtd", o ponto de reposição viraria o estoque — 89 números no lugar
    // errado, e nada na tela diria isso.
    const { colunas } = lerPlanilha("PRODUTO\tQTD. EM ESTOQUE\tQTD. MÍNIMA\n");
    expect(colunas.nome).toBe(0);
    expect(colunas.quantidade).toBe(1);
    expect(colunas.qtd_minima).toBe(2);
  });

  it("sem cabeçalho, a ordem é posicional e NENHUMA linha é perdida", () => {
    // O primeiro item não pode ser confundido com cabeçalho e sumir calado.
    const { linhas, comCabecalho } = lerPlanilha("Pallet PBR\t8\n Cavalete \t12\n");
    expect(comCabecalho).toBe(false);
    expect(linhas.map((l) => l.nome)).toEqual(["Pallet PBR", "Cavalete"]);
    expect(linhas[0].linha).toBe(1);
  });

  it("linha em branco e rodapé só com separadores não viram erro", () => {
    const { linhas } = lerPlanilha("Nome\tQtd\nPallet\t8\n\n\t\n");
    expect(linhas).toHaveLength(1);
  });

  it("uma coluna só (lista de nomes) também entra", () => {
    const { linhas } = lerPlanilha("Pallet PBR\nCavalete\n");
    expect(linhas.map((l) => l.nome)).toEqual(["Pallet PBR", "Cavalete"]);
    expect(linhas[0].quantidade).toBeNull();
  });

  it("uma coluna só COM título não cria um item chamado “Produto”", () => {
    const { linhas, comCabecalho } = lerPlanilha("Produto\nPallet PBR\nCavalete\n");
    expect(comCabecalho).toBe(true);
    expect(linhas.map((l) => l.nome)).toEqual(["Pallet PBR", "Cavalete"]);
  });
});

describe("plano — o que vai acontecer antes de acontecer", () => {
  const CATALOGO = [
    item({ id: "k", nome: "Rolo Kraft", quantidade: 0, qtd_minima: 0, unidade: "rl" }),
    item({ id: "s", nome: "Chapa MDF", quantidade: 312, serializado: true }),
    item({ id: "g", nome: "Graxa de lítio", quantidade: 3, qtd_minima: 1 }),
  ];

  it("item que já existe é ATUALIZADO, nunca duplicado — mesmo escrito diferente", () => {
    const p = planejarImportacao({
      linhas: [linha({ linha: 2, nome: "ROLO  KRAFT", quantidade: 229 })],
      itens: CATALOGO,
    });
    expect(p.novos).toHaveLength(0);
    expect(p.atualizados).toHaveLength(1);
    expect(p.atualizados[0].id).toBe("k");
    // É esta frase que a pessoa lê antes de apertar o botão.
    expect(p.atualizados[0].mudancas).toEqual([
      { campo: "quantidade", rotulo: "estoque", de: "0", para: "229" },
    ]);
    expect(p.atualizados[0].escrita.campos).toEqual({ quantidade: 229 });
    // O nome do banco fica: a planilha do fornecedor não rebatiza o catálogo.
    expect(p.atualizados[0].nome).toBe("Rolo Kraft");
  });

  it("item novo nasce SEM hierarquia — o dono classifica depois", () => {
    const p = planejarImportacao({
      linhas: [linha({ linha: 2, nome: "Pallet PBR", quantidade: 8, qtd_minima: 2, unidade: "un" })],
      itens: CATALOGO,
    });
    expect(p.novos).toHaveLength(1);
    expect(p.novos[0].nome).toBe("Pallet PBR");
    expect(p.novos[0].escrita.campos).toEqual({ nome: "Pallet PBR", quantidade: 8, qtd_minima: 2, unidade: "un" });
    // Chutar hierarquia por nome erra em silêncio, e ninguém revisa o que
    // parece pronto. Ausência é o estado visível (aba "Não classificados").
    expect("hierarquia" in p.novos[0].escrita.campos).toBe(false);
  });

  it("item serializado: a quantidade da planilha é deixada de fora e DITA", () => {
    // Escrever `quantidade` num item contado por etiqueta é recusado pelo banco
    // (estoque_itens_guarda). Sem esta regra, a importação estouraria no meio e
    // metade dos 93 itens ficaria gravada sem ninguém saber quais.
    const p = planejarImportacao({
      linhas: [linha({ linha: 2, nome: "Chapa MDF", quantidade: 400 })],
      itens: CATALOGO,
    });
    expect(p.atualizados).toHaveLength(0);
    expect(p.pulados).toEqual([
      { linha: 2, id: "s", nome: "Chapa MDF", quantidadePlanilha: 400, quantidadeSistema: 312 },
    ]);
  });

  it("serializado com OUTRA mudança: grava o resto e avisa do estoque travado", () => {
    const p = planejarImportacao({
      linhas: [linha({ linha: 2, nome: "Chapa MDF", quantidade: 400, qtd_minima: 20 })],
      itens: CATALOGO,
    });
    expect(p.atualizados[0].estoqueTravado).toBe(true);
    expect(p.atualizados[0].escrita.campos).toEqual({ qtd_minima: 20 });
    expect(p.atualizados[0].mudancas.map((m) => m.campo)).toEqual(["qtd_minima"]);
  });

  it("quantidade vazia não zera o estoque de quem a planilha não mencionou", () => {
    const p = planejarImportacao({
      linhas: [linha({ linha: 2, nome: "Graxa de lítio", qtd_minima: 5 })],
      itens: CATALOGO,
    });
    expect(p.atualizados[0].escrita.campos).toEqual({ qtd_minima: 5 });
    expect(p.atualizados[0].mudancas.map((m) => m.campo)).toEqual(["qtd_minima"]);
  });

  it("ponto de reposição vazio não zera o que já estava configurado", () => {
    const p = planejarImportacao({
      linhas: [linha({ linha: 2, nome: "Graxa de lítio", quantidade: 9 })],
      itens: CATALOGO,
    });
    expect(p.atualizados[0].escrita.campos).toEqual({ quantidade: 9 });
  });

  it("linha que não muda nada não vira escrita", () => {
    const p = planejarImportacao({
      linhas: [linha({ linha: 2, nome: "graxa de litio", quantidade: 3, qtd_minima: 1, unidade: "UN" })],
      itens: CATALOGO,
    });
    expect(p.atualizados).toHaveLength(0);
    expect(p.iguais).toEqual([{ linha: 2, nome: "Graxa de lítio" }]);
    expect(planoEscreve(p)).toBe(false);
  });

  it("o mesmo item duas vezes no arquivo: vale a primeira, a segunda é apontada", () => {
    const p = planejarImportacao({
      linhas: [
        linha({ linha: 2, nome: "Pallet PBR", quantidade: 8 }),
        linha({ linha: 7, nome: "PALLET  PBR", quantidade: 3 }),
      ],
      itens: CATALOGO,
    });
    expect(p.novos).toHaveLength(1);
    expect(p.novos[0].quantidade).toBe(8);
    expect(p.descartes).toHaveLength(1);
    expect(p.descartes[0].motivo).toBe("duplicada_no_arquivo");
    expect(p.descartes[0].detalhe).toContain("linha 2");
  });

  it("duas linhas do CATÁLOGO com o mesmo nome: não escolhe no palpite", () => {
    const ambiguo = [
      item({ id: "a", nome: "Cola Bonder" }),
      item({ id: "b", nome: "COLA BONDER" }),
    ];
    const p = planejarImportacao({
      linhas: [linha({ linha: 2, nome: "cola bonder", quantidade: 5 })],
      itens: ambiguo,
    });
    expect(p.novos).toHaveLength(0);
    expect(p.atualizados).toHaveLength(0);
    expect(p.descartes[0].motivo).toBe("nome_ambiguo");
  });

  it("linha sem nome é recusada com o número da linha", () => {
    const p = planejarImportacao({
      linhas: [linha({ linha: 4, nome: "   ", quantidade: 12 })],
      itens: CATALOGO,
    });
    expect(p.descartes).toEqual([
      { linha: 4, nome: "", motivo: "sem_nome", detalhe: expect.stringContaining("sem nome") },
    ]);
  });

  it("estoque negativo vira zero, não dívida na prateleira", () => {
    const p = planejarImportacao({
      linhas: [linha({ linha: 2, nome: "Novo item", quantidade: -3 })],
      itens: CATALOGO,
    });
    expect(p.novos[0].quantidade).toBe(0);
  });
});

describe("plano — fornecedor", () => {
  const CATALOGO = [item({ id: "k", nome: "Rolo Kraft", fornecedor_id: "f1" })];
  const FORNECEDORES = [{ id: "f1", nome: "Papelaria Central" }];

  it("vincula o que já existe, sem ligar pra caixa", () => {
    const p = planejarImportacao({
      linhas: [linha({ linha: 2, nome: "Fita nova", fornecedor: "PAPELARIA CENTRAL" })],
      itens: CATALOGO, fornecedores: FORNECEDORES, podeCriarFornecedor: true,
    });
    expect(p.novos[0].escrita.fornecedor).toBe("Papelaria Central");
    expect(p.fornecedoresNovos).toEqual([]);
  });

  it("fornecedor que não existe é listado ANTES, pra pessoa ver quantos cadastros vai criar", () => {
    const p = planejarImportacao({
      linhas: [linha({ linha: 2, nome: "Fita nova", fornecedor: "Mecânica São Jorge" })],
      itens: CATALOGO, fornecedores: FORNECEDORES, podeCriarFornecedor: true,
    });
    expect(p.fornecedoresNovos).toEqual(["Mecânica São Jorge"]);
  });

  it("sem permissão de fornecedores, não cria pela porta lateral — só avisa", () => {
    const p = planejarImportacao({
      linhas: [linha({ linha: 2, nome: "Fita nova", fornecedor: "Mecânica São Jorge" })],
      itens: CATALOGO, fornecedores: FORNECEDORES, podeCriarFornecedor: false,
    });
    expect(p.novos[0].escrita.fornecedor).toBeNull();
    expect(p.fornecedoresNovos).toEqual([]);
    expect(p.fornecedoresIgnorados).toEqual(["Mecânica São Jorge"]);
  });

  it("fornecedor igual ao que já está no item não vira mudança", () => {
    const p = planejarImportacao({
      linhas: [linha({ linha: 2, nome: "Rolo Kraft", fornecedor: "papelaria central" })],
      itens: CATALOGO, fornecedores: FORNECEDORES, podeCriarFornecedor: true,
    });
    expect(p.atualizados).toHaveLength(0);
    expect(p.iguais).toHaveLength(1);
  });
});

describe("planilha inteira, de ponta a ponta", () => {
  it("os 3 casos da planilha do galpão numa colada só", () => {
    const texto = [
      "Item;Estoque;Mínimo;Unidade;Fornecedor",
      "ROLO  KRAFT;229;50;rl;Papelaria Central", // existe, estoque 0 → 229
      "Chapa MDF;400;;un;",                      // serializado: pulado
      "Pallet PBR;8;2;un;Madeireira Sul",        // novo
      ";12;;;",                                  // sem nome
    ].join("\n");
    const { linhas } = lerPlanilha(texto);
    const p = planejarImportacao({
      linhas,
      itens: [
        item({ id: "k", nome: "Rolo Kraft", unidade: "rl" }),
        item({ id: "s", nome: "Chapa MDF", quantidade: 312, serializado: true }),
      ],
      podeCriarFornecedor: true,
    });
    expect(p.novos.map((n) => n.nome)).toEqual(["Pallet PBR"]);
    expect(p.atualizados.map((a) => a.nome)).toEqual(["Rolo Kraft"]);
    expect(p.pulados.map((s) => s.nome)).toEqual(["Chapa MDF"]);
    expect(p.descartes.map((d) => d.motivo)).toEqual(["sem_nome"]);
    expect(p.fornecedoresNovos.sort()).toEqual(["Madeireira Sul", "Papelaria Central"]);
    expect(planoEscreve(p)).toBe(true);
  });
});
