import { describe, it, expect } from "vitest";
import { recortesDaSerie } from "@/lib/painel-tridify";

/**
 * O faturamento do DIA e da SEMANA na parede.
 *
 * O painel tirava esses números de outra consulta (soma de `preco_total` dos
 * pedidos do ERP) enquanto o mês vinha do Tridify. Duas réguas na mesma tela:
 * o card do dia contava marketplace e perdia a venda lançada pela vendedora, o
 * do mês não. Agora os três saem da MESMA série diária — e é isto que este
 * teste trava, porque ninguém audita um "faturamento de hoje" numa TV.
 */
describe("recortes da série da empresa", () => {
  // Quarta-feira 2026-08-05. A semana começa na segunda, 2026-08-03 — mesmo
  // começo de semana do ERP (`startOf("weekly")`).
  const serie = [
    { d: "2026-08-01", empresa: 1000 },   // sábado, semana passada
    { d: "2026-08-02", empresa: 2000 },   // domingo, semana passada
    { d: "2026-08-03", empresa: 300 },    // segunda — entra
    { d: "2026-08-04", empresa: 400 },    // terça — entra
    { d: "2026-08-05", empresa: 500 },    // hoje
    { d: "2026-08-06", empresa: 900 },    // amanhã: não pode entrar
  ];

  it("o dia é só o dia", () => {
    expect(recortesDaSerie(serie, "2026-08-05").dia).toBe(500);
  });

  it("a semana vai da segunda até hoje, sem o fim de semana anterior", () => {
    expect(recortesDaSerie(serie, "2026-08-05").semana).toBe(300 + 400 + 500);
  });

  it("dia futuro na série não entra em nada", () => {
    const r = recortesDaSerie(serie, "2026-08-05");
    expect(r.semana).toBeLessThan(300 + 400 + 500 + 900);
  });

  it("na segunda-feira, semana = dia", () => {
    const r = recortesDaSerie(serie, "2026-08-03");
    expect(r.dia).toBe(300);
    expect(r.semana).toBe(300);
  });

  it("no domingo a semana ainda é a que começou na segunda", () => {
    // 2026-08-09 é domingo: a semana é 03→09, não recomeça nele.
    const s = [...serie, { d: "2026-08-09", empresa: 100 }];
    expect(recortesDaSerie(s, "2026-08-09").semana).toBe(300 + 400 + 500 + 900 + 100);
  });

  it("semana que atravessa a virada do mês continua inteira", () => {
    // 2026-09-02 é quarta; a segunda foi 2026-08-31.
    const s = [
      { d: "2026-08-31", empresa: 70 },
      { d: "2026-09-01", empresa: 20 },
      { d: "2026-09-02", empresa: 10 },
    ];
    expect(recortesDaSerie(s, "2026-09-02").semana).toBe(100);
  });

  it("dia sem venda é zero, não é o dia anterior", () => {
    expect(recortesDaSerie(serie, "2026-08-07").dia).toBe(0);
  });
});
