import { describe, expect, it } from "vitest";
import {
  TEMAS_QUIZ, corSeguraQuiz, exportarQuiz, fonteSeguraQuiz, importarQuiz, resolverTemaQuiz,
  type Quiz, type TemaQuiz,
} from "../tridiflow-quiz";

// O quiz passou a ter aparência PRÓPRIA (`quiz.tema`). Duas coisas não podem
// quebrar nunca:
//
// 1. Quem não definiu tema continua exatamente como estava — herdando as cores
//    do chat. Sem isso, publicar esta mudança repinta todo funil já no ar.
// 2. Cor e fonte entram numa CSS custom property. Custom property é vetor de
//    injeção conhecido (`--x: red; background: url(...)` vaza no `var(--x)`),
//    então o que não for hexadecimal/charset restrito tem que cair no padrão.

const CHAT = { corFundo: "#101010", corTextoBot: "#EEEEEE", corBotao: "#FF0000", corTextoBotao: "#FFFFFF", corBolhaBot: "#202020" };

describe("resolverTemaQuiz", () => {
  it("sem tema nenhum, herda as cores do chat", () => {
    const r = resolverTemaQuiz(undefined, CHAT);
    expect(r.fundo).toBe("#101010");
    expect(r.texto).toBe("#EEEEEE");
    expect(r.botao).toBe("#FF0000");
    expect(r.textoBotao).toBe("#FFFFFF");
    expect(r.cartao).toBe("#202020");
  });

  it("cada campo do tema ganha do chat, e só ele", () => {
    const r = resolverTemaQuiz({ corBotao: "#00FF00" }, CHAT);
    expect(r.botao).toBe("#00FF00");
    expect(r.fundo, "o que o quiz não definiu continua vindo do chat").toBe("#101010");
  });

  it("sem tema e sem chat, cai no padrão legível", () => {
    const r = resolverTemaQuiz(undefined, undefined);
    expect(r.fundo).toBe("#FFFFFF");
    expect(r.texto).toBe("#1C1C22");
    expect(r.progresso).toBe("barra");
    expect(r.botaoLargura).toBe("cheia");
  });

  it("número fora de faixa é limitado, não aceito cru", () => {
    expect(resolverTemaQuiz({ raio: 9999 }, CHAT).raio).toBe(40);
    expect(resolverTemaQuiz({ raio: -50 }, CHAT).raio).toBe(0);
    expect(resolverTemaQuiz({ larguraMax: 10 }, CHAT).larguraMax).toBe(360);
    expect(resolverTemaQuiz({ larguraMax: 99999 }, CHAT).larguraMax).toBe(1100);
  });

  it("valor inválido de progresso/botão cai no padrão", () => {
    const r = resolverTemaQuiz({ progresso: "arco-iris" as unknown as TemaQuiz["progresso"] }, CHAT);
    expect(r.progresso).toBe("barra");
    expect(resolverTemaQuiz({ botaoLargura: "gigante" as unknown as TemaQuiz["botaoLargura"] }, CHAT).botaoLargura).toBe("cheia");
  });

  it("todo estilo pronto resolve pra cor válida", () => {
    for (const p of TEMAS_QUIZ) {
      const r = resolverTemaQuiz(p.tema, undefined);
      for (const [k, v] of Object.entries({ fundo: r.fundo, texto: r.texto, botao: r.botao, cartao: r.cartao })) {
        expect(v, `${p.id}.${k}`).toMatch(/^#[0-9a-f]{3,8}$/i);
      }
    }
  });
});

describe("saneamento", () => {
  it("só hexadecimal passa como cor", () => {
    expect(corSeguraQuiz("#abc", "#000")).toBe("#abc");
    expect(corSeguraQuiz("#AABBCC", "#000")).toBe("#AABBCC");
    expect(corSeguraQuiz("#AABBCCDD", "#000")).toBe("#AABBCCDD");
  });

  it("tentativa de injeção via custom property cai no padrão", () => {
    // O ataque: a cor entra em `--tfq-botao` e vaza onde o CSS faz var(--tfq-botao).
    expect(corSeguraQuiz("red; background: url(//x)", "#000")).toBe("#000");
    expect(corSeguraQuiz("var(--algo)", "#000")).toBe("#000");
    expect(corSeguraQuiz("url(javascript:alert(1))", "#000")).toBe("#000");
    expect(corSeguraQuiz("", "#000")).toBe("#000");
    expect(corSeguraQuiz(undefined, "#000")).toBe("#000");
  });

  it("fonte aceita nome de família e recusa o resto", () => {
    expect(fonteSeguraQuiz("Georgia, serif", "sis")).toBe("Georgia, serif");
    expect(fonteSeguraQuiz(`"Segoe UI", sans-serif`, "sis")).toBe(`"Segoe UI", sans-serif`);
    expect(fonteSeguraQuiz("Arial; background: url(//x)", "sis")).toBe("sis");
    expect(fonteSeguraQuiz("a(b)", "sis")).toBe("sis");
  });
});

describe("tema no round-trip de JSON", () => {
  const quiz: Quiz = {
    titulo: "Com tema",
    steps: [
      { id: "a", tipo: "cover", headline: "Oi", botao: "Ir" },
      { id: "b", tipo: "single_choice", pergunta: "?", variavel: "q1", opcoes: [{ id: "o", label: "Sim", tag: "t" }] },
      { id: "c", tipo: "offer", titulo: "Fim", cta: "Ok" },
    ],
    tema: { corFundo: "#0C0C10", corBotao: "#A855F7", raio: 20 },
  };

  it("exportar e reimportar preserva o tema", () => {
    // O arquivo exportado é o que se guarda como backup: perder a aparência nele
    // significa perder a aparência na restauração.
    const volta = importarQuiz(JSON.stringify(exportarQuiz(quiz)));
    expect(volta.quiz).not.toBeNull();
    expect(volta.quiz!.tema).toEqual({ corFundo: "#0C0C10", corBotao: "#A855F7", raio: 20 });
  });

  it("JSON de fora sem tema não inventa um", () => {
    // Um tema vazio sobrescreveria a herança do chat com os padrões.
    const r = importarQuiz(JSON.stringify({ steps: [{ type: "cover", headline: "x" }, { type: "offer" }] }));
    expect(r.quiz!.tema).toBeUndefined();
  });

  it("tema de fora com lixo entra só com o que é válido", () => {
    const r = importarQuiz(JSON.stringify({
      steps: [{ type: "cover" }, { type: "offer" }],
      theme: { corFundo: "#123456", corBotao: "red; background: url(//x)", raio: 12 },
    }));
    expect(r.quiz!.tema).toEqual({ corFundo: "#123456", raio: 12 });
  });
});
