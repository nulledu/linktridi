import { describe, expect, it } from "vitest";
import {
  exportarQuiz, importarQuiz, resultadoDe, temResultados,
  type Quiz, type QuizResultado,
} from "@/lib/tridiflow-quiz";

// Resultado ponderado: a fila continua reta, mas a oferta do fim muda conforme a
// soma dos pontos das opções escolhidas. Estas travas cobrem quem ganha, o
// empate, o "ninguém pontuou" e o round-trip do JSON (o backup do funil).

const RA: QuizResultado = { id: "ra", titulo: "Perfil A", descricao: "desc A", cta: "Quero A", destino: "https://a" };
const RB: QuizResultado = { id: "rb", titulo: "Perfil B" };

function quizBase(extra: Partial<Quiz> = {}): Quiz {
  return {
    titulo: "Teste",
    resultados: [RA, RB],
    steps: [
      { id: "s1", tipo: "cover", headline: "oi" },
      {
        id: "s2", tipo: "single_choice", variavel: "q1", pergunta: "?",
        opcoes: [
          { id: "o1", label: "Opção A", pontos: { ra: 2 } },
          { id: "o2", label: "Opção B", pontos: { rb: 2 } },
          { id: "o3", label: "Empate", pontos: { ra: 1, rb: 1 } },
        ],
      },
      {
        id: "s3", tipo: "multiple_choice", variavel: "q2", pergunta: "?",
        opcoes: [
          { id: "m1", label: "Mais A", pontos: { ra: 3 } },
          { id: "m2", label: "Mais B", pontos: { rb: 5 } },
        ],
      },
      { id: "s4", tipo: "offer", titulo: "Oferta padrão", descricao: "cai aqui" },
    ],
    ...extra,
  };
}

describe("resultadoDe", () => {
  it("sem resultados no quiz → null (oferta única de sempre)", () => {
    const q = quizBase({ resultados: undefined });
    expect(resultadoDe(q, { q1: "Opção A" })).toBeNull();
    expect(temResultados(q)).toBe(false);
  });

  it("devolve o resultado com mais pontos", () => {
    const q = quizBase();
    expect(resultadoDe(q, { q1: "Opção A" })?.id).toBe("ra");
    expect(resultadoDe(q, { q1: "Opção B" })?.id).toBe("rb");
  });

  it("soma pontos de várias etapas (inclusive múltipla escolha)", () => {
    const q = quizBase();
    // q1=Opção A (ra+2), q2=Mais A,Mais B (ra+3, rb+5) → rb total 5, ra total 5 → empate → primeiro (ra)
    expect(resultadoDe(q, { q1: "Opção A", q2: "Mais A,Mais B" })?.id).toBe("ra");
    // q1=Opção B (rb+2) + q2=Mais B (rb+5) → rb 7, ra 0 → rb
    expect(resultadoDe(q, { q1: "Opção B", q2: "Mais B" })?.id).toBe("rb");
  });

  it("empate fica com o primeiro da lista", () => {
    const q = quizBase();
    expect(resultadoDe(q, { q1: "Empate" })?.id).toBe("ra");
  });

  it("ninguém pontuou → o marcado padrão, senão o primeiro", () => {
    const semResposta = {};
    expect(resultadoDe(quizBase(), semResposta)?.id).toBe("ra");            // sem padrão → primeiro
    const comPadrao = quizBase({ resultados: [RA, { ...RB, padrao: true }] });
    expect(resultadoDe(comPadrao, semResposta)?.id).toBe("rb");             // padrão vence
  });

  it("rótulo de escolha única com vírgula não é confundido com múltipla escolha", () => {
    const q: Quiz = {
      titulo: "t",
      resultados: [RA, RB],
      steps: [
        { id: "s", tipo: "single_choice", variavel: "q1", opcoes: [{ id: "o1", label: "Sim, agora", pontos: { ra: 5 } }, { id: "o2", label: "Depois", pontos: { rb: 5 } }] },
        { id: "o", tipo: "offer", titulo: "x" },
      ],
    };
    // "Sim, agora" tem vírgula; casar por partes ("Sim"/"agora") perderia o peso.
    expect(resultadoDe(q, { q1: "Sim, agora" })?.id).toBe("ra");
  });

  it("casa a opção pelo label (não pelo id) — editar id não perde o peso", () => {
    const q = quizBase();
    // label certo pontua; label inexistente não
    expect(resultadoDe(q, { q1: "Opção A" })?.id).toBe("ra");
    expect(resultadoDe(q, { q1: "nao existe" })?.id).toBe("ra"); // ninguém pontua → primeiro
  });
});

describe("round-trip de resultados no JSON", () => {
  it("exportar → importar preserva resultados e pontos das opções", () => {
    const q = quizBase();
    const r = importarQuiz(exportarQuiz(q));
    expect(r.quiz).not.toBeNull();
    const q2 = r.quiz!;
    expect(q2.resultados?.map((x) => x.id)).toEqual(["ra", "rb"]);
    expect(q2.resultados?.[0].titulo).toBe("Perfil A");
    expect(q2.resultados?.[0].destino).toBe("https://a");
    // Os pontos continuam apontando pros mesmos ids → o vencedor é o mesmo.
    expect(resultadoDe(q2, { q1: "Opção A" })?.id).toBe("ra");
    expect(resultadoDe(q2, { q1: "Opção B", q2: "Mais B" })?.id).toBe("rb");
  });

  it("preserva o resultado padrão no round-trip", () => {
    const q = quizBase({ resultados: [RA, { ...RB, padrao: true }] });
    const q2 = importarQuiz(exportarQuiz(q)).quiz!;
    expect(q2.resultados?.find((x) => x.padrao)?.id).toBe("rb");
  });
});
