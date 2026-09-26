import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * `supabase/financeiro_contato_empresa.sql` roda mesmo, na ordem.
 *
 * O que precisa ser provado aqui não é sintaxe: é que a empresa vira contato
 * SEM quebrar o que já existia. O gatilho de empresa cruzada de
 * `fin_recorrencias` é recriado neste arquivo, e recriar um gatilho com a
 * lista incompleta apaga conferências antigas em silêncio — o pior desfecho
 * possível, porque só aparece quando alguém lança na empresa errada.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const sql = (n: string) => readFileSync(join(RAIZ, "supabase", n), "utf8")
  .replace(/create extension if not exists pgcrypto;/, "select 1;");

const SQL = sql("financeiro_contato_empresa.sql");

let db: PGlite;
let tridi: string;
let gedux: string;

const uuid = async (s: string, p: unknown[] = []) =>
  ((await db.query<{ id: string }>(s, p)).rows[0] as { id: string }).id;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql("financeiro.sql"));
  await db.exec(sql("financeiro_fornecedor_completo.sql"));
  await db.exec(sql("financeiro_contato_banco_recorrencia.sql"));

  const emp = async (slug: string) =>
    (await db.query<{ id: string }>("select id from public.fin_empresas where slug = $1", [slug])).rows[0].id;
  tridi = await emp("tridi");
  gedux = await emp("gedux");

  // O estado de ANTES: contatos soltos, com a empresa em texto.
  await db.query(
    "insert into public.fin_contatos (empresa_id, nome, organizacao) values ($1, 'João', 'Elétrica Rápida')",
    [tridi]);

  await db.exec(SQL);
}, 120_000);

