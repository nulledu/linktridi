import { describe, it, expect } from "vitest";
import { reconciliarDia } from "@/lib/jornada/reconcilia";

// Batidas de um dia qualquer, em hora de SP (UTC-3).
const dia = (...horas: string[]) => horas.map((h) => ({ hora: h, iso: `2026-09-15T${String(Number(h.slice(0, 2)) + 3).padStart(2, "0")}:${h.slice(3, 5)}:00Z` }));
const ESCALA = { entradaPrevista: "07:00", almocoInicio: "12:00", almocoFim: "13:00", saidaPrevista: "17:00" };

describe("reconciliação das batidas", () => {
  it("sequência completa é consistente e conta os dois trechos", () => {
    const r = reconciliarDia(dia("07:00", "12:00", "13:00", "17:00"), ESCALA);
    expect(r.nivel).toBe("consistente");
    expect(r.trabMin).toBe(9 * 60);
  });

  it("faltou o retorno do almoço: concluído com inconsistência, almoço previsto descontado", () => {
    const r = reconciliarDia(dia("07:00", "12:00", "17:00"), ESCALA);
    expect(r.nivel).toBe("inconsistente");
    expect(r.faltando).toEqual(["retorno do almoço"]);
    // 07–12 (5h) + 13–17 (4h): nunca as 10h corridas.
    expect(r.trabMin).toBe(9 * 60);
  });

  it("faltou a saída pro almoço: reconstrói pelo retorno", () => {
    const r = reconciliarDia(dia("07:00", "13:00", "17:00"), ESCALA);
    expect(r.nivel).toBe("inconsistente");
    expect(r.faltando).toEqual(["saída pro almoço"]);
    expect(r.trabMin).toBe(9 * 60);
  });

  it("almoço e retorno mas sem saída: incompleta de verdade", () => {
    const r = reconciliarDia(dia("07:00", "12:00", "13:00"), ESCALA);
    expect(r.nivel).toBe("incompleta");
    expect(r.faltando).toEqual(["saída"]);
  });

  it("só a entrada: incompleta", () => {
    expect(reconciliarDia(dia("07:00"), ESCALA).nivel).toBe("incompleta");
  });

  it("toque duplo é descartado e o dia volta a fechar", () => {
    const r = reconciliarDia(dia("07:00", "07:01", "12:00", "13:00", "17:00"), ESCALA);
    expect(r.nivel).toBe("consistente");
    expect(r.duplicadas).toBe(1);
    expect(r.trabMin).toBe(9 * 60);
  });

  it("cinco batidas distintas: não inventa qual falta", () => {
    const r = reconciliarDia(dia("07:00", "10:00", "12:00", "13:00", "17:00"), ESCALA);
    expect(r.nivel).toBe("revisar");
    expect(r.trabMin).toBe(0);
  });

  it("trecho impossível (batidas trocadas) pede revisão", () => {
    expect(reconciliarDia(dia("05:00", "19:00"), ESCALA).nivel).toBe("revisar");
  });

  it("sem escala: usa o meio do dia e a distância da entrada", () => {
    const r = reconciliarDia(dia("08:00", "12:00", "18:00"));
    expect(r.nivel).toBe("inconsistente");
    expect(r.trabMin).toBe(4 * 60 + 5 * 60);
    expect(reconciliarDia(dia("08:00", "12:00", "13:00")).nivel).toBe("incompleta");
  });

  it("primeira batida longe da entrada: a entrada é que faltou, não inventa manhã", () => {
    const r = reconciliarDia(dia("11:38", "12:39", "14:00"), { entradaPrevista: "07:00", almocoInicio: "12:00", almocoFim: "13:00", saidaPrevista: "14:00" });
    expect(r.nivel).toBe("revisar");
    expect(r.faltando).toEqual(["entrada"]);
  });

  it("escala curta: almoço + retorno não viram saída", () => {
    const r = reconciliarDia(dia("06:56", "11:33", "12:38"), { entradaPrevista: "07:00", almocoInicio: "12:00", almocoFim: "13:00", saidaPrevista: "14:00" });
    expect(r.nivel).toBe("incompleta");
  });

  it("duas batidas no mesmo minuto num dia par são pausa, não toque duplo", () => {
    const r = reconciliarDia(dia("07:03", "09:38", "09:38", "11:30", "12:31", "16:48"), ESCALA);
    expect(r.nivel).toBe("consistente");
    expect(r.duplicadas).toBe(0);
  });

  it("sábado (sem almoço) com três batidas pede revisão", () => {
    expect(reconciliarDia(dia("08:04", "12:08", "16:19"), { ...ESCALA, semAlmoco: true }).nivel).toBe("revisar");
  });
});
