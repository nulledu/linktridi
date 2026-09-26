import { describe, expect, it } from "vitest";
import {
  ETAPAS_DE_PERGUNTA, ehPergunta, exportarQuiz, importarQuiz, novaEtapa, progresso,
  type Quiz,
} from "@/lib/tridiflow-quiz";

// Travas dos tipos de etapa novos: `rating` (nota/estrelas ou NPS) e `content`
// (tela de conteúdo no meio, que NÃO é pergunta).

describe("novaEtapa — rating e content", () => {
  it("rating nasce como pergunta, com escala de estrelas", () => {
    const s = novaEtapa("rating", 0);
    expect(s.tipo).toBe("rating");
    expect(ehPergunta(s)).toBe(true);
    expect(s.variavel).toBeTruthy();
    expect(s.ratingMax).toBe(5);
    expect(s.ratingEstilo).toBe("estrelas");
    expect(ETAPAS_DE_PERGUNTA).toContain("rating");
  });

  it("content NÃO é pergunta e tem título/botão", () => {
    const s = novaEtapa("content");
    expect(s.tipo).toBe("content");
    expect(ehPergunta(s)).toBe(false);
    expect(s.headline).toBeTruthy();
    expect(s.botao).toBeTruthy();
    expect(ETAPAS_DE_PERGUNTA).not.toContain("content");
  });

  it("content não conta no progresso (só perguntas contam)", () => {
    const q: Quiz = {
      titulo: "t",
      steps: [
        novaEtapa("cover"),
        novaEtapa("content"),
        { id: "p", tipo: "single_choice", variavel: "q1", opcoes: [{ id: "o", label: "x" }] },
        novaEtapa("offer"),
      ],
    };
    // 1 pergunta só; estar na etapa de conteúdo (índice 1) ainda é 0% respondido.
    expect(progresso(q.steps, 1)).toBe(0);
  });
});

describe("importar/exportar — rating e content", () => {
  it("importa rating por estrelas e NPS", () => {
    const r = importarQuiz({
      funnel_title: "t",
      steps: [
        { type: "rating", question: "Nota?", variable: "nota", max: 5, rating_style: "estrelas" },
        { type: "nps", question: "Recomenda?", variable: "nps" },
        { type: "offer", title: "Fim" },
      ],
    });
    expect(r.quiz).not.toBeNull();
    const [estrela, nps] = r.quiz!.steps;
    expect(estrela.tipo).toBe("rating");
    expect(estrela.ratingEstilo).toBe("estrelas");
    expect(nps.tipo).toBe("rating");
    expect(nps.ratingMax).toBe(10);
    expect(nps.ratingEstilo).toBe("numeros");
  });

  it("importa content (alias) como etapa que não é pergunta", () => {
    const r = importarQuiz({
      funnel_title: "t",
      steps: [
        { type: "info", headline: "Você sabia?", text: "explicação", button_text: "Segue" },
        { type: "single_choice", question: "?", options: ["a"] },
        { type: "offer", title: "Fim" },
      ],
    });
    const c = r.quiz!.steps[0];
    expect(c.tipo).toBe("content");
    expect(c.headline).toBe("Você sabia?");
    expect(c.subheadline).toBe("explicação");
    expect(c.botao).toBe("Segue");
    expect(ehPergunta(c)).toBe(false);
  });

  it("novaEtapa upload nasce com variável e não conta como pergunta", () => {
    const s = novaEtapa("upload");
    expect(s.tipo).toBe("upload");
    expect(s.variavel).toBe("curriculo");
    expect(s.obrigatorio).toBe(true);
    expect(ehPergunta(s)).toBe(false);
    expect(ETAPAS_DE_PERGUNTA).not.toContain("upload");
  });

  it("importa upload (aliases cv/curriculo/arquivo) e faz round-trip", () => {
    const r = importarQuiz({
      funnel_title: "t",
      steps: [
        { type: "single_choice", question: "?", options: ["a"] },
        { type: "cv", question: "Envie o CV", help: "PDF", variable: "curriculo", button_text: "Concluir" },
        { type: "offer", title: "Fim" },
      ],
    });
    const up = r.quiz!.steps[1];
    expect(up.tipo).toBe("upload");
    expect(up.variavel).toBe("curriculo");
    expect(up.botao).toBe("Concluir");
    const q2 = importarQuiz(exportarQuiz(r.quiz!)).quiz!;
    expect(q2.steps[1].tipo).toBe("upload");
    expect(q2.steps[1].botao).toBe("Concluir");
  });

  it("round-trip preserva rating e content", () => {
    const q: Quiz = {
      titulo: "t",
      steps: [
        { id: "c", tipo: "content", headline: "Oi", subheadline: "texto", botao: "Vamos" },
        { id: "r", tipo: "rating", variavel: "nota", pergunta: "Nota?", ratingMax: 10, ratingEstilo: "numeros" },
        { id: "o", tipo: "offer", titulo: "Fim" },
      ],
    };
    const q2 = importarQuiz(exportarQuiz(q)).quiz!;
    expect(q2.steps[0].tipo).toBe("content");
    expect(q2.steps[0].botao).toBe("Vamos");
    expect(q2.steps[1].tipo).toBe("rating");
    expect(q2.steps[1].ratingMax).toBe(10);
    expect(q2.steps[1].ratingEstilo).toBe("numeros");
  });
});
