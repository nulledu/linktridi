import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * `supabase/financeiro_contato_banco_recorrencia.sql` roda mesmo, na ordem.
 *
 * Este arquivo é o mais arriscado dos três: ele DERRUBA E RECRIA
 * `fin_contas_saldo`. Já houve um dia em que a view não subia e o erro levava
 * junto todos os `alter table` da mesma transação — o banco ficava na versão
 * velha e a tela dizia "o banco ainda não foi criado" com o banco criado do
 * lado. Por isso o teste roda o arquivo em cima do schema completo, e confere a
 * conta do cartão com movimento de verdade.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const sql = (n: string) => readFileSync(join(RAIZ, "supabase", n), "utf8")
  .replace(/create extension if not exists pgcrypto;/, "select 1;");

const BASE = sql("financeiro.sql");
const FORNECEDOR = sql("financeiro_fornecedor_completo.sql");
const SQL = sql("financeiro_contato_banco_recorrencia.sql");

let db: PGlite;
let tridi: string;
let gedux: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(BASE);
  await db.exec(FORNECEDOR);

  const emp = async (slug: string) =>
    ((await db.query<{ id: string }>(
      "select id from public.fin_empresas where slug = $1", [slug])).rows[0].id);
  tridi = await emp("tridi");
  gedux = await emp("gedux");

  // O estado de ANTES: contato com um telefone só, em texto.
  await db.query(
    "insert into public.fin_contatos (empresa_id, nome, telefone, categoria) values ($1, 'Zé Encanador', '(14) 99999-0000', 'Encanador')",
    [tridi]);

  await db.exec(SQL);
}, 120_000);

const uuid = async (s: string, p: unknown[] = []) =>
  ((await db.query<{ id: string }>(s, p)).rows[0] as { id: string }).id;

describe("Contato", () => {
  it("ganha lista de telefones, tipo, cargo e onde trabalha", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'fin_contatos'`);
    const cols = rows.map((r) => r.column_name);
    for (const c of ["telefones", "categorias", "tipo", "cargo", "organizacao", "site"]) {
      expect(cols, `faltou ${c}`).toContain(c);
    }
  });

  it("o telefone que já existia vira o primeiro da lista, sem sumir do campo velho", async () => {
    const { rows } = await db.query<{ telefone: string; telefones: string[]; categorias: string[] }>(
      "select telefone, telefones, categorias from public.fin_contatos where nome = 'Zé Encanador'");
    expect(rows[0].telefones).toEqual(["(14) 99999-0000"]);
    // A coluna singular CONTINUA preenchida: ficha, CSV e busca ainda leem dela.
    expect(rows[0].telefone).toBe("(14) 99999-0000");
    expect(rows[0].categorias).toEqual(["Encanador"]);
  });

  it("aceita mais de um WhatsApp", async () => {
    await db.query(
      `update public.fin_contatos set telefones = array['(14) 99999-0000', '(14) 98888-1111']
        where nome = 'Zé Encanador'`);
    const { rows } = await db.query<{ telefones: string[] }>(
      "select telefones from public.fin_contatos where nome = 'Zé Encanador'");
    expect(rows[0].telefones).toHaveLength(2);
  });
});

describe("Banco e cartão", () => {
  it("o cartão pendura na conta do banco", async () => {
    const banco = await uuid(
      "insert into public.fin_contas (empresa_id, nome, tipo) values ($1, 'Itaú', 'banco') returning id",
      [tridi]);
    const cartao = await uuid(
      `insert into public.fin_contas (empresa_id, nome, tipo, limite, conta_mae_id, bandeira, final)
       values ($1, 'Itaú Visa', 'cartao', 5000, $2, 'Visa', '4321') returning id`,
      [tridi, banco]);
    const { rows } = await db.query<{ conta_mae_id: string; limite: string }>(
      "select conta_mae_id, limite from public.fin_contas where id = $1", [cartao]);
    expect(rows[0].conta_mae_id).toBe(banco);
    expect(Number(rows[0].limite)).toBe(5000);
  });

  it("cartão não pode ser mãe de si mesmo", async () => {
    const c = await uuid(
      "insert into public.fin_contas (empresa_id, nome, tipo) values ($1, 'Solto', 'cartao') returning id",
      [tridi]);
    await expect(
      db.query("update public.fin_contas set conta_mae_id = id where id = $1", [c]),
    ).rejects.toThrow();
  });

  it("cartão da Tridi não mora em banco da Gedux", async () => {
    const bancoGedux = await uuid(
      "insert into public.fin_contas (empresa_id, nome, tipo) values ($1, 'Inter Gedux', 'banco') returning id",
      [gedux]);
    await expect(
      db.query(
        `insert into public.fin_contas (empresa_id, nome, tipo, conta_mae_id)
         values ($1, 'Cartão trocado', 'cartao', $2)`, [tridi, bancoGedux]),
    ).rejects.toThrow(/outra empresa/);
  });

  it("usado e disponível saem do saldo, não de coluna gravada", async () => {
    const cartao = await uuid(
      `insert into public.fin_contas (empresa_id, nome, tipo, limite, saldo_inicial)
       values ($1, 'Cartão com fatura', 'cartao', 3000, 0) returning id`, [tridi]);
    // Gastar no cartão empurra o saldo para o negativo.
    await db.query(
      "insert into public.fin_movimentos (empresa_id, conta_id, tipo, valor) values ($1, $2, 'saida', -1200)",
      [tridi, cartao]);
    await db.query(
      "insert into public.fin_movimentos (empresa_id, conta_id, tipo, valor) values ($1, $2, 'saida', -300)",
      [tridi, cartao]);
    // Revertido não conta.
    await db.query(
      `insert into public.fin_movimentos (empresa_id, conta_id, tipo, valor, status)
       values ($1, $2, 'saida', -9999, 'revertido')`, [tridi, cartao]);

    const { rows } = await db.query<{ saldo: string; usado: string; disponivel: string }>(
      "select saldo, usado, disponivel from public.fin_contas_saldo where id = $1", [cartao]);
    expect(Number(rows[0].saldo)).toBe(-1500);
    expect(Number(rows[0].usado)).toBe(1500);
    expect(Number(rows[0].disponivel)).toBe(1500);
  });

  it("conta que não é cartão tem usado NULO, e não zero", async () => {
    // Zero diria "tem limite e não usou nada", o que é falso numa conta
    // corrente — ela não tem limite nenhum.
    const banco = await uuid(
      "insert into public.fin_contas (empresa_id, nome, tipo, saldo_inicial) values ($1, 'Corrente', 'banco', 900) returning id",
      [tridi]);
    const { rows } = await db.query<{ usado: string | null; disponivel: string | null }>(
      "select usado, disponivel from public.fin_contas_saldo where id = $1", [banco]);
    expect(rows[0].usado).toBeNull();
    expect(rows[0].disponivel).toBeNull();
  });

  it("cartão sem limite informado não inventa disponível", async () => {
    const c = await uuid(
      "insert into public.fin_contas (empresa_id, nome, tipo) values ($1, 'Cartão sem limite', 'cartao') returning id",
      [tridi]);
    const { rows } = await db.query<{ usado: string; disponivel: string | null }>(
      "select usado, disponivel from public.fin_contas_saldo where id = $1", [c]);
    expect(Number(rows[0].usado)).toBe(0);
    expect(rows[0].disponivel).toBeNull();
  });

  it("a view não perdeu as colunas que já tinha", async () => {
    // O `drop`/`create` é onde uma coluna some sem ninguém notar — e a tela de
    // Contas passa a dizer "o banco não foi criado" com o banco criado do lado.
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'fin_contas_saldo'`);
    const cols = rows.map((r) => r.column_name);
    for (const c of [
      "id", "empresa_id", "nome", "tipo", "instituicao", "cor", "ordem", "ativa",
      "inclui_no_saldo", "saldo_inicial", "responsavel_id", "saldo",
      // As duas que a tela de Bancos passou a editar: ela lê pela view.
      "agencia", "numero",
    ]) expect(cols, `a view perdeu ${c}`).toContain(c);
  });
});

