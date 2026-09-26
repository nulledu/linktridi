import { describe, expect, it } from "vitest";
import { montarVisaoLogistica, DIAS_ATRASO } from "@/lib/logistica-visao";
import { SNAP_LOGISTICA_PROVA } from "@/app/dev-mobile/prova-logistica";

describe("Logística — a conta do painel", () => {
  const v = montarVisaoLogistica(SNAP_LOGISTICA_PROVA, new Date(SNAP_LOGISTICA_PROVA.updatedAt));

  it("números do topo saem do ERP, com 'antes' só onde o ERP dá", () => {
    expect(v.separacao).toEqual({ valor: 48, ontem: 43 });
    expect(v.prontos).toEqual({ valor: 32, ontem: 25 });
    expect(v.enviados.valor).toBe(21);
    expect(v.enviados.ontem).toBe(18); // penúltimo ponto da série
  });

  it(`atrasado é quem está na fila há ${DIAS_ATRASO}+ dias`, () => {
    expect(v.atrasados).toBe(4); // 9, 6, 5, 7
    expect(v.idade.faixas.reduce((a, f) => a + f.valor, 0)).toBe(v.totalPedidos);
    expect(v.idade.maisAntigo).toBe(9);
  });

  it("o que trava conta pendência por pedido, maior primeiro", () => {
    expect(v.travas[0]).toEqual({ rotulo: "Carimbo", valor: 2 });
    expect(v.travas.at(-1)?.rotulo).toBe("Outros");
  });

  it("próximas expedições: prontos antes, depois urgentes; fila pelos mais antigos", () => {
    expect(v.proximos.every((l, i, a) => i === 0 || Number(a[i - 1].pedido.pronto) >= Number(l.pedido.pronto))).toBe(true);
    expect(v.proximos.length).toBeLessThanOrEqual(4);
    expect(v.fila[0].pedido.dias).toBe(9);
  });

  it("alertas começam pelo grave e somem quando não há o que avisar", () => {
    expect(v.alertas[0].tom).toBe("perigo");
    const limpo = montarVisaoLogistica({ ...SNAP_LOGISTICA_PROVA, entradaPedidos: [], logisticaPedidos: [] });
    expect(limpo.alertas).toEqual([]);
    expect(limpo.idade.mediaDias).toBeNull();
  });
});
