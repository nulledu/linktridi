import { describe, it, expect } from "vitest";
import { calcBanco, INICIO_BANCO } from "../banco-horas";
import type { PontoRegistro } from "../ponto";
import type { TipoFeriado } from "../jornada-calendario";

// Sair mais cedo NÃO vira dívida enquanto houver hora a favor no banco. O
// déficit come o crédito ainda válido — de qualquer mês, do mais antigo pro
// mais novo (o que expiraria primeiro) — e só o que sobrar depois de raspar o
// banco é hora que a pessoa deve de verdade.
//
// O alcance é o prazo do crédito: 3 meses a partir do dia em que a hora foi
// gerada. Crédito que já expirou não ressuscita pra cobrir um déficit novo.
//
// Aqui os dias entram por AJUSTE MANUAL (o mesmo caminho do "lançar horas" do
// painel): é a forma direta de montar um banco com meses de distância sem
// precisar bater ponto em cem dias.

const PESSOA = {
  id: "p1", nome: "Ana", fotoUrl: null,
  jornadaMin: 480, entradaPrevista: "08:00", saidaPrevista: "17:00",
  almocoInicio: "12:00", almocoFim: "13:00",
  trabalhaSabado: false, sabadoMin: null,
};
const SEM = new Map<string, TipoFeriado>();
const SEM_BATIDA: PontoRegistro[] = [];
// Todo dia útil sem batida vira falta — o que interessa aqui é o encontro entre
// crédito e déficit, então o teste abona tudo e injeta os dois por ajuste.
const abonarTudo = (de: string, ate: string) => {
  const out = [];
  const cur = new Date(`${de}T00:00:00Z`), fim = Date.parse(`${ate}T00:00:00Z`);
  while (cur.getTime() <= fim) {
    const dia = cur.toISOString().slice(0, 10);
    out.push({ id: `j-${dia}`, pessoaId: "p1", dia, motivo: "teste", abona: true, createdAt: "2026-01-01T00:00:00Z" });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
};
const aj = (dia: string, minutos: number) => ({ id: `a-${dia}-${minutos}`, pessoaId: "p1", dia, minutos, motivo: null, autorNome: null, createdAt: `${dia}T12:00:00Z` });

const banco = (ajustes: ReturnType<typeof aj>[], hoje: string) =>
  calcBanco(PESSOA, SEM_BATIDA, hoje.slice(0, 7), hoje, SEM, abonarTudo(INICIO_BANCO, hoje), 480, ajustes, "23:59", []);

describe("banco de horas — o déficit desconta dos últimos 3 meses", () => {
  it("alcança crédito de dois meses atrás", () => {
    // +3h em 20/07 · −2h em 10/09 (dentro dos 3 meses: vence em 20/10).
    const L = banco([aj("2026-07-20", 180), aj("2026-09-10", -120)], "2026-09-30").ledger;
    expect(L.debitoMin).toBe(0);        // não deve nada
    expect(L.creditoMin).toBe(60);      // sobrou 1h a favor
    expect(L.saldoMin).toBe(60);
  });

  it("crédito EXPIRADO não cobre déficit novo", () => {
    // +3h em 20/07 vence em 20/10. O déficit é de 05/11: tarde demais.
    const L = banco([aj("2026-07-20", 180), aj("2026-11-05", -120)], "2026-11-30").ledger;
    expect(L.debitoMin).toBe(120);              // virou dívida mesmo
    expect(L.creditoMin).toBe(180);             // e o crédito velho segue lá…
    expect(L.creditoExpiradoMin).toBe(180);     // …só que expirado
  });

  it("no limite do prazo ainda dá: o crédito vale ATÉ o dia do vencimento", () => {
    const L = banco([aj("2026-07-20", 180), aj("2026-10-20", -120)], "2026-10-31").ledger;
    expect(L.debitoMin).toBe(0);
    expect(L.creditoMin).toBe(60);
  });

  it("come o crédito mais ANTIGO primeiro (o que expira antes)", () => {
    const L = banco([aj("2026-07-20", 120), aj("2026-08-20", 120), aj("2026-09-10", -120)], "2026-09-30").ledger;
    expect(L.creditos.map((c) => c.dia)).toEqual(["2026-08-20"]);   // julho foi embora
    expect(L.creditoMin).toBe(120);
  });

  it("só o que passa do banco vira dívida — e aí sim são horas a pagar", () => {
    const L = banco([aj("2026-07-20", 60), aj("2026-09-10", -180)], "2026-09-30").ledger;
    expect(L.creditoMin).toBe(0);
    expect(L.debitoMin).toBe(120);
    expect(L.debitos.map((d) => d.dia)).toEqual(["2026-09-10"]);
  });

  it("hora especial é a última a ser consumida, mesmo sendo a mais antiga", () => {
    // O domingo 19/07 (especial) é mais velho que o crédito comum de agosto,
    // mas quem paga o atraso é a hora comum — a especial vale mais.
    const L = calcBanco(
      PESSOA, SEM_BATIDA, "2026-09", "2026-09-30",
      new Map([["2026-07-20", "folga"]]),   // 20/07 vira feriado pago
      abonarTudo(INICIO_BANCO, "2026-09-30"), 480,
      [aj("2026-07-20", 120), aj("2026-08-20", 120), aj("2026-09-10", -120)], "23:59", [],
    ).ledger;
    expect(L.creditoEspecialMin).toBe(120);                        // domingo/feriado intacto
    expect(L.creditos.map((c) => c.dia)).toEqual(["2026-07-20"]);  // sobrou o especial
  });
});
