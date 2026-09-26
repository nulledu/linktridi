import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { calcBanco, creditoAbertoDoMes } from "../banco-horas";
import type { PontoRegistro, PontoPagamento } from "../ponto";

// Caso Bruno (set/2026): 7h39 a favor em agosto, pagas na folha; em setembro
// ficou devendo 9h33. A baixa da folha lia o banco de HOJE — o déficit de
// setembro já tinha comido o crédito de agosto, a baixa gravava 0 e o banco
// mostrava +7h32 pra quem devia. Paga, a hora sai do banco na virada; a
// dívida de setembro fica dívida.

const PESSOA = {
  id: "p1", nome: "Bruno", fotoUrl: null, jornadaMin: 480,
  entradaPrevista: "08:00", saidaPrevista: "17:00", almocoInicio: "12:00", almocoFim: "13:00",
  trabalhaSabado: false, sabadoMin: null,
};
let seq = 0;
const bat = (dia: string, hhmm: string): PontoRegistro => {
  const [h, m] = hhmm.split(":").map(Number);
  const iso = new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10), h + 3, m)).toISOString();
  return { id: `r${++seq}`, pessoaId: "p1", tipo: "entrada", batidoEm: iso, selfieUrl: null, confianca: null, origem: "tablet" };
};
const diaCom = (dia: string, extraMin: number): PontoRegistro[] => {
  const s = 17 * 60 + extraMin;
  return [bat(dia, "08:00"), bat(dia, "12:00"), bat(dia, "13:00"), bat(dia, `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`)];
};
// Dias úteis de 15/07 a 04/09 (o banco começa em 15/07).
const uteis: string[] = [];
for (let t = Date.UTC(2026, 6, 15); t <= Date.UTC(2026, 8, 4); t += 864e5) {
  const d = new Date(t); if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) uteis.push(d.toISOString().slice(0, 10));
}
// Agosto: +1h30 em 3 dias (4h30 a favor). Setembro: sai 2h mais cedo em 3 dias (6h devendo).
const EXTRA: Record<string, number> = { "2026-08-10": 90, "2026-08-11": 90, "2026-08-12": 90, "2026-09-02": -120, "2026-09-03": -120, "2026-09-04": -120 };
const regs = uteis.flatMap((d) => diaCom(d, EXTRA[d] ?? 0));
const banco = (hoje: string, periodo: string, pags: PontoPagamento[] = []) =>
  calcBanco(PESSOA, regs, periodo, hoje, new Set<string>(), [], 480, [], "23:59", pags);

describe("folha paga o retrato da virada", () => {
  it("lido de hoje, setembro já comeu agosto — por isso a baixa não pode ler de hoje", () => {
    expect(creditoAbertoDoMes(banco("2026-09-04", "2026-09").ledger, "2026-08")).toBe(0);
    expect(creditoAbertoDoMes(banco("2026-08-31", "2026-08").ledger, "2026-08")).toBe(270);
  });

  it("pagamento com a janela de agosto, lançado em setembro, sai antes da dívida de setembro", () => {
    const pag: PontoPagamento = { id: "pg", pessoaId: "p1", dia: "2026-09-09", minutos: 270, observacao: "Folha de 2026-08", autorNome: "Admin", createdAt: "2026-09-09T12:00:00Z", periodoDe: "2026-08-01", periodoAte: "2026-08-31" };
    // Olhado em 04/09 (sem as faltas de 07–09/09 do fixture); o pagamento é
    // lançado depois e mesmo assim entra em 31/08.
    const L = banco("2026-09-04", "2026-09", [pag]).ledger;
    expect(L.pagamentos[0].aplicadoMin).toBe(270);
    expect(L.saldoMin).toBe(-360);   // deve as 6h inteiras
  });

  it("pagarHorasDoMes lê o banco cortado no fim da competência", () => {
    const src = readFileSync(join(__dirname, "../financeiro/folha-mensal-servidor.ts"), "utf8");
    const corpo = src.slice(src.indexOf("export async function pagarHorasDoMes"), src.indexOf("export async function fotosDoMercadinho"));
    expect(corpo).toMatch(/bancoDaPessoa\(pessoa, mes, [^)]*\), undefined, ate\)/);
  });
});
