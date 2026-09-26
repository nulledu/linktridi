import { describe, expect, it } from "vitest";
import { templateQuizPorId } from "@/lib/tridiflow-quiz-templates";
import { pontuacaoDe, resultadoDe } from "@/lib/tridiflow-quiz";

// O template de Candidatura é o funil pronto: pré-qualifica sozinho e termina no
// upload do CV. Estas travas cobrem a forma (silencioso pro candidato, upload no
// fim) e a pontuação (respostas fortes → "forte", fracas → "inicial").

const quiz = () => templateQuizPorId("candidatura")!.montar();

describe("template Candidatura", () => {
  it("é silencioso pro candidato e termina em upload → oferta", () => {
    const q = quiz();
    expect(q.mostrarResultado).toBe(false);           // candidato vê "Candidatura enviada!", não o perfil
    expect(q.resultados?.length).toBe(3);
    const tipos = q.steps.map((s) => s.tipo);
    expect(tipos[0]).toBe("cover");
    expect(tipos).toContain("upload");
    expect(tipos.at(-1)).toBe("offer");
    // o upload é o penúltimo (última tela antes do "enviada!")
    expect(tipos[tipos.length - 2]).toBe("upload");
  });

  it("pré-qualifica: respostas fortes → candidato forte", () => {
    const q = quiz();
    const forte = {
      nivel: "Experiente", presencial: "Sim", periodo: "Integral", inicio: "Sim, agora",
      formacao: "Sim", ja_area: "Sim", tem_experiencia: "Sim", tempo_empresa: "Mais de 3 anos", ja_similar: "Sim",
    };
    expect(resultadoDe(q, forte)?.id).toBe("forte");
  });

  it("pré-qualifica: sem experiência → perfil inicial", () => {
    const q = quiz();
    const fraco = { nivel: "Sem experiência", tem_experiencia: "Não", presencial: "Não", inicio: "Ainda não" };
    expect(resultadoDe(q, fraco)?.id).toBe("inicial");
  });

  it("toda opção de escolha tem tag (segmentação do CRM)", () => {
    for (const s of quiz().steps) for (const o of s.opcoes ?? []) expect(o.tag, o.label).toBeTruthy();
  });

  it("score: respostas fortes tiram nota alta; fracas, baixa", () => {
    const q = quiz();
    const forte = pontuacaoDe(q, {
      nivel: "Experiente", presencial: "Sim", periodo: "Integral", inicio: "Sim, agora",
      formacao: "Sim", ja_area: "Sim", tem_experiencia: "Sim", tempo_empresa: "Mais de 3 anos", ja_similar: "Sim",
    });
    const fraco = pontuacaoDe(q, { nivel: "Sem experiência", tem_experiencia: "Não", presencial: "Não", inicio: "Ainda não" });
    expect(forte.score).toBeGreaterThanOrEqual(90);
    expect(forte.score).toBeLessThanOrEqual(100);
    expect(fraco.score).toBeLessThan(20);
    expect(forte.resultado?.id).toBe("forte");
  });
});
