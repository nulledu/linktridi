import { describe, it, expect } from "vitest";
import {
  andarMes, diasNoMes, ehDia, inicioDaSemana, isoDeDataHoraSP, janelaDeDias, janelaUTC, partesSP,
  rotuloDataHora, rotuloFaixa, rotuloMes, semanaDoDia, semanaDoStory, semanasDoMes,
} from "../marketing-stories/calendario";

/**
 * O quadro do Miro era MÊS → SEMANA. O que este arquivo trava:
 *  1. a semana é de segunda a domingo e cortada no mês (um mês pode ter 6);
 *  2. tudo é lido em horário de Brasília — story das 22h do dia 30 não pode
 *     cair no dia 31 (nem no mês seguinte) porque o servidor roda em UTC.
 */

describe("semanas do mês (segunda a domingo, cortadas no mês)", () => {
  it("setembro/2026 começa numa terça: 1–6, 7–13, 14–20, 21–27, 28–30", () => {
    expect(semanasDoMes("2026-09").map((s) => [s.de, s.ate])).toEqual([[1, 6], [7, 13], [14, 20], [21, 27], [28, 30]]);
  });

  it("junho/2026 começa numa segunda: semanas cheias", () => {
    expect(semanasDoMes("2026-06").map((s) => [s.de, s.ate])).toEqual([[1, 7], [8, 14], [15, 21], [22, 28], [29, 30]]);
  });

  it("agosto/2026 tem seis semanas (sábado dia 1º, segunda dia 31)", () => {
    const s = semanasDoMes("2026-08");
    expect(s).toHaveLength(6);
    expect(s[0]).toEqual({ n: 1, de: 1, ate: 2 });
    expect(s[5]).toEqual({ n: 6, de: 31, ate: 31 });
  });

  it("fevereiro de ano bissexto tem 29 dias", () => {
    expect(diasNoMes("2028-02")).toBe(29);
    expect(diasNoMes("2026-02")).toBe(28);
  });

  it("cada dia cai na sua semana", () => {
    expect(semanaDoDia("2026-09", 6)).toBe(1);
    expect(semanaDoDia("2026-09", 7)).toBe(2);
    expect(semanaDoDia("2026-09", 30)).toBe(5);
  });
});

describe("fuso de São Paulo", () => {
  it("22h30 do dia 30 em Brasília é dia 30, mesmo já sendo outro mês em UTC", () => {
    const p = partesSP("2026-10-01T01:30:00.000Z");
    expect(p.data).toBe("2026-09-30");
    expect(p.hora).toBe("22:30");
    expect(p.mes).toBe("2026-09");
  });

  it("data + hora de Brasília vira o instante certo, e o inválido vira null", () => {
    expect(isoDeDataHoraSP("2026-09-12", "23:30")).toBe("2026-09-13T02:30:00.000Z");
    expect(isoDeDataHoraSP("2026-02-31", "10:00")).toBeNull();
    expect(isoDeDataHoraSP("2026-09-12", "24:00")).toBeNull();
    expect(isoDeDataHoraSP("12/09/2026", "10:00")).toBeNull();
  });

  it("a janela do mês começa e termina à meia-noite de Brasília", () => {
    expect(janelaUTC("2026-09")).toEqual({ de: "2026-09-01T03:00:00.000Z", ate: "2026-10-01T03:00:00.000Z" });
    expect(janelaUTC("2026-12").ate).toBe("2027-01-01T03:00:00.000Z");
  });

  it("a janela de dias inclui o último dia inteiro", () => {
    expect(janelaDeDias("2026-09-12", "2026-09-12")).toEqual({ de: "2026-09-12T03:00:00.000Z", ate: "2026-09-13T03:00:00.000Z" });
    expect(janelaDeDias("2026-09-12", "nada")).toBeNull();
  });

  it("o story das 23h de domingo é da semana que termina nele", () => {
    // 06/09 (domingo) 23h em Brasília = 07/09 02h em UTC
    expect(semanaDoStory("2026-09-07T02:00:00.000Z")).toEqual({ mes: "2026-09", n: 1 });
  });
});

describe("navegação e rótulos", () => {
  it("andar de mês atravessa o ano nos dois sentidos", () => {
    expect(andarMes("2026-12", 1)).toBe("2027-01");
    expect(andarMes("2026-01", -1)).toBe("2025-12");
    expect(andarMes("2026-09", -13)).toBe("2025-08");
  });

  it("rótulos como o time fala", () => {
    expect(rotuloMes("2026-09")).toBe("Setembro 2026");
    expect(rotuloFaixa("2026-09", { n: 2, de: 7, ate: 13 })).toBe("7–13 set");
    expect(rotuloFaixa("2026-08", { n: 6, de: 31, ate: 31 })).toBe("31 ago");
    expect(rotuloDataHora("2026-09-12T17:30:00.000Z")).toBe("12 SET · 14:30");
  });

  it("a semana começa na segunda", () => {
    expect(inicioDaSemana("2026-09-13")).toBe("2026-09-07");
    expect(inicioDaSemana("2026-09-14")).toBe("2026-09-14");
  });

  it("dia que não existe não passa por dia", () => {
    expect(ehDia("2026-02-30")).toBe(false);
    expect(ehDia("2026-02-28")).toBe(true);
  });
});
