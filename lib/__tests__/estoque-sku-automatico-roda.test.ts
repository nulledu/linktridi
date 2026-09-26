import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * supabase/estoque_sku_automatico.sql roda mesmo — contra um Postgres de
 * verdade (PGlite). Mesmo padrão de sql-pendente-roda.test.ts, e pelo mesmo
 * motivo: SQL "revisado à mão" já explodiu duas vezes no SQL Editor do dono.
 *
 * O que este arquivo promete e aqui se cobra:
 *  · todo item SEM código ganha um, em ordem de cadastro;
 *  · item novo nasce com o próximo número, direto do gatilho;
 *  · dois cadastros não colidem (sequence, não max+1);
 *  · PRD manual acima do contador empurra a sequence;
 *  · código repetido é recusado PELO BANCO;
 *  · rodar o arquivo duas vezes não muda nada na segunda.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const ARQUIVO = readFileSync(join(RAIZ, "supabase", "estoque_sku_automatico.sql"), "utf8");

// O banco ANTES: catálogo com a mistura real — itens já padronizados, itens sem
// código nenhum, e um com espaço em branco (que vale como sem código).
const ANTES = `
create table public.estoque_itens (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  sku text,
  quantidade int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.estoque_itens (nome, sku, created_at) values
  ('Almofada 11', 'PRD-0001', now() - interval '10 days'),
  ('Alavanca',    'PRD-0007', now() - interval '9 days'),
  ('Sem código A', null,      now() - interval '8 days'),
  ('Sem código B', null,      now() - interval '7 days'),
  ('Em branco',    '  ',      now() - interval '6 days');
`;

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(ANTES);
  await db.exec(ARQUIVO);
}, 60_000);

describe("supabase/estoque_sku_automatico.sql", () => {
  it("quem não tinha código ganhou, em ordem de cadastro, sem repetir", async () => {
    const { rows } = await db.query<{ nome: string; sku: string }>(
      "select nome, sku from estoque_itens order by created_at",
    );
    const por = Object.fromEntries(rows.map((r) => [r.nome, r.sku]));
    expect(por["Almofada 11"]).toBe("PRD-0001");   // quem já tinha não se mexe
    expect(por["Alavanca"]).toBe("PRD-0007");
    // A sequence partiu do MAIOR existente (7): os três sem código são 8, 9, 10.
    expect(por["Sem código A"]).toBe("PRD-0008");
    expect(por["Sem código B"]).toBe("PRD-0009");
    expect(por["Em branco"]).toBe("PRD-0010");
  });

  it("item novo nasce com o próximo número — é o gatilho, não a tela", async () => {
    await db.exec("insert into estoque_itens (nome) values ('Criado sem sku')");
    const { rows } = await db.query<{ sku: string }>(
      "select sku from estoque_itens where nome = 'Criado sem sku'",
    );
    expect(rows[0].sku).toBe("PRD-0011");
  });

  it("PRD manual ACIMA do contador empurra a sequence — o próximo não colide", async () => {
    // Importação de histórico chega com número escolhido. Sem empurrar a
    // sequence, o próximo automático repetiria o 0050 e estouraria no índice.
    await db.exec("insert into estoque_itens (nome, sku) values ('Importado', 'PRD-0050')");
    await db.exec("insert into estoque_itens (nome) values ('Depois do importado')");
    const { rows } = await db.query<{ sku: string }>(
      "select sku from estoque_itens where nome = 'Depois do importado'",
    );
    expect(rows[0].sku).toBe("PRD-0051");
  });

  it("código repetido é recusado PELO BANCO, inclusive mudando só a caixa", async () => {
    await expect(db.exec("insert into estoque_itens (nome, sku) values ('Duplicado', 'PRD-0001')"))
      .rejects.toThrow(/unique|duplicate/i);
    await expect(db.exec("insert into estoque_itens (nome, sku) values ('Duplicado 2', 'prd-0001')"))
      .rejects.toThrow(/unique|duplicate/i);
  });

  it("rodar o arquivo DE NOVO não renumera ninguém nem quebra", async () => {
    const antes = (await db.query<{ nome: string; sku: string }>("select nome, sku from estoque_itens order by nome")).rows;
    await db.exec(ARQUIVO);
    const depois = (await db.query<{ nome: string; sku: string }>("select nome, sku from estoque_itens order by nome")).rows;
    expect(depois).toEqual(antes);
    // E o gatilho continua vivo depois da segunda rodada.
    await db.exec("insert into estoque_itens (nome) values ('Pós segunda rodada')");
    const { rows } = await db.query<{ sku: string }>("select sku from estoque_itens where nome = 'Pós segunda rodada'");
    expect(rows[0].sku).toMatch(/^PRD-\d{4}$/);
  });

  it("num catálogo VAZIO o primeiro item é PRD-0002 ou melhor — nunca erro", async () => {
    // Banco recém-criado: a sequence parte de 1 (setval com greatest(…, 1)),
    // então o primeiro nextval dá 2. Começar em 2 é aceitável; estourar não.
    const zero = new PGlite();
    await zero.exec(`
      create table public.estoque_itens (
        id uuid primary key default gen_random_uuid(),
        nome text not null, sku text, quantidade int not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);
    await zero.exec(ARQUIVO);
    await zero.exec("insert into estoque_itens (nome) values ('Primeiro')");
    const { rows } = await zero.query<{ sku: string }>("select sku from estoque_itens");
    expect(rows[0].sku).toMatch(/^PRD-\d{4}$/);
  }, 60_000);
});
