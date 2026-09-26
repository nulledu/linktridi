import { describe, it, expect } from "vitest";
import { canaisDaParede, CANAIS_PAREDE } from "../painel-tridify";

/**
 * Os canais da parede comercial (pedido do dono em 14/09/2026): só Yampi,
 * Carrinho Ab e WhatsApp, pela PLATAFORMA do pedido, somados em Hoje / Semana
 * (segunda→hoje) / Mês a partir da série plataforma×dia do snapshotVendas.
 */
describe("canaisDaParede", () => {
  // 14/09/2026 é segunda-feira: a semana começa hoje.
  const hoje = "2026-09-14";
  const linhas = [
    { d: "2026-09-01", plat: 6, valor: 1000, pedidos: 10 },
    { d: "2026-09-13", plat: 6, valor: 200, pedidos: 2 },   // domingo: semana passada
    { d: "2026-09-14", plat: 6, valor: 300.4, pedidos: 3 },
    { d: "2026-09-14", plat: 1, valor: 50, pedidos: 1 },
    { d: "2026-09-10", plat: 5, valor: 700, pedidos: 7 },
    { d: "2026-09-15", plat: 6, valor: 999, pedidos: 9 },   // dia futuro (UTC depois das 21h)
    { d: "2026-09-14", plat: 9, valor: 5000, pedidos: 50 }, // Mercado Livre: fora da parede
  ];

  it("só os três canais, na ordem e com os nomes do ERP", () => {
    expect(CANAIS_PAREDE.map((c) => c.plat)).toEqual([6, 1, 5]);
    expect(canaisDaParede(linhas, hoje).map((c) => c.nome)).toEqual(["Yampi", "Carrinho Ab", "WhatsApp"]);
  });

  it("soma hoje, semana e mês — sem dia futuro", () => {
    const [yampi, carrinho, whats] = canaisDaParede(linhas, hoje);
    expect(yampi.dia).toEqual({ valor: 300, pedidos: 3 });
    expect(yampi.semana).toEqual({ valor: 300, pedidos: 3 });
    expect(yampi.mes).toEqual({ valor: 1500, pedidos: 15 });
    expect(carrinho.dia).toEqual({ valor: 50, pedidos: 1 });
    expect(whats.dia).toEqual({ valor: 0, pedidos: 0 });
    expect(whats.mes).toEqual({ valor: 700, pedidos: 7 });
  });

  it("semana vai de segunda até hoje", () => {
    const [yampi] = canaisDaParede(linhas, "2026-09-13"); // domingo
    // semana de 07/09 (seg) a 13/09: só o dia 13
    expect(yampi.semana).toEqual({ valor: 200, pedidos: 2 });
  });
});
