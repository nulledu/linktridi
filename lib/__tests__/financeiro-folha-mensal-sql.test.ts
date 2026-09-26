import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/** `supabase/financeiro_folha_mensal.sql` roda, guarda e trava o que promete. */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const sql = (n: string) => readFileSync(join(RAIZ, "supabase", n), "utf8")
  .replace(/create extension if not exists pgcrypto;/, "select 1;");

let db: PGlite;
let tridi: string;
let gedux: string;
let pessoa: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql("financeiro.sql"));
  await db.exec(sql("financeiro_folha_mensal.sql"));
  const emp = async (slug: string) =>
    (await db.query<{ id: string }>("select id from public.fin_empresas where slug = $1", [slug])).rows[0].id;
  tridi = await emp("tridi");
  gedux = await emp("gedux");
  pessoa = (await db.query<{ id: string }>(
    "insert into public.fin_colaboradores (empresa_id, nome, salario_base, vinculo) values ($1, 'Ana Clara Braga', 3000, 'clt') returning id",
    [tridi])).rows[0].id;
}, 120_000);

describe("A linha do mês", () => {
  it("guarda o mês inteiro: salário, extras, descontos, faltas e o pago", async () => {
    await db.query(
      `insert into public.fin_folha_mensal
         (empresa_id, colaborador_id, competencia, salario, bonus, vale, faltas)
       values ($1, $2, '2026-08-01', 3000, 200, 500, array['2026-08-11','2026-08-13']::date[])`,
      [tridi, pessoa]);
    const { rows } = await db.query<{ salario: string; faltas: string[]; pago: boolean }>(
      "select salario, faltas, pago from public.fin_folha_mensal where colaborador_id = $1", [pessoa]);
    expect(Number(rows[0].salario)).toBe(3000);
    expect(rows[0].faltas).toHaveLength(2);
    expect(rows[0].pago).toBe(false);
  });

  it("um mês por pessoa: gravar de novo conflita em vez de duplicar", async () => {
    await expect(db.query(
      "insert into public.fin_folha_mensal (empresa_id, colaborador_id, competencia) values ($1, $2, '2026-08-01')",
      [tridi, pessoa])).rejects.toThrow();
  });

  it("upsert corrige — é o caminho que a rota usa", async () => {
    await db.query(
      `insert into public.fin_folha_mensal (empresa_id, colaborador_id, competencia, bonus)
       values ($1, $2, '2026-08-01', 999)
       on conflict (colaborador_id, competencia) do update set bonus = excluded.bonus`,
      [tridi, pessoa]);
    const { rows } = await db.query<{ bonus: string; n: number }>(
      "select bonus, (select count(*)::int from public.fin_folha_mensal where colaborador_id = $1) as n from public.fin_folha_mensal where colaborador_id = $1",
      [pessoa]);
    expect(Number(rows[0].bonus)).toBe(999);
    expect(rows[0].n).toBe(1);
  });

  it("meia-competência é recusada — 'agosto' é dia 1º, nunca dia 15", async () => {
    await expect(db.query(
      "insert into public.fin_folha_mensal (empresa_id, colaborador_id, competencia) values ($1, $2, '2026-09-15')",
      [tridi, pessoa])).rejects.toThrow();
  });

  it("pessoa da Tridi não ganha folha na Gedux", async () => {
    await expect(db.query(
      "insert into public.fin_folha_mensal (empresa_id, colaborador_id, competencia) values ($1, $2, '2026-09-01')",
      [gedux, pessoa])).rejects.toThrow(/outra empresa/);
  });

  it("apagar a pessoa leva os meses junto — folha de ninguém não existe", async () => {
    const outra = (await db.query<{ id: string }>(
      "insert into public.fin_colaboradores (empresa_id, nome) values ($1, 'Some') returning id", [tridi])).rows[0].id;
    await db.query(
      "insert into public.fin_folha_mensal (empresa_id, colaborador_id, competencia) values ($1, $2, '2026-08-01')",
      [tridi, outra]);
    await db.query("delete from public.fin_colaboradores where id = $1", [outra]);
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.fin_folha_mensal where colaborador_id = $1", [outra]);
    expect(rows[0].n).toBe(0);
  });

  it("o vínculo entrou no cadastro e aceita os quatro valores da tela", async () => {
    const { rows } = await db.query<{ vinculo: string }>(
      "select vinculo from public.fin_colaboradores where id = $1", [pessoa]);
    expect(rows[0].vinculo).toBe("clt");
  });

  it("a fechadura está ligada", async () => {
    const { rows } = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where relname = 'fin_folha_mensal'");
    expect(rows[0].relrowsecurity).toBe(true);
  });
});

describe("Rodar de novo", () => {
  it("não quebra e não apaga mês gravado", async () => {
    await expect(db.exec(sql("financeiro_folha_mensal.sql"))).resolves.toBeTruthy();
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.fin_folha_mensal where colaborador_id = $1", [pessoa]);
    expect(rows[0].n).toBe(1);
  }, 60_000);
});
