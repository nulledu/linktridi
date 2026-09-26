import { describe, expect, it } from "vitest";
import { buscarOperadorAtivo } from "@/app/api/estoque/device/_device";

// M3 da auditoria: a baixa/recebimento do leitor grava "quem baixou" a partir
// do operadorId que o aparelho manda. Antes bastava o perfil estar ATIVO — um
// token comprometido podia carimbar com o id de qualquer pessoa (até um admin).
// Agora o operador precisa ser um LEITOR CADASTRADO (ter codigo_acesso).

// db falso: from(tabela) → builder encadeável que resolve no resultado da tabela.
function fakeDb(porTabela: Record<string, { data?: unknown; error?: unknown }>) {
  return {
    from(tabela: string) {
      const resultado = porTabela[tabela] ?? { data: null };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => resultado,
      };
      return builder;
    },
  } as unknown as Parameters<typeof buscarOperadorAtivo>[0];
}

const ATIVO = { data: { id: "u1", name: "Ana", active: true } };
const INATIVO = { data: { id: "u1", name: "Ana", active: false } };

describe("buscarOperadorAtivo", () => {
  it("aceita perfil ativo COM codigo_acesso (leitor cadastrado)", async () => {
    const db = fakeDb({ profiles: ATIVO, employees: { data: { codigo_acesso: "1234" } } });
    expect(await buscarOperadorAtivo(db, "u1")).toEqual({ id: "u1", nome: "Ana" });
  });

  it("rejeita perfil ativo SEM codigo_acesso (não é operador do galpão)", async () => {
    const db = fakeDb({ profiles: ATIVO, employees: { data: { codigo_acesso: null } } });
    expect(await buscarOperadorAtivo(db, "u1")).toBeNull();
  });

  it("rejeita quando não há linha de employee para o id", async () => {
    const db = fakeDb({ profiles: ATIVO, employees: { data: null } });
    expect(await buscarOperadorAtivo(db, "u1")).toBeNull();
  });

  it("rejeita perfil inativo, com ou sem código", async () => {
    const db = fakeDb({ profiles: INATIVO, employees: { data: { codigo_acesso: "1234" } } });
    expect(await buscarOperadorAtivo(db, "u1")).toBeNull();
  });

  it("é tolerante: sem a coluna codigo_acesso (42703), mantém o comportamento antigo", async () => {
    const db = fakeDb({
      profiles: ATIVO,
      employees: { data: null, error: { code: "42703", message: "column employees.codigo_acesso does not exist" } },
    });
    expect(await buscarOperadorAtivo(db, "u1")).toEqual({ id: "u1", nome: "Ana" });
  });

  it("é tolerante a blip de infra (erro não-42703): não vira operador_invalido definitivo", async () => {
    // Um erro transitório na 2ª consulta NÃO pode rejeitar o operador — o app
    // trata operador_invalido (4xx) como falha definitiva e a baixa some da fila.
    const db = fakeDb({
      profiles: ATIVO,
      employees: { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } },
    });
    expect(await buscarOperadorAtivo(db, "u1")).toEqual({ id: "u1", nome: "Ana" });
  });
});
