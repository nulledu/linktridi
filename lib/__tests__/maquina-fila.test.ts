import { describe, it, expect } from "vitest";
import {
  problemaDaNovaProgramacao, transicao, proximaPosicao, montarControle, maquinaMenosCarregada, MINUTOS_MAXIMOS,
} from "../maquina-fila";
import type { LinhaMaquina, LinhaProgramacao } from "../painel-maquinas";

/**
 * A escrita da fila das máquinas — as regras que valem na tela E na rota.
 *
 * O desenho vem do pedido do dono: programação cai na fila de UMA máquina,
 * sem aceite ("não teria como aceitar, teria que fazer direto mesmo"), e o
 * operador marca "em andamento" e "feita" direto.
 */

describe("o que barra uma programação nova", () => {
  const ok = { maquinaId: "m1", referencia: "Pedido #58291", minutos: 60 };

  it("a completa passa", () => {
    expect(problemaDaNovaProgramacao(ok)).toBeNull();
  });

  it("sem máquina não existe fila geral — a frase diz isso", () => {
    expect(problemaDaNovaProgramacao({ ...ok, maquinaId: "  " })).toMatch(/fila DELA/);
    expect(problemaDaNovaProgramacao({ ...ok, maquinaId: undefined })).toBeTruthy();
  });

  it("sem referência não há o que mostrar na parede", () => {
    expect(problemaDaNovaProgramacao({ ...ok, referencia: "" })).toMatch(/o que vai ser cortado/);
    expect(problemaDaNovaProgramacao({ ...ok, referencia: "x".repeat(121) })).toMatch(/longa/);
  });

  it("minutos fazem a barra da TV andar — zero, negativo e lixo são recusados", () => {
    expect(problemaDaNovaProgramacao({ ...ok, minutos: 0 })).toMatch(/minutos/);
    expect(problemaDaNovaProgramacao({ ...ok, minutos: -5 })).toBeTruthy();
    expect(problemaDaNovaProgramacao({ ...ok, minutos: "abc" })).toBeTruthy();
  });

  it("acima de 12h é dado digitado errado, e a frase sugere dividir", () => {
    expect(problemaDaNovaProgramacao({ ...ok, minutos: MINUTOS_MAXIMOS })).toBeNull();
    expect(problemaDaNovaProgramacao({ ...ok, minutos: MINUTOS_MAXIMOS + 1 })).toMatch(/divida/);
  });
});

describe("as transições", () => {
  it("da fila: iniciar, concluir e cancelar", () => {
    expect(transicao("fila", "iniciar")).toEqual({ ok: true, para: "executando" });
    expect(transicao("fila", "cancelar")).toEqual({ ok: true, para: "cancelada" });
  });

  it("fila → concluir é PERMITIDO: o operador esquece o 'iniciar' o dia inteiro", () => {
    // Exigir a ordem transformaria o esquecimento num trabalho que nunca
    // fecha. A rota carimba início e fim juntos nesse caso.
    expect(transicao("fila", "concluir")).toEqual({ ok: true, para: "concluida" });
  });

  it("rodando: concluir e cancelar, mas não iniciar de novo", () => {
    expect(transicao("executando", "concluir")).toEqual({ ok: true, para: "concluida" });
    expect(transicao("executando", "cancelar")).toEqual({ ok: true, para: "cancelada" });
    expect(transicao("executando", "iniciar")).toMatchObject({ ok: false });
  });

  it("concluída e cancelada são finais — a frase explica, não só recusa", () => {
    const c = transicao("concluida", "iniciar");
    expect(c).toMatchObject({ ok: false });
    if (!c.ok) expect(c.frase).toMatch(/já foi concluído/);
    const x = transicao("cancelada", "concluir");
    if (!x.ok) expect(x.frase).toMatch(/programação nova/);
  });

  it("status nulo lê-se como fila — linha antiga sem status não trava", () => {
    expect(transicao(null, "iniciar")).toEqual({ ok: true, para: "executando" });
  });
});

describe("a posição da programação nova", () => {
  it("é max+1 das vivas, nunca count — cancelar uma do meio não pode empatar", () => {
    // count daria 3 → posição 3, EMPATADA com a existente. Duas posições
    // iguais fazem a fila da TV embaralhar a cada refresh.
    expect(proximaPosicao([1, 3, 4])).toBe(5);
    expect(proximaPosicao([])).toBe(1);
    expect(proximaPosicao([null, undefined, 2])).toBe(3);
  });
});

// ── A visão de controle ─────────────────────────────────────────────────────

