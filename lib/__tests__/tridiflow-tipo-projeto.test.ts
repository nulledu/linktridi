import { describe, expect, it } from "vitest";
import { tipoDe } from "../tridiflow-db";
import { iframeEmbed, iframePublicado, urlDeIframe } from "../tridiflow";
import { QUIZ_TEMPLATES, templateQuizPorId } from "../tridiflow-quiz-templates";
import { ehPergunta } from "../tridiflow-quiz";

// O quiz NÃO tem valor próprio na coluna `tipo`: a constraint
// tridiflow_bots_tipo_chk só aceita 'flow' e 'page'. Ele é um 'flow' cujo
// `settings.modo` é 'quiz', e o tipo real é derivado na leitura.
//
// Esta é a trava dessa decisão. Se alguém "simplificar" `tipoDe` de volta pro
// binário antigo, todo quiz volta pra lista de fluxos — que é exatamente o
// problema que a separação resolveu — e a listagem de quizzes fica vazia sem
// erro nenhum aparecer.

describe("tipoDe", () => {
  it("flow puro é fluxo", () => {
    expect(tipoDe({ tipo: "flow", settings: {} })).toBe("flow");
  });

  it("settings.modo 'quiz' faz o projeto ser quiz, mesmo com a coluna em 'flow'", () => {
    expect(tipoDe({ tipo: "flow", settings: { modo: "quiz" } })).toBe("quiz");
  });

  it("settings.modo 'iframe' faz o projeto ser iframe — mesma regra do quiz, sem migração", () => {
    expect(tipoDe({ tipo: "flow", settings: { modo: "iframe" } })).toBe("iframe");
    // Banco não migrado (coluna `tipo` ausente) também reconhece.
    expect(tipoDe({ settings: { modo: "iframe" } })).toBe("iframe");
    // Página ganha de qualquer modo.
    expect(tipoDe({ tipo: "page", settings: { modo: "iframe" } })).toBe("page");
  });

  it("modo 'chat' explícito continua fluxo", () => {
    expect(tipoDe({ tipo: "flow", settings: { modo: "chat" } })).toBe("flow");
  });

  it("página ganha de qualquer modo — página não vira quiz por engano", () => {
    expect(tipoDe({ tipo: "page", settings: { modo: "quiz" } })).toBe("page");
  });

  it("sem a migração de páginas (coluna `tipo` ausente) o quiz ainda é reconhecido", () => {
    // Antes de rodar supabase/tridiflow-paginas.sql, `tipo` nem existe na linha.
    // Derivar por settings tem que continuar funcionando, senão o TridiFlow
    // inteiro cai pra 'flow' num banco não migrado.
    expect(tipoDe({ settings: { modo: "quiz" } })).toBe("quiz");
    expect(tipoDe({ settings: {} })).toBe("flow");
  });

  it("settings ausente ou nulo não explode", () => {
    expect(tipoDe({ tipo: "flow" })).toBe("flow");
    expect(tipoDe({ tipo: "flow", settings: null })).toBe("flow");
    expect(tipoDe({})).toBe("flow");
  });
});

