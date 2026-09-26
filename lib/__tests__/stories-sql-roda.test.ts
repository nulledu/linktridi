import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * `supabase/marketing_stories.sql` roda mesmo — contra um Postgres de verdade
 * (PGlite: o motor do Postgres em WASM, em processo).
 *
 * O dono cola este arquivo à mão no SQL Editor, e cola DE NOVO a cada ajuste.
 * Revisão a olho não pega sintaxe de plpgsql nem o "rodar duas vezes"; e as
 * promessas que o arquivo faz (conversão gerada, número negativo recusado,
 * story importado não entra duas vezes) só um banco consegue provar.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const SQL = readFileSync(join(RAIZ, "supabase", "marketing_stories.sql"), "utf8");

// A seção de produtos do arquivo da Biblioteca, como ela está em produção onde
// já rodou — é a "versão anterior" por cima da qual este arquivo tem de subir.
// Só o BLOCO de produtos (até a próxima seção "-- ──"): o arquivo cresce com
// outras seções (a da estreia na Meta lê meta_ad_insights_daily, que o PGlite
// não tem), e recortar "tudo depois de Produtos" quebrava este teste à toa.
const BIBLIOTECA = readFileSync(join(RAIZ, "supabase", "marketing_criativos_ano_variacao.sql"), "utf8");
const PRODUTOS_DA_BIBLIOTECA = (/-- ── Produtos[\s\S]*?(?=\n-- ──|$)/.exec(BIBLIOTECA) ?? [""])[0];

describe("supabase/marketing_stories.sql", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SQL);
  }, 30_000);

  it("roda duas vezes sem erro", async () => {
    await expect(db.exec(SQL)).resolves.toBeDefined();
  });

  it("não duplica os produtos de fábrica", async () => {
    const r = await db.query<{ n: number }>("select count(*)::int as n from public.marketing_criativos_produtos");
    expect(r.rows[0].n).toBe(2);
  });

  it("conversão é gerada pelo banco: 18 vendas em 124 cliques = 14,52", async () => {
    const r = await db.query<{ conversao: string }>(
      "insert into public.marketing_stories (publicado_em, cliques, vendas) values (now(), 124, 18) returning conversao");
    expect(Number(r.rows[0].conversao)).toBe(14.52);
  });

  it("sem clique, conversão nula (não zero, não divisão por zero)", async () => {
    const r = await db.query<{ conversao: string | null }>(
      "insert into public.marketing_stories (publicado_em, cliques, vendas) values (now(), 0, 3) returning conversao");
    expect(r.rows[0].conversao).toBeNull();
  });

  it("número negativo, status e tipo de mídia fora da lista são recusados", async () => {
    await expect(db.query("insert into public.marketing_stories (publicado_em, cliques) values (now(), -1)")).rejects.toThrow();
    await expect(db.query("insert into public.marketing_stories (publicado_em, status) values (now(), 'aprovado')")).rejects.toThrow();
    await expect(db.query("insert into public.marketing_stories (publicado_em, midia_tipo) values (now(), 'pdf')")).rejects.toThrow();
  });

  it("updated_at anda sozinho no update", async () => {
    const { rows } = await db.query<{ id: string }>(
      "insert into public.marketing_stories (publicado_em, updated_at) values (now(), '2020-01-01') returning id");
    await db.query("update public.marketing_stories set vendas = 1 where id = $1", [rows[0].id]);
    const r = await db.query<{ ano: number }>(
      "select extract(year from updated_at)::int as ano from public.marketing_stories where id = $1", [rows[0].id]);
    expect(r.rows[0].ano).toBeGreaterThan(2020);
  });

  it("o mesmo story do Instagram não entra duas vezes", async () => {
    await db.query("insert into public.marketing_stories (publicado_em, origem, externo_id) values (now(), 'instagram', '1789')");
    await expect(
      db.query("insert into public.marketing_stories (publicado_em, origem, externo_id) values (now(), 'instagram', '1789')"),
    ).rejects.toThrow();
  });

  it("apagar o produto solta o story, não apaga", async () => {
    const p = await db.query<{ id: string }>("insert into public.marketing_criativos_produtos (nome, tag) values ('Almofada', 'ALM') returning id");
    const s = await db.query<{ id: string }>(
      "insert into public.marketing_stories (publicado_em, produto_id) values (now(), $1) returning id", [p.rows[0].id]);
    await db.query("delete from public.marketing_criativos_produtos where id = $1", [p.rows[0].id]);
    const r = await db.query<{ produto_id: string | null }>("select produto_id from public.marketing_stories where id = $1", [s.rows[0].id]);
    expect(r.rows[0].produto_id).toBeNull();
  });

  it("sobe por cima dos produtos que a Biblioteca já criou", async () => {
    // Recorte vazio passaria sem provar nada.
    expect(PRODUTOS_DA_BIBLIOTECA).toContain("create table if not exists public.marketing_criativos_produtos");
    const outro = new PGlite();
    await outro.exec(PRODUTOS_DA_BIBLIOTECA);
    await outro.exec(SQL);
    const r = await outro.query<{ n: number }>("select count(*)::int as n from public.marketing_criativos_produtos");
    expect(r.rows[0].n).toBe(2);
  }, 30_000);
});
