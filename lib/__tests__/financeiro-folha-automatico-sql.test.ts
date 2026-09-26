import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/** `supabase/financeiro_folha_automatico.sql`: interruptores por área e bônus recorrente. */

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
  await db.exec(sql("financeiro_folha_comissoes.sql"));
  tridi = (await db.query<{ id: string }>("select id from public.fin_empresas where slug = 'tridi'")).rows[0].id;
  pessoa = (await db.query<{ id: string }>(
    "insert into public.fin_colaboradores (empresa_id, nome) values ($1, 'Paola Rossi') returning id", [tridi])).rows[0].id;
  // Um mês e um bônus gravados ANTES do SQL novo.
  await db.query(
    "insert into public.fin_folha_mensal (empresa_id, colaborador_id, competencia, comissao_vendas) values ($1, $2, '2026-08-01', 350)",
    [tridi, pessoa]);
  await db.query(
    "insert into public.fin_folha_lancamentos (empresa_id, colaborador_id, competencia, tipo, valor) values ($1, $2, '2026-08-01', 'bonus', 200)",
    [tridi, pessoa]);
  await db.exec(sql("financeiro_folha_automatico.sql"));
  // Idempotente.
  await db.exec(sql("financeiro_folha_automatico.sql"));
}, 120_000);

describe("interruptores por área", () => {
  it("nascem NULOS no mês antigo — quem decide o padrão é a data, no código", async () => {
    const { rows } = await db.query<{ auto_vendas: boolean | null; comissao_vendas: string }>(
      "select auto_vendas, comissao_vendas from public.fin_folha_mensal where colaborador_id = $1", [pessoa]);
    expect(rows[0].auto_vendas).toBeNull();
    expect(Number(rows[0].comissao_vendas)).toBe(350);
  });

  it("gravam por área, independentes", async () => {
    await db.query("update public.fin_folha_mensal set auto_vendas = false, auto_trafego = true where colaborador_id = $1", [pessoa]);
    const { rows } = await db.query<{ auto_vendas: boolean; auto_trafego: boolean; auto_marketplace: boolean | null }>(
      "select auto_vendas, auto_trafego, auto_marketplace from public.fin_folha_mensal where colaborador_id = $1", [pessoa]);
    expect(rows[0]).toEqual({ auto_vendas: false, auto_trafego: true, auto_marketplace: null });
  });
});

describe("bônus recorrente", () => {
  it("o lançamento antigo continua, não recorrente", async () => {
    const { rows } = await db.query<{ recorrente: boolean; pulados: string[] }>(
      "select recorrente, pulados from public.fin_folha_lancamentos where colaborador_id = $1", [pessoa]);
    expect(rows[0].recorrente).toBe(false);
    expect(rows[0].pulados).toEqual([]);
  });

  it("uma cópia por mês por origem — a segunda é recusada", async () => {
    const origem = (await db.query<{ id: string }>(
      "insert into public.fin_folha_lancamentos (empresa_id, colaborador_id, competencia, tipo, valor, recorrente) values ($1, $2, '2026-09-01', 'bonus', 150, true) returning id",
      [tridi, pessoa])).rows[0].id;
    await db.query(
      "insert into public.fin_folha_lancamentos (empresa_id, colaborador_id, competencia, tipo, valor, origem_id) values ($1, $2, '2026-10-01', 'bonus', 150, $3)",
      [tridi, pessoa, origem]);
    await expect(db.query(
      "insert into public.fin_folha_lancamentos (empresa_id, colaborador_id, competencia, tipo, valor, origem_id) values ($1, $2, '2026-10-01', 'bonus', 150, $3)",
      [tridi, pessoa, origem])).rejects.toThrow(/fin_folha_lanc_copia_unica|duplicate/);
  });

  it("apagar a origem solta a cópia (fica como lançamento comum), não a apaga", async () => {
    const origem = (await db.query<{ id: string }>(
      "select id from public.fin_folha_lancamentos where recorrente and origem_id is null and colaborador_id = $1", [pessoa])).rows[0].id;
    await db.query("delete from public.fin_folha_lancamentos where id = $1", [origem]);
    const { rows } = await db.query<{ n: string }>(
      "select count(*)::text as n from public.fin_folha_lancamentos where competencia = '2026-10-01' and origem_id is null and colaborador_id = $1", [pessoa]);
    expect(Number(rows[0].n)).toBe(1);
  });
});
