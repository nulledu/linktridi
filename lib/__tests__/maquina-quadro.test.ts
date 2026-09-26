import { describe, expect, it } from "vitest";
import {
  cartoesDa, combinaComPorte, destinosRecomendados, filtrarQuadro, FILTRO_VAZIO, fimDaColuna,
  montarQuadro, patchDeStatus, resumoDoQuadro, statusDaLinha,
  type LinhaAtividadeQuadro, type LinhaMaquinaQuadro, type LinhaProgQuadro,
} from "@/lib/maquina-quadro";

const maq = (id: string, nome: string, porte: string, parada: string | null = null): LinhaMaquinaQuadro =>
  ({ id, nome, porte, materiais: null, parada_motivo: parada });

const prog = (p: Partial<LinhaProgQuadro> & { id: string; maquina_id: string }): LinhaProgQuadro => ({
  referencia: "Pedido", material: null, minutos_estimados: 30, posicao: 1,
  status: "fila", iniciada_at: null, concluida_at: null, ...p,
});

const atv = (a: Partial<LinhaAtividadeQuadro> & { id: string }): LinhaAtividadeQuadro => ({
  tarefa: "Testar chancela", categoria: "Chancela", para_nome: "Davi", status: "pendente",
  tempo_estimado_min: 15, iniciada_at: null, concluida_at: null, maquina_id: null,
  quadro_posicao: 0, ...a,
});

const AGORA = new Date("2026-09-08T15:00:00.000Z");

describe("a régua de porte (o pedido do dono)", () => {
  it("P é corte de borracha e acrílico — não de atividade", () => {
    expect(combinaComPorte("P", "programacao", "Borracha 2 mm")).toBe(true);
    expect(combinaComPorte("P", "programacao", "Acrílico 3 mm")).toBe(true);
    expect(combinaComPorte("P", "programacao", "MDF 6 mm")).toBe(false);
    expect(combinaComPorte("P", "atividade", null)).toBe(false);
  });

  it("M é atividade; G é MDF e atividade", () => {
    expect(combinaComPorte("M", "atividade", null)).toBe(true);
    expect(combinaComPorte("M", "programacao", "MDF 6 mm")).toBe(false);
    expect(combinaComPorte("G", "atividade", null)).toBe(true);
    expect(combinaComPorte("G", "programacao", "MDF 3 mm")).toBe(true);
    expect(combinaComPorte("G", "programacao", "Borracha")).toBe(false);
  });

  it("material em branco não é 'fora do lugar' — é falta de dado", () => {
    expect(combinaComPorte("P", "programacao", null)).toBe(true);
    expect(combinaComPorte("G", "programacao", "")).toBe(true);
  });

  it("sugere primeiro quem combina, sem esconder o resto", () => {
    const raias = [{ maquinaId: "p", porte: "P" }, { maquinaId: "m", porte: "M" }, { maquinaId: "g", porte: "G" }];
    const d = destinosRecomendados(raias, "atividade", null);
    expect(d.combina.map((c) => c.maquinaId)).toEqual(["m", "g"]);
    expect(d.resto.map((c) => c.maquinaId)).toEqual(["p"]);
  });
});

describe("fimDaColuna", () => {
  it("é max+1, nunca a contagem — senão duas posições empatam", () => {
    expect(fimDaColuna([1, 2, 7])).toBe(8);
    expect(fimDaColuna([])).toBe(1);
    expect(fimDaColuna([null, undefined, 3])).toBe(4);
  });
});

describe("statusDaLinha", () => {
  it("traduz o vocabulário das duas tabelas pras três colunas", () => {
    expect(statusDaLinha("programacao", "fila")).toBe("pendente");
    expect(statusDaLinha("programacao", "executando")).toBe("andamento");
    expect(statusDaLinha("atividade", "em_andamento")).toBe("andamento");
    expect(statusDaLinha("atividade", "pendente")).toBe("pendente");
    expect(statusDaLinha("programacao", "concluida")).toBe("concluida");
  });

  it("cancelada e aguardando material ficam FORA do quadro", () => {
    expect(statusDaLinha("programacao", "cancelada")).toBeNull();
    expect(statusDaLinha("atividade", "aguardando_material")).toBeNull();
  });
});

