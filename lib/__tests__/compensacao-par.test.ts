/**
 * O par de compensação no banco de horas — o exemplo do pedido, ponta a ponta:
 *
 *   segunda-feira é feriado · o funcionário trabalhou · na terça não veio ·
 *   o RH registra que a terça foi folga compensatória referente à segunda.
 *
 * O que precisa sair disso: os dois dias ligados, soma ZERO, e a hora trocada
 * não virando hora extra nenhuma — nem comum (que voltaria como folga de novo)
 * nem especial (que seria paga com adicional na folha, além da folga já tirada).
 *
 * A mecânica escolhida é RESERVA: os minutos saem do saldo do dia de origem
 * antes de o ledger vê-los. A alternativa — deixar o FIFO de sempre resolver —
 * foi recusada porque o débito da folga pode ser comido por um crédito de
 * outro mês, e aí o par fica sem lastro e o histórico mente.
 */
import { describe, it, expect } from "vitest";
import { calcBanco } from "../banco-horas";
import type { PontoRegistro } from "../ponto";
import type { Compensacao, StatusCompensacao } from "../jornada/tipos";

const MES = "2026-09";
const HOJE = "2026-09-30";
const SEG = "2026-09-14";   // o feriado trabalhado
const TER = "2026-09-15";   // a folga

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

/** Um dia inteiro trabalhado: 08:00–12:00 e 13:00–17:00 = 8h. */
const jornadaCheia = (dia: string) => [
  bat(dia, "08:00", 1), bat(dia, "12:00", 2), bat(dia, "13:00", 3), bat(dia, "17:00", 4),
];

const par = (extra: Partial<Compensacao> = {}): Compensacao => ({
  id: "c1", employeeId: "col-1", tipo: "feriado_trocado",
  diaOrigem: SEG, diaFolga: TER, minutos: 480, status: "aprovada",
  observacao: null, autorNome: null, aprovadorNome: "Caio", aprovadoEm: null,
  createdAt: "2026-09-14T12:00:00Z", ...extra,
});

const feriado = (dia: string, tipo: "folga" | "troca" = "folga") =>
  new Map<string, "folga" | "troca">([[dia, tipo]]);

const rodar = (regs: PontoRegistro[], feriados: Map<string, "folga" | "troca">, compensacoes: Compensacao[]) =>
  calcBanco(PESSOA, regs, MES, HOJE, feriados, [], 480, [], "23:59", [], { compensacoes });

const doMes = (b: ReturnType<typeof calcBanco>) => b.ledger.meses.find((m) => m.mes === MES)!;

describe("o exemplo do pedido: trabalhou no feriado, folgou no dia seguinte", () => {
  const b = rodar(jornadaCheia(SEG), feriado(SEG), [par()]);
  const seg = b.dias.find((d) => d.dia === SEG)!;
  const ter = b.dias.find((d) => d.dia === TER)!;

  it("o feriado trabalhado não deve jornada e as 8h ficam RESERVADAS ao par", () => {
    expect(seg.metaMin).toBe(0);
    expect(seg.trabalhadoMin).toBe(480);
    expect(seg.reservadoMin).toBe(480);
    expect(seg.saldoMin).toBe(0);            // sem a reserva seriam +480 de crédito
  });

  it("a folga não é falta: ela se chama compensado e não deve nada", () => {
    expect(ter.classe).toBe("compensada");
    expect(ter.metaMin).toBe(0);
    expect(ter.saldoMin).toBe(0);
    expect(b.ledger.faltasNaoJustificadas.some((f) => f.dia === TER)).toBe(false);
  });

  it("os dois dias ficam ligados, e a tela consegue dizer qual é qual", () => {
    expect(seg.compensacao).toMatchObject({ papel: "origem", outroDia: TER, minutos: 480 });
    expect(ter.compensacao).toMatchObject({ papel: "folga", outroDia: SEG, minutos: 480 });
  });

  it("a hora trocada não vira hora extra de espécie nenhuma", () => {
    // Nem crédito comum (que voltaria como folga outra vez) nem especial (que
    // seria paga com adicional, além da folga já tirada).
    expect(doMes(b).geradoMin).toBe(0);
    expect(doMes(b).geradoEspecialMin).toBe(0);
  });

  it("o par soma ZERO: o mês não fica nem devendo nem a favor por causa dele", () => {
    const semPar = rodar(jornadaCheia(SEG), feriado(SEG), []);
    // Sem o par: +8h de crédito especial na segunda e −8h de falta na terça.
    expect(semPar.dias.find((d) => d.dia === SEG)!.saldoMin).toBe(480);
    expect(semPar.dias.find((d) => d.dia === TER)!.classe).toBe("falta");
    // Com o par: nada nos dois lados.
    expect(seg.saldoMin + ter.saldoMin).toBe(0);
  });
});

