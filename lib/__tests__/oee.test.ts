import { describe, it, expect } from "vitest";
import {
  calcularOEE, somarOEE, faixaDoOEE, minutosDeTurnoDecorridos, minutosDoRelogio,
  OEE_CLASSE_MUNDIAL,
} from "@/lib/oee";
import { montarMaquina, resumirMaquinas, type LinhaMaquina, type LinhaProgramacao } from "@/lib/painel-maquinas";

// O OEE é o número que a diretoria olha. Se ele mentir, mente pra sempre —
// ninguém confere fórmula de painel. Estas travas são a conferência.

const maquina = (over: Partial<LinhaMaquina> = {}): LinhaMaquina => ({
  id: "m1", nome: "Laser P1", porte: "P", materiais: null, ativa: true, ordem: 1,
  parada_motivo: null, parada_desde: null, parada_previsao: null,
  turno_inicio: "08:00", turno_fim: "18:00", parada_planejada: false,
  ...over,
});

const prog = (over: Partial<LinhaProgramacao> = {}): LinhaProgramacao => ({
  id: "p1", maquina_id: "m1", referencia: "Pedido #1", material: null,
  minutos_estimados: 60, posicao: 1, status: "concluida",
  iniciada_at: null, concluida_at: null, pecas: null, refugos: null,
  ...over,
});

/** 2026-08-31 (segunda), 12:00 em São Paulo = 15:00 UTC. */
const MEIO_DIA = new Date("2026-08-31T15:00:00.000Z");
const spISO = (hhmm: string) => `2026-08-31T${String(Number(hhmm.slice(0, 2)) + 3).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`;

describe("a fórmula", () => {
  it("é o PRODUTO dos três pilares, não a média — 90×95×99 dá 84,6%", () => {
    const r = calcularOEE({
      minutosPlanejados: 100, minutosOperando: 90,
      minutosPadraoProduzidos: 95, minutosRealProduzidos: 100,
      pecas: 100, refugos: 1,
    });
    expect(r.disponibilidade).toBe(90);
    expect(r.desempenho).toBe(95);
    expect(r.qualidade).toBe(99);
    expect(r.oee).toBeCloseTo(84.6, 1);
    // A referência de mercado quase não chega em classe mundial — é isso que
    // faz o indicador doer, e é isso que não pode ser suavizado.
    expect(r.oee).toBeLessThan(OEE_CLASSE_MUNDIAL);
  });

  it("estimativa generosa não vira desempenho acima de 100%", () => {
    const r = calcularOEE({
      minutosPlanejados: 60, minutosOperando: 60,
      minutosPadraoProduzidos: 120, minutosRealProduzidos: 60,
    });
    expect(r.desempenho).toBe(100);
    expect(r.oee).toBe(100);
  });

  it("turno que ainda não começou é 100%, nunca 0% — vermelho às 7h50 ensina a ignorar o painel", () => {
    const r = calcularOEE({ minutosPlanejados: 0, minutosOperando: 0, minutosPadraoProduzidos: 0, minutosRealProduzidos: 0 });
    expect(r.disponibilidade).toBe(100);
    expect(r.oee).toBe(100);
  });

  it("sem apontamento de peça a qualidade entra como 100% MAS marcada como não medida", () => {
    const r = calcularOEE({ minutosPlanejados: 60, minutosOperando: 60, minutosPadraoProduzidos: 60, minutosRealProduzidos: 60 });
    expect(r.qualidade).toBe(100);
    expect(r.qualidadeApontada).toBe(false);
  });

  it("parada planejada sai do tempo planejado, quebra não", () => {
    const base = { minutosOperando: 60, minutosPadraoProduzidos: 60, minutosRealProduzidos: 60 };
    const quebra = calcularOEE({ ...base, minutosPlanejados: 120 });
    const preventiva = calcularOEE({ ...base, minutosPlanejados: 120, minutosParadaPlanejada: 60 });
    expect(quebra.disponibilidade).toBe(50);
    expect(preventiva.disponibilidade).toBe(100);
  });

  it("refugo maior que o total não faz qualidade negativa", () => {
    const r = calcularOEE({ minutosPlanejados: 60, minutosOperando: 60, minutosPadraoProduzidos: 60, minutosRealProduzidos: 60, pecas: 10, refugos: 99 });
    expect(r.qualidade).toBe(0);
    expect(r.oee).toBe(0);
  });

  it("faixa: 85% é classe mundial", () => {
    expect(faixaDoOEE(85)).toBe("mundial");
    expect(faixaDoOEE(84.9)).toBe("bom");
    expect(faixaDoOEE(41)).toBe("aceitavel");
    expect(faixaDoOEE(12)).toBe("baixo");
  });
});

