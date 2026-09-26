import { describe, it, expect } from "vitest";
import {
  diferencaDeQuantidade, minutosDaAtividade, duracaoEmPortugues, tempoDaAtividade,
  TETO_DE_DURACAO_MIN,
} from "../estoque-conferencia-contexto";

// A conferência é uma decisão binária tomada de pé, com uma caixa na mão, trinta
// vezes por dia. Estes testes travam as três contas que decidem CERTO ou ERRADO
// — e a razão de cada uma existir é um erro que a tela cometia:
//
//  · mostrava "19" e escondia o alvo, então a falta de onze peças só aparecia
//    pra quem subtraísse de cabeça;
//  · não tinha tempo nenhum, então um número baixo parecia sempre desleixo;
//  · caía em "0" quando ninguém informou, o que acusa quem só esqueceu de
//    digitar ao concluir.

describe("diferença entre o que foi pedido e o que foi feito", () => {
  it("faltou: diz QUANTAS faltaram, sem ninguém subtrair", () => {
    const d = diferencaDeQuantidade(19, 30);
    expect(d.estado).toBe("faltou");
    expect(d.texto).toBe("19 de 30");
    expect(d.diferenca).toBe("faltaram 11");
    expect(d.faltaram).toBe(11);
    expect(d.atencao).toBe(true);
  });

  it("faltou UMA fala no singular — 'faltaram 1' é frase de sistema", () => {
    expect(diferencaDeQuantidade(29, 30).diferenca).toBe("faltou 1");
  });

  it("bateu: mostra o par e NÃO escreve diferença nenhuma", () => {
    const d = diferencaDeQuantidade(30, 30);
    expect(d.estado).toBe("bateu");
    expect(d.texto).toBe("30 de 30");
    expect(d.diferenca).toBeNull();
    expect(d.atencao).toBe(false);
  });

  // Produzir a mais não é defeito. Pintar isto de amarelo junto com a falta é
  // como o amarelo deixa de significar alguma coisa.
  it("passou: conta a sobra sem pedir atenção", () => {
    const d = diferencaDeQuantidade(35, 30);
    expect(d.estado).toBe("passou");
    expect(d.diferenca).toBe("5 a mais");
    expect(d.sobraram).toBe(5);
    expect(d.atencao).toBe(false);
  });

  // A atividade nunca pediu um número: não existe falta, e "19 de 0" seria
  // inventar uma cobrança que ninguém fez.
  it("sem alvo: só a quantidade, sem comparação", () => {
    const d = diferencaDeQuantidade(19, 0);
    expect(d.estado).toBe("sem_alvo");
    expect(d.texto).toBe("19 peças");
    expect(d.diferenca).toBeNull();
    expect(d.atencao).toBe(false);
  });

  it("uma peça só fala no singular", () => {
    expect(diferencaDeQuantidade(1, 0).texto).toBe("1 peça");
  });

  // O caso que separa "fez zero" de "esqueceu de digitar". O servidor cai no
  // alvo nessa situação; a tela não pode escrever "faltaram 30" e acusar.
  it("ninguém informou não é zero feito", () => {
    const d = diferencaDeQuantidade(0, 30);
    expect(d.estado).toBe("nao_informada");
    expect(d.texto).toBe("— de 30");
    expect(d.diferenca).toBe("ninguém contou");
    expect(d.faltaram).toBe(0);
    expect(d.atencao).toBe(true);
  });

  it("número quebrado ou ausente do banco não vira NaN na tela", () => {
    expect(diferencaDeQuantidade(Number.NaN, 30).estado).toBe("nao_informada");
    expect(diferencaDeQuantidade(19.7, 30).texto).toBe("19 de 30");
    expect(diferencaDeQuantidade(-4, 0).texto).toBe("0 peças");
  });
});