describe("iframePublicado", () => {
  // O iframe tem DOIS caminhos: o projeto dedicado (modo "iframe") e a chave
  // `iframeAtivo` por cima de um fluxo/quiz/página existente — que NÃO muda o
  // tipo do projeto. Esta é a trava dos dois.
  it("modo 'iframe' publica a URL", () => {
    expect(iframePublicado({ modo: "iframe", iframeUrl: "https://ex.com/p" })).toBe("https://ex.com/p");
  });

  it("iframeAtivo publica por cima de qualquer tipo — sem mexer no modo", () => {
    expect(iframePublicado({ iframeAtivo: true, iframeUrl: "https://ex.com/p" })).toBe("https://ex.com/p");
    expect(iframePublicado({ modo: "quiz", iframeAtivo: true, iframeUrl: "https://ex.com/p" })).toBe("https://ex.com/p");
    // E o tipo do projeto continua o dele: quiz com iframe ligado SEGUE quiz.
    expect(tipoDe({ tipo: "flow", settings: { modo: "quiz", iframeAtivo: true } })).toBe("quiz");
    expect(tipoDe({ tipo: "flow", settings: { iframeAtivo: true } })).toBe("flow");
  });

  it("aceita o snippet <iframe> colado inteiro — o caso real que 'não fazia nada'", () => {
    // Exatamente o que foi colado no campo: o código de incorporar, com estilo
    // e quebras de linha. A URL está no src; recusar isso é bug de UX.
    const snippet = '<iframe   src="https://chat.carimbostridi.com/type-chancela-gedux"   style="border: none; width: 100%; height: 100vh" ></iframe>';
    expect(urlDeIframe(snippet)).toBe("https://chat.carimbostridi.com/type-chancela-gedux");
    expect(iframePublicado({ iframeAtivo: true, iframeUrl: snippet }))
      .toBe("https://chat.carimbostridi.com/type-chancela-gedux");
    // src sem aspas e URL crua também passam; texto qualquer volta como veio.
    expect(urlDeIframe("<iframe src=https://ex.com/p></iframe>")).toBe("https://ex.com/p");
    expect(urlDeIframe("  https://ex.com/p  ")).toBe("https://ex.com/p");
    expect(urlDeIframe("nada a ver")).toBe("nada a ver");
  });

  it("as CONFIGS do snippet valem junto — style/allow re-aplicados, nunca como HTML cru", () => {
    const snippet = '<iframe   src="https://chat.carimbostridi.com/type-chancela-gedux"   style="border: none; width: 100%; height: 100vh" allow="camera; microphone" allowfullscreen width="600"></iframe>';
    const e = iframeEmbed({ iframeAtivo: true, iframeUrl: snippet })!;
    expect(e.url).toBe("https://chat.carimbostridi.com/type-chancela-gedux");
    // style vira objeto camelCase, e `vh` vira `dvh` (no celular vh inclui a
    // barra do navegador — regra do app).
    expect(e.estilo).toMatchObject({ border: "none", width: "100%", height: "100dvh" });
    expect(e.allow).toBe("camera; microphone");
    expect(e.allowFullScreen).toBe(true);
    // width="600" (atributo) só entra quando o style não definiu width.
    // Só a URL crua: sem configs — o player usa os padrões de tela cheia.
    const so = iframeEmbed({ iframeAtivo: true, iframeUrl: "https://ex.com/p" })!;
    expect(so.url).toBe("https://ex.com/p");
    expect(so.estilo).toBeUndefined();
    expect(so.allow).toBeUndefined();
  });

  it("desligado ou sem URL http(s), volta null — o projeto publica normal", () => {
    expect(iframePublicado({ iframeUrl: "https://ex.com/p" })).toBeNull();          // chave desligada
    expect(iframePublicado({ iframeAtivo: true })).toBeNull();                       // sem URL
    expect(iframePublicado({ iframeAtivo: true, iframeUrl: "javascript:alert(1)" })).toBeNull();
    expect(iframePublicado({ modo: "iframe", iframeUrl: "ftp://x" })).toBeNull();
    expect(iframePublicado(null)).toBeNull();
  });
});

describe("templates de quiz", () => {
  it("todo template monta um funil jogável: capa, pergunta e oferta", () => {
    for (const t of QUIZ_TEMPLATES) {
      const q = t.montar();
      expect(q.steps.length, t.id).toBeGreaterThan(2);
      expect(q.steps[0].tipo, `${t.id}: primeira etapa é a capa`).toBe("cover");
      expect(q.steps.at(-1)?.tipo, `${t.id}: última etapa é a oferta`).toBe("offer");
      expect(q.steps.some(ehPergunta), `${t.id}: tem ao menos uma pergunta`).toBe(true);
    }
  });

  it("ids das etapas são únicos dentro do funil", () => {
    // `etapa()` monta a partir de `novaEtapa` e sobrescreve o id. Se o
    // sobrescrito sumir, duas etapas dividem o mesmo id e o editor passa a
    // mexer na etapa errada ao arrastar.
    for (const t of QUIZ_TEMPLATES) {
      const ids = t.montar().steps.map((s) => s.id);
      expect(new Set(ids).size, t.id).toBe(ids.length);
    }
  });

  it("dois usos do mesmo template não compartilham id", () => {
    // Se `montar` devolvesse um objeto constante, editar um quiz mexeria no
    // outro criado do mesmo template.
    const a = templateQuizPorId("diagnostico")!.montar();
    const b = templateQuizPorId("diagnostico")!.montar();
    expect(a.steps[0].id).not.toBe(b.steps[0].id);
  });

  it("toda opção nasce com tag — é o que leva a segmentação pro webhook", () => {
    for (const t of QUIZ_TEMPLATES) {
      if (t.id === "branco") continue;   // o branco herda o padrão do tipo
      for (const s of t.montar().steps) {
        for (const o of s.opcoes ?? []) {
          expect(o.tag, `${t.id} · "${o.label}"`).toBeTruthy();
        }
      }
    }
  });

  it("template desconhecido devolve null em vez de estourar", () => {
    expect(templateQuizPorId("nao-existe")).toBeNull();
    expect(templateQuizPorId(undefined)).toBeNull();
  });
});
