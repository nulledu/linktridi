import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * `supabase/financeiro.sql` roda mesmo — contra um Postgres de verdade.
 *
 * Mesma razão do `sql-pendente-roda.test.ts`: este arquivo é rodado À MÃO pelo
 * dono, no SQL Editor. Revisão a olho não pega sintaxe de plpgsql, ordem entre
 * seções nem o caso de rodar duas vezes — e "rodar duas vezes" é o caso comum,
 * porque todo ajuste no schema volta pelo mesmo arquivo.
 *
 * PGlite é o Postgres compilado pra WASM: mesmo motor, em processo.
 *
 * Além de rodar, o teste confere as promessas que o arquivo faz e que só um
 * banco de verdade consegue provar: idempotência, a trava de empresa cruzada,
 * a imutabilidade do movimento e o saldo derivado.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const SQL = readFileSync(join(RAIZ, "supabase", "financeiro.sql"), "utf8");

// PGlite não traz a extensão `pgcrypto` como o Supabase; `gen_random_uuid()` é
// nativo desde o PG13, então o `create extension` é o único trecho que não
// atravessa. Trocar por um no-op mantém o resto do arquivo idêntico ao que o
// dono vai colar — que é justamente o que precisa ser testado.
const PARA_PGLITE = SQL.replace(/create extension if not exists pgcrypto;/, "select 1;");

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(PARA_PGLITE);
}, 60_000);

const uuid = async (sql: string, params: unknown[] = []) =>
  ((await db.query(sql, params)).rows[0] as { id: string }).id;

describe("supabase/financeiro.sql", () => {
  it("roda inteiro num banco vazio", async () => {
    const { rows } = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_name like 'fin\\_%' and table_type = 'BASE TABLE'
        order by table_name`,
    );
    expect(rows.map((r) => r.table_name)).toEqual([
      "fin_acessos", "fin_anexos", "fin_auditoria", "fin_colaboradores", "fin_compra_itens",
      "fin_compra_parcelas", "fin_compras", "fin_compromissos", "fin_contas", "fin_contatos",
      "fin_empresas", "fin_folha_lancamentos", "fin_fornecedores", "fin_movimentos", "fin_notas",
      "fin_patrimonio", "fin_recorrencias",
    ]);
  });

  it("a view de saldo existe (o saldo não é coluna gravada)", async () => {
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from information_schema.views
        where table_schema = 'public' and table_name = 'fin_contas_saldo'`,
    );
    expect(rows[0].n).toBe(1);
  });

  it("roda DE NOVO sem quebrar (idempotente)", async () => {
    await expect(db.exec(PARA_PGLITE)).resolves.toBeTruthy();
  });

  it("já nasce com Tridi e Gedux, e rodar de novo não duplica", async () => {
    const { rows } = await db.query<{ slug: string }>("select slug from public.fin_empresas order by ordem");
    expect(rows.map((r) => r.slug)).toEqual(["tridi", "gedux"]);
  });

  it("recusa vínculo entre empresas diferentes", async () => {
    const tridi = await uuid("select id from public.fin_empresas where slug = 'tridi'");
    const gedux = await uuid("select id from public.fin_empresas where slug = 'gedux'");
    const forn = await uuid(
      "insert into public.fin_fornecedores (empresa_id, nome) values ($1, 'Madeireira X') returning id", [gedux]);
    // Compra da Tridi apontando pro fornecedor da Gedux: o gatilho barra.
    await expect(
      db.query("insert into public.fin_compras (empresa_id, fornecedor_id, descricao) values ($1, $2, 'MDF')",
        [tridi, forn]),
    ).rejects.toThrow(/outra empresa/);
  });

  it("não deixa a mesma parcela nascer duas vezes", async () => {
    const emp = await uuid("select id from public.fin_empresas where slug = 'tridi'");
    const compra = await uuid(
      "insert into public.fin_compras (empresa_id, descricao, valor_total) values ($1, 'MDF 3mm', 9000) returning id",
      [emp]);
    for (const n of [1, 2, 3]) {
      await db.query(
        "insert into public.fin_compra_parcelas (compra_id, numero, vencimento, valor) values ($1, $2, current_date, 3000)",
        [compra, n]);
    }
    await expect(
      db.query(
        "insert into public.fin_compra_parcelas (compra_id, numero, vencimento, valor) values ($1, 1, current_date, 3000)",
        [compra]),
    ).rejects.toThrow();
  });

  it("não deixa o mesmo compromisso automático nascer duas vezes", async () => {
    const emp = await uuid("select id from public.fin_empresas where slug = 'tridi'");
    const inserir = () =>
      db.query(
        `insert into public.fin_compromissos (empresa_id, descricao, valor, vencimento, idempotency_key)
         values ($1, 'Aluguel', 8000, current_date, 'rec:abc:2026-08')`, [emp]);
    await inserir();
    await expect(inserir()).rejects.toThrow();
  });

  it("movimento confirmado é imutável, mas pode ser marcado revertido", async () => {
    const emp = await uuid("select id from public.fin_empresas where slug = 'tridi'");
    const conta = await uuid(
      "insert into public.fin_contas (empresa_id, nome, saldo_inicial) values ($1, 'Itaú', 1000) returning id", [emp]);
    const mov = await uuid(
      "insert into public.fin_movimentos (empresa_id, conta_id, tipo, valor) values ($1, $2, 'saida', -250) returning id",
      [emp, conta]);

    await expect(
      db.query("update public.fin_movimentos set valor = -1 where id = $1", [mov]),
    ).rejects.toThrow(/imutável/);

    await expect(
      db.query("update public.fin_movimentos set status = 'revertido' where id = $1", [mov]),
    ).resolves.toBeTruthy();
  });

  it("saldo da conta é derivado dos movimentos confirmados", async () => {
    const emp = await uuid("select id from public.fin_empresas where slug = 'gedux'");
    const conta = await uuid(
      "insert into public.fin_contas (empresa_id, nome, saldo_inicial) values ($1, 'Inter', 500) returning id", [emp]);
    await db.query(
      "insert into public.fin_movimentos (empresa_id, conta_id, tipo, valor) values ($1, $2, 'entrada', 300)", [emp, conta]);
    await db.query(
      "insert into public.fin_movimentos (empresa_id, conta_id, tipo, valor) values ($1, $2, 'saida', -120)", [emp, conta]);
    // Revertido não conta.
    await db.query(
      `insert into public.fin_movimentos (empresa_id, conta_id, tipo, valor, status)
       values ($1, $2, 'saida', -999, 'revertido')`, [emp, conta]);

    const { rows } = await db.query<{ saldo: string }>(
      "select saldo from public.fin_contas_saldo where id = $1", [conta]);
    expect(Number(rows[0].saldo)).toBe(680);
  });
});

