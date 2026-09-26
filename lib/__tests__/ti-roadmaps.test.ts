// ── TI: as regras que toda tela repete ───────────────────────────────────────
// Progresso vem de tarefa REAL (concluídas/total), nunca de porcentagem
// fictícia; atraso compara prazo com o hoje de SÃO PAULO (em UTC, depois das
// 21h o "hoje" vira amanhã e tudo pareceria atrasado um dia antes).
import { describe, it, expect } from "vitest";
import { progressoDaEtapa, progressoDoRoadmap, estaAtrasada, hojeSP } from "@/lib/ti-regras";

const etapa = (over: Partial<Parameters<typeof progressoDaEtapa>[0]> = {}) => ({
  status: "em_andamento" as const, progressoManual: null, tarefas: [], ...over,
});

describe("progressoDaEtapa", () => {
  it("tarefas reais mandam: 8 de 10 concluídas = 80%", () => {
    const tarefas = [...Array(8).fill({ status: "concluida" }), ...Array(2).fill({ status: "pendente" })];
    expect(progressoDaEtapa(etapa({ tarefas }))).toBe(80);
  });
  it("com tarefas vinculadas, o progresso manual NÃO vence o cálculo real", () => {
    expect(progressoDaEtapa(etapa({ progressoManual: 90, tarefas: [{ status: "pendente" }] }))).toBe(0);
  });
  it("sem tarefas, vale o manual (limitado a 0–100)", () => {
    expect(progressoDaEtapa(etapa({ progressoManual: 65 }))).toBe(65);
    expect(progressoDaEtapa(etapa({ progressoManual: 130 }))).toBe(100);
    expect(progressoDaEtapa(etapa({ progressoManual: -5 }))).toBe(0);
  });
  it("etapa concluída é 100% mesmo com tarefa aberta pendurada", () => {
    expect(progressoDaEtapa(etapa({ status: "concluida", tarefas: [{ status: "pendente" }] }))).toBe(100);
  });
  it("sem nada, é 0 — nunca inventa número", () => {
    expect(progressoDaEtapa(etapa())).toBe(0);
  });
});

describe("progressoDoRoadmap", () => {
  it("média das etapas quando elas existem", () => {
    expect(progressoDoRoadmap({ progressoManual: 10 }, [{ progresso: 100 }, { progresso: 50 }, { progresso: 0 }])).toBe(50);
  });
  it("sem etapas, vale o manual; sem manual, 0", () => {
    expect(progressoDoRoadmap({ progressoManual: 40 }, [])).toBe(40);
    expect(progressoDoRoadmap({ progressoManual: null }, [])).toBe(0);
  });
});

describe("estaAtrasada", () => {
  it("prazo passado sem concluir = atrasada; concluída nunca atrasa", () => {
    expect(estaAtrasada({ prazo: "2026-09-20", status: "em_andamento" }, "2026-09-22")).toBe(true);
    expect(estaAtrasada({ prazo: "2026-09-20", status: "concluida" }, "2026-09-22")).toBe(false);
    expect(estaAtrasada({ prazo: "2026-09-20", status: "concluido" }, "2026-09-22")).toBe(false);
  });
  it("no dia do prazo ainda não está atrasada; sem prazo, nunca", () => {
    expect(estaAtrasada({ prazo: "2026-09-22", status: "em_andamento" }, "2026-09-22")).toBe(false);
    expect(estaAtrasada({ prazo: null, status: "em_andamento" }, "2026-09-22")).toBe(false);
  });
});

describe("hojeSP", () => {
  it("depois das 21h UTC-3, o dia em SP ainda é o de ontem em UTC", () => {
    // 2026-09-23T01:00Z = 2026-09-22 22:00 em São Paulo.
    expect(hojeSP(new Date("2026-09-23T01:00:00Z"))).toBe("2026-09-22");
  });
});
