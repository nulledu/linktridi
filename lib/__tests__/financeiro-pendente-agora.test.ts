import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * O pacote "o que falta rodar" roda mesmo, na ordem, e é re-rodável.
 *
 * É o arquivo que o dono cola no SQL Editor. A promessa dele é forte — "seguro
 * rodar mesmo que algum já tenha sido aplicado" — e promessa de SQL que
 * ninguém testa é como as regras que já deixaram este projeto cair duas vezes:
 * escritas, e não cumpridas.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const sql = (n: string) => readFileSync(join(RAIZ, "supabase", n), "utf8")
  .replace(/create extension if not exists pgcrypto;/, "select 1;");

const PENDENTE = sql("financeiro_pendente_agora.sql");

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  // O estado de quem já rodou tudo o que veio antes.
  for (const a of [
    "financeiro.sql", "financeiro_fornecedor_completo.sql",
    "financeiro_contato_banco_recorrencia.sql", "financeiro_contato_empresa.sql",
    "financeiro_cadastro_unificado.sql",
  ]) await db.exec(sql(a));

  const tridi = (await db.query<{ id: string }>(
    "select id from public.fin_empresas where slug = 'tridi'")).rows[0].id;
  await db.query(
    "insert into public.fin_contas (empresa_id, nome, logo_url) values ($1, 'Itaú', 'logos/conta/x.png')",
    [tridi]);
  await db.query(
    "insert into public.fin_patrimonio (empresa_id, codigo, descricao) values ($1, 'PAT0001', 'Monitor')",
    [tridi]);

  await db.exec(PENDENTE);
}, 180_000);

describe("Antes não dava, depois dá", () => {
  it("a view devolve a marca da conta", async () => {
    const { rows } = await db.query<{ logo_url: string | null }>(
      "select logo_url from public.fin_contas_saldo where nome = 'Itaú'");
    expect(rows[0].logo_url).toBe("logos/conta/x.png");
  });

  it("o bem aceita foto", async () => {
    await expect(db.query(
      "update public.fin_patrimonio set logo_url = 'logos/patrimonio/y.png' where codigo = 'PAT0001'",
    )).resolves.toBeTruthy();
  });

  it("a recorrência sabe que varia, e nasce fixa", async () => {
    const tridi = (await db.query<{ id: string }>(
      "select id from public.fin_empresas where slug = 'tridi'")).rows[0].id;
    await db.query("insert into public.fin_recorrencias (empresa_id, descricao) values ($1, 'Aluguel')", [tridi]);
    const { rows } = await db.query<{ valor_variavel: boolean }>(
      "select valor_variavel from public.fin_recorrencias where descricao = 'Aluguel'");
    expect(rows[0].valor_variavel).toBe(false);
  });

  it("dá para informar o valor de um mês", async () => {
    const r = (await db.query<{ id: string }>(
      "select id from public.fin_recorrencias where descricao = 'Aluguel'")).rows[0].id;
    await db.query(
      "insert into public.fin_recorrencia_valores (recorrencia_id, competencia, valor) values ($1, '2026-09-01', 617.42)",
      [r]);
    const { rows } = await db.query<{ valor: string }>(
      "select valor from public.fin_recorrencia_valores where recorrencia_id = $1", [r]);
    expect(Number(rows[0].valor)).toBe(617.42);
  });
});

describe("A view não perdeu nada ao ser recriada", () => {
  it("todas as colunas que o app lê continuam lá", async () => {
    // Recriar view com lista incompleta tira coluna em silêncio, e a leitura
    // tolerante do app esconderia a perda.
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'fin_contas_saldo'`);
    const cols = rows.map((r) => r.column_name);
    for (const c of [
      "id", "empresa_id", "nome", "tipo", "instituicao", "cor", "ordem", "ativa",
      "inclui_no_saldo", "saldo_inicial", "responsavel_id", "limite", "conta_mae_id",
      "bandeira", "final", "agencia", "numero", "logo_url", "icone",
      "saldo", "usado", "disponivel",
    ]) expect(cols, `a view perdeu ${c}`).toContain(c);
  });
});

describe("Rodar de novo", () => {
  it("não quebra e não perde o que foi informado", async () => {
    await expect(db.exec(PENDENTE)).resolves.toBeTruthy();
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.fin_recorrencia_valores");
    expect(rows[0].n).toBe(1);
    const { rows: v } = await db.query("select logo_url from public.fin_contas_saldo limit 1");
    expect(v).toBeTruthy();
  }, 120_000);
});
