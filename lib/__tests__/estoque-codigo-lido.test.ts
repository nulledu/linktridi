import { describe, expect, it } from "vitest";
import { classificarCodigos, fraseDoCodigoDesconhecido } from "@/lib/estoque-codigo-lido";

// ── "Não existe no sistema" para um produto que existe ───────────────────────
//
// O defeito que este arquivo guarda não foi de código quebrado: foi de PERGUNTA
// ERRADA. A tela de bipar saída procurava o código só em `estoque_unidades`, e
// respondia "não existe" quando não achava. Medido no banco do galpão no dia em
// que isto foi escrito: 263 dos 274 itens são de código fixo (a etiqueta é o
// SKU) e o catálogo inteiro tinha 10 etiquetas de unidade. Ou seja: a resposta
// errada era o caso NORMAL, e ela acusava o cadastro — que estava certo.
//
// Quem quebrar isto de novo não vai apagar a função: vai inverter a ordem das
// duas buscas (e aí a etiqueta de peça baixaria o saldo do item inteiro), ou
// vai deixar o SKU duplicado escolher um item ao acaso.

/** Um Supabase de mentira, com só o que `classificarCodigos` usa. */
function bancoFalso(tabelas: {
  unidades?: Record<string, unknown>[];
  itens?: Record<string, unknown>[];
  erroUnidades?: { code: string; message: string };
}) {
  return {
    from(tabela: string) {
      const consulta = {
        _valores: [] as string[],
        _campo: "",
        select() { return consulta; },
        in(campo: string, valores: string[]) { consulta._campo = campo; consulta._valores = valores; return consulta; },
        limit() {
          if (tabela === "estoque_unidades") {
            if (tabelas.erroUnidades) return Promise.resolve({ data: null, error: tabelas.erroUnidades });
            return Promise.resolve({
              data: (tabelas.unidades ?? []).filter((u) => consulta._valores.includes(String(u.codigo))),
              error: null,
            });
          }
          return Promise.resolve({
            data: (tabelas.itens ?? []).filter((i) => consulta._valores.includes(String(i[consulta._campo]))),
            error: null,
          });
        },
      };
      return consulta;
    },
  };
}

const ALMOFADA = { id: "i1", nome: "Almofada 11", sku: "PRD-0001", quantidade: 26, unidade: "un", serializado: false };
const ALAVANCA = { id: "i2", nome: "Alavanca", sku: "PRD-0007", quantidade: 30, unidade: "un", serializado: true };

describe("o que é este código", () => {
  it("etiqueta de PRODUTO é reconhecida — e não vira 'não existe'", async () => {
    const db = bancoFalso({ unidades: [], itens: [ALMOFADA] });

    const [r] = await classificarCodigos(db, ["PRD-0001"]);

    expect(r.tipo).toBe("produto");
    expect(r.item).toBe("Almofada 11");
    expect(r.itemId).toBe("i1");
    // O saldo vem junto: é o que decide se dá pra tirar 5 de um item que tem 3.
    expect(r.saldo).toBe(26);
  });

  it("etiqueta de UNIDADE ganha a etiqueta, não o saldo do item", async () => {
    // A ordem importa: `PRD-0007-000042` também começa com um SKU. Resolver
    // pelo produto primeiro baixaria o item inteiro em vez da peça na mão.
    const db = bancoFalso({
      unidades: [{ codigo: "PRD-0007-000042", status: "em_estoque", item_id: "i2", quantidade: 50 }],
      itens: [ALAVANCA],
    });

    const [r] = await classificarCodigos(db, ["PRD-0007-000042"]);

    expect(r.tipo).toBe("unidade");
    expect(r.pecas).toBe(50);
    expect(r.status).toBe("em_estoque");
  });

  it("o que não é nem um nem outro é o ÚNICO 'não existe'", async () => {
    const db = bancoFalso({ unidades: [], itens: [ALMOFADA] });

    const [r] = await classificarCodigos(db, ["7891234567890"]);

    expect(r.tipo).toBe("nenhum");
    // E a frase acusa o que é de fato provável — o código de barras do
    // fornecedor —, em vez de acusar o cadastro do galpão.
    expect(fraseDoCodigoDesconhecido("7891234567890")).toMatch(/fornecedor/i);
  });

  it("SKU duplicado é ausência, nunca escolha ao acaso", async () => {
    // Dois itens com o mesmo SKU é cadastro torto. Tirar peça do item errado é
    // o pior desfecho: o número fecha e ninguém procura.
    const db = bancoFalso({
      unidades: [],
      itens: [ALMOFADA, { ...ALMOFADA, id: "i9", nome: "Almofada 11 (duplicada)" }],
    });

    const [r] = await classificarCodigos(db, ["PRD-0001"]);

    expect(r.tipo).toBe("nenhum");
  });

  it("classifica o lote inteiro numa consulta por tabela", async () => {
    const db = bancoFalso({
      unidades: [{ codigo: "PRD-0007-000042", status: "baixada", item_id: "i2", quantidade: 1 }],
      itens: [ALMOFADA, ALAVANCA],
    });

    const r = await classificarCodigos(db, ["PRD-0001", "PRD-0007-000042", "LIXO"]);

    expect(r.map((x) => x.tipo)).toEqual(["produto", "unidade", "nenhum"]);
    // Etiqueta que já saiu continua sendo unidade — quem decide o desfecho é a
    // baixa, e ela tem uma frase própria ("já tinha saído").
    expect(r[1].status).toBe("baixada");
  });

  it("banco sem a coluna da caixa continua respondendo", async () => {
    // `quantidade` só existe depois do SQL da caixa, que roda na mão. Bipar é o
    // que o galpão faz o dia inteiro: pedir uma coluna ausente não pode
    // derrubar a leitura — sem ela cada etiqueta vale 1, como antes.
    const db = {
      _tentativas: 0,
      from(tabela: string) {
        const q = {
          _valores: [] as string[],
          _campo: "",
          _colunas: "",
          select(c: string) { q._colunas = c; return q; },
          in(campo: string, v: string[]) { q._campo = campo; q._valores = v; return q; },
          limit() {
            if (tabela === "estoque_unidades" && q._colunas.includes("quantidade")) {
              return Promise.resolve({ data: null, error: { code: "42703", message: "column does not exist" } });
            }
            if (tabela === "estoque_unidades") {
              return Promise.resolve({ data: [{ codigo: "PRD-0007-000042", status: "em_estoque", item_id: "i2" }], error: null });
            }
            return Promise.resolve({ data: [ALAVANCA], error: null });
          },
        };
        return q;
      },
    };

    const [r] = await classificarCodigos(db, ["PRD-0007-000042"]);

    expect(r.tipo).toBe("unidade");
    expect(r.pecas).toBe(1);
  });
});
