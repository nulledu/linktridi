import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/** `supabase/financeiro_folha_comissoes.sql`: as partes somam, o total obedece. */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const sql = (n: string) => readFileSync(join(RAIZ, "supabase", n), "utf8")
  .replace(/create extension if not exists pgcrypto;/, "select 1;");

let db: PGlite;
let tridi: string;
let pessoa: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql("financeiro.sql"));
  await db.exec(sql("financeiro_folha_mensal.sql"));
  tridi = (await db.query<{ id: string }>("select id from public.fin_empresas where slug = 'tridi'")).rows[0].id;
  pessoa = (await db.query<{ id: string }>(
    "insert into public.fin_colaboradores (empresa_id, nome) values ($1, 'Vera Lucia') returning id", [tridi])).rows[0].id;
  // Um mês gravado ANTES do SQL novo, com total no campo antigo — é o caso
  // real de quem roda os arquivos em dias diferentes.
  await db.query(
    "insert into public.fin_folha_mensal (empresa_id, colaborador_id, competencia, comissao) values ($1, $2, '2026-08-01', 350)",
    [tridi, pessoa]);
  await db.exec(sql("financeiro_folha_comissoes.sql"));
}, 120_000);

describe("A comissão por área", () => {
  it("o total antigo migra para 'outros' sem mudar o que a pessoa recebia", async () => {
    const { rows } = await db.query<{ comissao: string; comissao_outros: string }>(
      "select comissao, comissao_outros from public.fin_folha_mensal where colaborador_id = $1", [pessoa]);
    expect(Number(rows[0].comissao)).toBe(350);
    expect(Number(rows[0].comissao_outros)).toBe(350);
  });

  it("o total é a SOMA das partes, mantido pelo gatilho", async () => {
    await db.query(
      "update public.fin_folha_mensal set comissao_vendas = 100, comissao_trafego = 200 where colaborador_id = $1",
      [pessoa]);
    const { rows } = await db.query<{ comissao: string }>(
      "select comissao from public.fin_folha_mensal where colaborador_id = $1", [pessoa]);
    expect(Number(rows[0].comissao)).toBe(650);   // 100 + 200 + 0 + 350
  });

  it("escrever no total direto NÃO adianta — quem manda são as partes", async () => {
    await db.query(
      "update public.fin_folha_mensal set comissao = 9999 where colaborador_id = $1", [pessoa]);
    const { rows } = await db.query<{ comissao: string }>(
      "select comissao from public.fin_folha_mensal where colaborador_id = $1", [pessoa]);
    expect(Number(rows[0].comissao)).toBe(650);
  });

  it("rodar de novo não dobra a migração", async () => {
    await db.exec(sql("financeiro_folha_comissoes.sql"));
    const { rows } = await db.query<{ comissao: string; comissao_outros: string }>(
      "select comissao, comissao_outros from public.fin_folha_mensal where colaborador_id = $1", [pessoa]);
    expect(Number(rows[0].comissao_outros)).toBe(350);
    expect(Number(rows[0].comissao)).toBe(650);
  }, 60_000);
});
