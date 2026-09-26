import { describe, it, expect } from "vitest";
import {
  montarMaquina, resumirMaquinas, agruparPorPorte, duracaoCurta, restanteLongo, horaSP,
  type LinhaMaquina, type LinhaProgramacao,
} from "@/lib/painel-maquinas";

/**
 * O setor de máquinas na parede.
 *
 * O que este teste protege: o progresso é de RELÓGIO (não há sensor na
 * máquina), então ele nunca pode chegar a 100% sozinho nem estourar quando a
 * peça passa da estimativa — as duas coisas mentem para quem olha de longe.
 */

const AGORA = new Date("2026-08-25T13:00:00.000Z"); // 10:00 em SP

const maq = (extra: Partial<LinhaMaquina> = {}): LinhaMaquina => ({
  id: "m1", nome: "Laser P1", porte: "P", materiais: "Borracha / Acrílico",
  ativa: true, ordem: 1, parada_motivo: null, parada_desde: null, parada_previsao: null,
  ...extra,
});

const prog = (extra: Partial<LinhaProgramacao> = {}): LinhaProgramacao => ({
  id: "p1", maquina_id: "m1", referencia: "Pedido #58291", material: "Acrílico 3 mm",
  minutos_estimados: 60, posicao: 0, status: "fila", iniciada_at: null, concluida_at: null,
  ...extra,
});

describe("formatos da parede", () => {
  it("duração curta é 6h20 / 45min", () => {
    expect(duracaoCurta(380)).toBe("6h20");
    expect(duracaoCurta(45)).toBe("45min");
    expect(duracaoCurta(120)).toBe("2h");
    expect(duracaoCurta(0)).toBe("0min");
  });
  it("restante é 1h 45m restantes", () => {
    expect(restanteLongo(105)).toBe("1h 45m restantes");
    expect(restanteLongo(30)).toBe("30m restantes");
  });
  it("a hora sai no fuso de SP, não no da máquina", () => {
    expect(horaSP("2026-08-25T11:15:00.000Z")).toBe("08:15");
    expect(horaSP(null)).toBeNull();
  });
});

describe("montarMaquina — o que está na máquina agora", () => {
  it("produzindo: progresso e restante saem do relógio", () => {
    // Começou 09:00 SP (12:00Z), estimativa 240 min → às 10:00 SP deu 60 min.
    const m = montarMaquina(maq(), [
      prog({ id: "atual", status: "executando", iniciada_at: "2026-08-25T12:00:00.000Z", minutos_estimados: 240 }),
    ], AGORA);
    expect(m.estado).toBe("produzindo");
    expect(m.atual?.progressoPct).toBe(25);
    expect(m.atual?.minutosRestantes).toBe(180);
    expect(horaSP(m.atual!.inicio)).toBe("09:00");
    expect(horaSP(m.atual!.previsaoTermino)).toBe("13:00");
  });

  it("passar da estimativa NÃO vira 140%: satura em 99", () => {
    const m = montarMaquina(maq(), [
      prog({ status: "executando", iniciada_at: "2026-08-25T09:00:00.000Z", minutos_estimados: 60 }),
    ], AGORA);
    expect(m.atual?.progressoPct).toBe(99);
    expect(m.atual?.minutosRestantes).toBe(0);
  });

  it("nunca chega a 100% sozinho — quem fecha é o operador", () => {
    // Exatamente no fim da estimativa.
    const m = montarMaquina(maq(), [
      prog({ status: "executando", iniciada_at: "2026-08-25T12:00:00.000Z", minutos_estimados: 60 }),
    ], AGORA);
    expect(m.atual?.progressoPct).toBe(99);
  });

  it("aguardando: mostra a próxima com 0% e sem hora de início", () => {
    const m = montarMaquina(maq(), [
      prog({ id: "f1", posicao: 1, referencia: "Pedido #58301", minutos_estimados: 70 }),
      prog({ id: "f2", posicao: 2, referencia: "Programa AC-067" }),
    ], AGORA);
    expect(m.estado).toBe("aguardando");
    expect(m.atual?.referencia).toBe("Pedido #58301");
    expect(m.atual?.progressoPct).toBe(0);
    expect(m.atual?.inicio).toBeNull();
    // A que está "no ar" sai da lista de próximas — senão apareceria duas vezes.
    expect(m.proximas.map((p) => p.referencia)).toEqual(["Programa AC-067"]);
  });

  it("parada: some o trabalho atual, a FILA continua", () => {
    const m = montarMaquina(
      maq({ parada_motivo: "Manutenção programada", parada_previsao: "2026-08-25T14:30:00.000Z" }),
      [prog({ id: "f1", posicao: 1, referencia: "Programa CH-300" })],
      AGORA,
    );
    expect(m.estado).toBe("parada");
    expect(m.atual).toBeNull();
    expect(m.paradaMotivo).toBe("Manutenção programada");
    expect(m.proximas.map((p) => p.referencia)).toEqual(["Programa CH-300"]);
  });

  it("horas de hoje somam o concluído do dia + o que está rodando", () => {
    const m = montarMaquina(maq(), [
      // 2h fechadas hoje
      prog({ id: "c1", status: "concluida", iniciada_at: "2026-08-25T11:00:00.000Z", concluida_at: "2026-08-25T13:00:00.000Z" }),
      // 1h rodando agora
      prog({ id: "a1", status: "executando", iniciada_at: "2026-08-25T12:00:00.000Z", minutos_estimados: 240 }),
      // fechada ONTEM — não conta
      prog({ id: "c0", status: "concluida", iniciada_at: "2026-08-24T11:00:00.000Z", concluida_at: "2026-08-24T15:00:00.000Z" }),
    ], AGORA);
    expect(m.minutosHoje).toBe(180);
    expect(duracaoCurta(m.minutosHoje)).toBe("3h");
  });

  it("a fila só mostra 3 — é parede, não relatório", () => {
    const m = montarMaquina(maq(), [
      prog({ id: "atual", status: "executando", iniciada_at: "2026-08-25T12:00:00.000Z" }),
      ...Array.from({ length: 6 }, (_, i) => prog({ id: `f${i}`, posicao: i + 1, referencia: `Pedido #${i}` })),
    ], AGORA);
    expect(m.proximas).toHaveLength(3);
    expect(m.proximas[0].referencia).toBe("Pedido #0");
  });
});

