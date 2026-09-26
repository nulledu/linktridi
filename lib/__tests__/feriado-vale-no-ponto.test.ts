/**
 * Qual feriado do Calendário passa a valer no Ponto.
 *
 * O buraco: 7 de Setembro estava no calendário do RH e virava FALTA no banco
 * de horas, porque o cálculo só enxergava `ponto_feriados` — marcação manual.
 *
 * A regra escolhida (17/09/2026) é "automático com janela de revisão", e ela
 * tem dois lados que precisam ser travados juntos: o nacional entra sozinho
 * (ninguém confirma Natal todo ano) e o FACULTATIVO não entra (Carnaval é
 * decisão de empresa, e ligar isso sozinho daria folga geral sem ninguém pedir).
 */
import { describe, it, expect } from "vitest";
import {
  entraSozinho, fundirFeriadosDoPonto, statusNoPonto, SELO_STATUS_PONTO, STATUS_NO_PONTO,
  type DecisaoFeriado,
} from "../jornada/feriados-regra";
import { ICONS } from "../../app/(plataforma)/Icon";
import type { FeriadoRh } from "../rh/calendario/tipos";

const f = (dia: string, nome: string, esfera: FeriadoRh["esfera"], facultativo = false): FeriadoRh =>
  ({ dia, nome, esfera, origem: "base", ...(facultativo ? { facultativo: true } : {}) });

const decisao = (dia: string, vale: boolean, tipo: "folga" | "troca" = "folga"): DecisaoFeriado =>
  ({ dia, vale, tipo, decididoPor: "Caio", decididoEm: "2026-09-17T12:00:00Z" });

const NATAL = f("2026-12-25", "Natal", "nacional");
const CARNAVAL = f("2026-02-17", "Carnaval", "nacional", true);
const SP = f("2026-07-09", "Revolução de 1932", "estadual");
const CIDADE = f("2026-10-10", "Aniversário da cidade", "municipal");

describe("o que entra sozinho", () => {
  it("nacional não-facultativo vale sem ninguém confirmar", () => {
    expect(entraSozinho(NATAL)).toBe(true);
    expect(statusNoPonto(NATAL)).toBe("vale");
  });

  it("facultativo NÃO entra sozinho — é dia normal até o RH decidir", () => {
    expect(entraSozinho(CARNAVAL)).toBe(false);
    expect(statusNoPonto(CARNAVAL)).toBe("pendente");
  });

  it("estadual e municipal esperam decisão", () => {
    expect(statusNoPonto(SP)).toBe("pendente");
    expect(statusNoPonto(CIDADE)).toBe("pendente");
  });

  it("a decisão do RH vence a regra automática, nos dois sentidos", () => {
    expect(statusNoPonto(NATAL, decisao(NATAL.dia, false))).toBe("nao_vale");
    expect(statusNoPonto(CARNAVAL, decisao(CARNAVAL.dia, true))).toBe("vale");
  });
});

describe("a fusão com o ponto_feriados legado", () => {
  it("o mapa do cálculo leva só o que vale, com o tipo certo", () => {
    const r = fundirFeriadosDoPonto([NATAL, CARNAVAL, SP], [decisao(SP.dia, true, "troca")], []);
    expect([...r.mapa.keys()].sort()).toEqual([SP.dia, NATAL.dia].sort());
    expect(r.mapa.get(NATAL.dia)).toBe("folga");
    expect(r.mapa.get(SP.dia)).toBe("troca");
    expect(r.mapa.has(CARNAVAL.dia)).toBe(false);
  });

  it("os pendentes saem separados, pra tela cobrar a decisão", () => {
    const r = fundirFeriadosDoPonto([NATAL, CARNAVAL, SP, CIDADE], [], []);
    expect(r.pendentes.map((x) => x.dia).sort()).toEqual([CARNAVAL.dia, SP.dia, CIDADE.dia].sort());
    expect(r.lista).toHaveLength(4);
  });

  it("o que já estava marcado à mão no Ponto continua valendo, sem re-perguntar", () => {
    const r = fundirFeriadosDoPonto([SP], [], [{ dia: SP.dia, descricao: "Revolução", tipo: "folga" }]);
    expect(r.mapa.get(SP.dia)).toBe("folga");
    expect(r.pendentes).toHaveLength(0);
    expect(r.lista[0].decidido).toBe(true);
  });

  it("o legado carrega o tipo TROCA da empresa", () => {
    const r = fundirFeriadosDoPonto([SP], [], [{ dia: SP.dia, descricao: null, tipo: "troca" }]);
    expect(r.mapa.get(SP.dia)).toBe("troca");
  });

  it("decisão explícita vence o legado", () => {
    const r = fundirFeriadosDoPonto([SP], [decisao(SP.dia, false)], [{ dia: SP.dia, descricao: null, tipo: "folga" }]);
    expect(r.mapa.has(SP.dia)).toBe(false);
  });

  it("fechamento próprio da empresa (só no Ponto) entra no mapa mesmo assim", () => {
    const r = fundirFeriadosDoPonto([NATAL], [], [{ dia: "2026-12-24", descricao: "Emenda", tipo: "folga" }]);
    expect(r.mapa.get("2026-12-24")).toBe("folga");
    expect(r.mapa.get(NATAL.dia)).toBe("folga");
  });

  it("o detalhe acompanha o dia — a tela mostra o nome, não só 'feriado'", () => {
    const r = fundirFeriadosDoPonto([NATAL], [], []);
    expect(r.detalhe.get(NATAL.dia)).toEqual({ nome: "Natal", esfera: "nacional" });
  });

  it("dois feriados no mesmo dia não duplicam o mapa", () => {
    const outro = f(NATAL.dia, "Outro nome", "municipal");
    const r = fundirFeriadosDoPonto([NATAL, outro], [decisao(outro.dia, true)], []);
    expect(r.mapa.size).toBe(1);
  });
});

describe("os selos", () => {
  it("todo status tem selo, e todo ícone existe no Tabler do projeto", () => {
    for (const s of STATUS_NO_PONTO) {
      expect(SELO_STATUS_PONTO[s]?.label, s).toBeTruthy();
      expect(ICONS[SELO_STATUS_PONTO[s].icone], `${s} → ${SELO_STATUS_PONTO[s].icone}`).toBeTruthy();
    }
  });
});
