import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const sql = (nome: string) => readFileSync(join(RAIZ, "supabase", nome), "utf8")
  .replace(/create extension if not exists pgcrypto;/, "select 1;");

let db: PGlite;
let empresa: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(sql("financeiro.sql"));
  await db.exec(sql("financeiro_fornecedor_completo.sql"));
  await db.exec(sql("financeiro_contato_banco_recorrencia.sql"));
  await db.exec(sql("financeiro_contato_empresa.sql"));
  await db.exec(sql("financeiro_compromisso_recorrente.sql"));
  empresa = (await db.query<{ id: string }>("select id from public.fin_empresas where slug = 'tridi'")).rows[0].id;
}, 120_000);

const entrada = (over: Record<string, unknown> = {}) => ({
  empresa_id: empresa,
  descricao: "Aluguel",
  categoria: "aluguel",
  valor: 8000,
  vencimento: "2026-08-10",
  periodicidade: "mensal",
  intervalo_meses: 1,
  dia_vencimento: 10,
  fim: null,
  conta_id: null,
  fornecedor_id: null,
  contato_id: null,
  observacao: null,
  ...over,
});

describe("compromisso recorrente transacional", () => {
  it("cria regra e primeira ocorrência ligadas sem repetir a competência", async () => {
    const { rows } = await db.query<{ compromisso_id: string; recorrencia_id: string }>(
      "select * from public.fin_criar_compromisso_recorrente($1::jsonb, null)",
      [JSON.stringify(entrada())]);
    const ids = rows[0];
    const { rows: compromissos } = await db.query<{ origem: string; origem_id: string; idempotency_key: string }>(
      "select origem, origem_id, idempotency_key from public.fin_compromissos where id = $1", [ids.compromisso_id]);
    expect(compromissos[0]).toEqual({
      origem: "recorrencia",
      origem_id: ids.recorrencia_id,
      idempotency_key: `rec:${ids.recorrencia_id}:2026-08`,
    });
    const { rows: regras } = await db.query<{ proxima_competencia: string }>(
      "select proxima_competencia::text from public.fin_recorrencias where id = $1", [ids.recorrencia_id]);
    expect(regraDate(regras[0].proxima_competencia)).toBe("2026-09-01");
  });

  it("não deixa regra órfã quando o compromisso é inválido", async () => {
    await expect(db.query(
      "select * from public.fin_criar_compromisso_recorrente($1::jsonb, null)",
      [JSON.stringify(entrada({ valor: -1, descricao: "Falha atômica" }))]))
      .rejects.toThrow();
    const { rows } = await db.query("select id from public.fin_recorrencias where descricao = 'Falha atômica'");
    expect(rows).toHaveLength(0);
  });

  it("recusa fornecedor e contato ao mesmo tempo", async () => {
    const fornecedor = (await db.query<{ id: string }>(
      "insert into public.fin_fornecedores (empresa_id, nome) values ($1, 'F') returning id", [empresa])).rows[0].id;
    const contato = (await db.query<{ id: string }>(
      "insert into public.fin_contatos (empresa_id, nome) values ($1, 'C') returning id", [empresa])).rows[0].id;
    await expect(db.query(
      "select * from public.fin_criar_compromisso_recorrente($1::jsonb, null)",
      [JSON.stringify(entrada({ fornecedor_id: fornecedor, contato_id: contato }))]))
      .rejects.toThrow(/favorecido/);
  });
});

function regraDate(valor: string | Date): string {
  return valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor).slice(0, 10);
}