describe("o OEE do setor", () => {
  it("é a conta refeita sobre a soma dos tempos, não a média dos OEEs", () => {
    // Uma máquina rodou o turno inteiro; a outra ligou 10min no fim do dia e
    // ficou perfeita. A média diria ~75%; a verdade do setor é ~51%.
    const grande = { minutosPlanejados: 480, minutosOperando: 240, minutosPadraoProduzidos: 240, minutosRealProduzidos: 240 };
    const pequena = { minutosPlanejados: 10, minutosOperando: 10, minutosPadraoProduzidos: 10, minutosRealProduzidos: 10 };
    const soma = somarOEE([grande, pequena]);
    const media = (calcularOEE(grande).oee + calcularOEE(pequena).oee) / 2;
    expect(soma.oee).toBeCloseTo(51, 0);
    expect(media).toBeCloseTo(75, 0);
  });
});

describe("a janela de turno", () => {
  it("conta só o turno JÁ decorrido — às 10h a máquina não deve 8h de corte", () => {
    expect(minutosDeTurnoDecorridos(10 * 60, 8 * 60, 18 * 60)).toBe(120);
    expect(minutosDeTurnoDecorridos(7 * 60, 8 * 60, 18 * 60)).toBe(0);
    expect(minutosDeTurnoDecorridos(23 * 60, 8 * 60, 18 * 60)).toBe(600);
  });

  it("turno que vira o dia conta as duas pontas", () => {
    expect(minutosDeTurnoDecorridos(2 * 60, 22 * 60, 6 * 60)).toBe(120 + 120);
  });

  it("relógio torto ou ausente cai no padrão", () => {
    expect(minutosDoRelogio("08:30:00", 0)).toBe(510);
    expect(minutosDoRelogio(null, 480)).toBe(480);
    expect(minutosDoRelogio("99:99", 480)).toBe(480);
  });
});

describe("a máquina do painel", () => {
  it("mede desempenho comparando a estimativa com o tempo real da peça fechada", () => {
    // Estimou 60min, levou 120: metade do ritmo.
    const m = montarMaquina(maquina(), [
      prog({ iniciada_at: spISO("09:00"), concluida_at: spISO("11:00"), minutos_estimados: 60 }),
    ], MEIO_DIA);
    expect(m.oee.desempenho).toBe(50);
    // Turno decorrido: 08:00→12:00 = 240min; rodou 120 = 50% de disponibilidade.
    expect(m.oee.disponibilidade).toBe(50);
    expect(m.oee.oee).toBe(25);
  });

  it("peça fechada sem 'em andamento' não vira 100% de ritmo", () => {
    const m = montarMaquina(maquina(), [
      prog({ iniciada_at: null, concluida_at: spISO("11:00"), minutos_estimados: 60 }),
    ], MEIO_DIA);
    // Sem os dois carimbos o real É a estimativa: ficaria fora do desempenho.
    expect(m.oee.desempenho).toBe(100);
    expect(m.oee.disponibilidade).toBe(25);
  });

  it("apontamento de peças alimenta a qualidade", () => {
    const m = montarMaquina(maquina(), [
      prog({ iniciada_at: spISO("08:00"), concluida_at: spISO("12:00"), minutos_estimados: 240, pecas: 100, refugos: 5 }),
    ], MEIO_DIA);
    expect(m.oee.qualidadeApontada).toBe(true);
    expect(m.oee.qualidade).toBe(95);
    expect(m.oee.oee).toBe(95);
  });

  it("sem as colunas do SQL do OEE a conta continua de pé (turno padrão, sem apontamento)", () => {
    const crua = maquina({ turno_inicio: undefined, turno_fim: undefined, parada_planejada: undefined });
    const m = montarMaquina(crua, [
      prog({ iniciada_at: spISO("08:00"), concluida_at: spISO("10:00"), minutos_estimados: 120 }),
    ], MEIO_DIA);
    expect(m.oee.disponibilidade).toBe(50);
    expect(m.oee.qualidadeApontada).toBe(false);
  });

  it("o resumo traz o OEE do setor", () => {
    const r = resumirMaquinas(
      [maquina(), maquina({ id: "m2", nome: "Laser P2" })],
      [prog({ maquina_id: "m1", iniciada_at: spISO("08:00"), concluida_at: spISO("12:00"), minutos_estimados: 240 })],
      MEIO_DIA,
    );
    // Uma rodou o turno inteiro, a outra ficou parada: 240 de 480 planejados.
    expect(r.oee.disponibilidade).toBe(50);
    expect(r.maquinas[0].oee.disponibilidade).toBe(100);
    expect(r.maquinas[1].oee.disponibilidade).toBe(0);
  });
});
