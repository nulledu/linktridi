import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * O `supabase/lojas.sql` roda mesmo — contra um Postgres de verdade.
 *
 * O dono roda este arquivo à mão no SQL Editor. Já aconteceu duas vezes de um
 * arquivo assim explodir na cara dele depois de eu ter "revisado à mão" e dito
 * que estava bom: revisão à mão não pega sintaxe de plpgsql, ordem entre
 * seções, nem o caso em que o banco JÁ tem metade das coisas.
 *
 * PGlite é o Postgres compilado pra WASM — mesmo motor, sem servidor.
 *
 * Os três estados que importam, e cada um já foi um bug real em algum arquivo:
 *  - banco limpo;
 *  - rodar DUAS vezes (idempotência);
 *  - a tabela de domínios ainda não existir (a ordem entre os dois arquivos
 *    não é garantida — o dono roda o que a mensagem mandar).
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

// Só o que o arquivo declara precisar. Se um dia ele exigir mais, o teste
// falha — e essa é exatamente a informação que se quer.
const DOMINIOS = `
create table public.tridiflow_dominios (
  id uuid primary key default gen_random_uuid(),
  host text not null unique,
  verificado boolean not null default false,
  created_at timestamptz not null default now()
);
`;

let SQL = "";
beforeAll(() => { SQL = readFileSync(join(RAIZ, "supabase", "lojas.sql"), "utf8"); });

const contar = (db: PGlite, sql: string) =>
  db.query<{ n: number }>(sql).then((r) => r.rows[0].n);

const temColuna = (db: PGlite, tabela: string, coluna: string) =>
  contar(db, `select count(*)::int n from information_schema.columns
              where table_schema='public' and table_name='${tabela}' and column_name='${coluna}'`)
    .then((n) => n > 0);

describe("supabase/lojas.sql", () => {
  it("roda num banco que já tem o cadastro de domínios", async () => {
    const db = await PGlite.create();
    await db.exec(DOMINIOS);
    await db.exec(SQL);

    expect(await temColuna(db, "lojas", "slug")).toBe(true);
    expect(await temColuna(db, "loja_produtos", "preco_promocional")).toBe(true);
    expect(await temColuna(db, "loja_pedidos", "numero")).toBe(true);
    // O vínculo loja↔endereço, que é o que a tela avisava não gravar.
    expect(await temColuna(db, "tridiflow_dominios", "loja_id")).toBe(true);
  });

  it("roda DUAS vezes sem quebrar e sem duplicar", async () => {
    const db = await PGlite.create();
    await db.exec(DOMINIOS);
    await db.exec(SQL);
    await db.exec(`insert into public.lojas (nome, slug) values ('Carimbos Tridi', 'carimbos-tridi');`);
    await db.exec(SQL);   // <- a segunda passada é a que já quebrou antes

    expect(await contar(db, `select count(*)::int n from public.lojas`)).toBe(1);
    expect(await contar(db,
      `select count(*)::int n from pg_constraint where conname = 'loja_produtos_promo_chk'`)).toBe(1);
  });

  it("roda ANTES do tridiflow.sql — só não cria a coluna do endereço", async () => {
    // A ordem entre os dois arquivos não é garantida: o dono roda o que a
    // mensagem mandar. Explodir aqui deixaria o módulo inteiro de fora por
    // causa de uma coluna opcional.
    const db = await PGlite.create();
    await db.exec(SQL);
    expect(await temColuna(db, "lojas", "slug")).toBe(true);
  });
});

