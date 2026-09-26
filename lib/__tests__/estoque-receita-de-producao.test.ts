import { describe, it, expect } from "vitest";
import { tempoEstimadoMin, fraseDoTempo, normalizarReceita } from "../estoque-receita-de-producao";

/**
 * A receita da atividade de reposição: instrução + tempo por lote.
 *
 * O caso ditado pelo dono é a régua: "Montar 200 unidades de puxador de
 * carimbo → 2h". A atividade que repõe 340 não leva 2h — leva DOIS lotes.
 */

describe("tempo por lotes inteiros", () => {
  it("o caso ditado: 200 puxadores em 120min", () => {
    expect(tempoEstimadoMin(200, 120, 200)).toBe(120);
  });

  it("340 unidades são DOIS lotes — 240min, não interpolação", () => {
    // Monta-se o lote, não a fração dele: 204min fingiria uma precisão que a
    // bancada não tem.
    expect(tempoEstimadoMin(340, 120, 200)).toBe(240);
  });

  it("uma unidade a mais que o lote já é outro lote", () => {
    expect(tempoEstimadoMin(201, 120, 200)).toBe(240);
  });

  it("sem lote, o tempo é por unidade — a leitura natural de 'cada um leva N min'", () => {
    expect(tempoEstimadoMin(5, 15, null)).toBe(75);
    expect(tempoEstimadoMin(5, 15, 1)).toBe(75);
  });

  it("sem tempo cadastrado devolve null — atividade sem estimativa, como sempre foi", () => {
    expect(tempoEstimadoMin(10, null, 200)).toBeNull();
    expect(tempoEstimadoMin(10, 0, 200)).toBeNull();
  });

  it("quantidade zero não estima nada", () => {
    expect(tempoEstimadoMin(0, 120, 200)).toBeNull();
  });

  it("lixo não vira estimativa", () => {
    expect(tempoEstimadoMin(NaN, 120, 200)).toBeNull();
    expect(tempoEstimadoMin(10, NaN, 200)).toBeNull();
    expect(tempoEstimadoMin(10, 120, NaN)).toBe(1200); // lote lixo degrada pra "por unidade"
  });
});

describe("a frase da prévia", () => {
  it("horas e minutos como a bancada fala", () => {
    expect(fraseDoTempo(120)).toBe("≈ 2h");
    expect(fraseDoTempo(45)).toBe("≈ 45min");
    expect(fraseDoTempo(150)).toBe("≈ 2h30");
    expect(fraseDoTempo(65)).toBe("≈ 1h05");
  });

  it("sem tempo, sem frase", () => {
    expect(fraseDoTempo(null)).toBeNull();
    expect(fraseDoTempo(0)).toBeNull();
  });
});

describe("normalizar o que veio do formulário", () => {
  it("instrução vazia vira NULL — string vazia viraria bloco em branco na atividade", () => {
    expect(normalizarReceita({ instrucao: "   " }).instrucao).toBeNull();
    expect(normalizarReceita({ instrucao: "" }).instrucao).toBeNull();
  });

  it("instrução com conteúdo passa aparada e com teto", () => {
    expect(normalizarReceita({ instrucao: "  Cortar o feltro.  " }).instrucao).toBe("Cortar o feltro.");
    expect(normalizarReceita({ instrucao: "x".repeat(3000) }).instrucao).toHaveLength(2000);
  });

  it("lote sem tempo não significa nada; tempo sem lote significa por unidade", () => {
    expect(normalizarReceita({ loteDe: 200 })).toMatchObject({ instrucao: null, tempoMin: null, loteDe: null });
    expect(normalizarReceita({ tempoMin: 15 })).toMatchObject({ instrucao: null, tempoMin: 15, loteDe: null });
    expect(normalizarReceita({ tempoMin: 120, loteDe: 200 })).toMatchObject({ instrucao: null, tempoMin: 120, loteDe: 200 });
  });

  it("números tortos caem em null, nunca em NaN gravado", () => {
    expect(normalizarReceita({ tempoMin: "abc", loteDe: -5 })).toMatchObject({ instrucao: null, tempoMin: null, loteDe: null });
  });

  it("o destino: só 'maquina' exato desvia; qualquer lixo é manual", () => {
    // Lixo não pode desviar uma reposição pra fila de máquina — o padrão do
    // banco e o comportamento de sempre é o tablet.
    expect(normalizarReceita({}).tipo).toBe("manual");
    expect(normalizarReceita({ tipo: "MAQUINA" }).tipo).toBe("manual");
    expect(normalizarReceita({ tipo: "maquina" }).tipo).toBe("maquina");
  });

  it("máquina escolhida só sobrevive no tipo máquina", () => {
    // No manual ela seria um resto invisível que voltaria a valer se a pessoa
    // trocasse o tipo depois.
    expect(normalizarReceita({ tipo: "maquina", maquinaId: "m1" }).maquinaId).toBe("m1");
    expect(normalizarReceita({ tipo: "maquina", maquinaId: "  " }).maquinaId).toBeNull();
    expect(normalizarReceita({ tipo: "manual", maquinaId: "m1" }).maquinaId).toBeNull();
  });
});