describe("Recorrência", () => {
  it("sabe de qual conta sai E em qual conta entra", async () => {
    const sai = await uuid(
      "insert into public.fin_contas (empresa_id, nome) values ($1, 'Paga daqui') returning id", [tridi]);
    const entra = await uuid(
      "insert into public.fin_contas (empresa_id, nome) values ($1, 'Recebe aqui') returning id", [tridi]);
    const r = await uuid(
      `insert into public.fin_recorrencias (empresa_id, descricao, conta_id, conta_destino_id, forma_pagamento)
       values ($1, 'Aluguel recebido', $2, $3, 'PIX') returning id`, [tridi, sai, entra]);
    const { rows } = await db.query<{ conta_id: string; conta_destino_id: string; forma_pagamento: string }>(
      "select conta_id, conta_destino_id, forma_pagamento from public.fin_recorrencias where id = $1", [r]);
    expect(rows[0].conta_id).toBe(sai);
    expect(rows[0].conta_destino_id).toBe(entra);
    expect(rows[0].forma_pagamento).toBe("PIX");
  });

  it("a conta que RECEBE também é barrada quando é de outra empresa", async () => {
    const daGedux = await uuid(
      "insert into public.fin_contas (empresa_id, nome) values ($1, 'Conta da Gedux') returning id", [gedux]);
    await expect(
      db.query(
        "insert into public.fin_recorrencias (empresa_id, descricao, conta_destino_id) values ($1, 'Errada', $2)",
        [tridi, daGedux]),
    ).rejects.toThrow(/outra empresa/);
  });

  it("o responsável é uma pessoa da folha DESTA empresa", async () => {
    const pessoa = await uuid(
      "insert into public.fin_colaboradores (empresa_id, nome) values ($1, 'Douglas') returning id", [tridi]);
    await expect(
      db.query(
        "insert into public.fin_recorrencias (empresa_id, descricao, responsavel_id) values ($1, 'Com dono', $2)",
        [tridi, pessoa]),
    ).resolves.toBeTruthy();

    const daGedux = await uuid(
      "insert into public.fin_colaboradores (empresa_id, nome) values ($1, 'De outra') returning id", [gedux]);
    await expect(
      db.query(
        "insert into public.fin_recorrencias (empresa_id, descricao, responsavel_id) values ($1, 'Errada', $2)",
        [tridi, daGedux]),
    ).rejects.toThrow(/outra empresa/);
  });
});

describe("Rodar de novo", () => {
  it("não quebra e não desfaz o que foi editado na tela", async () => {
    await db.query(
      "update public.fin_contatos set telefones = array['(14) 97777-2222'] where nome = 'Zé Encanador'");

    await expect(db.exec(SQL)).resolves.toBeTruthy();

    const { rows } = await db.query<{ telefones: string[] }>(
      "select telefones from public.fin_contatos where nome = 'Zé Encanador'");
    expect(rows[0].telefones).toEqual(["(14) 97777-2222"]);

    // A view continua respondendo depois do segundo drop/create.
    const { rows: v } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.fin_contas_saldo");
    expect(v[0].n).toBeGreaterThan(0);
  }, 60_000);
});