/**
 * O caso que quebrou de verdade, em produção.
 *
 * O dono rodou o arquivo numa versão anterior. Depois `responsavel_id` entrou
 * em `fin_contas` e no MEIO da lista de colunas da view. `create or replace
 * view` no Postgres só aceita acrescentar coluna no FIM — então rodar o arquivo
 * de novo morria em «cannot change name of view column». E como o SQL Editor do
 * Supabase roda tudo numa transação, o erro voltava atrás com o `alter table`
 * junto: o banco continuava na versão velha, a consulta de Contas pedia uma
 * coluna que a view não tinha, e a tela dizia "o banco ainda não foi criado"
 * com o banco criado do lado.
 *
 * A trava é esta: partir do schema ANTIGO e exigir que o arquivo atual suba por
 * cima. É o único teste aqui que não parte de um banco vazio — de propósito,
 * porque banco vazio é o caso que nunca falhou.
 */
describe("subir por cima de uma versão anterior", () => {
  it("o arquivo roda sobre o schema antigo e traz as colunas que faltavam", async () => {
    const velho = new PGlite();
    await velho.exec(PARA_PGLITE);

    // Volta o banco ao estado de antes: sem as colunas que entraram depois, e
    // com a view na forma antiga (sem `responsavel_id`).
    await velho.exec(`
      drop view public.fin_contas_saldo;
      alter table public.fin_contas    drop column responsavel_id;
      alter table public.fin_contas    drop column logo_url;
      alter table public.fin_contas    drop column icone;
      alter table public.fin_empresas  drop column logo_url;
      alter table public.fin_empresas  drop column icone;
      alter table public.fin_fornecedores drop column logo_url;
      alter table public.fin_fornecedores drop column icone;
      alter table public.fin_contatos  drop column logo_url;
      alter table public.fin_contatos  drop column icone;
      alter table public.fin_anexos    drop column caminho;
      drop table public.fin_folha_lancamentos;
      alter table public.fin_colaboradores drop column gratificacao;
      alter table public.fin_colaboradores drop column valor_hora;
      alter table public.fin_colaboradores drop column conta_id;
      alter table public.fin_colaboradores drop column pix_chave;
      alter table public.fin_colaboradores drop column logo_url;
      alter table public.fin_patrimonio drop column idempotency_key;
      create view public.fin_contas_saldo as
      select c.id, c.empresa_id, c.nome, c.tipo, c.instituicao, c.cor, c.ordem,
             c.ativa, c.inclui_no_saldo, c.saldo_inicial,
             c.saldo_inicial + coalesce(sum(m.valor) filter (where m.status = 'confirmado'), 0) as saldo
      from public.fin_contas c
      left join public.fin_movimentos m on m.conta_id = c.id
      group by c.id;
    `);

    await expect(velho.exec(PARA_PGLITE)).resolves.toBeTruthy();

    const { rows } = await velho.query<{ n: number }>(`
      select count(*)::int as n from information_schema.columns
       where table_schema = 'public'
         and (table_name, column_name) in (
           ('fin_contas', 'responsavel_id'), ('fin_contas_saldo', 'responsavel_id'),
           ('fin_anexos', 'caminho'), ('fin_patrimonio', 'idempotency_key'),
           ('fin_contas', 'logo_url'), ('fin_contas', 'icone'),
           ('fin_empresas', 'logo_url'), ('fin_empresas', 'icone'),
           ('fin_fornecedores', 'logo_url'), ('fin_fornecedores', 'icone'),
           ('fin_contatos', 'logo_url'), ('fin_contatos', 'icone'),
           ('fin_colaboradores', 'gratificacao'), ('fin_colaboradores', 'valor_hora'),
           ('fin_colaboradores', 'conta_id'), ('fin_colaboradores', 'pix_chave'),
           ('fin_colaboradores', 'logo_url'))
    `);
    expect(rows[0].n).toBe(17);

    // A tabela do mês volta inteira, e não só o `create table` — quem já tinha
    // o Financeiro rodando nunca passou por aquele bloco.
    const { rows: mes } = await velho.query<{ n: number }>(
      `select count(*)::int as n from information_schema.tables
        where table_schema = 'public' and table_name = 'fin_folha_lancamentos'`);
    expect(mes[0].n).toBe(1);
    await velho.close();
  }, 60_000);
});
