import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * `supabase/financeiro_config.sql` roda mesmo — e toda empresa nasce com a
 * linha de configuração, com os padrões que as telas já usavam.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const sql = (n: string) => readFileSync(join(RAIZ, "supabase", n), "utf8")
  .replace(/create extension if not exists pgcrypto;/, "select 1;");

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql("financeiro.sql"));
  await db.exec(sql("financeiro_config.sql"));
}, 90_000);

describe("supabase/financeiro_config.sql", () => {
  it("toda empresa nasce com a linha, nos padrões que o código já usava", async () => {
    const { rows } = await db.query<{ slug: string; patrimonio_prefixo: string; alerta_dias: number; folha_dia_padrao: number; formas_pagamento: string[] }>(
      `select e.slug, c.patrimonio_prefixo, c.alerta_dias, c.folha_dia_padrao, c.formas_pagamento
         from public.fin_empresas e join public.fin_config c on c.empresa_id = e.id order by e.ordem`);
    expect(rows.map((r) => r.slug)).toEqual(["tridi", "gedux"]);
    for (const r of rows) {
      expect(r.patrimonio_prefixo).toBe("PAT");
      expect(r.alerta_dias).toBe(7);
      expect(r.folha_dia_padrao).toBe(5);
      expect(r.formas_pagamento).toContain("PIX");
    }
  });

  it("rodar de novo não duplica nem desfaz o que alguém mudou", async () => {
    await db.query("update public.fin_config set patrimonio_prefixo = 'TRD', alerta_dias = 15 where empresa_id = (select id from public.fin_empresas where slug = 'tridi')");
    await expect(db.exec(sql("financeiro_config.sql"))).resolves.toBeTruthy();
    const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.fin_config");
    expect(rows[0].n).toBe(2);
    const { rows: t } = await db.query<{ patrimonio_prefixo: string; alerta_dias: number }>(
      "select patrimonio_prefixo, alerta_dias from public.fin_config where empresa_id = (select id from public.fin_empresas where slug = 'tridi')");
    expect(t[0].patrimonio_prefixo).toBe("TRD");
    expect(t[0].alerta_dias).toBe(15);
  });

  it("o banco recusa alerta fora de 1–90 dias e dia de folha fora de 1–31", async () => {
    const tridi = (await db.query<{ id: string }>("select id from public.fin_empresas where slug = 'tridi'")).rows[0].id;
    await expect(db.query("update public.fin_config set alerta_dias = 0 where empresa_id = $1", [tridi])).rejects.toThrow();
    await expect(db.query("update public.fin_config set folha_dia_padrao = 32 where empresa_id = $1", [tridi])).rejects.toThrow();
  });

  it("empresa nova criada DEPOIS também ganha a linha ao rodar de novo", async () => {
    await db.query("insert into public.fin_empresas (slug, nome, ordem) values ('nova', 'Nova', 3)");
    await db.exec(sql("financeiro_config.sql"));
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.fin_config c join public.fin_empresas e on e.id = c.empresa_id where e.slug = 'nova'");
    expect(rows[0].n).toBe(1);
  });
});
