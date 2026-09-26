/**
 * Nem todo login é de funcionário.
 *
 * O RH lista a partir de `profiles`, que é a tabela de quem ENTRA no sistema.
 * Sócio de operação parceira e conta de serviço entram pelo mesmo motivo que um
 * funcionário — precisam abrir alguma tela — e não têm ficha, banco de horas
 * nem atestado. Contá-los faz "Equipe: 12" mentir.
 *
 * Este teste guarda a LISTA e o critério. O que ele impede, na prática: alguém
 * trocar o casamento por NOME (que muda, e cujo "contém" pega homônimo) ou
 * incluir por engano quem de fato trabalha aqui.
 */
import { describe, it, expect } from "vitest";
import { NAO_COLABORADORES, ehColaborador } from "../rh/nao-colaboradores";

describe("RH — quem entra na lista de colaboradores", () => {
  it("quem trabalha aqui entra", () => {
    for (const u of ["caio", "douglas", "douglasfranco", "maria", "joao"]) {
      expect(ehColaborador(u), `${u} devia contar como colaborador`).toBe(true);
    }
  });

  it("quem só usa o sistema fica de fora", () => {
    // Neiva é usuária do sistema e dona do mercadinho — não é funcionária.
    expect(ehColaborador("neiva")).toBe(false);
    // `acesso.dev` é a conta de teste do ERP: não tem admissão nem bate ponto.
    expect(ehColaborador("acesso.dev")).toBe(false);
  });

  it("o corte é por USERNAME inteiro, não por pedaço do nome", () => {
    // "contém" pegaria um homônimo por acidente: quem se chamasse
    // "neivaldo" sumiria da equipe sem ninguém entender por quê.
    expect(ehColaborador("neivaldo")).toBe(true);
    expect(ehColaborador("neiva.souza")).toBe(true);
  });

  it("caixa e espaço não decidem quem é funcionário", () => {
    expect(ehColaborador("NEIVA")).toBe(false);
    expect(ehColaborador("  Neiva  ")).toBe(false);
  });

  it("conta sem username não vira colaborador por omissão", () => {
    for (const v of [null, undefined, "", "   "]) {
      expect(ehColaborador(v)).toBe(false);
    }
  });

  it("a lista é curta e explícita — crescer sem querer é o risco", () => {
    expect(NAO_COLABORADORES).toEqual(["neiva", "acesso.dev"]);
  });

  it("o Douglas NÃO está na lista (é sócio e conta como colaborador)", () => {
    // Decisão escrita do dono, e o tipo de coisa que se desfaz sozinha num
    // "deixa eu tirar os não-funcionários" apressado.
    expect(NAO_COLABORADORES).not.toContain("douglas");
  });
});
