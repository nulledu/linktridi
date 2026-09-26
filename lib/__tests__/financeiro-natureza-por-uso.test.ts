import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * `supabase/financeiro_natureza_por_uso.sql` roda, e marca só quem tem PROVA.
 *
 * O que precisa ser provado não é sintaxe: é o CRITÉRIO. Um `update` sem
 * `where` marcaria as pessoas de verdade como empresa, e o dado é do dono —
 * adivinhar errado em cima dele é pior que deixar como está.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const sql = (n: string) => readFileSync(join(RAIZ, "supabase", n), "utf8")
  .replace(/create extension if not exists pgcrypto;/, "select 1;");

const SQL = sql("financeiro_natureza_por_uso.sql");

let db: PGlite;
let tridi: string;

const natureza = async (nome: string) =>
  (await db.query<{ natureza: string }>(
    "select natureza from public.fin_contatos where nome = $1", [nome])).rows[0]?.natureza;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql("financeiro.sql"));
  await db.exec(sql("financeiro_fornecedor_completo.sql"));
  await db.exec(sql("financeiro_contato_banco_recorrencia.sql"));
  await db.exec(sql("financeiro_contato_empresa.sql"));
  // `cnpj` e `papeis` em fin_contatos vêm daqui: sem este arquivo o critério
  // do passo 1 não tem coluna em que se apoiar.
  await db.exec(sql("financeiro_cadastro_unificado.sql"));

  tridi = (await db.query<{ id: string }>(
    "select id from public.fin_empresas where slug = 'tridi'")).rows[0].id;

  const novo = (nome: string, extra = "", vals: unknown[] = []) =>
    db.query(
      `insert into public.fin_contatos (empresa_id, nome${extra ? ", " + extra : ""})
       values ($1, $2${vals.map((_, i) => `, $${i + 3}`).join("")})`,
      [tridi, nome, ...vals]);

  await novo("Com CNPJ", "cnpj", ["12.345.678/0001-90"]);
  await novo("Fornecedora", "papeis", [["fornecedor"]]);
  await novo("Pessoa comum");
  await novo("Só contato", "papeis", [["contato"]]);
  await novo("CNPJ em branco", "cnpj", [""]);
  await novo("Mãe");
  const mae = (await db.query<{ id: string }>(
    "select id from public.fin_contatos where nome = 'Mãe'")).rows[0].id;
  await novo("Filho", "organizacao_id", [mae]);

  await db.exec(SQL);
}, 120_000);

describe("Natureza por uso — quem vira empresa", () => {
  it("quem tem CNPJ", async () => {
    expect(await natureza("Com CNPJ")).toBe("empresa");
  });

  it("ser FORNECEDOR não faz de ninguém uma empresa", async () => {
    // Esta asserção já foi o contrário, e o SQL com ela rodou em produção:
    // marcou como empresa o "Mestre Marceneiro" e o "Alexandre Império das
    // Chapas" — um marceneiro autônomo e uma pessoa com nome próprio.
    // Fornecedor é PAPEL, empresa é natureza jurídica; uma não se deduz da
    // outra, e o autônomo é o caso comum, não a exceção.
    expect(await natureza("Fornecedora")).toBe("pessoa");
  });

  it("quem já é apontada como organização de alguém", async () => {
    expect(await natureza("Mãe")).toBe("empresa");
  });
});

describe("Natureza por uso — quem NÃO vira", () => {
  it("pessoa sem nenhuma prova fica como está", async () => {
    expect(await natureza("Pessoa comum")).toBe("pessoa");
  });

  it("quem só é contato continua pessoa", async () => {
    expect(await natureza("Só contato")).toBe("pessoa");
  });

  it("CNPJ vazio não conta como CNPJ", async () => {
    // `coalesce(cnpj, '') <> ''` sozinho deixaria passar "   " e "--/-".
    expect(await natureza("CNPJ em branco")).toBe("pessoa");
  });

  it("a pessoa que TEM organização não vira empresa junto", async () => {
    // O vínculo prova a mãe, nunca o filho.
    expect(await natureza("Filho")).toBe("pessoa");
  });
});

describe("Rodar de novo", () => {
  it("desfaz o estrago da versão antiga, e só dela", async () => {
    // Simula o banco de quem rodou a primeira versão: fornecedor marcado como
    // empresa, sem CNPJ e sem ninguém apontando para ele.
    await db.query("update public.fin_contatos set natureza = 'empresa' where nome = 'Fornecedora'");
    // E alguém com prova de verdade, que NÃO pode ser rebaixado junto.
    await db.query("update public.fin_contatos set natureza = 'empresa' where nome = 'Com CNPJ'");
    await db.exec(SQL);
    expect(await natureza("Fornecedora"), "devia ter voltado a pessoa").toBe("pessoa");
    expect(await natureza("Com CNPJ"), "tem CNPJ: fica empresa").toBe("empresa");
    expect(await natureza("Mãe"), "alguém a aponta: fica empresa").toBe("empresa");
    expect(await natureza("Pessoa comum")).toBe("pessoa");
  }, 60_000);
});
