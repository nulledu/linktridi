import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * `supabase/financeiro_tudo.sql` roda inteiro, do zero E por cima.
 *
 * É o arquivo que existe para pôr um banco em dia sem ninguém lembrar quais dos
 * oito já rodaram. A promessa dele é forte — "é seguro rodar mesmo com tudo já
 * aplicado" — e promessa de SQL que ninguém testa é como as regras que já
 * deixaram este projeto cair duas vezes: escritas, e não cumpridas.
 *
 * Duas armadilhas que este teste existe para pegar:
 *
 *  · **Ordem.** Um arquivo que mexe numa coluna criada por outro precisa vir
 *    depois. Concatenar na ordem errada só falha na hora de rodar.
 *  · **Segunda passada.** `create or replace view` não remove coluna, e
 *    gatilho recriado com lista incompleta apaga conferência em silêncio (ver
 *    financeiro_contato_empresa.sql). Rodar duas vezes é o caso real de quem
 *    não sabe o que já aplicou.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const TUDO = readFileSync(join(RAIZ, "supabase/financeiro_tudo.sql"), "utf8")
  .replace(/create extension if not exists pgcrypto;/g, "select 1;");

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(TUDO);           // banco vazio
}, 180_000);

const colunas = async (tabela: string): Promise<string[]> =>
  (await db.query<{ column_name: string }>(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = $1`, [tabela])).rows.map((r) => r.column_name);

describe("financeiro_tudo.sql — do zero", () => {
  it("cria as tabelas do módulo", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_name like 'fin\\_%'`);
    const tabelas = rows.map((r) => r.table_name);
    for (const t of [
      "fin_empresas", "fin_contas", "fin_contatos", "fin_fornecedores", "fin_colaboradores",
      "fin_compromissos", "fin_compras", "fin_notas", "fin_patrimonio", "fin_recorrencias",
      "fin_movimentos", "fin_anexos", "fin_auditoria", "fin_acessos", "fin_config",
    ]) expect(tabelas, `faltou ${t}`).toContain(t);
  });

  it.each([
    ["fin_contatos", ["natureza", "organizacao_id", "papeis", "cnpj", "logo_url"]],
    ["fin_fornecedores", ["contato_id", "pix_chave", "prazo_dias"]],
    ["fin_recorrencias", ["contato_id", "conta_destino_id", "logo_url", "icone"]],
    ["fin_compromissos", ["contato_id", "origem_id", "idempotency_key"]],
    ["fin_contas", ["logo_url"]],
    ["fin_empresas", ["logo_url"]],
    ["fin_config", ["empresa_id", "patrimonio_prefixo"]],
  ])("%s tem as colunas que o código pede", async (tabela, esperadas) => {
    const tem = await colunas(tabela as string);
    for (const c of esperadas as string[]) expect(tem, `${tabela}.${c}`).toContain(c);
  });

  it("cria a função do cadastro unificado", async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
        where ns.nspname = 'public' and p.proname = 'fin_salvar_parte'`);
    expect(rows[0].n).toBeGreaterThan(0);
  });
});

describe("financeiro_tudo.sql — rodado DE NOVO por cima", () => {
  beforeAll(async () => {
    // O estado de um banco em uso, para a segunda passada ter o que estragar.
    const tridi = (await db.query<{ id: string }>(
      "select id from public.fin_empresas where slug = 'tridi'")).rows[0].id;
    await db.query(
      "insert into public.fin_contatos (empresa_id, nome, papeis) values ($1, 'Packit', $2)",
      [tridi, ["fornecedor"]]);
    await db.exec(TUDO);
  }, 180_000);

  it("não quebra e não perde o que estava lá", async () => {
    const { rows } = await db.query<{ nome: string; natureza: string }>(
      "select nome, natureza from public.fin_contatos where nome = 'Packit'");
    expect(rows).toHaveLength(1);
    // Continua PESSOA, e isso é o certo: "é fornecedor" foi removido dos
    // critérios porque é falso — marceneiro autônomo vende e não é empresa.
    // Esta asserção já disse "empresa"; era o teste defendendo a regra errada.
    expect(rows[0].natureza).toBe("pessoa");
  });

  it("o gatilho de empresa cruzada sobreviveu às duas passadas", async () => {
    // Recriar um gatilho com a lista incompleta apaga conferências em silêncio
    // — o pior desfecho, porque só aparece quando alguém lança na empresa
    // errada. Aqui a conferência tem de continuar recusando.
    const tridi = (await db.query<{ id: string }>(
      "select id from public.fin_empresas where slug = 'tridi'")).rows[0].id;
    const gedux = (await db.query<{ id: string }>(
      "select id from public.fin_empresas where slug = 'gedux'")).rows[0].id;
    const daGedux = (await db.query<{ id: string }>(
      "insert into public.fin_contas (empresa_id, nome) values ($1, 'Conta Gedux') returning id",
      [gedux])).rows[0].id;

    await expect(db.query(
      "insert into public.fin_recorrencias (empresa_id, descricao, conta_id) values ($1, 'x', $2)",
      [tridi, daGedux])).rejects.toThrow(/outra empresa/);
  });

  it("continua dando para gravar depois de tudo isso", async () => {
    const tridi = (await db.query<{ id: string }>(
      "select id from public.fin_empresas where slug = 'tridi'")).rows[0].id;
    await expect(db.query(
      `insert into public.fin_compromissos (empresa_id, descricao, valor, vencimento)
       values ($1, 'Aluguel', 100000, '2026-09-10')`, [tridi])).resolves.toBeTruthy();
  });
});
