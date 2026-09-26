import { describe, expect, it } from "vitest";
import {
  camposDaPessoa, duracao, hhmmMin, jornadaDoTurno, minHhmm, resumoTurno, sabadoDoTurno,
  type PontoTurno,
} from "../ponto-turnos";

const turno = (p: Partial<PontoTurno>): PontoTurno => ({
  id: "t", nome: "Turno", entrada: "08:00", saida: "17:00",
  almocoInicio: "12:00", almocoFim: "13:00",
  trabalhaSabado: false, sabadoEntrada: null, sabadoSaida: null,
  ordem: 0, ativo: true, ...p,
});

describe("relógio", () => {
  it("lê HH:MM e recusa lixo", () => {
    expect(hhmmMin("07:00")).toBe(420);
    expect(hhmmMin("16:48")).toBe(1008);
    expect(hhmmMin("24:00")).toBeNull();
    expect(hhmmMin("")).toBeNull();
  });

  it("minutos → HH:MM", () => {
    expect(minHhmm(420)).toBe("07:00");
    expect(minHhmm(1008)).toBe("16:48");
  });

  it("duração vira noite sem dar negativo", () => {
    expect(duracao("08:00", "17:00")).toBe(540);
    expect(duracao("22:00", "06:00")).toBe(480);   // atravessa a meia-noite
    expect(duracao(null, "17:00")).toBe(0);
  });
});

describe("jornada derivada do turno", () => {
  // Os turnos combinados com a empresa. A jornada NÃO é digitada: sai do
  // horário menos o almoço, então mudar a saída não deixa a meta desatualizada.
  it("07:00–16:00 com 1h de almoço = 8h", () => {
    expect(jornadaDoTurno(turno({ entrada: "07:00", saida: "16:00" }))).toBe(480);
  });

  it("07:00–16:48 com 1h de almoço = 8h48 (44h em 5 dias)", () => {
    expect(jornadaDoTurno(turno({ entrada: "07:00", saida: "16:48", almocoInicio: "11:30", almocoFim: "12:30" }))).toBe(528);
  });

  it("07:00–13:00 sem almoço = 6h", () => {
    expect(jornadaDoTurno(turno({ entrada: "07:00", saida: "13:00", almocoInicio: null, almocoFim: null }))).toBe(360);
  });

  it("08:00–17:00 com 1h de almoço = 8h", () => {
    expect(jornadaDoTurno(turno({}))).toBe(480);
  });

  it("08:00–15:00 com 1h de almoço = 6h", () => {
    expect(jornadaDoTurno(turno({ saida: "15:00" }))).toBe(360);
  });

  it("07:30–13:00 sem almoço = 5h30", () => {
    expect(jornadaDoTurno(turno({ entrada: "07:30", saida: "13:00", almocoInicio: null, almocoFim: null }))).toBe(330);
  });

  it("13:00–17:00 sem almoço = 4h", () => {
    expect(jornadaDoTurno(turno({ entrada: "13:00", saida: "17:00", almocoInicio: null, almocoFim: null }))).toBe(240);
  });

  it("almoço pela metade (só um dos dois) é ignorado — não inventa desconto", () => {
    expect(jornadaDoTurno(turno({ almocoFim: null }))).toBe(540);
  });
});

describe("sábado", () => {
  it("quem não trabalha sábado tem 0", () => {
    expect(sabadoDoTurno(turno({ trabalhaSabado: false }))).toBe(0);
  });

  it("sábado não tem almoço: conta o horário cheio", () => {
    const t = turno({ trabalhaSabado: true, sabadoEntrada: "08:00", sabadoSaida: "12:00" });
    expect(sabadoDoTurno(t)).toBe(240);
  });
});

describe("aplicar turno na pessoa", () => {
  it("copia horário, almoço e jornada calculada", () => {
    const c = camposDaPessoa(turno({ entrada: "07:00", saida: "16:00", trabalhaSabado: true, sabadoEntrada: "07:00", sabadoSaida: "11:00" }));
    expect(c).toEqual({
      entradaPrevista: "07:00", saidaPrevista: "16:00",
      almocoInicio: "12:00", almocoFim: "13:00",
      jornadaMin: 480, trabalhaSabado: true, sabadoMin: 240,
    });
  });

  it("sem sábado, zera o sábado em vez de deixar sobra do turno anterior", () => {
    const c = camposDaPessoa(turno({ trabalhaSabado: false, sabadoEntrada: "08:00", sabadoSaida: "12:00" }));
    expect(c.sabadoMin).toBeNull();
    expect(c.trabalhaSabado).toBe(false);
  });
});

describe("resumo legível", () => {
  it("mostra horário, jornada e almoço", () => {
    expect(resumoTurno(turno({ entrada: "07:00", saida: "16:48", almocoInicio: "11:30", almocoFim: "12:30" })))
      .toBe("07:00–16:48 · 8h48 · almoço 1h");
    expect(resumoTurno(turno({ entrada: "13:00", saida: "17:00", almocoInicio: null, almocoFim: null })))
      .toBe("13:00–17:00 · 4h · sem almoço");
  });
});
