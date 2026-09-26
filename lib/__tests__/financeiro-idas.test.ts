import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Quantas vezes o Financeiro vai ao banco — e quando NÃO vai.
 *
 * Cada ida ao Supabase custa 250–700 ms daqui. A lentidão que o dono relatou
 * ("extremamente lento") não era peso de dados: era NÚMERO de idas por tela,
 * em sequência. Este teste conta as idas num banco de mentira, porque é a
 * única forma de uma mudança em `db.ts` não devolver a lentidão em silêncio.
 *
 * Três promessas ficam travadas aqui:
 *  · o que o banco disse que NÃO tem (coluna/tabela do SQL pendente) não é
 *    perguntado de novo por um minuto;
 *  · a lista de empresas e os acessos da pessoa saem em PARALELO, e a segunda
 *    chamada dentro do minuto não vai ao banco;
 *  · quem escreve empresa/acesso esquece o cache na hora.
 */

const chamadas: string[] = [];
let faltaColuna = false;

class Consulta {
  url: URL;
  constructor(tabela: string) { this.url = new URL(`https://x.supabase.co/rest/v1/${tabela}`); }
  select(cols: string) { this.url.searchParams.set("select", cols); return this; }
  eq(c: string, v: string) { this.url.searchParams.set(c, `eq.${v}`); return this; }
  order() { return this; }
  limit() { return this; }
  then(res: (v: { data: unknown; error: unknown }) => void) {
    chamadas.push(this.url.pathname.split("/").pop() + "?" + this.url.searchParams.get("select"));
    // Simula a latência: a ordem de CHEGADA das respostas diz se as idas foram
    // paralelas (as duas chamadas já estão na lista antes de qualquer resposta).
    setTimeout(() => {
      const tabela = this.url.pathname.split("/").pop();
      const cols = this.url.searchParams.get("select") ?? "";
      if (faltaColuna && cols.includes("logo_url")) {
        res({ data: null, error: { code: "PGRST204", message: "column fin_empresas.logo_url does not exist" } });
        return;
      }
      if (tabela === "fin_empresas") res({ data: [{ id: "e1", slug: "tridi", nome: "Tridi", ordem: 1, ativa: true }, { id: "e2", slug: "gedux", nome: "Gedux", ordem: 2, ativa: true }], error: null });
      else if (tabela === "fin_acessos") res({ data: [{ empresa_id: "e1" }], error: null });
      else res({ data: [], error: null });
    }, 5);
  }
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({ from: (t: string) => new Consulta(t) }),
}));

const { empresasDoUsuario, esquecerEmpresas, listarEmpresas } = await import("@/lib/financeiro/db");
const { invalidate } = await import("@/lib/cache");

beforeEach(() => {
  chamadas.length = 0;
  faltaColuna = false;
  invalidate("fin:");
});

describe("empresas da pessoa", () => {
  it("as duas idas saem em paralelo, e a segunda chamada não vai ao banco", async () => {
    const r = await empresasDoUsuario("u1");
    expect(r.dados.map((e) => e.id)).toEqual(["e1"]);
    // As DUAS foram disparadas antes de qualquer resposta chegar: a lista
    // tem as duas, na ordem de disparo, e não "empresas → resposta → acessos".
    expect(chamadas.map((c) => c.split("?")[0])).toEqual(["fin_empresas", "fin_acessos"]);

    chamadas.length = 0;
    await empresasDoUsuario("u1");
    expect(chamadas, "dentro do minuto, nenhuma ida").toEqual([]);
  });

  it("quem escreve esquece — e a próxima leitura vai ao banco de novo", async () => {
    await empresasDoUsuario("u1");
    chamadas.length = 0;
    esquecerEmpresas();
    await empresasDoUsuario("u1");
    expect(chamadas.length).toBe(2);
  });
});

describe("o que o banco disse que não tem", () => {
  it("a coluna que falta não é perguntada de novo por um minuto", async () => {
    faltaColuna = true;
    invalidate("fin:");
    const r1 = await listarEmpresas();
    // Primeira vez: tenta COM a marca (falha), cai para SEM a marca (passa).
    expect(chamadas.length).toBe(2);
    expect(r1.dados).toHaveLength(2);

    chamadas.length = 0;
    invalidate("fin:");            // força sair do cache de 60s da lista…
    const r2 = await listarEmpresas();
    // …mas a ida que FALHA continua lembrada: só a consulta sem a marca viaja.
    expect(chamadas.length).toBe(1);
    expect(chamadas[0]).not.toContain("logo_url");
    expect(r2.dados).toHaveLength(2);
  });
});

/**
 * Nenhuma página do Financeiro busca em SEQUÊNCIA o que não depende.
 *
 * A tela de Colaboradores demorava porque fazia cinco ondas enfileiradas —
 * quatro leituras, depois a comissão, depois as fotos, depois a configuração —
 * e cada onda custa uma ida inteira (250–700 ms daqui). Só as fotos dependem
 * de verdade (precisam da lista para saber o que assinar).
 *
 * Esta trava lê o CÓDIGO das páginas: um `await` de leitura solto depois de um
 * `Promise.all` é a assinatura do defeito. Ela não sabe medir tempo — sabe
 * apontar a forma que produz o tempo.
 */
