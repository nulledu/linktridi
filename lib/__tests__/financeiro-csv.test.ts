import { describe, it, expect } from "vitest";
import { campoCSV, numeroCSV, dataCSV, montarCSV, nomeDoArquivo } from "@/lib/financeiro/csv";

/**
 * A exportação é o único lugar do módulo onde o erro é MUDO: o arquivo abre, a
 * planilha parece certa, e o problema só aparece quando alguém soma a coluna.
 */

describe("Campo", () => {
  it("põe aspas só quando precisa, e dobra a aspa de dentro", () => {
    expect(campoCSV("Internet Vivo")).toBe("Internet Vivo");
    expect(campoCSV("Aluguel; fábrica")).toBe('"Aluguel; fábrica"');
    expect(campoCSV('Cabo 3"')).toBe('"Cabo 3"""');
    expect(campoCSV("linha 1\nlinha 2")).toBe('"linha 1\nlinha 2"');
  });

  it("vazio é vazio — não vira 'null' nem 'undefined'", () => {
    expect(campoCSV(null)).toBe("");
    expect(campoCSV(undefined)).toBe("");
    expect(campoCSV("")).toBe("");
  });

  it("neutraliza fórmula: descrição é texto digitado por gente", () => {
    // Injeção de CSV. Sem a aspa simples, o Excel EXECUTA isso ao abrir — e
    // quem abre a exportação do financeiro é exatamente o alvo interessante.
    expect(campoCSV("=1+1")).toBe("'=1+1");
    expect(campoCSV("=HYPERLINK(\"http://x\",\"cliq\")")).toBe(`"'=HYPERLINK(""http://x"",""cliq"")"`);
    expect(campoCSV("+55 11 99999")).toBe("'+55 11 99999");
    expect(campoCSV("-desconto")).toBe("'-desconto");
    expect(campoCSV("@fulano")).toBe("'@fulano");
  });

  it("texto que só CONTÉM sinal não é mexido — o perigo é começar com ele", () => {
    expect(campoCSV("Nota 1+1 grátis")).toBe("Nota 1+1 grátis");
  });
});

describe("Número", () => {
  it("usa vírgula decimal e nada de separador de milhar", () => {
    // Com ponto de milhar o Excel pt-BR lê "3.000" como 3 em algumas máquinas.
    expect(numeroCSV(3000)).toBe("3000,00");
    expect(numeroCSV(-250)).toBe("-250,00");
    expect(numeroCSV(12400.5)).toBe("12400,50");
  });

  it("dinheiro de verdade (2 casas) atravessa exato", () => {
    // É o caso real: os valores vêm de `numeric(14,2)` do Postgres, então
    // chegam aqui já com duas casas. A terceira casa não existe no banco.
    for (const v of [0.01, 0.1, 350, 3000, 333.33, 333.34, 99999.99]) {
      expect(numeroCSV(v)).toBe(v.toFixed(2).replace(".", ","));
    }
  });

  it("meio centavo cai para baixo, e isso é o float — não um bug a consertar", () => {
    // 333.335 não existe em binário: o número guardado é 333.33499999999998,
    // então 333,33 é o arredondamento CORRETO do valor que realmente está lá.
    // Fica documentado para ninguém "consertar" isto depois e introduzir uma
    // diferença de um centavo entre a tela e a planilha.
    expect(numeroCSV(333.335)).toBe("333,33");
  });

  it("vazio e lixo não viram 0 — zero parece um dado", () => {
    expect(numeroCSV(null)).toBe("");
    expect(numeroCSV(undefined)).toBe("");
    expect(numeroCSV(NaN)).toBe("");
  });
});

describe("Data", () => {
  it("vira DD/MM/AAAA", () => {
    expect(dataCSV("2026-08-15")).toBe("15/08/2026");
    expect(dataCSV("2026-08-15T12:00:00Z")).toBe("15/08/2026");
  });

  it("vazio continua vazio, e não vira 31/12/1969", () => {
    expect(dataCSV(null)).toBe("");
    expect(dataCSV("")).toBe("");
  });
});

describe("Arquivo", () => {
  const linhas = [
    { descricao: "Internet Vivo", valor: 350, vencimento: "2026-08-14" },
    { descricao: "Fornecedor; MDF", valor: 12400.5, vencimento: "2026-08-18" },
  ];
  const csv = montarCSV(linhas, [
    { cabecalho: "Descrição", valor: (l) => l.descricao },
    { cabecalho: "Valor", valor: (l) => numeroCSV(l.valor) },
    { cabecalho: "Vencimento", valor: (l) => dataCSV(l.vencimento) },
  ]);

  it("começa com BOM — sem ele todo acento vira lixo no Excel", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("separa por ponto e vírgula e quebra linha com CRLF", () => {
    const linhasDoArquivo = csv.split("\r\n");
    expect(linhasDoArquivo).toHaveLength(3);
    expect(linhasDoArquivo[0]).toBe("﻿Descrição;Valor;Vencimento");
    expect(linhasDoArquivo[1]).toBe("Internet Vivo;350,00;14/08/2026");
    expect(linhasDoArquivo[2]).toBe('"Fornecedor; MDF";12400,50;18/08/2026');
  });

  it("lista vazia gera só o cabeçalho — arquivo válido, não arquivo quebrado", () => {
    const so = montarCSV([], [{ cabecalho: "Descrição", valor: () => "" }]);
    expect(so).toBe("﻿Descrição");
  });

  it("o nome do arquivo é previsível e ordenável", () => {
    expect(nomeDoArquivo("Compromissos", "Tridi", "2026-08-15"))
      .toBe("financeiro-compromissos-tridi-2026-08-15.csv");
    expect(nomeDoArquivo("Notas Fiscais", "Gedux Indústria", "2026-08-15"))
      .toBe("financeiro-notas-fiscais-gedux-industria-2026-08-15.csv");
  });
});
