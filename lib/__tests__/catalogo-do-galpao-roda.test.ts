import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * O SQL que cadastra os itens do galpão roda mesmo, e não duplica.
 *
 * Mesma razão do sql-pendente-roda.test.ts: o arquivo é colado à mão no SQL
 * Editor, e já explodiu na cara do dono duas vezes quando eu só "revisei à mão".
 * Aqui há um risco a mais, que revisão nenhuma pega — este arquivo ESCREVE
 * dado. Rodar duas vezes tem de acabar com 97 itens, não 194.
 *
 * A trava que importa é a do NOME: o catálogo não tem UNIQUE em `nome`, então
 * quem impede "COLA PVA" nascer ao lado de "Cola PVA" é o `where not exists`
 * com `estoque_nome_chave` (translate, sem depender de extensão). Se alguém trocar isso por um insert seco, o
 * estoque racha em dois itens com o mesmo material e nenhum dos dois números
 * fecha — o mesmo defeito que a importação por tela já teve de resolver.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const ARQUIVO = join(RAIZ, "supabase", "catalogo_itens_do_galpao.sql");

/** `estoque_itens` como ela é, com o que este arquivo toca. */
const ANTES = `
create table public.estoque_itens (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text,
  observacoes text,
  hierarquia text,
  quantidade int not null default 0,
  ativo boolean not null default true
);
`;

let SQL = "";
beforeAll(() => { SQL = readFileSync(ARQUIVO, "utf8"); });

async function banco(nomesExistentes: string[] = []): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(ANTES);
  for (const n of nomesExistentes) {
    await db.exec(`insert into public.estoque_itens (nome) values ('${n.replace(/'/g, "''")}');`);
  }
  return db;
}

const conta = async (db: PGlite, sql = "select count(*)::int n from public.estoque_itens") =>
  (await db.query<{ n: number }>(sql)).rows[0].n;

describe("supabase/catalogo_itens_do_galpao.sql", () => {
  it("num catálogo vazio, cadastra os 97 e nenhum fica com hierarquia", async () => {
    const db = await banco();
    await db.exec(SQL);

    expect(await conta(db)).toBe(97);
    // Nascer sem hierarquia é decisão, não esquecimento: adivinhar pelo nome
    // erra em silêncio, e ninguém revisa o que parece pronto.
    expect(await conta(db, "select count(*)::int n from public.estoque_itens where hierarquia is null")).toBe(97);
    // Quantidade é contagem, não chute.
    expect(await conta(db, "select count(*)::int n from public.estoque_itens where quantidade = 0")).toBe(97);
    await db.close();
  }, 60_000);

  it("RODAR DUAS VEZES não duplica — é o risco de um arquivo que escreve dado", async () => {
    const db = await banco();
    await db.exec(SQL);
    await db.exec(SQL);
    expect(await conta(db)).toBe(97);
    await db.close();
  }, 60_000);

  it("não duplica o que já existe escrito com outra caixa ou acento", async () => {
    // Os nomes abaixo ESTÃO na lista dos 97, escritos lá em CAIXA ALTA e com
    // acento; aqui entram antes em Título e sem acento. É o caso real invertido
    // — a primeira versão deste teste pré-inseria nomes que a lista já excluía,
    // então ele passava sem exercitar a dedup nenhuma vez.
    const antes = ["Acrilico", "Tonner", "Argola", "Lixa", "Seringa"];
    const db = await banco(antes);
    await db.exec(SQL);

    // Os 5 já estavam: o arquivo insere 97 − 5 = 92, e o total continua 97.
    expect(await conta(db)).toBe(97);
    for (const nome of ["acrilico", "tonner", "argola", "lixa", "seringa"]) {
      const n = await conta(db,
        `select count(*)::int n from public.estoque_itens where public.estoque_nome_chave(nome) = '${nome}'`);
      expect(n, `"${nome}" apareceu ${n}×`).toBe(1);
    }
    // E o que sobreviveu é a grafia de QUEM JÁ ESTAVA — o arquivo não renomeia
    // o que o catálogo já tinha, só deixa de inserir de novo.
    expect(await conta(db, `select count(*)::int n from public.estoque_itens where nome = 'Acrilico'`)).toBe(1);
    await db.close();
  }, 60_000);

  it("as correções de leitura estão lá, e o typo do papel não", async () => {
    const db = await banco();
    await db.exec(SQL);
    const tem = async (nome: string) =>
      (await conta(db, `select count(*)::int n from public.estoque_itens where nome = '${nome}'`)) === 1;

    // "PS Preto, Branco" era uma linha só e são dois materiais diferentes.
    expect(await tem("PS Preto")).toBe(true);
    expect(await tem("PS Branco")).toBe(true);
    // "TINTA DE PLÁSICO VERDE" no papel — faltava o T.
    expect(await tem("TINTA DE PLÁSTICO VERDE")).toBe(true);
    expect(await conta(db, `select count(*)::int n from public.estoque_itens where nome ilike '%PLÁSICO%'`)).toBe(0);
    await db.close();
  }, 60_000);

  it("nenhuma linha de CONVERSA virou item", async () => {
    const db = await banco();
    await db.exec(SQL);
    // O texto colado tinha horário de mensagem, nome de quem falou e frases
    // soltas. Qualquer uma delas virando linha do catálogo é ruído que alguém
    // vai tentar dar baixa um dia.
    for (const lixo of ["%20h1%", "%Caio%", "%Anotei%", "%bruno%", "%seria bom%", "%Enviar mensagem%", "Estoque logistica", "%Estoque Maquinas%"]) {
      const n = await conta(db, `select count(*)::int n from public.estoque_itens where nome ilike '${lixo}'`);
      expect(n, `"${lixo}" virou item`).toBe(0);
    }
    await db.close();
  }, 60_000);
});