describe("patchDeStatus — o gesto de arrastar entre colunas", () => {
  const t0 = new Date("2026-09-08T15:00:00.000Z");

  it("pra Em andamento carimba o início e limpa o fim", () => {
    const r = patchDeStatus("programacao", { status: "fila", iniciada_at: null }, "andamento", t0);
    expect(r).toEqual({ ok: true, patch: { status: "executando", iniciada_at: t0.toISOString(), concluida_at: null } });
  });

  it("concluir DIRETO da fila carimba início e fim juntos", () => {
    const r = patchDeStatus("atividade", { status: "pendente", iniciada_at: null }, "concluida", t0);
    expect(r).toEqual({ ok: true, patch: { status: "concluida", iniciada_at: t0.toISOString(), concluida_at: t0.toISOString() } });
  });

  it("concluir de Em andamento preserva o início real", () => {
    const antes = "2026-09-08T12:00:00.000Z";
    const r = patchDeStatus("programacao", { status: "executando", iniciada_at: antes }, "concluida", t0);
    expect(r).toEqual({ ok: true, patch: { status: "concluida", iniciada_at: antes, concluida_at: t0.toISOString() } });
  });

  it("voltar pra Pendente desfaz os dois carimbos — o desfazer do arrasto errado", () => {
    const r = patchDeStatus("atividade", { status: "concluida", iniciada_at: "2026-09-08T12:00:00.000Z" }, "pendente", t0);
    expect(r).toEqual({ ok: true, patch: { status: "pendente", iniciada_at: null, concluida_at: null } });
  });

  it("reabrir uma concluída pra Em andamento recomeça o relógio", () => {
    const r = patchDeStatus("programacao", { status: "concluida", iniciada_at: "2026-09-08T09:00:00.000Z" }, "andamento", t0);
    expect(r).toEqual({ ok: true, patch: { status: "executando", iniciada_at: t0.toISOString(), concluida_at: null } });
  });

  it("cancelada e aguardando material recusam com frase, não com código", () => {
    const a = patchDeStatus("programacao", { status: "cancelada", iniciada_at: null }, "andamento", t0);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.frase).toMatch(/cancelado/i);
    const b = patchDeStatus("atividade", { status: "aguardando_material", iniciada_at: null }, "andamento", t0);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.frase).toMatch(/material/i);
  });
});

describe("montarQuadro", () => {
  it("separa a raia nas três colunas, com corte e atividade juntos", () => {
    const q = montarQuadro(
      [maq("g1", "Laser G1", "G")],
      [
        prog({ id: "p1", maquina_id: "g1", material: "MDF 6 mm", status: "executando", iniciada_at: "2026-09-08T14:00:00.000Z", minutos_estimados: 120 }),
        prog({ id: "p2", maquina_id: "g1", material: "MDF 3 mm", posicao: 2 }),
      ],
      [atv({ id: "a1", maquina_id: "g1", quadro_posicao: 9 })],
      AGORA,
    );
    const r = q.raias[0];
    expect(r.andamento.map((c) => c.chave)).toEqual(["programacao:p1"]);
    expect(r.pendentes.map((c) => c.chave)).toEqual(["programacao:p2", "atividade:a1"]);
    expect(cartoesDa(r, "concluida")).toEqual([]);
  });

  it("a barra do que roda é de relógio e satura em 99%", () => {
    const q = montarQuadro(
      [maq("g1", "Laser G1", "G")],
      [prog({ id: "p1", maquina_id: "g1", status: "executando", iniciada_at: "2026-09-08T14:00:00.000Z", minutos_estimados: 120 })],
      [], AGORA,
    );
    expect(q.raias[0].andamento[0].rodandoHaMin).toBe(60);
    expect(q.raias[0].andamento[0].progressoPct).toBe(50);

    const estourado = montarQuadro(
      [maq("g1", "Laser G1", "G")],
      [prog({ id: "p1", maquina_id: "g1", status: "executando", iniciada_at: "2026-09-08T09:00:00.000Z", minutos_estimados: 30 })],
      [], AGORA,
    );
    expect(estourado.raias[0].andamento[0].progressoPct).toBe(99);
  });

  it("urgente fura a fila dentro da coluna", () => {
    const q = montarQuadro(
      [maq("m1", "Laser M1", "M")],
      [],
      [
        atv({ id: "a1", maquina_id: "m1", quadro_posicao: 1 }),
        atv({ id: "a2", maquina_id: "m1", quadro_posicao: 5, urgente: true }),
      ],
      AGORA,
    );
    expect(q.raias[0].pendentes.map((c) => c.id)).toEqual(["a2", "a1"]);
  });

  it("Concluído mostra só o DIA — ontem não polui a coluna", () => {
    const q = montarQuadro(
      [maq("g1", "Laser G1", "G")],
      [
        prog({ id: "hoje", maquina_id: "g1", status: "concluida", concluida_at: "2026-09-08T12:00:00.000Z" }),
        prog({ id: "ontem", maquina_id: "g1", status: "concluida", concluida_at: "2026-09-07T12:00:00.000Z" }),
      ],
      [], AGORA,
    );
    expect(q.raias[0].concluidas.map((c) => c.id)).toEqual(["hoje"]);
    expect(q.raias[0].feitasHoje).toBe(1);
  });

  it("cancelada não aparece em coluna nenhuma", () => {
    const q = montarQuadro(
      [maq("g1", "Laser G1", "G")],
      [prog({ id: "p1", maquina_id: "g1", status: "cancelada" })],
      [], AGORA,
    );
    expect(q.raias[0].pendentes).toEqual([]);
    expect(q.raias[0].feitasHoje).toBe(0);
  });

  it("marca o cartão fora do porte da raia", () => {
    const q = montarQuadro([maq("p1", "Laser P1", "P")], [prog({ id: "x", maquina_id: "p1", material: "MDF 6 mm" })], [], AGORA);
    expect(q.raias[0].pendentes[0].combina).toBe(false);
  });

  it("atividade sem máquina e programação órfã caem no monte — trabalho não some", () => {
    const q = montarQuadro(
      [maq("g1", "Laser G1", "G")],
      [prog({ id: "orfa", maquina_id: "desativada" })],
      [atv({ id: "a1" })],
      AGORA,
    );
    expect(q.semMaquina.pendentes.map((c) => c.chave).sort()).toEqual(["atividade:a1", "programacao:orfa"]);
  });
});

