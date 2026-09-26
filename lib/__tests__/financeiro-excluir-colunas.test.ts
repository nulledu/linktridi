import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/**
 * Toda coluna que a rota de excluir pede EXISTE mesmo.
 *
 * A rota lia `id,nome,empresa_id,logo_url` das quatro tabelas como se elas
 * concordassem. Não concordam:
 *
 *   · `fin_recorrencias` e `fin_patrimonio` chamam de `descricao`, não `nome`;
 *   · `fin_patrimonio` não tem `logo_url` (não é tipo de marca).
 *
 * O sintoma foi "Não deu para ler a recorrência: column fin_recorrencias.nome
 * does not exist" — um erro de programação chegando na tela vestido de defeito
 * do banco, o que manda a pessoa procurar SQL que não rodou.
 *
 * `tsc` não pega nada disso: os nomes de coluna são strings. Este teste monta o
 * schema de verdade em Postgres e roda a consulta EXATA que a rota monta, para
 * cada tipo — inclusive as tabelas de `segura`, que têm o mesmo risco e são
 * onde alguém vai acrescentar um vínculo novo amanhã.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const sql = (n: string) => readFileSync(join(RAIZ, "supabase", n), "utf8")
  .replace(/create extension if not exists pgcrypto;/, "select 1;");
const ROTA = readFileSync(join(RAIZ, "app/api/financeiro/excluir/route.ts"), "utf8");
const MARCA = readFileSync(join(RAIZ, "app/api/financeiro/marca/route.ts"), "utf8");

/** Lê o mapa APAGAVEL direto da rota — a fonte é o código, não uma cópia. */
function mapaDaRota() {
  const corpo = ROTA.slice(ROTA.indexOf("const APAGAVEL = {"), ROTA.indexOf("} as const;"));
  const tipos: { tipo: string; tabela: string; nome: string; semLogo: boolean; segura: [string, string][] }[] = [];
  for (const m of corpo.matchAll(/^ {2}(\w+): \{([\s\S]*?)^ {2}\},$/gm)) {
    const [, tipo, bloco] = m;
    tipos.push({
      tipo,
      tabela: /tabela: "(\w+)"/.exec(bloco)![1],
      nome: /nome: "(\w+)"/.exec(bloco)![1],
      semLogo: /semLogo: true/.test(bloco),
      segura: [...bloco.matchAll(/\{ tabela: "(\w+)", coluna: "(\w+)"/g)].map((s) => [s[1], s[2]]),
    });
  }
  return tipos;
}

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  for (const arquivo of [
    "financeiro.sql",
    "financeiro_fornecedor_completo.sql",
    "financeiro_contato_banco_recorrencia.sql",
    "financeiro_contato_empresa.sql",
    "financeiro_cadastro_unificado.sql",
    "financeiro_folha_mensal.sql",
    "financeiro_estornos.sql",
  ]) await db.exec(sql(arquivo));
}, 120_000);

describe("Excluir — as colunas existem", () => {
  it("o mapa foi lido (senão o resto passa por vazio)", () => {
    const m = mapaDaRota();
    expect(m.map((x) => x.tipo).sort()).toEqual(
      ["colaborador", "compromisso", "conta", "empresa", "estorno", "patrimonio", "recorrencia"]);
  });

  it.each(mapaDaRota())("$tipo: a consulta que a rota monta roda", async ({ tipo, tabela, nome, semLogo }) => {
    const colunas = [
      "id", `${nome} as nome`,
      ...(tipo === "empresa" ? [] : ["empresa_id"]),
      ...(semLogo ? [] : ["logo_url"]),
    ].join(", ");
    await expect(
      db.query(`select ${colunas} from public.${tabela} limit 1`),
      `a rota pede uma coluna que ${tabela} não tem`,
    ).resolves.toBeTruthy();
  });

  it.each(mapaDaRota())("$tipo: as tabelas que SEGURAM também batem", async ({ segura }) => {
    for (const [tabela, coluna] of segura) {
      await expect(
        db.query(`select 1 from public.${tabela} where ${coluna} is null limit 1`),
        `${tabela}.${coluna} não existe — a conferência passaria batido e apagaria histórico`,
      ).resolves.toBeTruthy();
    }
  });

  it("nenhum tipo assume `nome` sem declarar", () => {
    // A regressão exata: `id,nome,...` fixo para as quatro tabelas.
    expect(ROTA).not.toContain('"id,nome,empresa_id,logo_url"');
    for (const t of mapaDaRota()) expect(t.nome, `${t.tipo} sem coluna de nome`).toBeTruthy();
  });
});

