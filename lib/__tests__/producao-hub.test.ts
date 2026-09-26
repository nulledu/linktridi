import { describe, expect, it } from "vitest";
import { agendaProjetada, colunasControle, cumprimento, estadoMaquina, resumoMaquinas } from "../producao-hub";
import type { MaquinaControle } from "../maquina-fila";
import type { CartaoQuadro, Quadro, RaiaQuadro } from "../maquina-quadro";

const oee = { disponibilidade: 80, desempenho: 90, qualidade: 100, oee: 72, faixa: "boa", qualidadeApontada: true, minutosPerdidos: 0, pecas: 10, refugos: 0 } as unknown as MaquinaControle["oee"];
const maq = (o: Partial<MaquinaControle>): MaquinaControle => ({
  id: "m", nome: "Laser", porte: "G", paradaMotivo: null, executando: null, fila: [], feitasHoje: 0, oee, semApontamentoHoje: 0, ...o,
});
const prog = (id: string, minutos: number) => ({ id, referencia: id, material: null, minutos, posicao: 1 });

describe("estado da máquina", () => {
  it("parada por manutenção ≠ parada comum", () => {
    expect(estadoMaquina(maq({ paradaMotivo: "Manutenção do cabeçote" }))).toBe("manutencao");
    expect(estadoMaquina(maq({ paradaMotivo: "Sem material" }))).toBe("parada");
    expect(estadoMaquina(maq({ executando: { ...prog("a", 30), iniciadaAt: null } }))).toBe("produzindo");
    expect(estadoMaquina(maq({ fila: [prog("b", 10)] }))).toBe("aguardando");
    expect(estadoMaquina(maq({}))).toBe("ociosa");
  });

  it("resumo conta parada e manutenção fora das ativas", () => {
    const r = resumoMaquinas([maq({}), maq({ paradaMotivo: "manutenção" }), maq({ paradaMotivo: "quebrou" })]);
    expect(r).toMatchObject({ total: 3, ativas: 1, manutencao: 1, paradas: 1, disponibilidade: 80, pecasHoje: 30 });
  });
});

const cartao = (o: Partial<CartaoQuadro>): CartaoQuadro => ({
  chave: "c", id: "c", tipo: "programacao", titulo: "#1", detalhe: null, status: "pendente", minutos: 30, responsavel: null,
  urgente: false, posicao: 1, iniciadaAt: null, concluidaAt: null, rodandoHaMin: 0, progressoPct: 0, combina: true, ...o,
});
const raia = (o: Partial<RaiaQuadro>): RaiaQuadro => ({
  maquinaId: "r", nome: "CNC", porte: "G", materiais: null, paradaMotivo: null, pendentes: [], andamento: [], concluidas: [],
  minutosPendentes: 0, minutosHoje: 0, feitasHoje: 0, ...o,
});

describe("colunas do controle", () => {
  it("máquina parada pausa tudo que não fechou; estouro de estimativa atrasa", () => {
    const q: Quadro = {
      atualizadoEm: "",
      raias: [
        raia({ paradaMotivo: "Sem MDF", pendentes: [cartao({ id: "p" })], concluidas: [cartao({ id: "f", status: "concluida" })] }),
        raia({ andamento: [cartao({ id: "a", status: "andamento", rodandoHaMin: 45 }), cartao({ id: "b", status: "andamento", rodandoHaMin: 10 })] }),
      ],
      semMaquina: raia({ nome: "Sem máquina", pendentes: [cartao({ id: "u", urgente: true }), cartao({ id: "n" })] }),
    };
    const c = colunasControle(q);
    expect(c.pausado.map((i) => [i.cartao.id, i.motivo])).toEqual([["p", "Sem MDF"]]);
    expect(c.concluido.map((i) => i.cartao.id)).toEqual(["f"]);
    expect(c.atrasado.map((i) => i.cartao.id).sort()).toEqual(["a", "u"]);
    expect(c.andamento.map((i) => i.cartao.id)).toEqual(["b"]);
    expect(c.aguardando.map((i) => [i.cartao.id, i.maquina])).toEqual([["n", null]]);
  });
});

describe("agenda projetada", () => {
  it("a fila vem atrás do que roda, na ordem", () => {
    const agora = new Date("2026-09-22T13:00:00Z");
    const a = agendaProjetada([maq({
      executando: { ...prog("x", 60), iniciadaAt: "2026-09-22T12:30:00Z" },
      fila: [prog("y", 30), prog("z", 15)],
    })], agora);
    expect(a.map((i) => [i.id, i.inicio.toISOString(), i.estado])).toEqual([
      ["x", "2026-09-22T12:30:00.000Z", "andamento"],
      ["y", "2026-09-22T13:30:00.000Z", "programado"],
      ["z", "2026-09-22T14:00:00.000Z", "programado"],
    ]);
  });

  it("cumprimento sem planejado é nulo", () => {
    expect(cumprimento(0, 3)).toBeNull();
    expect(cumprimento(40, 30)).toBe(75);
  });
});