describe("resumoDoQuadro", () => {
  it("soma as raias e o monte", () => {
    const q = montarQuadro(
      [maq("p1", "Laser P1", "P"), maq("g1", "Laser G1", "G", "Manutenção")],
      [
        prog({ id: "p1", maquina_id: "p1", status: "executando", iniciada_at: "2026-09-08T14:30:00.000Z", minutos_estimados: 40 }),
        prog({ id: "p2", maquina_id: "p1", material: "MDF 6 mm", minutos_estimados: 20 }),
        prog({ id: "p3", maquina_id: "p1", status: "concluida", concluida_at: "2026-09-08T11:00:00.000Z" }),
      ],
      [atv({ id: "a1" })],
      AGORA,
    );
    expect(resumoDoQuadro(q)).toEqual({
      pendentes: 2, andamento: 1, concluidasHoje: 1,
      minutosPendentes: 60 + 15, maquinasParadas: 1, semMaquina: 1, foraDoPorte: 1,
    });
  });
});

describe("filtrarQuadro", () => {
  const q = montarQuadro(
    [maq("p1", "Laser P1", "P"), maq("m1", "Laser M1", "M")],
    [prog({ id: "c1", maquina_id: "p1", referencia: "Pedido #58291", material: "Acrílico" })],
    [atv({ id: "a1", maquina_id: "m1", tarefa: "Testar chancela", urgente: true })],
    AGORA,
  );

  it("porte esconde a RAIA inteira", () => {
    const f = filtrarQuadro(q, { ...FILTRO_VAZIO, porte: "M" });
    expect(f.raias.map((r) => r.nome)).toEqual(["Laser M1"]);
  });

  it("tipo e urgente filtram os cartões, mas a raia fica", () => {
    const soCorte = filtrarQuadro(q, { ...FILTRO_VAZIO, tipo: "programacao" });
    expect(soCorte.raias.map((r) => r.pendentes.length)).toEqual([1, 0]);
    const urgentes = filtrarQuadro(q, { ...FILTRO_VAZIO, soUrgentes: true });
    expect(urgentes.raias.map((r) => r.pendentes.length)).toEqual([0, 1]);
  });

  it("a busca ignora acento e maiúscula, e olha o responsável", () => {
    expect(filtrarQuadro(q, { ...FILTRO_VAZIO, busca: "acrilico" }).raias[0].pendentes).toHaveLength(1);
    expect(filtrarQuadro(q, { ...FILTRO_VAZIO, busca: "DAVI" }).raias[1].pendentes).toHaveLength(1);
    expect(filtrarQuadro(q, { ...FILTRO_VAZIO, busca: "zzz" }).raias[0].pendentes).toHaveLength(0);
  });
});
