import { describe, it, expect } from "vitest";
import { periodosValidos } from "../painel-frescor";

// Horários em São Paulo (UTC-3). 14/09/2026 é segunda-feira.
const sp = (iso: string) => Date.parse(`${iso}-03:00`);

describe("periodosValidos — o 'Hoje' nunca é de ontem", () => {
  it("dado de hoje: os três períodos", () => {
    expect(periodosValidos("2026-09-16T12:00:00.000Z", sp("2026-09-16T18:00:00"))).toEqual(["daily", "weekly", "monthly"]);
  });

  it("dado de ontem, mesma semana: semana e mês", () => {
    expect(periodosValidos(new Date(sp("2026-09-15T17:00:00")).toISOString(), sp("2026-09-16T09:00:00")))
      .toEqual(["weekly", "monthly"]);
  });

  it("dado de domingo visto na segunda: só o mês", () => {
    expect(periodosValidos(new Date(sp("2026-09-13T20:00:00")).toISOString(), sp("2026-09-14T08:00:00")))
      .toEqual(["monthly"]);
  });

  it("virada do mês no meio da semana: só a semana", () => {
    // 30/09/2026 é quarta; 01/10 é quinta, mesma semana.
    expect(periodosValidos(new Date(sp("2026-09-30T20:00:00")).toISOString(), sp("2026-10-01T09:00:00")))
      .toEqual(["weekly"]);
  });

  it("nada bate: sobra o mês (a tarja diz desde quando)", () => {
    expect(periodosValidos(new Date(sp("2026-08-20T20:00:00")).toISOString(), sp("2026-09-16T09:00:00")))
      .toEqual(["monthly"]);
  });

  it("21h em SP já é amanhã em UTC — continua sendo hoje", () => {
    expect(periodosValidos("2026-09-17T00:30:00.000Z", sp("2026-09-16T22:00:00"))).toEqual(["daily", "weekly", "monthly"]);
  });

  it("sem carimbo, ilegível ou no futuro: não esconde nada", () => {
    const tudo = ["daily", "weekly", "monthly"];
    expect(periodosValidos(undefined)).toEqual(tudo);
    expect(periodosValidos("")).toEqual(tudo);
    expect(periodosValidos("ontem")).toEqual(tudo);
    expect(periodosValidos("2027-01-01T00:00:00.000Z", sp("2026-09-16T10:00:00"))).toEqual(tudo);
  });
});
