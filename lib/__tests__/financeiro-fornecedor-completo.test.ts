import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * `supabase/financeiro_fornecedor_completo.sql` roda mesmo, em cima do banco
 * que já existe.
 *
 * É colado à mão no SQL Editor e mexe em dado REAL: 9 fornecedores com
 * categoria escrita. O que precisa ser provado não é a sintaxe — é que nada se
 * perde: a categoria antiga vira array sem sumir da coluna velha, e o cadastro
 * de categorias nasce preenchido com o que já está em uso, em vez de pedir que
 * alguém recadastre.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const BASE = readFileSync(join(RAIZ, "supabase", "financeiro.sql"), "utf8")
  .replace(/create extension if not exists pgcrypto;/, "select 1;");
const SQL = readFileSync(join(RAIZ, "supabase", "financeiro_fornecedor_completo.sql"), "utf8");

let db: PGlite;
let tridi: string;

/** O estado real de antes: fornecedores com categoria em texto, e nada mais. */
async function comOsDadosDeHoje(banco: PGlite) {
  const { rows } = await banco.query<{ id: string }>(
    "select id from public.fin_empresas where slug = 'tridi'");
  const emp = rows[0].id;
  for (const [nome, cat] of [
    ["Alexandre Império das Chapas", "Matéria Prima"],
    ["Molas ICO", "Peças"],
    ["Mestre Marceneiro", "Matéria Prima"],
    // O mesmo nome com outra caixa — é o que o índice único precisa recusar.
    ["Grafite e Cia", "matéria prima"],
    ["Sem categoria nenhuma", null],
  ] as [string, string | null][]) {
    await banco.query(
      "insert into public.fin_fornecedores (empresa_id, nome, categoria) values ($1, $2, $3)",
      [emp, nome, cat]);
  }
  await banco.query(
    "insert into public.fin_contatos (empresa_id, nome, categoria) values ($1, 'Zé Encanador', 'Encanador')",
    [emp]);
  return emp;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(BASE);
  tridi = await comOsDadosDeHoje(db);
  await db.exec(SQL);
}, 90_000);

describe("O fornecedor completo", () => {
  it("ganha as colunas de como se paga e de onde vem", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'fin_fornecedores'
        order by column_name`);
    const cols = rows.map((r) => r.column_name);
    for (const c of [
      "categorias", "pix_tipo", "pix_chave", "banco", "agencia", "conta_numero",
      "aceita_boleto", "inscricao_estadual", "site", "whatsapp", "cidade", "uf",
      "endereco", "prazo_envio_dias",
    ]) expect(cols, `faltou ${c}`).toContain(c);
  });

  it("prazo de ENVIO e prazo de PAGAMENTO são colunas diferentes", async () => {
    // Um é quando o material chega, o outro é quando o dinheiro sai. Fundir os
    // dois faria a compra ser planejada ao contrário.
    const { rows } = await db.query<{ n: number }>(
      `select count(*)::int as n from information_schema.columns
        where table_schema = 'public' and table_name = 'fin_fornecedores'
          and column_name in ('prazo_dias', 'prazo_envio_dias')`);
    expect(rows[0].n).toBe(2);
  });

  it("a categoria que já existia vira o primeiro item do array", async () => {
    const { rows } = await db.query<{ nome: string; categorias: string[] | null; categoria: string | null }>(
      "select nome, categorias, categoria from public.fin_fornecedores order by nome");
    const porNome = new Map(rows.map((r) => [r.nome, r]));
    expect(porNome.get("Molas ICO")?.categorias).toEqual(["Peças"]);
    // A coluna VELHA continua preenchida: consulta e tela que ainda leem
    // `categoria` não podem quebrar no dia do deploy.
    expect(porNome.get("Molas ICO")?.categoria).toBe("Peças");
    // Quem não tinha categoria continua sem — nada é inventado.
    expect(porNome.get("Sem categoria nenhuma")?.categorias).toBeNull();
  });

  it("o cadastro de categorias nasce com o que já está em uso", async () => {
    const { rows } = await db.query<{ nome: string; escopo: string }>(
      "select nome, escopo from public.fin_categorias order by escopo, nome");
    const forn = rows.filter((r) => r.escopo === "fornecedor").map((r) => r.nome);
    // "Matéria Prima" e "matéria prima" são A MESMA: uma só entra.
    expect(forn).toHaveLength(2);
    expect(forn.map((n) => n.toLowerCase()).sort()).toEqual(["matéria prima", "peças"]);
    expect(rows.filter((r) => r.escopo === "contato").map((r) => r.nome)).toEqual(["Encanador"]);
  });

  it("não deixa cadastrar a mesma categoria com outra caixa", async () => {
    await expect(
      db.query(
        "insert into public.fin_categorias (empresa_id, escopo, nome) values ($1, 'fornecedor', '  PEÇAS ')",
        [tridi]),
    ).rejects.toThrow();
  });

  it("a mesma palavra pode existir para fornecedor E para contato", async () => {
    // O vocabulário é outro: "Peças" de quem vende ≠ "Peças" de quem conserta.
    await expect(
      db.query(
        "insert into public.fin_categorias (empresa_id, escopo, nome) values ($1, 'contato', 'Peças')",
        [tridi]),
    ).resolves.toBeTruthy();
  });

  it("roda DE NOVO sem duplicar categoria nem desfazer edição", async () => {
    // Alguém editou o array na tela depois da migração: rodar o arquivo de novo
    // não pode devolver o valor antigo.
    await db.query(
      "update public.fin_fornecedores set categorias = array['Peças','Ferragens'] where nome = 'Molas ICO'");

    await expect(db.exec(SQL)).resolves.toBeTruthy();

    const { rows } = await db.query<{ categorias: string[] }>(
      "select categorias from public.fin_fornecedores where nome = 'Molas ICO'");
    expect(rows[0].categorias).toEqual(["Peças", "Ferragens"]);

    const { rows: cats } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.fin_categorias where escopo = 'fornecedor'");
    // 2 do uso + a 'Peças' de contato não conta aqui.
    expect(cats[0].n).toBe(2);
  });

  it("o gatilho de updated_at vale para a tabela nova", async () => {
    const { rows } = await db.query<{ id: string; updated_at: string }>(
      "select id, updated_at from public.fin_categorias limit 1");
    await db.query("update public.fin_categorias set ordem = 5 where id = $1", [rows[0].id]);
    const { rows: depois } = await db.query<{ updated_at: string }>(
      "select updated_at from public.fin_categorias where id = $1", [rows[0].id]);
    expect(new Date(depois[0].updated_at).getTime())
      .toBeGreaterThanOrEqual(new Date(rows[0].updated_at).getTime());
  });
});
