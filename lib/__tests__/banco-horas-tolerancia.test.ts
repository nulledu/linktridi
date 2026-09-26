import { describe, expect, it } from "vitest";
import {
  TOLERANCIA_DIA_MIN, TOLERANCIA_MARCACAO_MIN, EXTRA_MINIMO_MIN, aplicarTolerancia, minutosDoRelogio,
} from "../banco-horas";

// Tolerância da CLT (art. 58 §1º): 5 min por marcação, 10 min somados no dia.
// A regra é CONDIÇÃO, não franquia — estourou, conta o tempo real inteiro.
// Os casos abaixo são exatamente os combinados com a empresa.
//
// Do lado do CRÉDITO existe uma regra a mais: hora extra só nasce passando de
// 10 min no dia, sem exceção por marcação (EXTRA_MINIMO_MIN).

const dia = (saldoBruto: number, extra: Partial<Parameters<typeof aplicarTolerancia>[0]> = {}) =>
  aplicarTolerancia({ saldoBruto, entradaPrevista: "08:00", saidaPrevista: "17:00", ...extra });

describe("tolerância — os limites", () => {
  it("os limites são 5 por marcação e 10 no dia", () => {
    expect(TOLERANCIA_MARCACAO_MIN).toBe(5);
    expect(TOLERANCIA_DIA_MIN).toBe(10);
  });

  it("hora extra só a partir de 10 min no dia", () => {
    expect(EXTRA_MINIMO_MIN).toBe(10);
  });

  it("lê HH:MM e recusa lixo", () => {
    expect(minutosDoRelogio("08:00")).toBe(480);
    expect(minutosDoRelogio("17:30")).toBe(1050);
    expect(minutosDoRelogio("")).toBeNull();
    expect(minutosDoRelogio("25:00")).toBeNull();
    expect(minutosDoRelogio(null)).toBeNull();
  });
});

describe("tolerância — casos combinados", () => {
  it("entrou 4 min atrasado → 0 de débito", () => {
    expect(dia(-4, { entradaReal: "08:04", saidaReal: "17:00" })).toBe(0);
  });

  it("entrou 5 min atrasado E saiu 5 min antes → 0 (bate exatamente nos dois limites)", () => {
    expect(dia(-10, { entradaReal: "08:05", saidaReal: "16:55" })).toBe(0);
  });

  it("entrou 6 min atrasado → 6 de débito, NÃO 1", () => {
    // O dia soma só 6 (dentro dos 10), mas a MARCAÇÃO estourou os 5.
    expect(dia(-6, { entradaReal: "08:06", saidaReal: "17:00" })).toBe(-6);
  });

  it("entrou 4 atrasado e saiu 7 antes → 11 de débito, NÃO 1", () => {
    // Cada marcação até caberia isolada (4 e 7… 7 já estoura), e o dia passa de 10.
    expect(dia(-11, { entradaReal: "08:04", saidaReal: "16:53" })).toBe(-11);
  });

  it("trabalhou 12 min a mais → 12 de crédito, NÃO 2", () => {
    expect(dia(12, { entradaReal: "08:00", saidaReal: "17:12" })).toBe(12);
  });
});

// ── Crédito: piso de 10 min no dia, e é absoluto ────────────────────────────
// Hora extra só existe passando de 10 min no dia. Diferente do débito, aqui a
// conferência marcação a marcação NÃO abre exceção: era por ela que chegar 8
// min mais cedo virava banco de horas.
describe("crédito — piso de 10 min no dia", () => {
  it("3 min a mais não vira banco de horas", () => {
    expect(dia(3, { entradaReal: "08:00", saidaReal: "17:03" })).toBe(0);
  });

  it("os 10 min do dia zeram mesmo com a marcação estourada", () => {
    // Sair 10 min depois é UMA marcação com desvio de 10 (estoura os 5), mas o
    // dia soma 10: não é hora extra.
    expect(dia(10, { entradaReal: "08:00", saidaReal: "17:10" })).toBe(0);
    expect(dia(10, { entradaReal: "07:55", saidaReal: "17:05" })).toBe(0);
  });

  it("11 no dia conta inteiro", () => {
    expect(dia(11, { entradaReal: "07:55", saidaReal: "17:06" })).toBe(11);
  });

  it("chegou 6 min mais cedo NÃO é hora extra", () => {
    expect(dia(6, { entradaReal: "07:54", saidaReal: "17:00" })).toBe(0);
  });

  it("esticar o almoço e sair mais tarde não vira crédito de 8 min", () => {
    // O dia fecha em +8 (dentro do piso) — mesmo com a volta do almoço 20 min
    // atrasada, o que sobra é pequeno demais pra ser hora extra.
    expect(aplicarTolerancia({
      saldoBruto: 8,
      almocoPrevistoInicio: "12:00", almocoPrevistoFim: "13:00",
      entradaReal: "08:00", entradaPrevista: "08:00",
      almocoRealInicio: "12:00", almocoRealFim: "13:20",
      saidaReal: "17:28", saidaPrevista: "17:00",
    })).toBe(0);
  });

  it("do lado do DÉBITO a marcação continua pegando", () => {
    // Simetria só vale no total do dia: o débito tem a segunda condição.
    expect(dia(-6, { entradaReal: "08:06", saidaReal: "17:00" })).toBe(-6);
  });
});

