import { describe, it, expect } from "vitest";
import { calcBanco } from "../banco-horas";
import type { PontoRegistro } from "../ponto";

// Regra: o saldo do dia (deve horas / tem horas a mais) só existe DEPOIS que o
// expediente da pessoa acaba. Enquanto ela está trabalhando, o dia é neutro —
// não soma nem subtrai. Antes disso, quem batia entrada+almoço já aparecia
// devendo meia jornada ao meio-dia, e quem não tinha chegado às 9h contava
// falta do dia inteiro.

const HOJE = "2026-07-22";        // quarta-feira (dia útil)
const MES = "2026-07";
const SEM_FERIADO = new Set<string>();
const PESSOA = {
  id: "p1", nome: "Bruno", fotoUrl: null,
  jornadaMin: 480,                // 8h
  entradaPrevista: "08:00", saidaPrevista: "18:00",
  trabalhaSabado: false, sabadoMin: null,
};

// Batida em horário SP (UTC-3) → ISO UTC.
const bat = (dia: string, hhmm: string, i: number): PontoRegistro => {
  const [h, m] = hhmm.split(":").map(Number);
  const iso = new Date(Date.UTC(+dia.slice(0, 4), +dia.slice(5, 7) - 1, +dia.slice(8, 10), h + 3, m)).toISOString();
  return { id: `r${i}`, pessoaId: "p1", tipo: "entrada", batidoEm: iso, selfieUrl: null, confianca: null, origem: "tablet" };
};

const diaDe = (regs: PontoRegistro[], agora: string) =>
  calcBanco(PESSOA, regs, MES, HOJE, SEM_FERIADO, [], 480, [], agora).dias.find((d) => d.dia === HOJE)!;

describe("banco de horas — só contabiliza depois do expediente", () => {
  it("meio do expediente com par de batidas (entrada+almoço) não gera débito", () => {
    // 08:00→12:00 = 4h de 8h. Às 12:30 ela ainda vai voltar do almoço.
    const d = diaDe([bat(HOJE, "08:00", 1), bat(HOJE, "12:00", 2)], "12:30");
    expect(d.classe).toBe("andamento");
    expect(d.saldoMin).toBe(0);   // antes: -240
    expect(d.metaMin).toBe(0);
  });

  it("ainda não chegou não vira falta do dia", () => {
    const d = diaDe([], "09:00");
    expect(d.classe).toBe("andamento");
    expect(d.saldoMin).toBe(0);   // antes: -480 (falta cheia)
  });

  it("depois da saída prevista, o déficit conta normal", () => {
    // 08:00→15:00 = 7h de 8h → deve 1h INTEIRA.
    // Antes esperava -50 (era -60 + 10 de "franquia" da tolerância). A regra
    // mudou: a tolerância é CONDIÇÃO, não franquia — 60 min estoura o limite de
    // 10 min do dia, então conta o tempo real desde o primeiro minuto.
    // Ver lib/__tests__/banco-horas-tolerancia.test.ts.
    const d = diaDe([bat(HOJE, "08:00", 1), bat(HOJE, "15:00", 2)], "18:30");
    expect(d.classe).toBe("parcial");
    expect(d.saldoMin).toBe(-60);
  });

  it("depois da saída prevista, a hora a mais conta", () => {
    // 08:00→19:00 = 11h de 8h → +3h. Aqui ela DEVE horas (os outros dias do mês
    // estão sem batida nenhuma), então as 3h quitam dívida: nesse caso não há
    // teto — devolver o que se pegou não é hora extra.
    // O teto de 2h da sobra tem prova própria em banco-horas-quita-antes-de-extra.
    const d = diaDe([bat(HOJE, "08:00", 1), bat(HOJE, "19:00", 2)], "19:30");
    expect(d.classe).toBe("trabalhado");
    expect(d.saldoMin).toBe(180);
    expect(d.quitadoMin).toBe(180);
    expect(d.extraCortadoMin).toBeUndefined();
  });

  it("expediente acabou mas esqueceu de bater a saída → em aberto (neutro), não débito", () => {
    const d = diaDe([bat(HOJE, "08:00", 1)], "19:00");
    expect(d.classe).toBe("aberto");
    expect(d.saldoMin).toBe(0);
  });

  it("sem saidaPrevista configurada, o dia de hoje não contabiliza", () => {
    const semSaida = { ...PESSOA, saidaPrevista: null };
    const d = calcBanco(semSaida, [], MES, HOJE, SEM_FERIADO, [], 480, [], "23:00")
      .dias.find((x) => x.dia === HOJE)!;
    expect(d.classe).toBe("andamento");
    expect(d.saldoMin).toBe(0);
  });

  it("dia PASSADO sem batida continua sendo falta", () => {
    const ontem = "2026-07-21";
    const d = calcBanco(PESSOA, [], MES, HOJE, SEM_FERIADO, [], 480, [], "12:00")
      .dias.find((x) => x.dia === ontem)!;
    expect(d.classe).toBe("falta");
    expect(d.saldoMin).toBe(-480);
  });
});
