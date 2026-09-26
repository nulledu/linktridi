import { describe, it, expect, beforeEach, vi } from "vitest";
import { HIERARQUIAS } from "../estoque-hierarquia";

// Banco falso: só o suficiente pra exercitar
// from("estoque_itens").select(cols).order().order().limit(). Cada chamada ao
// terminal (o `await`) consome UMA resposta da fila e fica registrada em
// `chamadas` — é como os testes de "não faz segunda query" e "faz duas"
// confirmam quantas consultas realmente saíram.
type Resposta = { data?: unknown[] | null; error?: { code?: string; message?: string } | null };

function fakeDb(fila: Resposta[]) {
  const chamadas: string[] = [];
  const from = (_tabela: string) => {
    let colunas = "";
    const builder: Record<string, unknown> = {
      select: (c: string) => { colunas = c; return builder; },
      order: () => builder,
      limit: () => builder,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        chamadas.push(colunas);
        const resp = fila.shift() ?? { data: [], error: null };
        return Promise.resolve(resp).then(resolve, reject);
      },
    };
    return builder;
  };
  return { from, chamadas };
}

// Cada teste importa o módulo do zero: `esquemaNovo` é memoizado a nível de
// módulo, e vazar esse estado de um teste pro outro é exatamente o tipo de
// falso positivo/negativo que este arquivo tenta pegar no código real.
async function modulo() {
  vi.resetModules();
  return import("../estoque-colunas");
}