describe("quanto tempo levou", () => {
  const t = (h: number) => new Date(Date.UTC(2026, 7, 15, h, 0, 0)).toISOString();

  it("conta os minutos entre começar e concluir", () => {
    expect(minutosDaAtividade("2026-08-15T13:00:00Z", "2026-08-15T13:34:00Z")).toBe(34);
  });

  it("sem carimbo de início não inventa duração", () => {
    expect(minutosDaAtividade(null, t(14))).toBeNull();
    expect(minutosDaAtividade(t(13), null)).toBeNull();
    expect(minutosDaAtividade("qualquer coisa", t(14))).toBeNull();
  });

  // Atividade esquecida aberta na sexta e fechada na segunda não é "72 h de
  // trabalho": mostrada crua, faz desconfiar de quem trabalhou certo.
  it("passou do teto de 12 h: some, em vez de virar um número que engana", () => {
    expect(minutosDaAtividade(t(0), t(13))).toBeNull();
    expect(minutosDaAtividade(t(0), t(11))).toBe(11 * 60);
    expect(TETO_DE_DURACAO_MIN).toBe(720);
  });

  it("fim antes do começo (relógio do aparelho torto) não vira negativo", () => {
    expect(minutosDaAtividade(t(14), t(13))).toBeNull();
  });
});

describe("como se fala uma duração no galpão", () => {
  it("menos de uma hora fica em minutos", () => {
    expect(duracaoEmPortugues(34)).toBe("34 min");
    expect(duracaoEmPortugues(59)).toBe("59 min");
  });

  it("uma hora redonda não ganha ' 0 min'", () => {
    expect(duracaoEmPortugues(60)).toBe("1 h");
    expect(duracaoEmPortugues(120)).toBe("2 h");
  });

  it("acima de uma hora vira 'h e min' — nunca '72 min'", () => {
    expect(duracaoEmPortugues(72)).toBe("1 h 12 min");
  });

  it("zero e nulo não desenham nada", () => {
    expect(duracaoEmPortugues(0)).toBeNull();
    expect(duracaoEmPortugues(null)).toBeNull();
  });
});

describe("o tempo como apoio, não como acusação", () => {
  it("junta o real e o estimado numa frase de contexto", () => {
    const t = tempoDaAtividade(34, 40);
    expect(t.texto).toBe("34 min");
    expect(t.referencia).toBe("estimado 40 min");
    expect(t.demorou).toBe(false);
  });

  it("sem estimativa, ainda diz quanto levou", () => {
    const t = tempoDaAtividade(34, null);
    expect(t.texto).toBe("34 min");
    expect(t.referencia).toBeNull();
  });

  it("marca 'demorou' só passando de metade a mais — é o que EXPLICA um número baixo", () => {
    expect(tempoDaAtividade(60, 40).demorou).toBe(false);
    expect(tempoDaAtividade(61, 40).demorou).toBe(true);
  });

  it("sem tempo nenhum, o bloco não tem o que dizer", () => {
    const t = tempoDaAtividade(null, null);
    expect(t.texto).toBeNull();
    expect(t.referencia).toBeNull();
    expect(t.demorou).toBe(false);
    expect(t.fraseDeApoio).toBeNull();
  });

  // ── A frase pronta ─────────────────────────────────────────────────────────
  // Ela existe porque montar a frase na TELA foi como as duas telas divergiram:
  // o tablet juntava "Levou " com o pedaço que sobrava e, sem hora de início,
  // escrevia "Levou estimado 40 min". Agora a frase tem um dono só.

  it("a frase pronta junta o verbo, o real e o estimado", () => {
    expect(tempoDaAtividade(34, 40).fraseDeApoio).toBe("Levou 34 min · estimado 40 min");
    expect(tempoDaAtividade(34, null).fraseDeApoio).toBe("Levou 34 min");
  });

  it("quem levou muito mais que o previsto ganha a explicação junto", () => {
    expect(tempoDaAtividade(95, 60).fraseDeApoio).toBe("Levou 1 h 35 min · estimado 1 h — bem mais que o previsto");
  });

  /**
   * A REGRESSÃO. `iniciada_at` nulo (atividade concluída sem nunca ter sido
   * iniciada) chega como tempo real nulo — e no tablet como ZERO, que a rota
   * manda pra não derrubar o parse. Nos dois casos não se sabe quanto levou, e
   * a estimativa sozinha NÃO pode virar frase: "Levou estimado 40 min" conta o
   * plano como se fosse o relógio, e o gerente julga a pessoa por ele.
   */
  it("sem duração real, a estimativa sozinha não vira frase", () => {
    expect(tempoDaAtividade(null, 40).fraseDeApoio).toBeNull();
    expect(tempoDaAtividade(0, 40).fraseDeApoio).toBeNull();
    // a referência continua existindo como dado — o que não existe é a FRASE
    expect(tempoDaAtividade(null, 40).referencia).toBe("estimado 40 min");
  });
});