describe("Contato pode ser empresa", () => {
  it("ganha natureza e o vínculo com a empresa", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'fin_contatos'`);
    const cols = rows.map((r) => r.column_name);
    expect(cols).toContain("natureza");
    expect(cols).toContain("organizacao_id");
  });

  it("quem já existia nasce como pessoa, e o texto da empresa continua", async () => {
    const { rows } = await db.query<{ natureza: string; organizacao: string; organizacao_id: string | null }>(
      "select natureza, organizacao, organizacao_id from public.fin_contatos where nome = 'João'");
    expect(rows[0].natureza).toBe("pessoa");
    // O texto NÃO é convertido em vínculo por adivinhação: casar "Elétrica
    // Rápida" com uma empresa cadastrada é decisão de quem conhece o cadastro.
    expect(rows[0].organizacao).toBe("Elétrica Rápida");
    expect(rows[0].organizacao_id).toBeNull();
  });

  it("a pessoa pendura na empresa", async () => {
    const empresa = await uuid(
      "insert into public.fin_contatos (empresa_id, nome, natureza) values ($1, 'Elétrica Rápida ME', 'empresa') returning id",
      [tridi]);
    const pessoa = await uuid(
      "insert into public.fin_contatos (empresa_id, nome, organizacao_id) values ($1, 'Maria', $2) returning id",
      [tridi, empresa]);
    const { rows } = await db.query<{ nome: string }>(
      `select p.nome from public.fin_contatos p
        where p.organizacao_id = $1`, [empresa]);
    expect(rows.map((r) => r.nome)).toEqual(["Maria"]);
    expect(pessoa).toBeTruthy();
  });

  it("uma empresa não é dela mesma", async () => {
    const c = await uuid(
      "insert into public.fin_contatos (empresa_id, nome, natureza) values ($1, 'Sozinha', 'empresa') returning id",
      [tridi]);
    await expect(
      db.query("update public.fin_contatos set organizacao_id = id where id = $1", [c]),
    ).rejects.toThrow();
  });

  it("pessoa da Tridi não pendura em empresa da Gedux", async () => {
    const daGedux = await uuid(
      "insert into public.fin_contatos (empresa_id, nome, natureza) values ($1, 'Empresa Gedux', 'empresa') returning id",
      [gedux]);
    await expect(
      db.query("insert into public.fin_contatos (empresa_id, nome, organizacao_id) values ($1, 'Trocado', $2)",
        [tridi, daGedux]),
    ).rejects.toThrow(/outra empresa/);
  });

  it("apagar a empresa solta as pessoas em vez de apagá-las junto", async () => {
    const empresa = await uuid(
      "insert into public.fin_contatos (empresa_id, nome, natureza) values ($1, 'Vai sumir', 'empresa') returning id",
      [tridi]);
    await db.query("insert into public.fin_contatos (empresa_id, nome, organizacao_id) values ($1, 'Fica', $2)",
      [tridi, empresa]);
    await db.query("delete from public.fin_contatos where id = $1", [empresa]);
    const { rows } = await db.query<{ organizacao_id: string | null }>(
      "select organizacao_id from public.fin_contatos where nome = 'Fica'");
    expect(rows).toHaveLength(1);
    expect(rows[0].organizacao_id).toBeNull();
  });
});

describe("Recorrência aponta para contato", () => {
  it("aceita o contato da mesma empresa", async () => {
    const contato = await uuid(
      "insert into public.fin_contatos (empresa_id, nome) values ($1, 'Dono do galpão') returning id", [tridi]);
    const r = await uuid(
      "insert into public.fin_recorrencias (empresa_id, descricao, contato_id) values ($1, 'Aluguel', $2) returning id",
      [tridi, contato]);
    const { rows } = await db.query<{ contato_id: string }>(
      "select contato_id from public.fin_recorrencias where id = $1", [r]);
    expect(rows[0].contato_id).toBe(contato);
  });

  it("recusa contato de outra empresa", async () => {
    const daGedux = await uuid(
      "insert into public.fin_contatos (empresa_id, nome) values ($1, 'De fora') returning id", [gedux]);
    await expect(
      db.query("insert into public.fin_recorrencias (empresa_id, descricao, contato_id) values ($1, 'Errada', $2)",
        [tridi, daGedux]),
    ).rejects.toThrow(/outra empresa/);
  });

  it("o gatilho recriado NÃO perdeu as conferências antigas", async () => {
    // Recriar um gatilho com a lista incompleta apaga conferências em silêncio.
    // As quatro que já existiam continuam valendo:
    const contaGedux = await uuid(
      "insert into public.fin_contas (empresa_id, nome) values ($1, 'Conta Gedux') returning id", [gedux]);
    const fornGedux = await uuid(
      "insert into public.fin_fornecedores (empresa_id, nome) values ($1, 'Forn Gedux') returning id", [gedux]);
    const pessoaGedux = await uuid(
      "insert into public.fin_colaboradores (empresa_id, nome) values ($1, 'Pessoa Gedux') returning id", [gedux]);

    for (const [campo, valor] of [
      ["conta_id", contaGedux], ["conta_destino_id", contaGedux],
      ["fornecedor_id", fornGedux], ["responsavel_id", pessoaGedux],
    ] as [string, string][]) {
      await expect(
        db.query(`insert into public.fin_recorrencias (empresa_id, descricao, ${campo}) values ($1, 'x', $2)`,
          [tridi, valor]),
        `${campo} deixou de ser conferido`,
      ).rejects.toThrow(/outra empresa/);
    }
  });
});

describe("Compromisso aponta para contato", () => {
  it("aceita contato da mesma empresa", async () => {
    const contato = await uuid(
      "insert into public.fin_contatos (empresa_id, nome) values ($1, 'Locador') returning id", [tridi]);
    const compromisso = await uuid(
      `insert into public.fin_compromissos
        (empresa_id, descricao, valor, vencimento, contato_id)
       values ($1, 'Aluguel', 1000, '2026-08-10', $2) returning id`, [tridi, contato]);
    const { rows } = await db.query<{ contato_id: string }>(
      "select contato_id from public.fin_compromissos where id = $1", [compromisso]);
    expect(rows[0].contato_id).toBe(contato);
  });

  it("recusa contato de outra empresa", async () => {
    const contato = await uuid(
      "insert into public.fin_contatos (empresa_id, nome) values ($1, 'Contato Gedux') returning id", [gedux]);
    await expect(db.query(
      `insert into public.fin_compromissos
        (empresa_id, descricao, valor, vencimento, contato_id)
       values ($1, 'Trocado', 1000, '2026-08-10', $2)`, [tridi, contato]))
      .rejects.toThrow(/outra empresa/);
  });
});

describe("Rodar de novo", () => {
  it("não quebra e não devolve natureza que alguém mudou", async () => {
    await db.query("update public.fin_contatos set natureza = 'empresa' where nome = 'João'");
    await expect(db.exec(SQL)).resolves.toBeTruthy();
    const { rows } = await db.query<{ natureza: string }>(
      "select natureza from public.fin_contatos where nome = 'João'");
    expect(rows[0].natureza).toBe("empresa");
  }, 60_000);
});