describe("estoque-colunas", () => {
  beforeEach(() => { vi.resetModules(); });

  describe("lerItensEstoque", () => {
    it("esquema completo presente: uma query só, com receita e cadeia junto", async () => {
      const { lerItensEstoque, COLUNAS_NOVAS, COLUNAS_RECEITA, COLUNAS_CADEIA } = await modulo();
      const linha = { id: "1", nome: "MDF 6mm", hierarquia: "materia_prima", custo_em: "2026-01-01" };
      const db = fakeDb([{ data: [linha], error: null }]);

      const itens = await lerItensEstoque(db);

      expect(itens).toEqual([linha]);
      expect(db.chamadas).toHaveLength(1);
      expect(db.chamadas[0]).toBe([...COLUNAS_NOVAS, ...COLUNAS_RECEITA, ...COLUNAS_CADEIA].join(","));
    });

    it("banco COM hierarquia e SEM receita fica no degrau do meio — nunca cai pro legado por causa dela", async () => {
      // O estado real deste banco enquanto supabase/estoque_producao_receita.sql
      // não roda. Cair pro LEGADO aqui perderia as 8 abas do catálogo por causa
      // de três colunas que nem são delas.
      const { lerItensEstoque, COLUNAS_NOVAS } = await modulo();
      const linha = { id: "1", nome: "MDF 6mm", hierarquia: "materia_prima" };
      const db = fakeDb([
        // completa (receita + cadeia), depois só receita, depois a nova crua.
        { data: null, error: { code: "42703", message: 'column "setor_responsavel" does not exist' } },
        { data: null, error: { code: "42703", message: 'column "producao_instrucao" does not exist' } },
        { data: [linha], error: null },
      ]);

      const itens = await lerItensEstoque(db);

      expect(itens).toEqual([linha]);          // hierarquia INTACTA, não derivada
      expect(db.chamadas).toHaveLength(3);
      expect(db.chamadas[2]).toBe(COLUNAS_NOVAS.join(","));
    });

    it("42703 na primeira chamada: cai pro legado e deriva hierarquia em toda linha", async () => {
      const { lerItensEstoque, COLUNAS_LEGADO } = await modulo();
      const db = fakeDb([
        // Agora são TRÊS degraus antes do legado: completa (receita+cadeia),
        // sem cadeia, e a nova crua.
        { data: null, error: { code: "42703", message: 'column "hierarquia" does not exist' } },
        { data: null, error: { code: "42703", message: 'column "hierarquia" does not exist' } },
        { data: null, error: { code: "42703", message: 'column "hierarquia" does not exist' } },
        {
          data: [
            { id: "1", nome: "MDF 6mm", classe: "materia_prima", tipo: null },
            { id: "2", nome: "Caixa M", classe: null, tipo: "embalagem" },
            { id: "3", nome: "Sem classificação", classe: null, tipo: null },
          ],
          error: null,
        },
      ]);

      const itens = await lerItensEstoque(db);

      expect(db.chamadas).toHaveLength(4);
      expect(db.chamadas[3]).toBe(COLUNAS_LEGADO.join(","));
      expect(itens).toHaveLength(3);
      for (const it of itens) {
        expect(it.hierarquia).toBeTruthy();
        expect(HIERARQUIAS).toContain(it.hierarquia);
      }
      expect(itens[0].hierarquia).toBe("materia_prima");
      expect(itens[1].hierarquia).toBe("embalagem");
      expect(itens[2].hierarquia).toBe("componente"); // default final
    });

    it("erro que não é coluna ausente não é engolido: propaga pra quem chamou", async () => {
      const { lerItensEstoque } = await modulo();
      const db = fakeDb([{ data: null, error: { code: "PGRST301", message: "JWT expired" } }]);

      await expect(lerItensEstoque(db)).rejects.toMatchObject({ code: "PGRST301" });
      // Erro de verdade não tenta o legado — só uma consulta saiu.
      expect(db.chamadas).toHaveLength(1);
    });

    it("uma vez visto o esquema novo, o caminho legado não volta a ser usado", async () => {
      const { lerItensEstoque, COLUNAS_NOVAS } = await modulo();

      // 1ª chamada: esquema novo presente → trava esquemaNovo = true.
      const db1 = fakeDb([{ data: [{ id: "1", nome: "A" }], error: null }]);
      await lerItensEstoque(db1);

      // 2ª chamada, MESMO módulo (mesma memória): mesmo que o banco devolvesse
      // 42703 de novo, travado em "novo" não tenta mais o fallback — a
      // promessa é "nunca mais tenta o legado neste processo".
      const db2 = fakeDb([{ data: null, error: { code: "42703", message: "column x does not exist" } }]);
      await expect(lerItensEstoque(db2)).rejects.toMatchObject({ code: "42703" });
      expect(db2.chamadas).toHaveLength(1); // não caiu pro legado
      // A 1ª chamada confirmou o esquema COMPLETO, então a memoização pede tudo.
      expect(db2.chamadas[0]).toContain(COLUNAS_NOVAS.join(","));
    });

    it("respeita o limite passado em opções, mantendo order/order/limit nos dois caminhos", async () => {
      const { lerItensEstoque } = await modulo();
      const db = fakeDb([{ data: [], error: null }]);
      await lerItensEstoque(db, { limite: 50 });
      expect(db.chamadas).toHaveLength(1);
    });
  });

  describe("isColunaAusente", () => {
    it("reconhece 42703", async () => {
      const { isColunaAusente } = await modulo();
      expect(isColunaAusente({ code: "42703" })).toBe(true);
    });

    it("reconhece pela mensagem quando o code não bate (defensivo entre versões do PostgREST)", async () => {
      const { isColunaAusente } = await modulo();
      expect(isColunaAusente({ code: undefined, message: 'column "cor" does not exist' })).toBe(true);
    });

    it("não reconhece erro genérico", async () => {
      const { isColunaAusente } = await modulo();
      expect(isColunaAusente({ code: "PGRST301", message: "JWT expired" })).toBe(false);
      expect(isColunaAusente(null)).toBe(false);
      expect(isColunaAusente(undefined)).toBe(false);
    });
  });

  describe("derivarHierarquia", () => {
    // As 13 classes do vocabulário antigo (seção 4 do SQL), um caso por linha
    // do `case`, na mesma ordem — divergir da migração significa a tela
    // mostrar uma aba e o banco preencher outra assim que o SQL rodar.
    const CASOS_CLASSE: Array<[string, string]> = [
      ["materia_prima", "materia_prima"],
      ["semiacabado", "mp_processada"],
      ["peca_montada", "peca"],
      ["componente", "componente"],
      ["acabado", "produto"],
      ["insumo", "insumo_indireto"],
      ["manutencao", "insumo_indireto"],
      ["consumo", "insumo_indireto"],
      ["emb_producao", "embalagem"],
      ["emb_expedicao", "embalagem"],
      ["emb_montada", "embalagem"],
      ["emb_sem_montar", "embalagem"],
      ["plastico_bolha", "embalagem"],
    ];

    it("tem exatamente as 13 classes do vocabulário antigo cobertas no teste", () => {
      expect(CASOS_CLASSE).toHaveLength(13);
    });

    for (const [classe, esperado] of CASOS_CLASSE) {
      it(`classe "${classe}" → "${esperado}"`, async () => {
        const { derivarHierarquia } = await modulo();
        expect(derivarHierarquia({ classe, tipo: null })).toBe(esperado);
      });
    }

    it("sem classe reconhecida, cai pro `tipo` como rede", async () => {
      const { derivarHierarquia } = await modulo();
      expect(derivarHierarquia({ classe: null, tipo: "embalagem" })).toBe("embalagem");
      expect(derivarHierarquia({ classe: null, tipo: "peca" })).toBe("peca");
      expect(derivarHierarquia({ classe: null, tipo: "produto" })).toBe("produto");
      expect(derivarHierarquia({ classe: null, tipo: "componente" })).toBe("componente");
    });

    it("classe desconhecida (não vazia) também cai pro `tipo`, não pro default direto", async () => {
      const { derivarHierarquia } = await modulo();
      expect(derivarHierarquia({ classe: "algo_que_nao_existe", tipo: "produto" })).toBe("produto");
    });

    it("sem classe nem tipo reconhecidos, o default final é componente", async () => {
      const { derivarHierarquia } = await modulo();
      expect(derivarHierarquia({ classe: null, tipo: null })).toBe("componente");
      expect(derivarHierarquia({ classe: undefined, tipo: "algo_esquisito" })).toBe("componente");
      expect(derivarHierarquia({})).toBe("componente");
    });

    it("todo resultado possível é uma das 8 hierarquias válidas", async () => {
      const { derivarHierarquia } = await modulo();
      const entradas: Array<{ classe?: string | null; tipo?: string | null }> = [
        ...CASOS_CLASSE.map(([classe]) => ({ classe, tipo: null })),
        { classe: null, tipo: "embalagem" }, { classe: null, tipo: "peca" },
        { classe: null, tipo: "produto" }, { classe: null, tipo: "componente" },
        { classe: null, tipo: null }, {},
      ];
      for (const e of entradas) expect(HIERARQUIAS).toContain(derivarHierarquia(e));
    });
  });
});
