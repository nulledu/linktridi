import { describe, expect, it } from "vitest";
import { empregadoParaTotem } from "../_device";
import type { MarketEmployee } from "../../../../../lib/tridimarket/types";

const pessoa = (p: Partial<MarketEmployee>): MarketEmployee => ({
  id: 1, profileId: "u1", companyId: 0, name: "Felipe", imageUrl: null, active: true,
  normalLimit: 500, overdraftLimit: 0, open: 0, cycleOpen: 0, previousOpen: 0, closedUntil: 0, currentMonth: 0,
  overdue: 0, available: 500, status: "good", lastPaymentAt: null, score: 0, scoreManual: false, ...p,
});

describe("o que o totem chama de 'em aberto'", () => {
  // O caso real: Felipe devia R$ 499,55 de agosto e o tablet escrevia
  // "Em aberto: R$ 499,55" bem em cima de "Disponível: R$ 500,00".
  it("mostra o gasto DO MÊS, não a dívida acumulada", () => {
    const dto = empregadoParaTotem(pessoa({ open: 499.55, cycleOpen: 0, previousOpen: 499.55, available: 500 }));
    expect(dto.open).toBe(0);
    expect(dto.available).toBe(500);
  });

  it("gasto do mês aparece e bate com o disponível", () => {
    const dto = empregadoParaTotem(pessoa({ open: 98.9, cycleOpen: 3.99, previousOpen: 94.91, available: 196.01 }));
    expect(dto.open).toBe(3.99);
    expect(dto.open + dto.available).toBe(200);   // = limite
  });

  it("a dívida acumulada continua viajando, só que noutro campo", () => {
    const dto = empregadoParaTotem(pessoa({ open: 98.9, cycleOpen: 3.99, previousOpen: 94.91 }));
    expect(dto.totalOpen).toBe(98.9);
    expect(dto.previousOpen).toBe(94.91);
  });
});
