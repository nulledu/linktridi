import { describe, it, expect } from "vitest";
import { classificarDia } from "../ponto";

// O tablet só manda "fulano bateu agora" — quem decide o TIPO é `classificarDia`.
// E o painel do gestor lê justamente o tipo da última batida pra dizer se a
// pessoa está presente, em almoço ou já saiu.
//
// O bug: qualquer segunda batida entre 11h e 13h virava "almoço". No sábado
// (meia jornada, ninguém almoça e volta) o mercadinho inteiro terminava o dia
// marcado como "Em almoço", esperando uma volta que não vinha.

// "HH:MM" de São Paulo (UTC-3) → ISO UTC.
const bat = (dia: string, hhmm: string): string => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10), h + 3, m)).toISOString();
};

const SABADO = "2026-08-08";
const QUARTA = "2026-08-05";
const DOMINGO = "2026-08-09";

describe("classificarDia — a última batida do dia só é almoço se ainda falta jornada", () => {
  it("sábado de 4h: entrou 07:30, bateu 11:30 → SAÍDA (não almoço)", () => {
    const t = classificarDia([bat(SABADO, "07:30"), bat(SABADO, "11:30")], { jornadaDiaMin: 240, almocoInicio: "12:00" });
    expect(t).toEqual(["entrada", "saida"]);
  });

  it("sábado sem jornada cadastrada também não tem almoço", () => {
    const t = classificarDia([bat(SABADO, "08:00"), bat(SABADO, "12:10")]);
    expect(t).toEqual(["entrada", "saida"]);
  });

  it("dia útil de 8h: entrou 08:00, bateu 12:00 → ALMOÇO (ainda falta meia jornada)", () => {
    const t = classificarDia([bat(QUARTA, "08:00"), bat(QUARTA, "12:00")], { jornadaDiaMin: 480, almocoInicio: "12:00" });
    expect(t).toEqual(["entrada", "almoco"]);
  });

  it("dia útil: com a volta batida, o dia fica entrada/almoço/retorno/saída", () => {
    const t = classificarDia(
      [bat(QUARTA, "08:00"), bat(QUARTA, "12:00"), bat(QUARTA, "13:00"), bat(QUARTA, "18:00")],
      { jornadaDiaMin: 480, almocoInicio: "12:00" },
    );
    expect(t).toEqual(["entrada", "almoco", "retorno", "saida"]);
  });

  // Quem já cumpriu a jornada não vai voltar do "almoço" — mesmo batendo 12h30.
  it("dia útil já cumprido: entrou 04:00 e bateu 12:30 → saída", () => {
    const t = classificarDia([bat(QUARTA, "04:00"), bat(QUARTA, "12:30")], { jornadaDiaMin: 480, almocoInicio: "12:00" });
    expect(t).toEqual(["entrada", "saida"]);
  });

  it("domingo e feriado (jornada 0) não têm almoço: a segunda batida é saída", () => {
    expect(classificarDia([bat(DOMINGO, "08:00"), bat(DOMINGO, "12:00")], { jornadaDiaMin: 0 }))
      .toEqual(["entrada", "saida"]);
    expect(classificarDia([bat(QUARTA, "08:00"), bat(QUARTA, "11:40")], { jornadaDiaMin: 0 }))
      .toEqual(["entrada", "saida"]);
  });

  it("almoço fora do meio-dia: turno que almoça 14:00 fecha às 14:05 como almoço", () => {
    const t = classificarDia([bat(QUARTA, "10:00"), bat(QUARTA, "14:05")], { jornadaDiaMin: 480, almocoInicio: "14:00" });
    expect(t).toEqual(["entrada", "almoco"]);
  });

  it("batida extra no meio do dia entra como intervalo, e reabrir nunca é saída", () => {
    const t = classificarDia(
      [bat(QUARTA, "08:00"), bat(QUARTA, "12:00"), bat(QUARTA, "13:00"), bat(QUARTA, "15:00"), bat(QUARTA, "15:20"), bat(QUARTA, "18:00")],
      { jornadaDiaMin: 480, almocoInicio: "12:00" },
    );
    expect(t).toEqual(["entrada", "almoco", "retorno", "intervalo_inicio", "retorno", "saida"]);
  });

  it("sem contexto nenhum, dia útil continua se comportando como antes", () => {
    expect(classificarDia([bat(QUARTA, "08:00"), bat(QUARTA, "12:00")])).toEqual(["entrada", "almoco"]);
    expect(classificarDia([])).toEqual([]);
    expect(classificarDia([bat(QUARTA, "08:00")])).toEqual(["entrada"]);
  });
});
