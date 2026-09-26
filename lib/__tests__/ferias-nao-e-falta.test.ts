/**
 * Férias e atestado no banco de horas.
 *
 * O defeito que este teste existe pra impedir de voltar: `rh_ferias` existia
 * desde o módulo de RH e NINGUÉM no Ponto a lia. Trinta dias de férias viravam
 * trinta FALTAS e ~240h de dívida — e a dívida comia o crédito real da pessoa
 * nos meses seguintes, então o estrago não ficava no mês das férias.
 *
 * Três coisas travadas aqui, e as três já erraram:
 *   1. o dia não deve jornada (saldo 0, não −480);
 *   2. o dia não se CHAMA falta (o painel lia a classe, não o saldo);
 *   3. quem trabalha durante o afastamento ainda ganha a hora.
 */
import { describe, it, expect } from "vitest";
import { calcBanco } from "../banco-horas";
import type { PontoRegistro } from "../ponto";
import type { Afastamento } from "../jornada/tipos";

const MES = "2026-09";
const HOJE = "2026-09-30";
const SEM_FERIADO = new Set<string>();
const PESSOA = {
  id: "p1", nome: "Ana", fotoUrl: null, colaboradorId: "col-1",
  jornadaMin: 480, entradaPrevista: "08:00", saidaPrevista: "17:00",
  trabalhaSabado: false, sabadoMin: null,
};

const bat = (dia: string, hhmm: string, i: number): PontoRegistro => {
  const [h, m] = hhmm.split(":").map(Number);
  const iso = new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10), h + 3, m)).toISOString();
  return { id: `r${i}`, pessoaId: "p1", tipo: "entrada", batidoEm: iso, selfieUrl: null, confianca: null, origem: "tablet" };
};

const ferias = (de: string, ate: string): Afastamento =>
  ({ tipo: "ferias", de, ate, id: "f1", situacao: "Em gozo" });
const atestado = (de: string, ate: string): Afastamento =>
  ({ tipo: "atestado", de, ate, id: "a1", situacao: "Aceito" });

const banco = (afastamentos: Afastamento[], regs: PontoRegistro[] = []) =>
  calcBanco(PESSOA, regs, MES, HOJE, SEM_FERIADO, [], 480, [], "23:59", [], { afastamentos });

/** O placar BRUTO de setembro. O ledger corre desde o início do banco (julho),
 *  então o total dele carrega dívida de outros meses — medir o total aqui é
 *  medir a coisa errada. */
const devidoEmSetembro = (b: ReturnType<typeof calcBanco>) =>
  b.ledger.meses.find((m) => m.mes === MES)?.devidoMin ?? -1;

describe("férias", () => {
  it("o mês inteiro de férias não deve NENHUM minuto e não tem falta", () => {
    const b = banco([ferias("2026-09-01", "2026-09-30")]);
    expect(b.metaMin).toBe(0);
    expect(b.saldoMesMin).toBe(0);
    expect(b.faltas).toBe(0);
    expect(devidoEmSetembro(b)).toBe(0);
    expect(b.ledger.faltasNaoJustificadas.filter((f) => f.dia.startsWith(MES))).toHaveLength(0);
  });

  it("antes da correção o mesmo mês era ~176h de dívida — a regressão fica visível", () => {
    const semAfastamento = calcBanco(PESSOA, [], MES, HOJE, SEM_FERIADO, [], 480, [], "23:59", []);
    expect(devidoEmSetembro(semAfastamento)).toBe(22 * 480);   // 176h
    expect(devidoEmSetembro(banco([ferias("2026-09-01", "2026-09-30")]))).toBe(0);
  });

  it("o dia se CHAMA férias — o painel lê a classe, não o saldo", () => {
    const b = banco([ferias("2026-09-07", "2026-09-11")]);
    const dias = b.dias.filter((d) => d.dia >= "2026-09-07" && d.dia <= "2026-09-11");
    expect(dias.map((d) => d.classe)).toEqual(["ferias", "ferias", "ferias", "ferias", "ferias"]);
    expect(dias.every((d) => d.semJornada === "ferias")).toBe(true);
  });

  it("só o período afastado muda: o resto do mês continua devendo normalmente", () => {
    const b = banco([ferias("2026-09-07", "2026-09-11")]);
    // 2026-09 tem 22 dias úteis; 5 viraram férias, sobram 17 × 8h.
    expect(b.metaMin).toBe(17 * 480);
    expect(b.dias.find((d) => d.dia === "2026-09-14")?.classe).toBe("falta");
  });

  it("quem é chamado a trabalhar durante as férias ganha a hora como extra", () => {
    const b = banco([ferias("2026-09-07", "2026-09-11")], [bat("2026-09-09", "08:00", 1), bat("2026-09-09", "12:00", 2)]);
    const d = b.dias.find((x) => x.dia === "2026-09-09")!;
    expect(d.classe).toBe("trabalhado");
    expect(d.metaMin).toBe(0);
    expect(d.saldoMin).toBe(240);
    // Férias não é domingo nem feriado: a hora é extra COMUM, sem adicional.
    expect(d.especial).toBe(false);
  });
});

describe("atestado", () => {
  it("atestado aceito não deve jornada e se chama atestado", () => {
    const b = banco([atestado("2026-09-14", "2026-09-16")]);
    const d = b.dias.find((x) => x.dia === "2026-09-15")!;
    expect(d.classe).toBe("atestado");
    expect(d.metaMin).toBe(0);
    expect(d.saldoMin).toBe(0);
    expect(b.ledger.faltasNaoJustificadas.some((f) => f.dia === "2026-09-15")).toBe(false);
  });

  it("férias e atestado no mesmo dia: vale férias", () => {
    const b = banco([atestado("2026-09-15", "2026-09-15"), ferias("2026-09-15", "2026-09-15")]);
    expect(b.dias.find((x) => x.dia === "2026-09-15")?.classe).toBe("ferias");
  });
});

describe("sem vínculo, sem afastamento", () => {
  it("pessoa do Ponto sem colaborador vinculado calcula como sempre calculou", () => {
    // Afastamento é do COLABORADOR. Sem `colaboradorId` não há de quem seriam
    // as férias — e inventar um vínculo aqui seria pior do que não ter.
    const b = calcBanco({ ...PESSOA, colaboradorId: null }, [], MES, HOJE, SEM_FERIADO, [], 480, [], "23:59", []);
    expect(b.metaMin).toBe(22 * 480);
  });
});
