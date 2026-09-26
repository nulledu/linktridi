import { describe, expect, it } from "vitest";
import { diasDoPeriodo, montarPeriodo, periodoAnterior, rotuloPeriodo } from "../tridimarket/periodo";

// Uma quinta-feira às 14h32 — hora do meio do dia de propósito: o bug que este
// módulo corrige aparece justamente quando "agora" não é meia-noite.
const AGORA = new Date("2026-07-23T14:32:00");
const dia = (iso: string) => iso.slice(0, 10);

describe("período das consultas", () => {
  it("hoje vai da meia-noite ao fim do dia, não das últimas 24h", () => {
    const p = montarPeriodo("hoje", AGORA);
    expect(new Date(p.de).getHours()).toBe(0);
    expect(new Date(p.de).getMinutes()).toBe(0);
    expect(new Date(p.ate).getHours()).toBe(23);
    expect(dia(new Date(p.de).toLocaleDateString("sv"))).toBe("2026-07-23");
  });

  it("ontem é o dia inteiro de ontem, sem encostar em hoje", () => {
    const p = montarPeriodo("ontem", AGORA);
    expect(new Date(p.de).toLocaleDateString("sv")).toBe("2026-07-22");
    expect(new Date(p.ate).toLocaleDateString("sv")).toBe("2026-07-22");
    // Não invade hoje: termina antes da meia-noite seguinte.
    expect(new Date(p.ate).getTime()).toBeLessThan(new Date(montarPeriodo("hoje", AGORA).de).getTime());
  });

  it("7 dias inclui hoje e os seis anteriores", () => {
    const p = montarPeriodo("7d", AGORA);
    expect(new Date(p.de).toLocaleDateString("sv")).toBe("2026-07-17");
    expect(new Date(p.ate).toLocaleDateString("sv")).toBe("2026-07-23");
    expect(diasDoPeriodo(p)).toBe(7);
  });

  it("30 e 90 dias fecham a contagem certa", () => {
    expect(diasDoPeriodo(montarPeriodo("30d", AGORA))).toBe(30);
    expect(diasDoPeriodo(montarPeriodo("90d", AGORA))).toBe(90);
  });

  it("período escolhido cobre os dois dias por inteiro", () => {
    const p = montarPeriodo("custom", AGORA, { de: "2026-07-01", ate: "2026-07-03" });
    expect(new Date(p.de).toLocaleDateString("sv")).toBe("2026-07-01");
    expect(new Date(p.ate).toLocaleDateString("sv")).toBe("2026-07-03");
    expect(new Date(p.de).getHours()).toBe(0);
    expect(new Date(p.ate).getHours()).toBe(23);
  });

  it("datas invertidas são trocadas em vez de virar intervalo vazio", () => {
    const p = montarPeriodo("custom", AGORA, { de: "2026-07-10", ate: "2026-07-05" });
    expect(new Date(p.de).toLocaleDateString("sv")).toBe("2026-07-05");
    expect(new Date(p.ate).toLocaleDateString("sv")).toBe("2026-07-10");
  });

  it("anterior de hoje é ontem", () => {
    const anterior = periodoAnterior(montarPeriodo("hoje", AGORA));
    expect(new Date(anterior.de).toLocaleDateString("sv")).toBe("2026-07-22");
    expect(new Date(anterior.ate).toLocaleDateString("sv")).toBe("2026-07-22");
  });

  it("anterior de 7 dias são os 7 dias que vieram antes, sem sobrepor", () => {
    const atual = montarPeriodo("7d", AGORA);
    const anterior = periodoAnterior(atual);
    expect(new Date(anterior.ate).getTime()).toBeLessThan(new Date(atual.de).getTime());
    expect(diasDoPeriodo(anterior)).toBe(7);
    expect(new Date(anterior.de).toLocaleDateString("sv")).toBe("2026-07-10");
  });

  it("rótulo do período escolhido mostra as datas", () => {
    expect(rotuloPeriodo(montarPeriodo("hoje", AGORA))).toBe("Hoje");
    expect(rotuloPeriodo(montarPeriodo("custom", AGORA, { de: "2026-07-01", ate: "2026-07-03" }))).toMatch(/01 de jul.* a 03 de jul/);
  });

  it("custom sem datas cai no comportamento de dias, sem quebrar", () => {
    const p = montarPeriodo("custom", AGORA);
    expect(new Date(p.ate).getTime()).toBeGreaterThan(new Date(p.de).getTime());
  });
});
