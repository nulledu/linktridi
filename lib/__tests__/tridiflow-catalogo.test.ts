import { describe, expect, it } from "vitest";
import {
  catalogoCompleto, editorDoTipo, filtrarCatalogo, ICONE_TIPO, ROTULO_TIPO, ROTULO_TIPO_PLURAL,
} from "../tridiflow-catalogo";
import { FUNIL_TEMPLATES } from "../tridiflow-templates";
import { QUIZ_TEMPLATES } from "../tridiflow-quiz-templates";
import { TEMPLATES_PAGINA } from "../tridiflow-pagina-templates";

// A Biblioteca de Templates listava só os de chat — 2 de 11. A trava aqui é
// contra o jeito mais fácil de quebrar isso de novo: alguém cria um catálogo
// novo (ou some com um) e a tela continua mostrando o que mostrava, sem erro
// nenhum aparecer.

const catalogo = catalogoCompleto();

describe("catalogoCompleto", () => {
  it("traz os TRÊS catálogos, sem perder nem inventar item", () => {
    expect(catalogo).toHaveLength(FUNIL_TEMPLATES.length + QUIZ_TEMPLATES.length + TEMPLATES_PAGINA.length);
    expect(catalogo.filter((t) => t.tipo === "flow")).toHaveLength(FUNIL_TEMPLATES.length);
    expect(catalogo.filter((t) => t.tipo === "quiz")).toHaveLength(QUIZ_TEMPLATES.length);
    expect(catalogo.filter((t) => t.tipo === "page")).toHaveLength(TEMPLATES_PAGINA.length);
  });

  it("a chave é única no catálogo inteiro", () => {
    // "branco" existe em mais de um catálogo: sem o prefixo do tipo, o React
    // reusaria o card e clicar num criaria o outro.
    const chaves = catalogo.map((t) => t.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("a chave carrega o tipo e o templateId cru vai pro POST", () => {
    for (const t of catalogo) {
      expect(t.chave, t.nome).toBe(`${t.tipo}:${t.templateId}`);
      expect(t.templateId).not.toContain(":");
    }
  });

  it("todo item tem o que o card desenha", () => {
    for (const t of catalogo) {
      expect(t.nome, t.chave).toBeTruthy();
      expect(t.descricao, t.chave).toBeTruthy();
      expect(t.icone, t.chave).toBeTruthy();
      expect(t.passos.length, `${t.chave}: sem passos o mini-fluxo fica vazio`).toBeGreaterThan(0);
      expect(t.metricas.length, t.chave).toBeGreaterThan(0);
    }
  });

  it("nenhum passo sai vazio", () => {
    // Seção sem nome existe no modelo; um card com lacuna no meio do caminho
    // parece template quebrado.
    for (const t of catalogo) {
      for (const p of t.passos) expect(p.trim(), t.chave).toBeTruthy();
    }
  });

  it("as métricas são números, não texto", () => {
    for (const t of catalogo) {
      for (const m of t.metricas) {
        expect(typeof m.valor, `${t.chave}/${m.label}`).toBe("number");
        expect(Number.isFinite(m.valor)).toBe(true);
      }
    }
  });

  // Chat sempre tem categoria; página só quando faz parte de um site (as
  // páginas do mesmo site andam juntas no catálogo); quiz nunca.
  it("categoria: todo chat, página só de site, quiz nunca", () => {
    for (const t of catalogo) {
      if (t.tipo === "flow") expect(t.categoria, t.chave).toBeTruthy();
      else if (t.tipo === "page") expect([undefined, "Site Maindx"], t.chave).toContain(t.categoria);
      else expect(t.categoria, t.chave).toBeUndefined();
    }
  });

  it("site Maindx: 5 páginas, e todo link /p/ aponta pra uma delas (e toda âncora existe)", async () => {
    const { SITE_MAINDX } = await import("../tridiflow-site-maindx");
    const { templatePaginaPorId } = await import("../tridiflow-pagina-templates");
    const { todosBlocos } = await import("../tridiflow-pagina");
    const slugs = new Set(SITE_MAINDX.map((p) => `/p/${p.slug}`));
    expect(SITE_MAINDX).toHaveLength(5);
    // Âncoras que existem em cada página, pra conferir /p/pagina#ancora.
    const ancoras = new Map(SITE_MAINDX.map((p) => [`/p/${p.slug}`, new Set(templatePaginaPorId(p.id)!.doc.secoes.map((s) => s.ancora).filter(Boolean))]));
    for (const p of SITE_MAINDX) {
      const tpl = templatePaginaPorId(p.id);
      expect(tpl, p.id).toBeTruthy();
      // O slug nasce do NOME da página: se o nome e o slug divergirem, o
      // cabeçalho das outras páginas aponta pra um endereço que não existe.
      expect(p.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-"), p.id).toBe(p.slug);
      const links = todosBlocos(tpl!.doc).flatMap((b) => [
        b.tipo === "botao" ? b.url : undefined,
        b.cabecalho?.urlBotao,
        ...(b.cabecalho?.links.flatMap((l) => [l.url, ...(l.filhos?.map((f) => f.url) ?? [])]) ?? []),
        ...(b.rodape?.colunas.flatMap((c) => c.links.map((l) => l.url)) ?? []),
      ]).filter((u): u is string => !!u && u.startsWith("/p/"));
      expect(links.length, p.id).toBeGreaterThan(0);
      for (const l of links) {
        const [caminho, ancora] = l.split("#");
        expect(slugs, `${p.id} → ${l}`).toContain(caminho);
        if (ancora) expect(ancoras.get(caminho), `${p.id} → ${l}: âncora sem seção`).toContain(ancora);
      }
    }
  });

  it("o quiz conta perguntas e tags de verdade", () => {
    const diag = catalogo.find((t) => t.chave === "quiz:diagnostico")!;
    const perguntas = diag.metricas.find((m) => m.label === "Perguntas")!;
    const tags = diag.metricas.find((m) => m.label === "Tags")!;
    expect(perguntas.valor).toBeGreaterThan(0);
    expect(tags.valor).toBeGreaterThan(0);
  });

  it("duas chamadas não compartilham estado", () => {
    // `TEMPLATES_PAGINA.doc` é getter que remonta a árvore. Se o catálogo
    // guardasse a referência, dois usos do mesmo template dividiriam ids.
    const a = catalogoCompleto();
    const b = catalogoCompleto();
    expect(a).not.toBe(b);
    expect(a.map((t) => t.chave)).toEqual(b.map((t) => t.chave));
  });
});

describe("filtrarCatalogo", () => {
  it("'todos' devolve tudo", () => {
    expect(filtrarCatalogo(catalogo, "todos", "")).toHaveLength(catalogo.length);
  });

  it("filtra por tipo", () => {
    const so = filtrarCatalogo(catalogo, "quiz", "");
    expect(so.length).toBe(QUIZ_TEMPLATES.length);
    expect(so.every((t) => t.tipo === "quiz")).toBe(true);
  });

  it("busca no nome e na descrição, sem ligar pra caixa", () => {
    expect(filtrarCatalogo(catalogo, "todos", "QUALIFICAÇÃO").length).toBeGreaterThan(0);
    expect(filtrarCatalogo(catalogo, "todos", "  vsl  ").length).toBeGreaterThan(0);
  });

  it("tipo e busca se somam", () => {
    const r = filtrarCatalogo(catalogo, "page", "vsl");
    expect(r.every((t) => t.tipo === "page")).toBe(true);
  });

  it("busca sem resultado devolve lista vazia, não tudo", () => {
    expect(filtrarCatalogo(catalogo, "todos", "zzzzznaoexiste")).toEqual([]);
  });
});

describe("editorDoTipo", () => {
  it("cada tipo abre no editor dele", () => {
    // Mandar todo mundo pro editor de chat era o comportamento antigo: um
    // template de página abria num canvas de grafo vazio.
    expect(editorDoTipo("flow", "x")).toBe("/tridiflow/x");
    expect(editorDoTipo("quiz", "x")).toBe("/tridiflow/q/x");
    expect(editorDoTipo("page", "x")).toBe("/tridiflow/p/x");
  });
});

describe("rótulos e ícones", () => {
  it("os três tipos têm rótulo, plural e ícone", () => {
    for (const t of ["flow", "quiz", "page"] as const) {
      expect(ROTULO_TIPO[t]).toBeTruthy();
      expect(ROTULO_TIPO_PLURAL[t]).toBeTruthy();
      expect(ICONE_TIPO[t]).toBeTruthy();
    }
  });

  it("o plural é escrito à mão — `${rotulo}s` dava 'Quizs'", () => {
    expect(ROTULO_TIPO_PLURAL.quiz).toBe("Quizzes");
    // E tem que bater com o que a sidebar do TridiFlow já escreve.
    expect(ROTULO_TIPO_PLURAL.page).toBe("Páginas");
    expect(ROTULO_TIPO_PLURAL.flow).toBe("Fluxos");
  });
});
