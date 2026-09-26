import { describe, it, expect, vi, beforeEach } from "vitest";

// Endereço COM DONO só serve o que foi marcado pra ele.
//
// O site público espelhado (outra conta na Vercel, ver scripts/espelho.mjs) roda
// o mesmo código do Gaius. Antes desta regra, a escolha de domínio na publicação
// decidia só o LINK divulgado, nunca a porta: havia um último recurso
// (`?? rows[0]`) que entregava a publicação pelo slug quando o host não casava
// com nada. Resultado medido em produção (16/09/2026): a Central de Tutoriais,
// publicada no gedux, abria igual em linktridi.vercel.app.
//
// O recurso não podia simplesmente sumir — ele é o que mantém prévia do editor,
// preview da Vercel e `npm run dev` abrindo qualquer projeto. Por isso a regra
// olha se o host está cadastrado em `tridiflow_dominios`.

type Resposta = { data: unknown; error: unknown };
const fila: Record<string, Resposta[]> = {};

class Consulta {
  constructor(private tabela: string) {}
  select() { return this; }
  eq() { return this; }
  limit() { return this; }
  maybeSingle() { return this; }
  then<R>(res: (v: Resposta) => R, rej?: (e: unknown) => R) {
    return Promise.resolve(fila[this.tabela]?.shift() ?? { data: [], error: null }).then(res, rej);
  }
}
const banco = { from: (t: string) => new Consulta(t) };
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => banco }));

const { getPaginaPublicada, getBotPublicado, DOMINIO_PADRAO } = await import("@/lib/tridiflow-db");
const { invalidate } = await import("@/lib/cache");

const PAGINA = { versao: 1, secoes: [], config: {} };
const paginaEm = (host: string | null) => ({
  id: "p1", nome: "Central de Tutoriais", slug: "central", status: "publicado", tipo: "page",
  published: { pagina: PAGINA }, settings: {}, tridiflow_dominios: host ? { host } : null,
});
const botEm = (host: string | null) => ({
  id: "b1", nome: "Quiz", slug: "quiz", status: "publicado",
  published: { fluxo: { nos: [], arestas: [] } }, settings: {}, tridiflow_dominios: host ? { host } : null,
});

/** `dominios` = o que a tabela tridiflow_dominios devolve; `bots` = as linhas do slug. */
function prepara(dominios: string[], bots: unknown[], tabela = "tridiflow_bots") {
  for (const k of Object.keys(fila)) delete fila[k];
  invalidate("tf-dominios:");
  invalidate("bot-pub:");
  fila["tridiflow_dominios"] = [{ data: dominios.map((host) => ({ host })), error: null }];
  fila[tabela] = [{ data: bots, error: null }];
}

beforeEach(() => { for (const k of Object.keys(fila)) delete fila[k]; });

describe("página: endereço com dono não serve publicação de outro domínio", () => {
  it("host cadastrado NÃO abre a página publicada em outro domínio", async () => {
    prepara(["gedux.com.br", "site-novo.com.br"], [paginaEm("gedux.com.br")]);
    expect(await getPaginaPublicada("site-novo.com.br", "central")).toBeNull();
  });

  it("host cadastrado abre a página marcada PRA ELE", async () => {
    prepara(["gedux.com.br", "site-novo.com.br"], [paginaEm("site-novo.com.br")]);
    const p = await getPaginaPublicada("site-novo.com.br", "central");
    expect(p?.nome).toBe("Central de Tutoriais");
  });

  // Projeto que nunca escolheu domínio é publicado no DOMINIO_PADRAO por
  // `linkPublico()`. Se o gedux deixasse de responder por ele, todo funil antigo
  // sairia do ar de uma vez — é o caso que torna a regra perigosa sem exceção.
  it("gedux responde por quem não escolheu domínio nenhum", async () => {
    prepara(["gedux.com.br", "site-novo.com.br"], [paginaEm(null)]);
    const p = await getPaginaPublicada(DOMINIO_PADRAO, "central");
    expect(p?.nome).toBe("Central de Tutoriais");
  });

  it("…e o site novo NÃO responde por quem não escolheu domínio", async () => {
    prepara(["gedux.com.br", "site-novo.com.br"], [paginaEm(null)]);
    expect(await getPaginaPublicada("site-novo.com.br", "central")).toBeNull();
  });

  // Prévia do editor, preview da Vercel e localhost não estão cadastrados —
  // sem esta saída, desenvolver e revisar antes de publicar deixaria de abrir.
  it("host SEM dono (preview/dev) continua abrindo qualquer publicação", async () => {
    prepara(["gedux.com.br", "site-novo.com.br"], [paginaEm("gedux.com.br")]);
    const p = await getPaginaPublicada("tridigaius.vercel.app", "central");
    expect(p?.nome).toBe("Central de Tutoriais");
  });

  // Migração pendente não pode derrubar landing no ar: sem a tabela, ninguém é
  // "endereço com dono" e tudo volta ao comportamento antigo.
  it("tabela de domínios ausente → falha para o lado ABERTO", async () => {
    for (const k of Object.keys(fila)) delete fila[k];
    invalidate("tf-dominios:");
    fila["tridiflow_dominios"] = [{ data: null, error: { message: "relation does not exist" } }];
    fila["tridiflow_bots"] = [{ data: [paginaEm("gedux.com.br")], error: null }];
    const p = await getPaginaPublicada("site-novo.com.br", "central");
    expect(p?.nome).toBe("Central de Tutoriais");
  });
});

describe("funil/quiz/LinkTridi: a mesma regra vale em /f", () => {
  it("host cadastrado NÃO abre o bot publicado em outro domínio", async () => {
    prepara(["gedux.com.br", "site-novo.com.br"], [botEm("gedux.com.br")]);
    expect(await getBotPublicado("site-novo.com.br", "quiz")).toBeNull();
  });

  it("host cadastrado abre o bot marcado pra ele", async () => {
    prepara(["gedux.com.br", "site-novo.com.br"], [botEm("site-novo.com.br")]);
    const b = await getBotPublicado("site-novo.com.br", "quiz");
    expect(b?.nome).toBe("Quiz");
  });
});
