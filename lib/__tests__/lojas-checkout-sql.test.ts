import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * O `supabase/lojas-checkout.sql` roda mesmo, contra Postgres de verdade.
 *
 * O que importa aqui não é só "não explodir": é a numeração do pedido. Ela é a
 * parte que só quebra sob concorrência — dois pedidos no mesmo instante — e
 * concorrência não aparece em revisão à mão nem em teste de tela. Numa vitrine
 * pública ligada a um anúncio, isso não é hipótese.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

let BASE = "";
let CHECKOUT = "";
beforeAll(() => {
  BASE = readFileSync(join(RAIZ, "supabase", "lojas.sql"), "utf8");
  CHECKOUT = readFileSync(join(RAIZ, "supabase", "lojas-checkout.sql"), "utf8");
});

async function banco() {
  const db = await PGlite.create();
  await db.exec(BASE);
  await db.exec(CHECKOUT);
  const r = await db.query<{ id: string }>(
    `insert into public.lojas (nome, slug) values ('Loja', 'loja') returning id`);
  return { db, lojaId: r.rows[0].id };
}

const um = (db: PGlite, sql: string) => db.query<{ n: number }>(sql).then((r) => r.rows[0].n);

describe("supabase/lojas-checkout.sql", () => {
  it("roda em cima do lojas.sql, e roda duas vezes", async () => {
    const { db } = await banco();
    await db.exec(CHECKOUT);   // a segunda passada é a que já quebrou antes
    expect(await um(db,
      `select count(*)::int n from information_schema.columns
        where table_name='lojas' and column_name in ('checkout','whatsapp')`)).toBe(2);
  });

  it("vender pelo WhatsApp exige telefone — no BANCO, não só na tela", async () => {
    const { db, lojaId } = await banco();
    await expect(db.exec(
      `update public.lojas set checkout='whatsapp' where id='${lojaId}'`)).rejects.toThrow();
    await expect(db.exec(
      `update public.lojas set checkout='whatsapp', whatsapp='5514998544623' where id='${lojaId}'`,
    )).resolves.toBeDefined();
  });

  it("o padrão é NÃO vender — migração não liga venda sozinha", async () => {
    const { db, lojaId } = await banco();
    const r = await db.query<{ checkout: string }>(
      `select checkout from public.lojas where id='${lojaId}'`);
    expect(r.rows[0].checkout).toBe("nenhum");
  });
});

describe("numeração do pedido", () => {
  it("começa em 1 e anda sozinha", async () => {
    const { db, lojaId } = await banco();
    for (const cliente of ["A", "B", "C"]) {
      await db.exec(`insert into public.loja_pedidos (loja_id, cliente) values ('${lojaId}', '${cliente}')`);
    }
    const r = await db.query<{ numero: number }>(
      `select numero from public.loja_pedidos where loja_id='${lojaId}' order by numero`);
    expect(r.rows.map((x) => x.numero)).toEqual([1, 2, 3]);
  });

  it("cada loja tem a PRÓPRIA sequência — sem buraco entre lojas", async () => {
    // É por isso que não é uma sequence do Postgres: ela é global, e o lojista
    // abriria a lista e veria "#1" e depois "#57" sem entender por quê.
    const { db, lojaId } = await banco();
    const outra = await db.query<{ id: string }>(
      `insert into public.lojas (nome, slug) values ('Outra', 'outra') returning id`);
    await db.exec(`insert into public.loja_pedidos (loja_id, cliente) values ('${lojaId}', 'A')`);
    await db.exec(`insert into public.loja_pedidos (loja_id, cliente) values ('${lojaId}', 'B')`);
    await db.exec(`insert into public.loja_pedidos (loja_id, cliente) values ('${outra.rows[0].id}', 'C')`);
    expect(await um(db,
      `select numero::int n from public.loja_pedidos where loja_id='${outra.rows[0].id}'`)).toBe(1);
  });

  it("dois pedidos no MESMO instante não colidem", async () => {
    // O caso que o `select max+1` seguido de insert perde: os dois leem o mesmo
    // máximo e o segundo bate no UNIQUE (loja_id, numero).
    const { db, lojaId } = await banco();
    await Promise.all(Array.from({ length: 12 }, (_, i) =>
      db.exec(`insert into public.loja_pedidos (loja_id, cliente) values ('${lojaId}', 'C${i}')`)));
    const r = await db.query<{ numero: number }>(
      `select numero from public.loja_pedidos where loja_id='${lojaId}' order by numero`);
    expect(r.rows.map((x) => x.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("número dado à mão é respeitado — importação de histórico continua possível", async () => {
    const { db, lojaId } = await banco();
    await db.exec(`insert into public.loja_pedidos (loja_id, numero, cliente) values ('${lojaId}', 1042, 'Antigo')`);
    await db.exec(`insert into public.loja_pedidos (loja_id, cliente) values ('${lojaId}', 'Novo')`);
    const r = await db.query<{ numero: number }>(
      `select numero from public.loja_pedidos where loja_id='${lojaId}' order by numero`);
    expect(r.rows.map((x) => x.numero)).toEqual([1042, 1043]);
  });

  it("origem fora do vocabulário é rejeitada", async () => {
    const { db, lojaId } = await banco();
    await expect(db.exec(
      `insert into public.loja_pedidos (loja_id, cliente, origem) values ('${lojaId}', 'A', 'instagram')`,
    )).rejects.toThrow();
  });
});
