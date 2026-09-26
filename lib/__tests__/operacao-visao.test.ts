import { describe, expect, it } from "vitest";
import { montarVisaoAtividades } from "@/lib/operacao-visao";
import { variacao } from "@/app/(plataforma)/ui/primitives";

// 22/09/2026 15:00 em SP.
const AGORA = new Date("2026-09-22T18:00:00Z");
const base = {
  tarefa: "Corte", setor: "Produção", categoria: null, urgente: false, impedida: false, prazo: null,
  quantidade_alvo: null, para_nome: "Ana", iniciada_at: null, created_at: "2026-09-20T12:00:00Z",
};
const linha = (o: Record<string, unknown>) => ({ ...base, id: String(Math.random()), status: "pendente", quantidade_feita: null, para_id: "a", concluida_at: null, ...o });

describe("Operação › Visão geral — a conta das atividades", () => {
  const linhas = [
    linha({ status: "concluida", quantidade_feita: 10, iniciada_at: "2026-09-22T12:00:00Z", concluida_at: "2026-09-22T12:30:00Z" }),
    linha({ status: "concluida", quantidade_feita: 5, para_id: "b", iniciada_at: "2026-09-21T12:00:00Z", concluida_at: "2026-09-21T13:00:00Z" }),
    linha({ status: "em_andamento", iniciada_at: "2026-09-22T17:00:00Z" }),
    linha({ status: "pendente", urgente: true }),
    linha({ status: "pendente", impedida: true }),
  ];
  const v = montarVisaoAtividades(linhas as never, AGORA);

  it("hoje × ontem saem das concluídas de cada dia (fuso SP)", () => {
    expect(v.pecas).toEqual({ valor: 10, ontem: 5 });
    expect(v.concluidas).toEqual({ valor: 1, ontem: 1 });
    expect(v.tmaMin).toEqual({ valor: 30, ontem: 60 });
  });

  it("a fila aberta conta pendente, andamento, urgente e impedida", () => {
    expect([v.pendentes, v.emAndamento, v.urgentes, v.impedidas]).toEqual([2, 1, 1, 1]);
  });

  it("a semana tem 7 dias terminando hoje", () => {
    expect(v.semana).toHaveLength(7);
    expect(v.semana[6]).toEqual({ dia: "2026-09-22", pecas: 10 });
    expect(v.semana[5]).toEqual({ dia: "2026-09-21", pecas: 5 });
  });

  it("próximas: impedida fica fora, urgente vem primeiro", () => {
    expect(v.proximas).toHaveLength(1);
    expect(v.proximas[0].urgente).toBe(true);
  });

  it("últimas: do mais recente, só o que começou ou terminou", () => {
    expect(v.ultimas.map((u) => u.status)).toEqual(["em_andamento", "concluida", "concluida"]);
  });
});

describe("variacao — 'vs. ontem' não inventa", () => {
  it("sem ontem não há comparação; ontem 0 não vira infinito", () => {
    expect(variacao(5, null)).toBeNull();
    expect(variacao(5, 0)).toBeNull();
    expect(variacao(0, 0)).toBe(0);
    expect(variacao(12, 10)).toBe(20);
  });
});
