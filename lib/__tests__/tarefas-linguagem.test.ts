import { describe, it, expect } from "vitest";
import { entender } from "../tarefas-linguagem";

// Quarta-feira, 06/08/2026, 09:00 em São Paulo (12:00 UTC).
const AGORA = new Date("2026-08-06T12:00:00.000Z");
const dia = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(0, 10) : null);
const hora = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(11, 16) : null);

describe("entender: o caminho comum", () => {
  it("a frase inteira vira tarefa completa numa interação", () => {
    const e = entender("Ligar pro fornecedor amanhã às 14h !urgente #compras", AGORA);
    expect(e.titulo).toBe("Ligar pro fornecedor");
    expect(dia(e.prazo)).toBe("2026-08-07");
    expect(hora(e.prazo)).toBe("14:00");
    expect(e.prioridade).toBe("urgente");
    expect(e.lista).toBe("compras");
  });

  it("o que virou campo sai do título", () => {
    const e = entender("Revisar contrato hoje @juridico @urgente2", AGORA);
    expect(e.titulo).toBe("Revisar contrato");
    expect(e.tags).toEqual(["juridico", "urgente2"]);
  });

  it("mostra o que entendeu, trecho por trecho", () => {
    const e = entender("Pagar boleto 20/08 !alta", AGORA);
    expect(e.marcas.map((m) => m.campo).sort()).toEqual(["prazo", "prioridade"]);
  });
});

describe("entender: datas", () => {
  it.each([
    ["hoje", "2026-08-06"], ["hj", "2026-08-06"],
    ["amanhã", "2026-08-07"], ["amanha", "2026-08-07"],
    ["depois de amanhã", "2026-08-08"],
    ["em 3 dias", "2026-08-09"], ["em 2 semanas", "2026-08-20"],
    ["20/08", "2026-08-20"], ["20/8/26", "2026-08-20"],
  ])("%s → %s", (txt, esperado) => {
    expect(dia(entender(`Fazer algo ${txt}`, AGORA).prazo)).toBe(esperado);
  });

  it("dia da semana pega o próximo — hoje nunca conta", () => {
    // AGORA é quarta. "quarta" tem que ser a da semana que vem, não hoje.
    expect(dia(entender("Reunião quarta", AGORA).prazo)).toBe("2026-08-12");
    expect(dia(entender("Reunião sexta", AGORA).prazo)).toBe("2026-08-07");
    expect(dia(entender("Reunião terça", AGORA).prazo)).toBe("2026-08-11");
    expect(dia(entender("Reunião próxima segunda", AGORA).prazo)).toBe("2026-08-10");
  });

  it("data sem ano que já passou é do ano que vem — ninguém agenda pro passado", () => {
    expect(dia(entender("Renovar 10/02", AGORA).prazo)).toBe("2027-02-10");
  });

  it("só a hora: hoje se ainda vem, amanhã se já passou", () => {
    expect(dia(entender("Ligar às 14h", AGORA).prazo)).toBe("2026-08-06");
    expect(dia(entender("Ligar às 8h", AGORA).prazo)).toBe("2026-08-07");
  });

  it("hora aceita as três grafias", () => {
    for (const t of ["às 14h30", "14:30", "as 14h30"]) {
      expect(hora(entender(`X amanhã ${t}`, AGORA).prazo)).toBe("14:30");
    }
  });
});

describe("entender: o que NÃO pode adivinhar", () => {
  // Esta é a regra que protege a confiança: um prazo errado em silêncio é pior
  // do que nenhum prazo, porque a pessoa não confere o que não pediu.
  it.each([
    "Ver o pedido 15",
    "Conferir nota 1234",
    "Comprar 3 caixas",
    "Ajustar margem para 20",
  ])("%s não ganha prazo", (frase) => {
    const e = entender(frase, AGORA);
    expect(e.prazo).toBeNull();
    expect(e.titulo).toBe(frase);
  });

  it("data impossível continua sendo título", () => {
    const e = entender("Conferir lote 45/99", AGORA);
    expect(e.prazo).toBeNull();
    expect(e.titulo).toBe("Conferir lote 45/99");
  });

  it("ponto de exclamação de frase não vira prioridade", () => {
    const e = entender("Consertar isso urgente!", AGORA);
    expect(e.prioridade).toBeNull();
    expect(e.titulo).toBe("Consertar isso urgente!");
  });

  it("frase sem nada reconhecível passa intacta", () => {
    const e = entender("Falar com o Bruno", AGORA);
    expect(e).toMatchObject({ titulo: "Falar com o Bruno", prazo: null, prioridade: null, lista: null, tags: [] });
    expect(e.marcas).toEqual([]);
  });

  it("nunca devolve título vazio, mesmo se a frase for só marcadores", () => {
    expect(entender("#compras", AGORA).titulo).toBe("#compras");
  });
});

describe("entender: prioridade", () => {
  it.each([["!urgente", "urgente"], ["!alta", "alta"], ["!baixa", "baixa"], ["!!!", "urgente"], ["!!", "alta"], ["!", "media"]])(
    "%s → %s", (txt, esperado) => {
      expect(entender(`Fazer ${txt}`, AGORA).prioridade).toBe(esperado);
    });
});
