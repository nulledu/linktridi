import { describe, it, expect } from "vitest";
import {
  CHAVE_TAGS, ehPergunta, exportarQuiz, importarQuiz, novaEtapa, progresso, resumoDe, tagsDe,
  type Quiz,
} from "@/lib/tridiflow-quiz";

// O JSON do enunciado, na letra. Se o interpretador parar de aceitar ESTE
// arquivo, a promessa "cole o JSON e o funil roda" morreu — e é o tipo de
// regressão que só apareceria com alguém colando na mão semanas depois.
const JSON_DO_CONTRATO = {
  funnel_title: "Quiz de Diagnóstico de Perfil de Pele",
  steps: [
    { step_number: 1, type: "cover", headline: "Descubra o tratamento ideal para sua pele em 2 minutos", subheadline: "Responda a 3 perguntas simples e receba um plano personalizado.", button_text: "Iniciar Teste Gratuito" },
    {
      step_number: 2, type: "single_choice", question: "Qual é a sua principal preocupação hoje?",
      options: [
        { label: "Ressecamento", tag: "dor_ressecamento" },
        { label: "Oleosidade extrema", tag: "dor_oleosidade" },
        { label: "Manchas / Melasma", tag: "dor_manchas" },
        { label: "Linhas de expressão", tag: "dor_linhas" },
      ],
      tracking_tag: "step_1_skin_concern",
    },
    { step_number: 3, type: "transition", loading_text: "Analisando suas respostas...", social_proof: "Mais de 5.000 pessoas já descobriram seu diagnóstico esta semana." },
    { step_number: 4, type: "offer", title: "Seu Diagnóstico está Pronto!", description: "Com base nas suas respostas, recomendamos a rotina personalizada abaixo.", cta_button: "Garantir Meu Plano com Desconto", redirect_url: "https://seucheckout.com/oferta" },
  ],
};

describe("TridiFlow · quiz — o JSON do contrato", () => {
  it("importa o exemplo inteiro, sem aviso de etapa perdida", () => {
    const r = importarQuiz(JSON.stringify(JSON_DO_CONTRATO));
    expect(r.erro).toBeUndefined();
    expect(r.quiz).toBeTruthy();
    expect(r.quiz!.titulo).toBe("Quiz de Diagnóstico de Perfil de Pele");
    expect(r.quiz!.steps.map((s) => s.tipo)).toEqual(["cover", "single_choice", "transition", "offer"]);
    // Nenhum aviso de "pulei" — só o de oferta ausente é que não deve existir aqui.
    expect(r.avisos).toEqual([]);
  });

  it("leva a tag de cada opção — é ela que segmenta no CRM", () => {
    const q = importarQuiz(JSON_DO_CONTRATO).quiz!;
    const pergunta = q.steps[1];
    expect(pergunta.opcoes?.map((o) => o.tag)).toEqual(["dor_ressecamento", "dor_oleosidade", "dor_manchas", "dor_linhas"]);
    expect(pergunta.tagRastreio).toBe("step_1_skin_concern");
  });

  it("lê os campos de capa, transição e oferta com os nomes do contrato", () => {
    const q = importarQuiz(JSON_DO_CONTRATO).quiz!;
    expect(q.steps[0].headline).toContain("Descubra o tratamento");
    expect(q.steps[0].botao).toBe("Iniciar Teste Gratuito");
    expect(q.steps[2].carregando).toBe("Analisando suas respostas...");
    expect(q.steps[2].provaSocial).toEqual(["Mais de 5.000 pessoas já descobriram seu diagnóstico esta semana."]);
    expect(q.steps[3].cta).toBe("Garantir Meu Plano com Desconto");
    expect(q.steps[3].destino).toBe("https://seucheckout.com/oferta");
  });

  it("exportar e importar de volta devolve o mesmo funil", () => {
    const ida = importarQuiz(JSON_DO_CONTRATO).quiz!;
    const volta = importarQuiz(JSON.stringify(exportarQuiz(ida))).quiz!;
    expect(volta.titulo).toBe(ida.titulo);
    expect(volta.steps.map((s) => s.tipo)).toEqual(ida.steps.map((s) => s.tipo));
    expect(volta.steps[1].opcoes?.map((o) => [o.label, o.tag]))
      .toEqual(ida.steps[1].opcoes?.map((o) => [o.label, o.tag]));
    expect(volta.steps[3].destino).toBe(ida.steps[3].destino);
  });
});

