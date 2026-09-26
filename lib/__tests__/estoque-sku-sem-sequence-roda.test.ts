import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * supabase/estoque_sku_sem_sequence.sql roda mesmo — contra Postgres de verdade.
 *
 * O que este arquivo prova é a TROCA: o número do SKU passa a sair da tabela
 * (`max+1`) em vez de uma sequence à parte. A sequence tinha derivado 6450
 * números à frente do catálogo porque `nextval` não volta atrás quando o INSERT
 * falha — e INSERT falho é rotina aqui (o importador reinsere linha a linha
 * quando o lote quebra).
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const ANTIGO = readFileSync(join(RAIZ, "supabase", "estoque_sku_automatico.sql"), "utf8");
const NOVO = readFileSync(join(RAIZ, "supabase", "estoque_sku_sem_sequence.sql"), "utf8");

const ANTES = `
create table public.estoque_itens (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  sku text,
  quantidade int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.estoque_itens (nome, sku) values
  ('Almofada 11', 'PRD-0001'),
  ('Alavanca',    'PRD-0248');
`;

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(ANTES);
  // Parte do estado REAL: o arquivo antigo já rodou, a sequence existe.
  await db.exec(ANTIGO);
}, 60_000);

async function sku(nome: string): Promise<string> {
  await db.exec(`insert into estoque_itens (nome) values ('${nome}')`);
  const { rows } = await db.query<{ sku: string }>("select sku from estoque_itens where nome = $1", [nome]);
  return rows[0].sku;
}

describe("supabase/estoque_sku_sem_sequence.sql", () => {
  it("o problema EXISTE antes: a sequence deriva quando o INSERT falha", async () => {
    // Reproduz o que o importador faz: tenta, falha, tenta de novo. Cada
    // tentativa perdida queima um `nextval` que não volta.
    for (let i = 0; i < 5; i++) {
      await db.exec("begin");
      await db.exec("insert into estoque_itens (nome) values ('vai falhar')");
      await db.exec("rollback");
    }
    const antes = await sku("sonda antes");
    // Já deveria ser 0249 (o maior é 0248); a sequence entrega bem mais.
    expect(Number(antes.replace("PRD-", ""))).toBeGreaterThan(249);
    await db.exec("delete from estoque_itens where nome = 'sonda antes'");
  });

  it("depois da troca, o número volta a ser o vizinho do maior", async () => {
    await db.exec(NOVO);
    expect(await sku("primeiro depois")).toBe("PRD-0249");
    expect(await sku("segundo depois")).toBe("PRD-0250");
  });

  it("INSERT que falha NÃO abre buraco — é o ganho da troca", async () => {
    for (let i = 0; i < 5; i++) {
      await db.exec("begin");
      await db.exec("insert into estoque_itens (nome) values ('falha de novo')");
      await db.exec("rollback");
    }
    expect(await sku("depois das falhas")).toBe("PRD-0251");
  });

  it("a sequence e o apoio dela SUMIRAM — segunda fonte da verdade não sobrevive", async () => {
    await expect(db.query("select last_value from public.estoque_sku_seq")).rejects.toThrow();
    await expect(db.query("select public.currval_ou_zero()")).rejects.toThrow();
  });

  it("SKU escolhido à mão é respeitado, e o próximo já o enxerga", async () => {
    await db.exec("insert into estoque_itens (nome, sku) values ('importado', 'PRD-0400')");
    expect(await sku("depois do importado")).toBe("PRD-0401");
  });

  it("código repetido continua recusado PELO BANCO, inclusive na caixa trocada", async () => {
    await expect(db.exec("insert into estoque_itens (nome, sku) values ('dup', 'PRD-0001')")).rejects.toThrow(/unique|duplicate/i);
    await expect(db.exec("insert into estoque_itens (nome, sku) values ('dup2', 'prd-0001')")).rejects.toThrow(/unique|duplicate/i);
  });

  it("um LOTE numera em sequência — a planilha não sai toda com o mesmo número", async () => {
    // Dentro da mesma transação o `max` já enxerga as linhas inseridas antes,
    // que é o que faz a importação continuar funcionando sem a sequence.
    await db.exec(`insert into estoque_itens (nome) values ('lote a'), ('lote b'), ('lote c')`);
    const { rows } = await db.query<{ sku: string }>(
      "select sku from estoque_itens where nome like 'lote %' order by sku",
    );
    const nums = rows.map((r) => Number(r.sku.replace("PRD-", "")));
    expect(new Set(nums).size).toBe(3);
    expect(nums[1]).toBe(nums[0] + 1);
    expect(nums[2]).toBe(nums[1] + 1);
  });

  it("rodar DE NOVO não renumera nem quebra", async () => {
    const antes = (await db.query<{ n: string }>("select count(*) as n from estoque_itens")).rows[0].n;
    await db.exec(NOVO);
    const depois = (await db.query<{ n: string }>("select count(*) as n from estoque_itens")).rows[0].n;
    expect(depois).toBe(antes);
    expect(await sku("pos segunda rodada")).toMatch(/^PRD-\d{4}$/);
  });

  it("catálogo VAZIO começa em PRD-0001", async () => {
    const zero = new PGlite();
    await zero.exec(`
      create table public.estoque_itens (
        id uuid primary key default gen_random_uuid(),
        nome text not null, sku text, quantidade int not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);
    await zero.exec(NOVO);
    await zero.exec("insert into estoque_itens (nome) values ('primeiro da casa')");
    const { rows } = await zero.query<{ sku: string }>("select sku from estoque_itens");
    expect(rows[0].sku).toBe("PRD-0001");
  }, 60_000);
});