/**
 * A rota da MARCA tem o mesmo risco, e caiu nele.
 *
 * Ela lia `id,nome,empresa_id,logo_url` das seis tabelas de marca. Cinco têm
 * `nome`; `fin_recorrencias` tem `descricao`. O 42703 resultante era
 * classificado como "schema atrasado" e traduzido para "rode os arquivos de
 * supabase/" — então subir a foto de uma recorrência falhava mandando a pessoa
 * rodar SQL que já estava rodado. Erro nosso vestido de problema do banco, que
 * é a pior forma de errar: manda procurar longe.
 */
describe("Marca — as colunas existem", () => {
  const TABELA: Record<string, string> = {
    empresa: "fin_empresas", conta: "fin_contas", fornecedor: "fin_fornecedores",
    contato: "fin_contatos", colaborador: "fin_colaboradores", recorrencia: "fin_recorrencias",
    patrimonio: "fin_patrimonio",
  };
  /** Quem ainda depende de um SQL que o dono roda à mão. */
  const PENDENTE_DE_SQL = new Set(["patrimonio"]);

  /** Lê COLUNA_NOME da rota — a fonte é o código, não uma cópia. */
  function nomes(): [string, string][] {
    const bloco = MARCA.slice(MARCA.indexOf("const COLUNA_NOME"), MARCA.indexOf("/** As colunas que a marca"));
    return [...bloco.matchAll(/(\w+): "(\w+)"/g)].map((m) => [m[1], m[2]]);
  }

  it("todos os tipos de marca declaram a coluna do nome", () => {
    expect(nomes().map(([t]) => t).sort()).toEqual(
      ["colaborador", "conta", "contato", "empresa", "fornecedor", "patrimonio", "recorrencia"]);
  });

  it.each(nomes())("%s: a coluna de nome existe mesmo", async (tipo, coluna) => {
    // `logo_url` do patrimônio vem de `financeiro_patrimonio_foto.sql`, que o
    // dono roda à mão; o código já é tolerante à ausência. Conferir o nome
    // continua valendo — é ele que erra em silêncio.
    const marca = PENDENTE_DE_SQL.has(tipo) ? [] : ["logo_url"];
    const cols = ["id", `${coluna} as nome`, ...(tipo === "empresa" ? [] : ["empresa_id"]), ...marca].join(", ");
    await expect(
      db.query(`select ${cols} from public.${TABELA[tipo]} limit 1`),
      `a rota da marca pede uma coluna que ${TABELA[tipo]} não tem`,
    ).resolves.toBeTruthy();
  });

  it("42703 NÃO é tratado como schema atrasado", () => {
    // Coluna que não existe é quase sempre consulta errada nossa. Dizer "rode
    // os arquivos de supabase/" nesse caso é mandar procurar no lugar errado.
    const bloco = MARCA.slice(MARCA.indexOf("const faltaSchema"), MARCA.indexOf("const faltaSchema") + 400);
    expect(bloco).not.toContain('"42703"');
    // Tabela ausente continua sendo schema de verdade.
    expect(bloco).toContain('"42P01"');
  });

  it("nenhuma rota do módulo assume `nome` para todas as tabelas", () => {
    for (const [arquivo, texto] of [["excluir", ROTA], ["marca", MARCA]] as [string, string][]) {
      expect(texto, `${arquivo} voltou a fixar a lista de colunas`)
        .not.toContain('"id,nome,empresa_id,logo_url"');
    }
  });
});