describe("TridiFlow · quiz — o interpretador aguenta JSON de gente", () => {
  it("`step_number` fora de ordem manda na ordem final", () => {
    const r = importarQuiz({ steps: [
      { step_number: 2, type: "single_choice", question: "B", options: ["x"] },
      { step_number: 1, type: "cover", headline: "A" },
    ] });
    expect(r.quiz!.steps.map((s) => s.tipo)).toEqual(["cover", "single_choice"]);
  });

  it("aceita `options` como lista de textos", () => {
    const r = importarQuiz({ steps: [{ type: "single_choice", question: "Q", options: ["Sim", "Não"] }] });
    expect(r.quiz!.steps[0].opcoes?.map((o) => o.label)).toEqual(["Sim", "Não"]);
  });

  it("tipo desconhecido vira AVISO, não erro — o resto entra", () => {
    const r = importarQuiz({ steps: [
      { type: "cover", headline: "A" },
      { type: "carrossel_3d", question: "?" },
      { type: "offer", title: "Fim" },
    ] });
    expect(r.quiz!.steps).toHaveLength(2);
    expect(r.avisos.join(" ")).toContain("carrossel_3d");
  });

  it("JSON quebrado e JSON sem `steps` devolvem erro legível", () => {
    expect(importarQuiz("{ nao é json").erro).toBeTruthy();
    expect(importarQuiz({ funnel_title: "X" }).erro).toContain("steps");
  });

  it("avisa quando o funil não tem oferta — quem terminar não veria nada", () => {
    const r = importarQuiz({ steps: [{ type: "cover", headline: "A" }] });
    expect(r.quiz).toBeTruthy();
    expect(r.avisos.join(" ")).toContain("oferta");
  });

  it("campo de e-mail sem variável declarada vira `email`", () => {
    // É por esse nome que o destino do lead procura o contato — cair em `q1`
    // significaria mandar o lead sem e-mail pro CRM.
    const r = importarQuiz({ steps: [{ type: "text", format: "email", question: "Seu e-mail?" }] });
    expect(r.quiz!.steps[0].variavel).toBe("email");
    expect(r.quiz!.steps[0].formato).toBe("email");
  });
});

describe("TridiFlow · quiz — progresso", () => {
  const quiz = importarQuiz(JSON_DO_CONTRATO).quiz!;

  it("conta só as perguntas: a capa não é trabalho de quem responde", () => {
    expect(progresso(quiz.steps, 0)).toBe(0);   // capa
    expect(progresso(quiz.steps, 1)).toBe(0);   // na pergunta, ainda não respondeu
    expect(progresso(quiz.steps, 2)).toBe(100); // respondeu a única pergunta
  });

  it("nunca passa de 100", () => {
    for (let i = 0; i < quiz.steps.length + 3; i++) expect(progresso(quiz.steps, i)).toBeLessThanOrEqual(100);
  });

  it("funil sem pergunta nenhuma não divide por zero", () => {
    const so = [novaEtapa("cover"), novaEtapa("offer")];
    expect(Number.isFinite(progresso(so, 1))).toBe(true);
  });
});

describe("TridiFlow · quiz — tags coletadas", () => {
  const quiz = importarQuiz(JSON_DO_CONTRATO).quiz!;
  const varPergunta = quiz.steps[1].variavel!;

  it("a escolha vira tag", () => {
    expect(tagsDe(quiz.steps, { [varPergunta]: "Manchas / Melasma" })).toEqual(["dor_manchas"]);
  });

  it("múltipla escolha separa por vírgula e não repete", () => {
    const q: Quiz = { titulo: "t", steps: [{
      id: "m", tipo: "multiple_choice", variavel: "m", opcoes: [
        { id: "1", label: "A", tag: "ta" }, { id: "2", label: "B", tag: "tb" }, { id: "3", label: "C", tag: "ta" },
      ],
    }] };
    expect(tagsDe(q.steps, { m: "A, B, C" })).toEqual(["ta", "tb"]);
  });

  it("resposta que não casa com opção nenhuma não inventa tag", () => {
    expect(tagsDe(quiz.steps, { [varPergunta]: "Outra coisa" })).toEqual([]);
  });

  it("a chave reservada é `tags` — é por ela que o webhook enxerga", () => {
    expect(CHAVE_TAGS).toBe("tags");
  });
});

describe("TridiFlow · quiz — resumo da oferta", () => {
  it("mostra pergunta e resposta, sem interpretar nada", () => {
    const quiz = importarQuiz(JSON_DO_CONTRATO).quiz!;
    const linhas = resumoDe(quiz.steps, { [quiz.steps[1].variavel!]: "Oleosidade extrema" });
    expect(linhas).toEqual([{ pergunta: "Qual é a sua principal preocupação hoje?", resposta: "Oleosidade extrema" }]);
  });

  it("o sufixo do slider entra na resposta COM espaço, tenha ele ou não", () => {
    // O interpretador trima todo texto do JSON, então " anos" chega "anos".
    // Quem põe o espaço é o resumo — senão a linha vira "32anos".
    const semEspaco: Quiz = { titulo: "t", steps: [{ id: "s", tipo: "slider", pergunta: "Idade?", variavel: "idade", sufixo: "anos" }] };
    const comEspaco: Quiz = { titulo: "t", steps: [{ id: "s", tipo: "slider", pergunta: "Idade?", variavel: "idade", sufixo: " anos" }] };
    expect(resumoDe(semEspaco.steps, { idade: "32" })[0].resposta).toBe("32 anos");
    expect(resumoDe(comEspaco.steps, { idade: "32" })[0].resposta).toBe("32 anos");
  });

  it("capa, análise e oferta não entram no resumo", () => {
    const quiz = importarQuiz(JSON_DO_CONTRATO).quiz!;
    expect(quiz.steps.filter(ehPergunta)).toHaveLength(1);
  });
});
