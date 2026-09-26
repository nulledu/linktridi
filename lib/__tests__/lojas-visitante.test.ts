import { describe, it, expect } from "vitest";
import { ehCaminhoDeVitrine, resolverIdentidade } from "@/lib/lojas-visitante";

// ── Trava da identidade anônima da vitrine ───────────────────────────────────
// Três coisas quebram um relatório de acesso de um jeito que ninguém percebe:
//
//   1. a SESSÃO renascer a cada página — cada clique viraria um visitante novo
//      e o relatório mostraria dez pessoas onde havia uma;
//   2. a ORIGEM ser reclassificada dentro da sessão — a mesma sessão seria
//      contada em "Instagram" e em "direto", inflando os dois;
//   3. o PRIMEIRO TOQUE ser sobrescrito por uma visita direta — o anúncio que
//      trouxe a pessoa perderia o crédito da venda pro "direto".
//
// Os três estão abaixo.

const P = (s = "") => new URLSearchParams(s);
const LOJA = "carimbostridi.com.br";
const UUID = "11111111-2222-4333-8444-555555555555";
const OUTRO = "99999999-8888-4777-8666-555555555555";

describe("caminho de vitrine", () => {
  it("pega /l e o que está dentro, e só isso", () => {
    expect(ehCaminhoDeVitrine("/l")).toBe(true);
    expect(ehCaminhoDeVitrine("/l/carimbos")).toBe(true);
    expect(ehCaminhoDeVitrine("/l/carimbos/produto-x")).toBe(true);
    // `/lojas` é o PAINEL, atrás de sessão. Dar cookie de visitante ali seria
    // contar o próprio lojista como visita da loja dele.
    expect(ehCaminhoDeVitrine("/lojas")).toBe(false);
    expect(ehCaminhoDeVitrine("/lojas/abc/analises")).toBe(false);
    expect(ehCaminhoDeVitrine("/login")).toBe(false);
    expect(ehCaminhoDeVitrine("/")).toBe(false);
  });
});

describe("primeira visita", () => {
  it("cria visitante e sessão, e marca as duas como novas", () => {
    const id = resolverIdentidade({}, null, P(), LOJA);
    expect(id.visitante).toMatch(/^[0-9a-f-]{36}$/i);
    expect(id.sessao).toMatch(/^[0-9a-f-]{36}$/i);
    expect(id.novo).toBe(true);
    expect(id.primeira).toBe(true);
    expect(id.origem.canal).toBe("direto");
  });

  it("classifica a origem da campanha e a guarda como primeiro toque", () => {
    const id = resolverIdentidade({}, "https://l.instagram.com/", P("utm_source=insta&utm_medium=paid_social&utm_campaign=natal"), LOJA);
    expect(id.origem).toMatchObject({ canal: "social", fonte: "insta", campanha: "natal" });
    expect(id.atribuicao).toMatchObject({ canal: "social", fonte: "insta", campanha: "natal" });
  });
});

describe("a sessão continua", () => {
  it("não renasce a cada página", () => {
    const id = resolverIdentidade(
      { visitante: UUID, sessao: `${OUTRO}|social|instagram|natal` },
      "https://carimbostridi.com.br/",   // referrer interno: navegou dentro da loja
      P(),
      LOJA,
    );
    expect(id.visitante).toBe(UUID);
    expect(id.sessao).toBe(OUTRO);
    expect(id.novo).toBe(false);
    expect(id.primeira).toBe(false);
  });

  it("carrega a origem de quando ela COMEÇOU", () => {
    // Da segunda página em diante o referrer é a própria loja. Reclassificar
    // aqui daria "direto", e a mesma sessão apareceria em dois canais no
    // relatório — inflando os dois.
    const id = resolverIdentidade(
      { visitante: UUID, sessao: `${OUTRO}|social|instagram|natal` },
      "https://carimbostridi.com.br/produto-x",
      P(),
      LOJA,
    );
    expect(id.origem).toMatchObject({ canal: "social", fonte: "instagram", campanha: "natal" });
  });

  it("visitante conhecido com sessão vencida começa sessão nova, e NÃO é novo", () => {
    // O cookie de sessão expira sozinho por `maxAge`; quando ele some, o de
    // visitante continua. É exatamente o que separa "voltou" de "chegou".
    const id = resolverIdentidade({ visitante: UUID }, null, P(), LOJA);
    expect(id.visitante).toBe(UUID);
    expect(id.novo).toBe(false);
    expect(id.primeira).toBe(true);
  });
});

describe("primeiro toque", () => {
  it("uma visita direta NÃO apaga o anúncio que trouxe a pessoa", () => {
    const id = resolverIdentidade(
      { visitante: UUID, atribuicao: "social|instagram|natal" },
      null, P(), LOJA,
    );
    expect(id.atribuicao).toMatchObject({ canal: "social", fonte: "instagram", campanha: "natal" });
  });

  it("mas uma origem conhecida SOBE por cima de um 'direto' anterior", () => {
    // "direto" quer dizer "não sei". Saber vale mais que não saber.
    const id = resolverIdentidade(
      { visitante: UUID, atribuicao: "direto||" },
      "https://www.google.com/search?q=carimbo", P(), LOJA,
    );
    expect(id.atribuicao).toMatchObject({ canal: "busca", fonte: "google" });
  });

  it("uma campanha não é substituída por outra", () => {
    const id = resolverIdentidade(
      { visitante: UUID, atribuicao: "busca|google|" },
      "https://l.instagram.com/", P(), LOJA,
    );
    expect(id.atribuicao.canal).toBe("busca");
  });
});

describe("cookie mexido à mão", () => {
  it("visitante que não é uuid é descartado", () => {
    // O cookie mora no navegador de quem visita: qualquer pessoa consegue
    // editar. Sem esta checagem, um valor forjado viraria uma linha no
    // relatório do lojista — ou pior, um valor repetido em massa.
    const id = resolverIdentidade({ visitante: "'; drop table --" }, null, P(), LOJA);
    expect(id.visitante).toMatch(/^[0-9a-f-]{36}$/i);
    expect(id.novo).toBe(true);
  });

  it("sessão sem uuid válido começa de novo", () => {
    const id = resolverIdentidade({ visitante: UUID, sessao: "qualquer-coisa|social|x|y" }, null, P(), LOJA);
    expect(id.sessao).toMatch(/^[0-9a-f-]{36}$/i);
    expect(id.primeira).toBe(true);
  });

  it("canal inventado na sessão cai em direto", () => {
    const id = resolverIdentidade({ visitante: UUID, sessao: `${OUTRO}|canal-inventado||` }, null, P(), LOJA);
    expect(id.sessao).toBe(OUTRO);
    expect(id.origem.canal).toBe("direto");
  });
});