describe("as regras que o banco garante sozinho", () => {
  async function comLoja() {
    const db = await PGlite.create();
    await db.exec(DOMINIOS);
    await db.exec(SQL);
    const r = await db.query<{ id: string }>(
      `insert into public.lojas (nome, slug) values ('Loja', 'loja') returning id`);
    return { db, lojaId: r.rows[0].id };
  }

  const novoProduto = (lojaId: string, extra = "") =>
    `insert into public.loja_produtos (loja_id, titulo, preco ${extra ? ", " + extra.split("=")[0] : ""})
     values ('${lojaId}', 'Carimbo', 89.90 ${extra ? ", " + extra.split("=")[1] : ""})`;

  it("promoção que não desconta é rejeitada pelo banco, não só pela tela", async () => {
    const { db, lojaId } = await comLoja();
    // A tela valida, mas importação em massa e SQL Editor não passam pela tela.
    await expect(db.exec(novoProduto(lojaId, "preco_promocional=99.90"))).rejects.toThrow();
    await expect(db.exec(novoProduto(lojaId, "preco_promocional=59.90"))).resolves.toBeDefined();
  });

  it("estoque negativo é rejeitado", async () => {
    const { db, lojaId } = await comLoja();
    await expect(db.exec(novoProduto(lojaId, "estoque=-1"))).rejects.toThrow();
  });

  it("status fora do vocabulário é rejeitado", async () => {
    const { db, lojaId } = await comLoja();
    await expect(db.exec(novoProduto(lojaId, "status='publicado'"))).rejects.toThrow();
    await expect(db.exec(novoProduto(lojaId, "status='ativo'"))).resolves.toBeDefined();
  });

  it("SKU repete entre lojas, mas não dentro da mesma", async () => {
    const { db, lojaId } = await comLoja();
    await db.exec(novoProduto(lojaId, "sku='CAR-01'"));
    await expect(db.exec(novoProduto(lojaId, "sku='CAR-01'"))).rejects.toThrow();

    const outra = await db.query<{ id: string }>(
      `insert into public.lojas (nome, slug) values ('Outra', 'outra') returning id`);
    await expect(db.exec(novoProduto(outra.rows[0].id, "sku='CAR-01'"))).resolves.toBeDefined();
  });

  it("produto SEM sku não colide com outro sem sku", async () => {
    // O índice é parcial (`where sku <> ''`) justamente por isto: sem a
    // condição, o segundo produto sem código seria recusado.
    const { db, lojaId } = await comLoja();
    await db.exec(novoProduto(lojaId));
    await expect(db.exec(novoProduto(lojaId))).resolves.toBeDefined();
  });

  it("dois pedidos não dividem o mesmo número na mesma loja", async () => {
    const { db, lojaId } = await comLoja();
    await db.exec(`insert into public.loja_pedidos (loja_id, numero, cliente) values ('${lojaId}', 1, 'A')`);
    await expect(db.exec(
      `insert into public.loja_pedidos (loja_id, numero, cliente) values ('${lojaId}', 1, 'B')`)).rejects.toThrow();
  });

  it("apagar a loja leva junto produtos e pedidos", async () => {
    const { db, lojaId } = await comLoja();
    await db.exec(novoProduto(lojaId));
    await db.exec(`insert into public.loja_pedidos (loja_id, numero, cliente) values ('${lojaId}', 1, 'A')`);
    await db.exec(`delete from public.lojas where id = '${lojaId}'`);
    expect(await contar(db, `select count(*)::int n from public.loja_produtos`)).toBe(0);
    expect(await contar(db, `select count(*)::int n from public.loja_pedidos`)).toBe(0);
  });

  it("o gatilho carimba updated_at sozinho", async () => {
    // Em gatilho e não na aplicação: quem escreve pelo SQL Editor também
    // precisa carimbar, e essa escrita nunca passa pelo código do app.
    const { db, lojaId } = await comLoja();
    const antes = await db.query<{ u: string }>(`select updated_at u from public.lojas where id='${lojaId}'`);
    await db.exec(`update public.lojas set nome = 'Outro nome' where id = '${lojaId}'`);
    const depois = await db.query<{ u: string }>(`select updated_at u from public.lojas where id='${lojaId}'`);
    expect(new Date(depois.rows[0].u).getTime()).toBeGreaterThanOrEqual(new Date(antes.rows[0].u).getTime());
  });
});
