import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * A view de saldo devolve a marca da conta.
 *
 * O defeito era do pior tipo: a foto subia, o banco guardava, e a tela seguia
 * com o ícone de reserva — "adiciono as fotos dos bancos e nada acontece".
 * `fin_contas.logo_url` está preenchido em produção (Sicred, Itaú, Inter), mas
 * a tela não lê a TABELA: lê a view `fin_contas_saldo`, onde mora o saldo
 * calculado, e a view nunca listou a coluna.
 *
 * Não havia erro em lugar nenhum porque a leitura é tolerante: tenta com as
 * colunas, leva 42703, e repete sem elas. Silêncio é o que fez isso durar.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const sql = (n: string) => readFileSync(join(RAIZ, "supabase", n), "utf8")
  .replace(/create extension if not exists pgcrypto;/, "select 1;");

let db: PGlite;
let tridi: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql("financeiro.sql"));
  await db.exec(sql("financeiro_fornecedor_completo.sql"));
  await db.exec(sql("financeiro_contato_banco_recorrencia.sql"));

  tridi = (await db.query<{ id: string }>(
    "select id from public.fin_empresas where slug = 'tridi'")).rows[0].id;
  await db.query(
    "insert into public.fin_contas (empresa_id, nome, logo_url, icone) values ($1, 'Itaú', $2, 'wallet')",
    [tridi, "logos/conta/x/abc.png"]);
  await db.query(
    "insert into public.fin_contas (empresa_id, nome, tipo, limite) values ($1, 'Cartão', 'cartao', 5000)",
    [tridi]);
}, 120_000);

describe("Antes do arquivo — o defeito existe mesmo", () => {
  it("a view não devolvia a marca", async () => {
    await expect(
      db.query("select logo_url from public.fin_contas_saldo limit 1"),
    ).rejects.toThrow(/logo_url/);
  });
});

describe("Depois do arquivo", () => {
  beforeAll(async () => { await db.exec(sql("financeiro_view_conta_marca.sql")); }, 60_000);

  it("a view devolve logo e ícone", async () => {
    const { rows } = await db.query<{ nome: string; logo_url: string | null; icone: string | null }>(
      "select nome, logo_url, icone from public.fin_contas_saldo where nome = 'Itaú'");
    expect(rows[0].logo_url).toBe("logos/conta/x/abc.png");
    expect(rows[0].icone).toBe("wallet");
  });

  it("a view NÃO perdeu nada do que já entregava", async () => {
    // Recriar uma view com a lista incompleta tira coluna em silêncio, e a
    // leitura tolerante do app esconderia a perda exatamente como escondeu esta.
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'fin_contas_saldo'`);
    const cols = rows.map((r) => r.column_name);
    for (const c of [
      "id", "empresa_id", "nome", "tipo", "instituicao", "cor", "ordem", "ativa",
      "inclui_no_saldo", "saldo_inicial", "responsavel_id", "limite", "conta_mae_id",
      "bandeira", "final", "agencia", "numero", "saldo", "usado", "disponivel",
    ]) expect(cols, `a view perdeu ${c}`).toContain(c);
  });

  it("o saldo e o limite do cartão continuam certos", async () => {
    const { rows } = await db.query<{ saldo: string; usado: string | null; disponivel: string | null }>(
      "select saldo, usado, disponivel from public.fin_contas_saldo where nome = 'Cartão'");
    expect(Number(rows[0].saldo)).toBe(0);
    expect(Number(rows[0].usado)).toBe(0);
    expect(Number(rows[0].disponivel)).toBe(5000);
  });

  it("conta comum não finge ter limite", async () => {
    const { rows } = await db.query<{ usado: string | null; disponivel: string | null }>(
      "select usado, disponivel from public.fin_contas_saldo where nome = 'Itaú'");
    // Zero diria "tem limite e não usou nada", o que é falso.
    expect(rows[0].usado).toBeNull();
    expect(rows[0].disponivel).toBeNull();
  });

  it("roda de novo sem quebrar", async () => {
    await expect(db.exec(sql("financeiro_view_conta_marca.sql"))).resolves.toBeTruthy();
    const { rows } = await db.query("select logo_url from public.fin_contas_saldo limit 1");
    expect(rows).toBeTruthy();
  }, 60_000);
});
