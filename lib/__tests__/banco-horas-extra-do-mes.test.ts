import { describe, it, expect } from "vitest";
import { calcBanco, creditoAbertoDoMes } from "../banco-horas";
import type { PontoRegistro, PontoPagamento } from "../ponto";
import type { TipoFeriado } from "../jornada-calendario";

// ── "Quantas horas extras tem este mês?" ────────────────────────────────────
// A folha mostrava `saldoMesMin − pagas` (a soma crua dos dias) e a BAIXA
// pagava o crédito do mês ainda aberto. Os dois números divergem sempre que o
// mês compensou contra outro — e aí o painel dizia "3h a favor" e pagava zero,
// ou "nada a pagar" com hora a favor no banco. `creditoAbertoDoMes` é a
// resposta única, e é a da baixa.

const PESSOA = {
  id: "p1", nome: "Ana", fotoUrl: null,
  jornadaMin: 480, entradaPrevista: "08:00", saidaPrevista: "17:00",
  almocoInicio: "12:00", almocoFim: "13:00",
  trabalhaSabado: false, sabadoMin: null as number | null,
};
const SEM = new Map<string, TipoFeriado>();

let seq = 0;
const bat = (dia: string, hhmm: string): PontoRegistro => {
  const [h, m] = hhmm.split(":").map(Number);
  return {
    id: `r${++seq}`, pessoaId: "p1", tipo: "entrada",
    batidoEm: new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10), h + 3, m)).toISOString(),
    selfieUrl: null, confianca: null, origem: "tablet",
  };
};
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const diaCom = (dia: string, saldoMin = 0) =>
  [bat(dia, "08:00"), bat(dia, "12:00"), bat(dia, "13:00"), bat(dia, hhmm(17 * 60 + saldoMin))];

/** Julho (a partir do dia 15) e agosto trabalhados certinho, com os ajustes
 *  pedidos em dias específicos. Feriado nenhum no caminho. */
const registros = (saldos: Record<string, number>): PontoRegistro[] => {
  const out: PontoRegistro[] = [];
  for (let d = new Date(Date.UTC(2026, 6, 15)); d <= new Date(Date.UTC(2026, 7, 31)); d.setUTCDate(d.getUTCDate() + 1)) {
    const dia = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    out.push(...diaCom(dia, saldos[dia] ?? 0));
  }
  return out;
};

const HOJE = "2026-08-31";
const calc = (saldos: Record<string, number>, pags: PontoPagamento[] = []) =>
  calcBanco(PESSOA, registros(saldos), "2026-08", HOJE, SEM, [], 480, [], "23:59", pags);

describe("crédito aberto do mês — a conta que a folha paga", () => {
  it("mês limpo: 2h extras em agosto são 2h de agosto", () => {
    const b = calc({ "2026-08-10": 120 });
    expect(creditoAbertoDoMes(b.ledger, "2026-08")).toBe(120);
    expect(b.saldoMesMin).toBe(120);   // aqui os dois concordam
  });

  it("agosto compensando julho: a soma crua do mês MENTE", () => {
    // Julho deixou 2h a favor; em agosto a pessoa fez 2h extras e faltou 1h.
    // A dívida come o crédito mais antigo (julho), então agosto continua com
    // as 2h dele em aberto — mas a soma crua dos dias de agosto dá só 1h.
    const b = calc({ "2026-07-16": 120, "2026-08-10": 120, "2026-08-11": -60 });
    expect(b.saldoMesMin).toBe(60);                            // o número antigo da folha
    expect(creditoAbertoDoMes(b.ledger, "2026-08")).toBe(120); // o que a baixa paga
    expect(creditoAbertoDoMes(b.ledger, "2026-07")).toBe(60);  // julho pagou 1h da dívida
  });

  it("o que já foi pago em dinheiro não aparece de novo", () => {
    const pag: PontoPagamento = {
      id: "pg1", pessoaId: "p1", dia: "2026-09-05", minutos: 120,
      observacao: "Folha de 2026-08", autorNome: null,
      periodoDe: "2026-08-01", periodoAte: "2026-08-31", createdAt: "2026-09-05T12:00:00.000Z",
    };
    const b = calc({ "2026-08-10": 120 }, [pag]);
    expect(creditoAbertoDoMes(b.ledger, "2026-08")).toBe(0);
  });

  it("crédito expirado não é pagável", () => {
    const b = calc({ "2026-07-16": 120 });
    const venceu = { ...b.ledger, creditos: b.ledger.creditos.map((c) => ({ ...c, vencido: true })) };
    expect(creditoAbertoDoMes(venceu, "2026-07")).toBe(0);
  });

  it("mês só de dívida não vira extra negativo", () => {
    const b = calc({ "2026-08-11": -60 });
    expect(creditoAbertoDoMes(b.ledger, "2026-08")).toBe(0);
  });
});
