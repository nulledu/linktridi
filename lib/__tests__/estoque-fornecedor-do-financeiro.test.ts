import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * `supabase/estoque_fornecedor_do_financeiro.sql` roda mesmo — num Postgres.
 *
 * O arquivo é colado À MÃO no SQL Editor, e o que ele faz é trocar uma chave
 * estrangeira: se errar, o estoque fica sem saber de quem compra. Revisão a
 * olho não pega `pg_constraint`, `conkey` nem `regclass` — só um banco pega.
 *
 * Os três casos que importam são todos aqui:
 *  · banco limpo → a chave troca;
 *  · rodar de novo → não faz nada e não quebra;
 *  · item apontando para fornecedor que não existe no Financeiro → NÃO troca.
 *    Este é o que decide o desenho: trocar assim mesmo significaria apagar em
 *    silêncio o vínculo de um material com a origem dele.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const SQL = readFileSync(join(RAIZ, "supabase", "estoque_fornecedor_do_financeiro.sql"), "utf8");

/** O schema como ele é ANTES: item apontando para o cadastro do estoque. */
const ANTES = `
create table public.fin_empresas (
  id uuid primary key default gen_random_uuid(), slug text not null, nome text not null
);
create table public.fin_fornecedores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.fin_empresas(id),
  nome text not null, cnpj text, ativo boolean not null default true, deleted_at timestamptz
);
create table public.estoque_fornecedores (
  id uuid primary key default gen_random_uuid(), nome text not null
);
create table public.estoque_itens (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  fornecedor_id uuid references public.estoque_fornecedores(id) on delete set null
);
create table public.compras (
  id uuid primary key default gen_random_uuid(),
  item_nome text not null default '',
  fornecedor_id uuid references public.estoque_fornecedores(id) on delete set null
);
insert into public.fin_empresas (slug, nome) values ('tridi', 'TridiXP');
`;

async function bancoAntes() {
  const db = new PGlite();
  await db.exec(ANTES);
  return db;
}

const apontaPara = async (db: PGlite, tabela: string) => {
  const { rows } = await db.query<{ alvo: string | null }>(
    `select confrelid::regclass::text as alvo
       from pg_constraint
      where conrelid = $1::regclass and contype = 'f'
        and conkey = array[(select attnum from pg_attribute
                             where attrelid = $1::regclass and attname = 'fornecedor_id')]`,
    [`public.${tabela}`],
  );
  return rows[0]?.alvo ?? null;
};

describe("O fornecedor do estoque passa a ser o do Financeiro", () => {
  it("num banco limpo, o item passa a apontar para fin_fornecedores", async () => {
    const db = await bancoAntes();
    expect(await apontaPara(db, "estoque_itens")).toBe("estoque_fornecedores");

    await db.exec(SQL);

    expect(await apontaPara(db, "estoque_itens")).toBe("fin_fornecedores");
    expect(await apontaPara(db, "compras")).toBe("fin_fornecedores");
    await db.close();
  }, 60_000);

  it("rodar de novo não quebra nem desfaz", async () => {
    const db = await bancoAntes();
    await db.exec(SQL);
    await expect(db.exec(SQL)).resolves.toBeTruthy();
    expect(await apontaPara(db, "estoque_itens")).toBe("fin_fornecedores");
    await db.close();
  }, 60_000);

  it("o vínculo que já existe continua valendo depois da troca", async () => {
    const db = await bancoAntes();
    const emp = (await db.query<{ id: string }>("select id from public.fin_empresas")).rows[0].id;
    // Fornecedor que existe NOS DOIS com o mesmo id — é o caso de quem já
    // cadastrou em ambos, e o vínculo do item tem de sobreviver.
    const f = (await db.query<{ id: string }>(
      "insert into public.fin_fornecedores (empresa_id, nome) values ($1, 'Madeireira X') returning id",
      [emp])).rows[0].id;
    await db.query("insert into public.estoque_fornecedores (id, nome) values ($1, 'Madeireira X')", [f]);
    await db.query("insert into public.estoque_itens (nome, fornecedor_id) values ('MDF 3mm', $1)", [f]);

    await db.exec(SQL);

    const { rows } = await db.query<{ fornecedor_id: string }>(
      "select fornecedor_id from public.estoque_itens where nome = 'MDF 3mm'");
    expect(rows[0].fornecedor_id).toBe(f);
    expect(await apontaPara(db, "estoque_itens")).toBe("fin_fornecedores");
    await db.close();
  }, 60_000);

  it("com órfão, NÃO troca a chave — e não apaga o vínculo de ninguém", async () => {
    const db = await bancoAntes();
    const orfao = (await db.query<{ id: string }>(
      "insert into public.estoque_fornecedores (nome) values ('Só do estoque') returning id")).rows[0].id;
    await db.query("insert into public.estoque_itens (nome, fornecedor_id) values ('Cola branca', $1)", [orfao]);

    await db.exec(SQL);

    // A chave fica onde estava: o estoque continua funcionando, e o aviso do
    // `raise notice` diz o que fazer. Trocar assim mesmo derrubaria a origem
    // daquele material em silêncio, que é o defeito que ninguém percebe.
    expect(await apontaPara(db, "estoque_itens")).toBe("estoque_fornecedores");
    const { rows } = await db.query<{ fornecedor_id: string }>(
      "select fornecedor_id from public.estoque_itens where nome = 'Cola branca'");
    expect(rows[0].fornecedor_id).toBe(orfao);
    await db.close();
  }, 60_000);

  it("sem o Financeiro no banco, não faz nada e não quebra", async () => {
    const db = new PGlite();
    await db.exec(`
      create table public.estoque_fornecedores (id uuid primary key default gen_random_uuid(), nome text not null);
      create table public.estoque_itens (
        id uuid primary key default gen_random_uuid(), nome text not null,
        fornecedor_id uuid references public.estoque_fornecedores(id) on delete set null);
    `);
    await expect(db.exec(SQL)).resolves.toBeTruthy();
    expect(await apontaPara(db, "estoque_itens")).toBe("estoque_fornecedores");
    await db.close();
  }, 60_000);

  it("a tabela velha continua lá, marcada como morta", async () => {
    const db = await bancoAntes();
    await db.exec(SQL);
    const { rows } = await db.query<{ obs: string | null }>(
      "select obj_description('public.estoque_fornecedores'::regclass) as obs");
    expect(rows[0].obs).toMatch(/MORTA/);
    await db.close();
  }, 60_000);
});