describe("Página do Financeiro não enfileira o que cabe em paralelo", () => {
  const { readFileSync, readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
  const { join, relative } = require("node:path") as typeof import("node:path");
  const RAIZ = new URL("../..", import.meta.url).pathname;
  const TELAS = join(RAIZ, "app", "(plataforma)", "financeiro");

  function paginas(dir: string, out: string[] = []): string[] {
    for (const nome of readdirSync(dir)) {
      const full = join(dir, nome);
      if (statSync(full).isDirectory()) paginas(full, out);
      else if (nome === "page.tsx") out.push(full);
    }
    return out;
  }

  // Ler estas DEPOIS do Promise.all é legítimo: elas dependem do que ele
  // devolveu. `assinarLogos` precisa da lista para saber quais caminhos
  // assinar; `proximoCodigoPatrimonio` precisa da empresa resolvida.
  const DEPENDEM = /assinarLogos|proximoCodigoPatrimonio/;

  const LEITURAS = /\bawait\s+(colaboradores|contas|contatos|fornecedores|recorrencias|compromissos|compras|notas|patrimonio|movimentos|auditoria|lancamentosDaFolha|pessoasDoSistema|folhaTotal|categorias|comissoesPorPessoa|comissaoMarketplaceDoMes|comissoesVendasPorPessoa|configDaEmpresa|configDasEmpresas|quemTemAcesso|listarEmpresas)\s*\(/;

  it("nenhuma leitura independente espera o Promise.all terminar", () => {
    const enfileiram: string[] = [];
    for (const arquivo of paginas(TELAS)) {
      const texto = readFileSync(arquivo, "utf8");
      const depoisDoAll = texto.split("Promise.all(").slice(1).join("Promise.all(");
      if (!depoisDoAll) continue;
      for (const linha of depoisDoAll.split("\n")) {
        if (!LEITURAS.test(linha) || DEPENDEM.test(linha)) continue;
        // Dentro do próprio Promise.all as chamadas aparecem sem `await`.
        enfileiram.push(`${relative(RAIZ, arquivo)}: ${linha.trim().slice(0, 70)}`);
      }
    }
    expect(enfileiram, "ponha estas leituras DENTRO do Promise.all").toEqual([]);
  });

  /**
   * A SEGUNDA onda também é uma onda.
   *
   * O primeiro `Promise.all` resolveu a lentidão de quem buscava tudo em fila,
   * mas o que sobrou DEPOIS dele voltou a enfileirar sozinho: a folha esperava
   * `folhaDoMes`, depois a foto do totem, depois o ponto, depois assinar as
   * fotos — quatro esperas de 250–700 ms para quatro coisas que dependem só da
   * lista de pessoas, não umas das outras.
   *
   * A regra mecânica: no máximo UM `await` solto destes por página. Duas em
   * sequência significa que a segunda podia estar dentro de um `Promise.all`
   * com a primeira. Quando a segunda depende MESMO da primeira (o caso de
   * `assinarLogos` sobre uma lista que acabou de chegar), a primeira entra na
   * rodada de cima e sobra uma só.
   */
  const SEGUNDA_ONDA = /\bawait\s+(folhaDoMes|fotosDoMercadinho|pontoDaFolha|assinarLogos|partesReferenciadas|valoresDeRecorrencias|proximoCodigoPatrimonio)\s*\(/;

  it("nenhuma página encadeia duas esperas depois do Promise.all", () => {
    const enfileiram: string[] = [];
    for (const arquivo of paginas(TELAS)) {
      const texto = readFileSync(arquivo, "utf8");
      // Só o que está FORA de um `Promise.all([...])`: dentro dele as chamadas
      // aparecem sem `await`, então a expressão acima já não as vê.
      const soltas = texto.split("\n").filter((linha) => SEGUNDA_ONDA.test(linha));
      if (soltas.length > 1) {
        enfileiram.push(`${relative(RAIZ, arquivo)}: ${soltas.length} esperas em fila`);
      }
    }
    expect(enfileiram, "junte estas esperas num Promise.all — elas não dependem umas das outras").toEqual([]);
  });

  /**
   * A lista de empresas sai ANTES do gate.
   *
   * Ela não depende de quem é a pessoa (só o filtro de acesso depende), e o
   * gate custa sessão + grade de áreas. Disparada antes, ela viaja em paralelo
   * com ele; disparada depois, é uma ida inteira somada ao caminho crítico de
   * TODA tela do módulo numa instância fria. Sem `await` de propósito: quem
   * consome é o `resolverEmpresa`, pela mesma promessa no cache de processo.
   */
  it("o contexto e o trilho pedem as empresas antes de esperar pelo gate", () => {
    for (const arquivo of ["contexto.ts", "layout.tsx"]) {
      const texto = readFileSync(join(TELAS, arquivo), "utf8");
      const aquece = texto.indexOf("void listarEmpresas()");
      const gate = texto.indexOf("await requireFinanceiro(");
      expect(aquece, `${arquivo}: falta o aquecimento da lista de empresas`).toBeGreaterThan(-1);
      expect(gate, `${arquivo}: cadê o gate?`).toBeGreaterThan(-1);
      expect(aquece, `${arquivo}: o aquecimento tem que vir ANTES do gate`).toBeLessThan(gate);
    }
  });
});
