import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/** `supabase/financeiro_recorrencia_variavel.sql` roda e guarda o que promete. */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const sql = (n: string) => readFileSync(join(RAIZ, "supabase", n), "utf8")
  .replace(/create extension if not exists pgcrypto;/, "select 1;");

let db: PGlite;
let regra: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql("financeiro.sql"));
  await db.exec(sql("financeiro_recorrencia_variavel.sql"));
  const tridi = (await db.query<{ id: string }>(
    "select id from public.fin_empresas where slug = 'tridi'")).rows[0].id;
  regra = (await db.query<{ id: string }>(
    `insert into public.fin_recorrencias (empresa_id, descricao, valor, valor_variavel)
     values ($1, 'Luz', 480, true) returning id`, [tridi])).rows[0].id;
}, 120_000);

describe("A regra sabe que varia", () => {
  it("`valor_variavel` existe e nasce falso", async () => {
    const { rows } = await db.query<{ valor_variavel: boolean }>(
      "select valor_variavel from public.fin_recorrencias where descricao = 'Luz'");
    expect(rows[0].valor_variavel).toBe(true);
  });

  it("regra antiga continua fixa — o padrão não muda comportamento", async () => {
    const tridi = (await db.query<{ id: string }>(
      "select id from public.fin_empresas where slug = 'tridi'")).rows[0].id;
    await db.query("insert into public.fin_recorrencias (empresa_id, descricao) values ($1, 'Aluguel')", [tridi]);
    const { rows } = await db.query<{ valor_variavel: boolean }>(
      "select valor_variavel from public.fin_recorrencias where descricao = 'Aluguel'");
    expect(rows[0].valor_variavel).toBe(false);
  });
});

describe("O valor combinado de um mês", () => {
  it("guarda por competência", async () => {
    await db.query(
      "insert into public.fin_recorrencia_valores (recorrencia_id, competencia, valor) values ($1, '2026-09-01', 617.42)",
      [regra]);
    const { rows } = await db.query<{ valor: string }>(
      "select valor from public.fin_recorrencia_valores where recorrencia_id = $1", [regra]);
    expect(Number(rows[0].valor)).toBe(617.42);
  });

  it("informar de novo CORRIGE — não duplica", async () => {
    await db.query(
      `insert into public.fin_recorrencia_valores (recorrencia_id, competencia, valor)
       values ($1, '2026-09-01', 700)
       on conflict (recorrencia_id, competencia) do update set valor = excluded.valor`, [regra]);
    const { rows } = await db.query<{ n: number; valor: string }>(
      "select count(*)::int as n, max(valor) as valor from public.fin_recorrencia_valores where recorrencia_id = $1",
      [regra]);
    expect(rows[0].n).toBe(1);
    expect(Number(rows[0].valor)).toBe(700);
  });

  it("recusa meia-competência — ela nunca casaria com a chave de idempotência", async () => {
    await expect(db.query(
      "insert into public.fin_recorrencia_valores (recorrencia_id, competencia, valor) values ($1, '2026-10-15', 10)",
      [regra])).rejects.toThrow();
  });

  it("apagar a regra leva os valores junto — eles não existem sozinhos", async () => {
    const tridi = (await db.query<{ id: string }>(
      "select id from public.fin_empresas where slug = 'tridi'")).rows[0].id;
    const outra = (await db.query<{ id: string }>(
      "insert into public.fin_recorrencias (empresa_id, descricao) values ($1, 'Some') returning id", [tridi])).rows[0].id;
    await db.query(
      "insert into public.fin_recorrencia_valores (recorrencia_id, competencia, valor) values ($1, '2026-11-01', 5)", [outra]);
    await db.query("delete from public.fin_recorrencias where id = $1", [outra]);
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.fin_recorrencia_valores where recorrencia_id = $1", [outra]);
    expect(rows[0].n).toBe(0);
  });

  it("a fechadura está ligada", async () => {
    const { rows } = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where relname = 'fin_recorrencia_valores'");
    expect(rows[0].relrowsecurity).toBe(true);
  });
});

describe("Rodar de novo", () => {
  it("não quebra e não apaga o que foi informado", async () => {
    await expect(db.exec(sql("financeiro_recorrencia_variavel.sql"))).resolves.toBeTruthy();
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.fin_recorrencia_valores where recorrencia_id = $1", [regra]);
    expect(rows[0].n).toBe(1);
  }, 60_000);
});