describe("tolerância — simetria débito/crédito", () => {
  it("mesma magnitude dá o mesmo tratamento nos dois lados (sem desvio de marcação)", () => {
    for (const n of [3, 8, 10]) {
      expect(dia(n, { entradaReal: "08:00", saidaReal: "17:00" })).toBe(0);
      expect(dia(-n, { entradaReal: "08:00", saidaReal: "17:00" })).toBe(0);
    }
    for (const n of [11, 30, 120]) {
      expect(dia(n, { entradaReal: "08:00", saidaReal: "17:00" })).toBe(n);
      expect(dia(-n, { entradaReal: "08:00", saidaReal: "17:00" })).toBe(-n);
    }
  });
});

describe("tolerância — almoço esticado", () => {
  // O caso que motivou cadastrar o almoço: sem previsto de almoço/retorno,
  // esticar 20 min só aparecia diluído no total do dia — e sumia de vez se a
  // pessoa compensasse saindo mais tarde.
  const almoco = { almocoPrevistoInicio: "12:00", almocoPrevistoFim: "13:00" };

  it("voltou 20 min depois do almoço e compensou saindo mais tarde → conta", () => {
    // Total do dia fecha em 0 (compensou), mas a volta do almoço estourou.
    expect(aplicarTolerancia({
      saldoBruto: 0, ...almoco,
      entradaReal: "08:00", entradaPrevista: "08:00",
      almocoRealInicio: "12:00", almocoRealFim: "13:20",
      saidaReal: "17:20", saidaPrevista: "17:00",
    })).toBe(0);
    // ↑ zero porque o saldo bruto já era zero — o que muda é o caso abaixo:
    // quando sobra saldo, ele NÃO é perdoado.
    expect(aplicarTolerancia({
      saldoBruto: -8, ...almoco,
      entradaReal: "08:00", entradaPrevista: "08:00",
      almocoRealInicio: "12:00", almocoRealFim: "13:20",
      saidaReal: "17:00", saidaPrevista: "17:00",
    })).toBe(-8);
  });

  it("almoço 4 min mais longo está dentro da tolerância", () => {
    expect(aplicarTolerancia({
      saldoBruto: -4, ...almoco,
      entradaReal: "08:00", entradaPrevista: "08:00",
      almocoRealInicio: "12:00", almocoRealFim: "13:04",
      saidaReal: "17:00", saidaPrevista: "17:00",
    })).toBe(0);
  });

  it("saiu 8 min mais cedo pro almoço → estoura a marcação", () => {
    expect(aplicarTolerancia({
      saldoBruto: -8, ...almoco,
      entradaReal: "08:00", entradaPrevista: "08:00",
      almocoRealInicio: "11:52", almocoRealFim: "13:00",
      saidaReal: "17:00", saidaPrevista: "17:00",
    })).toBe(-8);
  });

  it("turno SEM almoço não confere esse par", () => {
    expect(aplicarTolerancia({
      saldoBruto: -3,
      entradaReal: "07:00", entradaPrevista: "07:00",
      saidaReal: "12:57", saidaPrevista: "13:00",
      almocoRealInicio: "10:00", almocoRealFim: "10:30",   // bateu, mas não há previsto
      almocoPrevistoInicio: null, almocoPrevistoFim: null,
    })).toBe(0);
  });
});

describe("tolerância — sem horário previsto cadastrado", () => {
  // Sem previsto não dá pra medir marcação a marcação; sobra o limite do dia.
  // É uma limitação assumida, não um descuido: melhor valer só o total que
  // inventar um horário previsto que a empresa não configurou.
  it("cai pro limite do dia", () => {
    expect(aplicarTolerancia({ saldoBruto: -8 })).toBe(0);
    expect(aplicarTolerancia({ saldoBruto: -11 })).toBe(-11);
    expect(aplicarTolerancia({ saldoBruto: 9 })).toBe(0);
  });

  it("marcação estourada é ignorada quando não há previsto pra comparar", () => {
    expect(aplicarTolerancia({ saldoBruto: -6, entradaReal: "08:06" })).toBe(0);
  });
});

describe("tolerância — não inventa saldo", () => {
  it("dia exato continua zero", () => {
    expect(dia(0, { entradaReal: "08:00", saidaReal: "17:00" })).toBe(0);
  });

  it("nunca troca o sinal nem aumenta o valor", () => {
    for (const n of [-200, -11, 11, 200]) {
      const r = dia(n, { entradaReal: "08:00", saidaReal: "17:00" });
      expect(Math.sign(r)).toBe(Math.sign(n));
      expect(Math.abs(r)).toBeLessThanOrEqual(Math.abs(n));
    }
  });
});
