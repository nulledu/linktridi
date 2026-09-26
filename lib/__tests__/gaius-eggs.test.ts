import { describe, it, expect } from "vitest";
import { eggDoMomento, anosDeSistema, marcoAlcancado, ehONome, NASCIMENTO } from "../gaius-eggs";

/**
 * A frase do momento agora aparece DENTRO do sistema (SussurroHost, no Shell) e
 * não só na tela de login — ninguém está no login à meia-noite; quem vira o dia
 * trabalhando está lá dentro.
 *
 * Isso torna a janela de tempo importante o bastante para travar: é lógica que
 * só roda cinco minutos por dia e um ano por vez, então quebrar aqui é o tipo
 * de coisa que passa meses sem ninguém notar — e o defeito seria "o detalhe
 * some" ou, pior, "o detalhe aparece o tempo todo".
 */

const em = (h: number, m: number, mes = 1, dia = 20) =>
  new Date(2027, mes - 1, dia, h, m, 0);

describe("eggDoMomento", () => {
  it("quase sempre é nulo — este é o caso normal", () => {
    expect(eggDoMomento(em(9, 30))).toBeNull();
    expect(eggDoMomento(em(14, 0))).toBeNull();
    expect(eggDoMomento(em(23, 59))).toBeNull();
  });

  it("a virada do dia tem janela estreita: 00:00 a 00:04", () => {
    expect(eggDoMomento(em(0, 0))?.titulo).toBe("00:00");
    expect(eggDoMomento(em(0, 4))?.titulo).toBe("00:00");
    // 00:05 já passou: uma frase que dura a hora inteira deixa de ser detalhe.
    expect(eggDoMomento(em(0, 5))).toBeNull();
    expect(eggDoMomento(em(1, 0))).toBeNull();
  });

  it("aniversário do sistema vence a virada do dia", () => {
    // No dia do aniversário, à meia-noite, as duas condições valem. A que fala
    // do ano tem precedência — é a mais rara das duas.
    const aniversarioMeiaNoite = em(0, 1, NASCIMENTO.mes, NASCIMENTO.dia);
    expect(eggDoMomento(aniversarioMeiaNoite)?.titulo).toContain("ano");
  });

  it("aniversário só no dia exato, e só a partir de 1 ano", () => {
    expect(anosDeSistema(new Date(NASCIMENTO.ano + 2, NASCIMENTO.mes - 1, NASCIMENTO.dia))).toBe(2);
    // O dia seguinte não conta.
    expect(anosDeSistema(new Date(NASCIMENTO.ano + 2, NASCIMENTO.mes - 1, NASCIMENTO.dia + 1))).toBeNull();
    // O próprio ano de nascimento não é "1 ano".
    expect(anosDeSistema(new Date(NASCIMENTO.ano, NASCIMENTO.mes - 1, NASCIMENTO.dia))).toBeNull();
  });
});

describe("marcos", () => {
  it("devolve o maior marco já alcançado, não o próximo", () => {
    expect(marcoAlcancado(999)).toBeNull();
    expect(marcoAlcancado(1000)).toBe(1000);
    expect(marcoAlcancado(7321)).toBe(5000);
    expect(marcoAlcancado(2_000_000)).toBe(1_000_000);
  });
});

describe("ehONome", () => {
  it("ignora caixa e espaços, mas não aceita quase-acertos", () => {
    expect(ehONome("  GAIUS ")).toBe(true);
    expect(ehONome("gaius")).toBe(true);
    expect(ehONome("gaia")).toBe(false);
    expect(ehONome("gaius erp")).toBe(false);
  });
});
