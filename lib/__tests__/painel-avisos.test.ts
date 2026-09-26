import { describe, expect, it } from "vitest";
import { avisoQueAssume, avisosValidos } from "../painel-avisos";
import type { AvisoInput } from "../config-schema";

const base: AvisoInput = {
  id: "a1",
  titulo: "",
  texto: "Reunião geral às 15h",
  ativo: true,
  tom: "aviso",
  de: null,
  ate: null,
  perfis: [],
  assumeTela: false,
};

describe("avisosValidos", () => {
  it("mostra o aviso sem prazo em qualquer parede", () => {
    expect(avisosValidos([base], "p-comercial", "2026-08-29")).toHaveLength(1);
    expect(avisosValidos([base], null, "2026-08-29")).toHaveLength(1);
  });

  it("não mostra aviso desligado nem aviso sem texto", () => {
    expect(avisosValidos([{ ...base, ativo: false }], "p-comercial", "2026-08-29")).toHaveLength(0);
    expect(avisosValidos([{ ...base, texto: "   " }], "p-comercial", "2026-08-29")).toHaveLength(0);
  });

  /*
   * O prazo é o que impede o aviso de virar paisagem. Estes três casos são a
   * regra inteira: antes de começar não aparece, no último dia AINDA aparece
   * (quem escreve "até dia 30" espera que valha o dia 30 todo), e depois some
   * sozinho sem ninguém ir até a TV.
   */
  it("respeita o começo e o fim, incluindo o último dia", () => {
    const comPrazo = { ...base, de: "2026-08-28", ate: "2026-08-30" };
    expect(avisosValidos([comPrazo], null, "2026-08-27")).toHaveLength(0);
    expect(avisosValidos([comPrazo], null, "2026-08-28")).toHaveLength(1);
    expect(avisosValidos([comPrazo], null, "2026-08-30")).toHaveLength(1);
    expect(avisosValidos([comPrazo], null, "2026-08-31")).toHaveLength(0);
  });

  it("compara datas como texto — a virada do mês e do ano não confunde", () => {
    const virada = { ...base, de: "2026-12-31", ate: "2027-01-02" };
    expect(avisosValidos([virada], null, "2026-12-30")).toHaveLength(0);
    expect(avisosValidos([virada], null, "2027-01-01")).toHaveLength(1);
    expect(avisosValidos([virada], null, "2027-01-03")).toHaveLength(0);
  });

  it("filtra por perfil, e sem perfil só passa o que vale para todas", () => {
    const daDoca = { ...base, perfis: ["p-logistica"] };
    expect(avisosValidos([daDoca], "p-logistica", "2026-08-29")).toHaveLength(1);
    expect(avisosValidos([daDoca], "p-comercial", "2026-08-29")).toHaveLength(0);
    // TV sem perfil escolhido: não dá para saber se ela é a doca.
    expect(avisosValidos([daDoca], null, "2026-08-29")).toHaveLength(0);
  });

  it("casa o perfil sem depender de maiúscula", () => {
    const daDoca = { ...base, perfis: ["P-Logistica"] };
    expect(avisosValidos([daDoca], "p-logistica", "2026-08-29")).toHaveLength(1);
  });

  it("lista vazia, nula ou indefinida não quebra", () => {
    expect(avisosValidos([], "p-comercial", "2026-08-29")).toEqual([]);
    expect(avisosValidos(null, "p-comercial", "2026-08-29")).toEqual([]);
    expect(avisosValidos(undefined, "p-comercial", "2026-08-29")).toEqual([]);
  });
});

describe("avisoQueAssume", () => {
  it("devolve nulo quando nenhum aviso pede a tela", () => {
    expect(avisoQueAssume([base])).toBeNull();
  });

  it("com dois pedindo a tela, ganha o primeiro — dois não seriam lidos", () => {
    const a = { ...base, id: "a", assumeTela: true, texto: "Primeiro" };
    const b = { ...base, id: "b", assumeTela: true, texto: "Segundo" };
    expect(avisoQueAssume([a, b])?.id).toBe("a");
  });
});