describe("resumirMaquinas — os números do cabeçalho", () => {
  const maquinas = [
    maq({ id: "m1", nome: "Laser P1", porte: "P", ordem: 1 }),
    maq({ id: "m2", nome: "Laser G1", porte: "G", ordem: 3 }),
    maq({ id: "m3", nome: "Laser M1", porte: "M", ordem: 2 }),
    maq({ id: "off", nome: "Laser velho", ativa: false, ordem: 9 }),
  ];
  const programacoes = [
    prog({ id: "a", maquina_id: "m1", status: "executando", iniciada_at: "2026-08-25T12:00:00.000Z", minutos_estimados: 120 }),
    prog({ id: "b", maquina_id: "m1", status: "fila", posicao: 1, minutos_estimados: 90, material: "Acrílico 3 mm" }),
    prog({ id: "c", maquina_id: "m2", status: "fila", posicao: 1, minutos_estimados: 30, material: "Chapa PS" }),
    prog({ id: "d", maquina_id: "m3", status: "concluida", iniciada_at: "2026-08-25T11:00:00.000Z", concluida_at: "2026-08-25T12:00:00.000Z" }),
    prog({ id: "e", maquina_id: "m2", status: "fila", posicao: 2, minutos_estimados: 45, material: "Acrílico 3 mm" }),
  ];
  const r = resumirMaquinas(maquinas, programacoes, AGORA);

  it("máquina inativa fica fora da parede", () => {
    expect(r.maquinas.map((m) => m.nome)).toEqual(["Laser P1", "Laser M1", "Laser G1"]);
  });

  it("trabalhado = 1h rodando + 1h concluída", () => {
    expect(r.minutosTrabalhados).toBe(120);
  });

  it("pendente = a fila inteira + o que falta do que está na máquina", () => {
    // fila 90+30+45 = 165, restante do atual = 120-60 = 60
    expect(r.minutosPendentes).toBe(225);
  });

  it("conta programações feitas hoje e pendentes", () => {
    expect(r.programacoesFeitas).toBe(1);
    expect(r.programacoesPendentes).toBe(3);
  });

  it("agrupa as pendentes por material, do maior pro menor", () => {
    expect(r.porMaterial).toEqual([
      { material: "Acrílico 3 mm", programacoes: 2 },
      { material: "Chapa PS", programacoes: 1 },
    ]);
  });

  it("sem máquina nenhuma não estoura", () => {
    const vazio = resumirMaquinas([], [], AGORA);
    expect(vazio.maquinas).toEqual([]);
    expect(vazio.minutosTrabalhados).toBe(0);
    expect(vazio.porMaterial).toEqual([]);
  });
});

describe("agruparPorPorte", () => {
  it("ordena P → M → G, como a parede desenha", () => {
    const r = resumirMaquinas(
      [maq({ id: "g", nome: "Laser G1", porte: "G", ordem: 3 }),
       maq({ id: "p", nome: "Laser P1", porte: "P", ordem: 1 }),
       maq({ id: "m", nome: "Laser M1", porte: "M", ordem: 2 })],
      [], AGORA,
    );
    expect(agruparPorPorte(r.maquinas).map((g) => g.porte)).toEqual(["P", "M", "G"]);
  });
});
