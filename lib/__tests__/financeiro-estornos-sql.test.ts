import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/** `supabase/financeiro_estornos.sql` roda, guarda e trava o que promete. */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const sql = (n: string) => readFileSync(join(RAIZ, "supabase", n), "utf8")
  .replace(/create extension if not exists pgcrypto;/, "select 1;");

let db: PGlite;
let tridi: string;
let gedux: string;
let contaTridi: string;
let contaGedux: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql("financeiro.sql"));
  await db.exec(sql("financeiro_estornos.sql"));
  const emp = async (slug: string) =>
    (await db.query<{ id: string }>("select id from public.fin_empresas where slug = $1", [slug])).rows[0].id;
  tridi = await emp("tridi");
  gedux = await emp("gedux");
  const conta = async (empresa: string, nome: string) =>
    (await db.query<{ id: string }>(
      "insert into public.fin_contas (empresa_id, nome) values ($1, $2) returning id", [empresa, nome])).rows[0].id;
  contaTridi = await conta(tridi, "Stripe");
  contaGedux = await conta(gedux, "Yampi");
}, 120_000);

describe("O caso de estorno", () => {
  it("nasce em disputa e guarda o caso inteiro", async () => {
    const { rows } = await db.query<{ id: string; status: string; tipo: string }>(
      `insert into public.fin_estornos (empresa_id, referencia, cliente, valor, conta_id, tipo)
       values ($1, 'pedido 8412', 'Maria', 249.90, $2, 'chargeback') returning id, status, tipo`,
      [tridi, contaTridi]);
    expect(rows[0].status).toBe("em_disputa");
    expect(rows[0].tipo).toBe("chargeback");
  });

  it("conta de outra empresa é recusada — estorno da Tridi não sai pela Gedux", async () => {
    await expect(db.query(
      "insert into public.fin_estornos (empresa_id, referencia, valor, conta_id) values ($1, 'x', 10, $2)",
      [tridi, contaGedux])).rejects.toThrow(/outra empresa/);
  });

  it("apagar a conta não apaga o caso: a referência vira nula e a história fica", async () => {
    const solta = (await db.query<{ id: string }>(
      "insert into public.fin_contas (empresa_id, nome) values ($1, 'Vega') returning id", [tridi])).rows[0].id;
    const caso = (await db.query<{ id: string }>(
      "insert into public.fin_estornos (empresa_id, referencia, valor, conta_id) values ($1, 'pedido 9', 50, $2) returning id",
      [tridi, solta])).rows[0].id;
    await db.query("delete from public.fin_contas where id = $1", [solta]);
    const { rows } = await db.query<{ conta_id: string | null }>(
      "select conta_id from public.fin_estornos where id = $1", [caso]);
    expect(rows[0].conta_id).toBeNull();
  });

  it("a fechadura está ligada", async () => {
    const { rows } = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where relname = 'fin_estornos'");
    expect(rows[0].relrowsecurity).toBe(true);
  });
});

describe("Rodar de novo", () => {
  it("não quebra e não apaga caso registrado", async () => {
    await expect(db.exec(sql("financeiro_estornos.sql"))).resolves.toBeTruthy();
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.fin_estornos");
    expect(rows[0].n).toBeGreaterThan(0);
  }, 60_000);
});
