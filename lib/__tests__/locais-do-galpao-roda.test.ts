import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * O SQL dos locais do galpão roda mesmo, e não duplica.
 *
 * Mesma razão dos outros dois testes de SQL: este arquivo é colado à mão no SQL
 * Editor, e já explodiu na cara do dono duas vezes quando eu só "revisei à mão".
 * Aqui há o risco a mais de quem ESCREVE dado — rodar duas vezes tem de acabar
 * com 80 linhas, não 160.
 *
 * O que mais importa travar não é a contagem: é a ÁRVORE. Um `pai_id` errado não
 * dá erro nenhum no banco — o local simplesmente aparece no lugar errado da tela,
 * e a etiqueta manda alguém procurar a peça noutra rua.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const ARQUIVO = join(RAIZ, "supabase", "estoque_locais_do_galpao.sql");

/** `estoque_locais` como ela é hoje (supabase/estoque_hierarquia_unidades.sql). */
const ANTES = `
create table public.estoque_locais (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  codigo     text not null,
  pai_id     uuid references public.estoque_locais(id) on delete set null,
  ativo      boolean not null default true,
  ordem      int not null default 0,
  created_at timestamptz not null default now()
);
create unique index estoque_locais_codigo_idx on public.estoque_locais (lower(codigo));
`;

let SQL = "";
beforeAll(() => { SQL = readFileSync(ARQUIVO, "utf8"); });

async function banco(): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(ANTES);
  return db;
}

const conta = async (db: PGlite, sql: string) =>
  (await db.query<{ n: number }>(sql)).rows[0].n;

/** O código do pai de um código, lido do banco. `null` = está na raiz. */
async function paiDe(db: PGlite, codigo: string): Promise<string | null> {
  const { rows } = await db.query<{ pai: string | null }>(
    `select p.codigo as pai from public.estoque_locais l
       left join public.estoque_locais p on p.id = l.pai_id
      where l.codigo = $1`, [codigo]);
  return rows[0]?.pai ?? null;
}

describe("supabase/estoque_locais_do_galpao.sql", () => {
  it("num banco vazio entram 80 locais: 5 ruas, 21 móveis, 54 níveis", async () => {
    const db = await banco();
    await db.exec(SQL);

    expect(await conta(db, "select count(*)::int n from public.estoque_locais")).toBe(80);
    expect(await conta(db, "select count(*)::int n from public.estoque_locais where pai_id is null")).toBe(5);
    expect(await conta(db, `
      select count(*)::int n from public.estoque_locais l
        join public.estoque_locais p on p.id = l.pai_id where p.pai_id is null`)).toBe(21);
    expect(await conta(db, `
      select count(*)::int n from public.estoque_locais l
        join public.estoque_locais p on p.id = l.pai_id
        join public.estoque_locais a on a.id = p.pai_id`)).toBe(54);
    await db.close();
  }, 60_000);

  it("RODAR DUAS VEZES não duplica — é o risco de um arquivo que escreve dado", async () => {
    const db = await banco();
    await db.exec(SQL);
    await db.exec(SQL);
    expect(await conta(db, "select count(*)::int n from public.estoque_locais")).toBe(80);
    await db.close();
  }, 60_000);

  it("a árvore está certa: cada nível pendurado no SEU móvel, cada móvel na SUA rua", async () => {
    const db = await banco();
    await db.exec(SQL);

    // Um pai errado não dá erro no banco: manda alguém procurar noutra rua.
    expect(await paiDe(db, "A-01-6")).toBe("A-01");
    expect(await paiDe(db, "B-01-2")).toBe("B-01");
    expect(await paiDe(db, "C-05-3")).toBe("C-05");
    expect(await paiDe(db, "E-02-8")).toBe("E-02");
    expect(await paiDe(db, "E-04-4")).toBe("E-04");
    expect(await paiDe(db, "C-06")).toBe("C");
    expect(await paiDe(db, "REC")).toBe("E");
    expect(await paiDe(db, "A")).toBeNull();
    await db.close();
  }, 60_000);

  it("posição única NÃO ganha nível — inventar um andar que não existe é escolha na hora de etiquetar", async () => {
    const db = await banco();
    await db.exec(SQL);
    for (const solto of ["A-02", "A-03", "C-06", "D-02", "D-03", "E-01", "REC"]) {
      const filhos = await conta(db,
        `select count(*)::int n from public.estoque_locais l
           join public.estoque_locais p on p.id = l.pai_id where p.codigo = '${solto}'`);
      expect(filhos, `"${solto}" ganhou ${filhos} nível(is) e não devia ter nenhum`).toBe(0);
    }
    await db.close();
  }, 60_000);

  it("os andares são exatamente os que o dono mapeou, sem sobrar nem faltar degrau", async () => {
    const db = await banco();
    await db.exec(SQL);
    const esperado: Record<string, number> = {
      "A-01": 6, "B-01": 2, "B-02": 3, "B-03": 3, "B-04": 3,
      "C-01": 2, "C-02": 2, "C-03": 3, "C-04": 3, "C-05": 3,
      "D-01": 5, "E-02": 8, "E-03": 5, "E-04": 6,
    };
    for (const [movel, quantos] of Object.entries(esperado)) {
      const n = await conta(db,
        `select count(*)::int n from public.estoque_locais l
           join public.estoque_locais p on p.id = l.pai_id where p.codigo = '${movel}'`);
      expect(n, `"${movel}" ficou com ${n} nível(is), esperado ${quantos}`).toBe(quantos);
    }
    await db.close();
  }, 60_000);

  it("respeita o que já existe: local criado pela tela não é duplicado nem perde os filhos", async () => {
    const db = await banco();
    // Alguém já cadastrou a Estante Cinza pela aba Localização, com outro nome.
    await db.exec(`insert into public.estoque_locais (codigo, nome) values ('C', 'Rua C');`);
    await db.exec(`insert into public.estoque_locais (codigo, nome, pai_id)
      select 'C-03', 'Estante cinza do fundo', id from public.estoque_locais where codigo = 'C';`);
    await db.exec(SQL);

    expect(await conta(db, "select count(*)::int n from public.estoque_locais")).toBe(80);
    // O nome de quem já estava lá VENCE — o arquivo não renomeia o que a pessoa
    // escreveu, só deixa de inserir de novo.
    expect(await conta(db,
      `select count(*)::int n from public.estoque_locais where nome = 'Estante cinza do fundo'`)).toBe(1);
    // E os três níveis foram pendurados no local que já existia.
    expect(await paiDe(db, "C-03-2")).toBe("C-03");
    await db.close();
  }, 60_000);

  it("o código cabe na etiqueta: nenhum passa de 8 caracteres", async () => {
    const db = await banco();
    await db.exec(SQL);
    const { rows } = await db.query<{ codigo: string }>(
      "select codigo from public.estoque_locais where length(codigo) > 8");
    // O código divide a tira com o nome da peça e as barras. "A-01-1" tem 6;
    // qualquer coisa muito maior come a coluna do nome.
    expect(rows.map((r) => r.codigo)).toEqual([]);
    await db.close();
  }, 60_000);
});