const maq = (id: string, extra: Partial<LinhaMaquina> = {}): LinhaMaquina => ({
  id, nome: `Laser ${id}`, porte: "m", materiais: null, ativa: true, ordem: 1,
  parada_motivo: null, parada_desde: null, parada_previsao: null, ...extra,
});
const prog = (id: string, maquina: string, extra: Partial<LinhaProgramacao> = {}): LinhaProgramacao => ({
  id, maquina_id: maquina, referencia: `Ref ${id}`, material: null,
  minutos_estimados: 60, posicao: 1, status: "fila", iniciada_at: null, concluida_at: null, ...extra,
});

describe("montarControle — o shape da tela de quem mexe", () => {
  it("a fila vem INTEIRA e o executando vem com id — a TV recorta, aqui não", () => {
    const progs = [
      prog("e1", "m1", { status: "executando", iniciada_at: "2026-08-25T12:00:00Z" }),
      prog("f1", "m1", { posicao: 2 }),
      prog("f2", "m1", { posicao: 3 }),
      prog("f3", "m1", { posicao: 4 }),
      prog("f4", "m1", { posicao: 5 }),
      prog("f5", "m1", { posicao: 6 }),
    ];
    const [m] = montarControle([maq("m1")], progs);
    expect(m.executando?.id).toBe("e1");
    expect(m.executando?.iniciadaAt).toBe("2026-08-25T12:00:00Z");
    // O botão "concluir" precisa de um id pra apertar — o shape da TV não o tem.
    expect(m.fila.map((p) => p.id)).toEqual(["f1", "f2", "f3", "f4", "f5"]);
  });

  it("a ordem da fila é a MESMA da TV: posicao manda, id desempata", () => {
    const progs = [
      prog("b", "m1", { posicao: 2 }),
      prog("a", "m1", { posicao: 2 }),
      prog("c", "m1", { posicao: 1 }),
    ];
    const [m] = montarControle([maq("m1")], progs);
    // Se as duas telas discordassem, o "1º da fila" do controle iniciaria um
    // trabalho que a parede mostra em 2º.
    expect(m.fila.map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  it("feitas de HOJE contam; de ontem, não — é o placar do dia", () => {
    const agora = new Date("2026-08-25T15:00:00Z");
    const progs = [
      prog("h1", "m1", { status: "concluida", concluida_at: "2026-08-25T10:00:00Z" }),
      prog("h2", "m1", { status: "concluida", concluida_at: "2026-08-25T14:00:00Z" }),
      prog("o1", "m1", { status: "concluida", concluida_at: "2026-08-24T10:00:00Z" }),
    ];
    const [m] = montarControle([maq("m1")], progs, agora);
    expect(m.feitasHoje).toBe(2);
  });

  it("cada máquina só vê a fila DELA, e parada carrega o motivo", () => {
    const progs = [prog("p1", "m1"), prog("p2", "m2")];
    const [m1, m2] = montarControle(
      [maq("m1"), maq("m2", { parada_motivo: "Manutenção" })],
      progs,
    );
    expect(m1.fila.map((p) => p.id)).toEqual(["p1"]);
    expect(m1.paradaMotivo).toBeNull();
    expect(m2.fila.map((p) => p.id)).toEqual(["p2"]);
    expect(m2.paradaMotivo).toBe("Manutenção");
  });

  it("máquina sem nada segue existindo — cartão vazio, não cartão sumido", () => {
    const [m] = montarControle([maq("m1")], []);
    expect(m.executando).toBeNull();
    expect(m.fila).toEqual([]);
    expect(m.feitasHoje).toBe(0);
  });
});

describe("maquinaMenosCarregada — pra onde vai a reposição sem máquina preferida", () => {
  it("a de menos minutos pendentes ganha", () => {
    expect(maquinaMenosCarregada([
      { id: "a", minutosPendentes: 120 },
      { id: "b", minutosPendentes: 30 },
      { id: "c", minutosPendentes: 240 },
    ])).toBe("b");
  });

  it("empate fica com a primeira da lista — a ordem da parede, estável entre varreduras", () => {
    expect(maquinaMenosCarregada([
      { id: "a", minutosPendentes: 0 },
      { id: "b", minutosPendentes: 0 },
    ])).toBe("a");
  });

  it("sem candidata devolve null — é o sinal de cair pro manual", () => {
    expect(maquinaMenosCarregada([])).toBeNull();
  });

  it("carga lixo conta como zero, não como Infinity", () => {
    expect(maquinaMenosCarregada([
      { id: "a", minutosPendentes: 10 },
      { id: "b", minutosPendentes: NaN },
    ])).toBe("b");
  });
});
