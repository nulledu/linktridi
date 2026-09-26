import { describe, it, expect } from "vitest";
import { calcBanco } from "../banco-horas";
import type { PontoRegistro, PontoPagamento } from "../ponto";
import type { TipoFeriado } from "../jornada-calendario";

// Hora extra não vale toda o mesmo. Domingo e feriado PAGO têm adicional na
// folha (a "especial"); dia comum e feriado TROCADO não (a "comum", que existe
// pra virar folga depois). O banco mostra os dois separados — e escolhe com
// cuidado qual dos dois some primeiro:
//   · dívida (compensação) come a COMUM primeiro — um atraso de 20 min não pode
//     consumir hora de domingo, que vale bem mais;
//   · dinheiro paga a ESPECIAL primeiro — é justamente a que não deveria virar
//     folga.

const MES = "2026-07";
const HOJE = "2026-07-20";   // segunda. O banco começa em 15/07 (quarta).
// 15 qua · 16 qui · 17 sex · 18 sáb · 19 dom · 20 seg
const QUA = "2026-07-15", QUI = "2026-07-16", SEX = "2026-07-17", SAB = "2026-07-18", DOM = "2026-07-19", SEG = "2026-07-20";
const UTEIS = [QUA, QUI, SEX, SEG];

const PESSOA = {
  id: "p1", nome: "Ana", fotoUrl: null,
  jornadaMin: 480, entradaPrevista: "08:00", saidaPrevista: "17:00",
  almocoInicio: "12:00", almocoFim: "13:00",
  trabalhaSabado: false, sabadoMin: null as number | null,
};

let seq = 0;
const bat = (dia: string, hhmm: string): PontoRegistro => {
  const [h, m] = hhmm.split(":").map(Number);
  return {
    id: `r${++seq}`, pessoaId: "p1", tipo: "entrada",
    batidoEm: new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10), h + 3, m)).toISOString(),
    selfieUrl: null, confianca: null, origem: "tablet",
  };
};
/** Dia de 8h cravadas (08–12, 13–17) + `extra` minutos no fim. */
const diaCom = (dia: string, extraMin = 0): PontoRegistro[] => {
  const s = 17 * 60 + extraMin;
  return [bat(dia, "08:00"), bat(dia, "12:00"), bat(dia, "13:00"), bat(dia, `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`)];
};
/** Meio período (08–12 = 4h). */
const meiaJornada = (dia: string) => [bat(dia, "08:00"), bat(dia, "12:00")];
// Todo dia útil sem batida vira FALTA e a dívida come o crédito — por isso a
// base preenche a semana inteira certinha, e cada teste mexe só no que importa.
const base = (extras: Record<string, number> = {}, pular: string[] = []): PontoRegistro[] =>
  UTEIS.filter((d) => !pular.includes(d)).flatMap((d) => diaCom(d, extras[d] ?? 0));

const SEM = new Map<string, TipoFeriado>();
const calc = (regs: PontoRegistro[], feriados: Map<string, TipoFeriado> = SEM, pags: PontoPagamento[] = [], pessoa = PESSOA) =>
  calcBanco(pessoa, regs, MES, HOJE, feriados, [], 480, [], "23:59", pags);
const doMes = (b: ReturnType<typeof calc>) => b.ledger.meses.find((m) => m.mes === MES)!;

describe("banco de horas — extra comum × extra especial", () => {
  it("semana certinha não gera nada", () => {
    const m = doMes(calc(base()));
    expect(m.creditoMin).toBe(0);
    expect(m.debitoMin).toBe(0);
  });

  it("domingo trabalhado vira crédito ESPECIAL", () => {
    const b = calc([...base(), ...diaCom(DOM)]);
    const m = doMes(b);
    expect(m.creditoMin).toBe(480);
    expect(m.creditoEspecialMin).toBe(480);
    expect(m.geradoEspecialMin).toBe(480);
    expect(b.ledger.creditoEspecialMin).toBe(480);
  });

  it("feriado pago trabalhado é especial; feriado TROCADO é comum", () => {
    const regs = [...base({}, [QUI]), ...meiaJornada(QUI)];   // 4h na quinta feriada
    const pago = calc(regs, new Map([[QUI, "folga"]]));
    expect(pago.ledger.creditoMin).toBe(240);
    expect(pago.ledger.creditoEspecialMin).toBe(240);

    const trocado = calc(regs, new Map([[QUI, "troca"]]));
    expect(trocado.ledger.creditoMin).toBe(240);        // o crédito existe igual…
    expect(trocado.ledger.creditoEspecialMin).toBe(0);  // …só que sem adicional
  });

  // A troca fechando o ciclo, no exemplo de sempre: feriado na quinta, a pessoa
  // trabalha meio período e não vem no sábado. Ninguém deve, ninguém recebe.
  it("feriado trocado + a folga combinada se anulam", () => {
    const comSabado = { ...PESSOA, trabalhaSabado: true, sabadoMin: 240 };   // sábado de 4h
    const regs = [...base({}, [QUI]), ...meiaJornada(QUI)];                  // 4h na quinta, nada no sábado
    const m = doMes(calc(regs, new Map([[QUI, "troca"]]), [], comSabado));
    expect(m.geradoMin).toBe(240);      // as 4h do feriado
    expect(m.devidoMin).toBe(240);      // o sábado que ela não veio
    expect(m.creditoMin).toBe(0);
    expect(m.debitoMin).toBe(0);
    expect(m.saldoMin).toBe(0);
  });

  it("dívida come a hora COMUM antes de encostar na especial", () => {
    // Domingo: +8h especiais · sexta: +2h comuns · segunda: −1h.
    const b = calc([...base({ [SEX]: 120, [SEG]: -60 }), ...diaCom(DOM)]);
    const m = doMes(b);
    expect(m.creditoEspecialMin).toBe(480);        // domingo intacto
    expect(m.creditoMin).toBe(480 + 120 - 60);     // a dívida saiu da comum
  });

  it("dinheiro quita a hora ESPECIAL primeiro", () => {
    const regs = [...base({ [SEX]: 120 }), ...diaCom(DOM)];   // 8h especiais + 2h comuns
    const pagamento: PontoPagamento = {
      id: "pg1", pessoaId: "p1", dia: SEG, minutos: 300, observacao: null, autorNome: "Admin",
      createdAt: `${SEG}T12:00:00Z`, periodoDe: "2026-07-01", periodoAte: "2026-07-31",
    };
    const L = calc(regs, SEM, [pagamento]).ledger;
    expect(L.pagoMin).toBe(300);
    expect(L.pagoEspecialMin).toBe(300);           // saiu tudo do domingo
    expect(L.creditoEspecialMin).toBe(180);        // sobraram 3h de domingo
    expect(L.creditoMin).toBe(180 + 120);          // e as 2h comuns intactas
    expect(L.pagamentos[0].aplicadoEspecialMin).toBe(300);
  });
});
