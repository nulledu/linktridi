import { describe, it, expect } from "vitest";
import type { Atividade } from "@/lib/atividades-catalog";
import { estagioDaAtividade, jaEntrouNoEstoque, nascidaDaAutomacao, APARENCIA } from "@/lib/atividades-estagio";

/**
 * A conferência de atividade saiu em 11/09/2026 (pedido do dono; ver
 * lib/conferencia-de-atividade.ts): concluir FECHA a atividade, e nada entra
 * no estoque por ela. Não existe mais "aguardando conferência". O que sobra é
 * ler o passado: atividade conferida antes continua dizendo que as peças
 * entraram — é isso que decide se "reabrir" precisa avisar.
 */

const base: Atividade = {
  id: "a1", categoria: "Almofadas", tarefa: "Montar estrutura da almofada 6",
  detalhe: null, para_id: "op-1", para_nome: "Operador", por_id: "ger-1", por_nome: "Gestora",
  status: "pendente", prazo: null, quantidade_alvo: 3, quantidade_feita: 0,
  tempo_estimado_min: 40, iniciada_at: null, produto_id: null, produto_nome: null,
  estoque_lancado: false, created_at: "2026-08-10T12:00:00.000Z", concluida_at: null,
  foto_url: null, impedida: false, motivo_impedimento: null,
} as Atividade;

const comProduto = (extra: Partial<Atividade> = {}): Atividade => ({
  ...base, status: "concluida", produto_nome: "Almofada 6",
  concluida_at: "2026-08-10T13:00:00.000Z", quantidade_feita: 3, ...extra,
});

describe("em que pé está a atividade", () => {
  it("aberta continua sendo o que o status diz", () => {
    expect(estagioDaAtividade(base)).toBe("pendente");
    expect(estagioDaAtividade({ ...base, status: "em_andamento" })).toBe("em_andamento");
  });

  it("concluída é concluída — com produto ou sem, ninguém espera conferência", () => {
    expect(estagioDaAtividade(comProduto())).toBe("concluida");
    expect(estagioDaAtividade({ ...comProduto(), produto_nome: null })).toBe("concluida");
  });

  it("o passado continua legível: conferida e recusada (antes de 11/09)", () => {
    expect(estagioDaAtividade(comProduto({ estoque_lancado: true }))).toBe("conferida");
    expect(estagioDaAtividade(comProduto({ estoque_lancado: true, quantidade_feita: 0 }))).toBe("recusada");
  });

  it("só a conferida antes entrou no estoque; a concluída de agora, não", () => {
    expect(jaEntrouNoEstoque(comProduto({ estoque_lancado: true }))).toBe(true);
    expect(jaEntrouNoEstoque(comProduto({ estoque_lancado: true, quantidade_feita: 0 }))).toBe(true);
    expect(jaEntrouNoEstoque(comProduto())).toBe(false);
    expect(jaEntrouNoEstoque(base)).toBe(false);
  });

  it("não existe mais etiqueta de 'aguardando conferência'", () => {
    expect(Object.keys(APARENCIA)).not.toContain("aguardando_conferencia");
  });

  it("toda etiqueta tem cor de token, nunca hex", () => {
    for (const [estagio, ap] of Object.entries(APARENCIA)) {
      expect(ap.cor, `${estagio} usa cor crua`).toMatch(/^var\(--/);
      expect(ap.label.length, `${estagio} tem etiqueta longa demais pro card de 320px`).toBeLessThanOrEqual(26);
    }
  });
});

describe("de onde veio a atividade", () => {
  it("a varredura de reposição se identifica", () => {
    // lib/requisicoes.ts insere com por_id null e por_nome "Sistema (requisição)".
    expect(nascidaDaAutomacao({ por_id: null as unknown as string, por_nome: "Sistema (requisição)" })).toBe(true);
    expect(nascidaDaAutomacao({ por_id: "", por_nome: "" })).toBe(true);
  });

  it("atividade criada por gente não vira 'automática'", () => {
    expect(nascidaDaAutomacao({ por_id: "ger-1", por_nome: "Gestora" })).toBe(false);
    // Nome de pessoa que por acaso contém "sistema" no meio não conta.
    expect(nascidaDaAutomacao({ por_id: "ger-2", por_nome: "Ana do Sistema" })).toBe(false);
  });
});