describe("a sobra", () => {
  it("quem trabalha MAIS do que trocou fica com a diferença como hora de feriado", () => {
    // 08:00–12:00 e 13:00–19:00 = 10h num feriado; 8h foram trocadas por folga.
    const regs = [bat(SEG, "08:00", 1), bat(SEG, "12:00", 2), bat(SEG, "13:00", 3), bat(SEG, "19:00", 4)];
    const b = rodar(regs, feriado(SEG), [par()]);
    const seg = b.dias.find((d) => d.dia === SEG)!;
    expect(seg.trabalhadoMin).toBe(600);
    expect(seg.reservadoMin).toBe(480);
    expect(seg.saldoMin).toBe(120);
    // As 2h que sobraram são hora de feriado de verdade: têm adicional.
    expect(seg.especial).toBe(true);
    expect(doMes(b).geradoEspecialMin).toBe(120);
  });

  it("quem trabalha MENOS do que o par prometeu fica devendo a diferença", () => {
    // Trocou o dia inteiro mas só fez 4h no feriado: tirou uma folga maior do
    // que ganhou. Esconder isso deixaria o saldo errado pra sempre.
    const regs = [bat(SEG, "08:00", 1), bat(SEG, "12:00", 2)];
    const b = rodar(regs, feriado(SEG), [par()]);
    expect(b.dias.find((d) => d.dia === SEG)!.saldoMin).toBe(-240);
  });
});

describe("o par pessoal e a troca da empresa", () => {
  it("o par vale mesmo quando a empresa NÃO trocou o feriado", () => {
    // A empresa diz "folga" (feriado pago, com adicional). Ana trocou o dela.
    const b = rodar(jornadaCheia(SEG), feriado(SEG, "folga"), [par()]);
    expect(b.dias.find((d) => d.dia === SEG)!.reservadoMin).toBe(480);
    expect(doMes(b).geradoEspecialMin).toBe(0);
  });

  it("sem par pessoal, a troca GLOBAL da empresa continua funcionando como antes", () => {
    // Feriado 'troca': a hora é comum (sem adicional) e vai pro banco, pra ser
    // gasta na folga combinada — o mecanismo antigo, intocado.
    const b = rodar(jornadaCheia(SEG), feriado(SEG, "troca"), []);
    const seg = b.dias.find((d) => d.dia === SEG)!;
    expect(seg.saldoMin).toBe(480);
    expect(seg.especial).toBe(false);
    expect(seg.reservadoMin).toBeUndefined();
  });
});

describe("status: só aprovada mexe em conta", () => {
  for (const status of ["pendente", "recusada", "cancelada"] as StatusCompensacao[]) {
    it(`par ${status} não reserva nada e a folga volta a ser falta`, () => {
      const b = rodar(jornadaCheia(SEG), feriado(SEG), [par({ status })]);
      const seg = b.dias.find((d) => d.dia === SEG)!;
      expect(seg.reservadoMin).toBeUndefined();
      expect(seg.saldoMin).toBe(480);
      expect(b.dias.find((d) => d.dia === TER)!.classe).toBe("falta");
    });
  }
});

describe("compensação de jornada — folgou primeiro, repõe depois", () => {
  // Aqui nada é perdoado na hora: a hora ainda não existe. O dia de folga nasce
  // devendo (mas NÃO como falta) e o trabalho futuro quita, pelo motor de
  // dívida que já existe. Perdoar antes seria adiantar crédito.
  const adiantada = par({ tipo: "compensacao_jornada", diaFolga: SEG, diaOrigem: TER });

  it("o dia folgado continua devendo a jornada, mas não é falta", () => {
    const b = calcBanco(PESSOA, [], MES, HOJE, new Map(), [], 480, [], "23:59", [], { compensacoes: [adiantada] });
    const seg = b.dias.find((d) => d.dia === SEG)!;
    expect(seg.metaMin).toBe(480);
    expect(seg.saldoMin).toBe(-480);
    expect(seg.classe).toBe("compensada");
    expect(b.ledger.faltasNaoJustificadas.some((f) => f.dia === SEG)).toBe(false);
  });

  it("o dia de reposição NÃO reserva — ele quita a dívida pelo motor de sempre", () => {
    const regs = [bat(TER, "08:00", 1), bat(TER, "12:00", 2), bat(TER, "13:00", 3), bat(TER, "19:00", 4)];
    const b = calcBanco(PESSOA, regs, MES, HOJE, new Map(), [], 480, [], "23:59", [], { compensacoes: [adiantada] });
    const ter = b.dias.find((d) => d.dia === TER)!;
    expect(ter.reservadoMin).toBeUndefined();
    expect(ter.saldoMin).toBe(120);          // 10h num dia de 8h
    expect(ter.quitadoMin).toBe(120);        // tudo foi devolver o que devia
  });
});

describe("meio período", () => {
  it("trocar só metade do dia deixa a outra metade devida", () => {
    const b = rodar(jornadaCheia(SEG), feriado(SEG), [par({ minutos: 240 })]);
    const ter = b.dias.find((d) => d.dia === TER)!;
    expect(ter.metaMin).toBe(240);
    expect(ter.saldoMin).toBe(-240);
    expect(b.dias.find((d) => d.dia === SEG)!.saldoMin).toBe(240);
  });
});
