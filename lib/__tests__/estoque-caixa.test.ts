import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pecasDaUnidade, pecasEmEstoque, ehCaixa, rotuloDeCaixa } from "../estoque-unidades";

/**
 * A CAIXA é a unidade de manuseio do galpão.
 *
 * Uma etiqueta pode valer VÁRIAS peças: uma chapa avulsa é uma caixa de 1, uma
 * caixa lacrada de folhas de alavanca é UMA etiqueta valendo 50. Ninguém
 * etiqueta 50 folhas uma a uma — bipa a caixa, ela sai inteira.
 *
 * Por isso "quanto tem no estoque" deixou de ser CONTAR etiquetas e passou a
 * ser SOMAR o que cada uma vale. É um erro de uma palavra (`count` no lugar de
 * `sum`) que não dá erro em lugar nenhum: uma caixa de 50 conta como 1, o
 * estoque fica 50× menor do que a prateleira, a automação manda fabricar o que
 * já está lá e ninguém desconfia até alguém contar na mão.
 *
 * A regra vive em dois lugares que precisam dizer a MESMA coisa: a trigger do
 * banco (`estoque_recontar_unidades`, que mantém `estoque_itens.quantidade`) e
 * as funções puras daqui, que a tela usa pra somar o que já baixou. Este teste
 * cobre os dois — o segundo bloco lê o SQL como texto porque DDL não roda aqui.
 */

describe("caixa: uma etiqueta pode valer várias peças", () => {
  describe("pecasDaUnidade", () => {
    it("caixa de 50 vale 50 peças", () => {
      expect(pecasDaUnidade({ quantidade: 50 })).toBe(50);
    });

    it("unidade avulsa vale 1", () => {
      expect(pecasDaUnidade({ quantidade: 1 })).toBe(1);
    });

    it("sem a coluna `quantidade` vale 1 — nunca 0", () => {
      // O banco de quem ainda não rodou o SQL não devolve a coluna. Ler isso
      // como 0 zeraria a prateleira inteira em silêncio; a leitura certa é
      // "uma etiqueta = uma peça", que é como o galpão funcionava antes.
      expect(pecasDaUnidade({})).toBe(1);
      expect(pecasDaUnidade({ quantidade: null })).toBe(1);
      expect(pecasDaUnidade({ quantidade: undefined })).toBe(1);
    });

    it("valor inválido (0, negativo, quebrado, texto) também vale 1", () => {
      expect(pecasDaUnidade({ quantidade: 0 })).toBe(1);
      expect(pecasDaUnidade({ quantidade: -5 })).toBe(1);
      expect(pecasDaUnidade({ quantidade: 2.7 })).toBe(2);
      expect(pecasDaUnidade({ quantidade: "12" as unknown as number })).toBe(12);
      expect(pecasDaUnidade({ quantidade: "abc" as unknown as number })).toBe(1);
    });
  });

  describe("pecasEmEstoque", () => {
    it("uma caixa de 50 + uma de 1 = 51 peças, não 2 etiquetas", () => {
      const total = pecasEmEstoque([
        { status: "em_estoque", quantidade: 50 },
        { status: "em_estoque", quantidade: 1 },
      ]);
      expect(total, "contou etiqueta em vez de somar o que cada uma vale").toBe(51);
    });

    it("só conta o que está em estoque — baixada saiu", () => {
      expect(pecasEmEstoque([
        { status: "em_estoque", quantidade: 50 },
        { status: "consumido", quantidade: 30 },
        { status: "expedido", quantidade: 10 },
      ])).toBe(50);
    });

    it("lista vazia é 0", () => {
      expect(pecasEmEstoque([])).toBe(0);
    });

    it("unidade sem `quantidade` conta 1 cada — o comportamento antigo", () => {
      expect(pecasEmEstoque([
        { status: "em_estoque" },
        { status: "em_estoque" },
        { status: "em_estoque" },
      ])).toBe(3);
    });
  });

  describe("ehCaixa / rotuloDeCaixa", () => {
    it("caixa é quantidade > 1; avulsa não é caixa", () => {
      expect(ehCaixa({ quantidade: 50 })).toBe(true);
      expect(ehCaixa({ quantidade: 1 })).toBe(false);
      expect(ehCaixa({})).toBe(false);
    });

    it("o rótulo diz o que a pessoa vai encontrar na prateleira", () => {
      expect(rotuloDeCaixa({ quantidade: 50 })).toBe("Caixa · 50 un");
      expect(rotuloDeCaixa({ quantidade: 1 })).toBe("1 un");
      expect(rotuloDeCaixa({})).toBe("1 un");
    });
  });
});

// ── O banco tem que dizer a mesma coisa ──────────────────────────────────────
// DDL não roda neste ambiente, então a trava aqui é sobre o TEXTO do SQL. Vale
// a pena mesmo assim: o erro que este teste pega é literalmente trocar `sum`
// por `count` numa linha, e nada mais no repositório olha pra dentro do SQL.
describe("a recontagem do banco soma peças, não conta etiquetas", () => {
  const ARQUIVOS = [
    "../../supabase/estoque_hierarquia_unidades.sql",
    "../../supabase/estoque_pendente_tudo.sql",
  ];

  /** Corpo de `create or replace function <nome> ... $$ ... $$`. */
  function corpoDaFuncao(sql: string, nome: string): string {
    const inicio = sql.indexOf(`function public.${nome}`);
    if (inicio < 0) return "";
    const abre = sql.indexOf("$$", inicio);
    const fecha = sql.indexOf("$$", abre + 2);
    return sql.slice(abre, fecha);
  }

  for (const rel of ARQUIVOS) {
    const sql = readFileSync(join(__dirname, rel), "utf8");

    it(`${rel}: estoque_recontar_unidades soma \`quantidade\``, () => {
      const corpo = corpoDaFuncao(sql, "estoque_recontar_unidades");
      expect(corpo, "a função de recontagem sumiu deste arquivo").not.toBe("");
      expect(
        /sum\(\s*u\.quantidade\s*\)/.test(corpo),
        "a recontagem tem que SOMAR `u.quantidade`: com `count(*)` uma caixa de " +
        "50 conta como 1 e o estoque inteiro fica errado sem ninguém ver",
      ).toBe(true);
      expect(/count\(\s*\*\s*\)/.test(corpo), "sobrou um count(*) na recontagem").toBe(false);
    });

    it(`${rel}: a guarda do item compara com a SOMA das etiquetas`, () => {
      // `estoque_itens_guarda` (c) estoura quando alguém escreve `quantidade`
      // à mão num item serializado. Ela compara o valor digitado com o que as
      // etiquetas valem — se continuasse comparando com a CONTAGEM, todo item
      // com caixa passaria a estourar essa exceção a cada recontagem legítima.
      const corpo = corpoDaFuncao(sql, "estoque_itens_guarda");
      expect(corpo, "a guarda sumiu deste arquivo").not.toBe("");
      expect(/coalesce\(sum\(quantidade\)/.test(corpo)).toBe(true);
    });

    it(`${rel}: a coluna \`quantidade\` da unidade existe e é > 0`, () => {
      expect(/estoque_unidades[\s\S]*?add column if not exists quantidade/.test(sql)).toBe(true);
      expect(/check \(quantidade > 0\)/.test(sql)).toBe(true);
    });

    it(`${rel}: a baixa sabe de qual atividade veio`, () => {
      expect(/add column if not exists baixa_atividade_id/.test(sql)).toBe(true);
    });
  }
});
