import { describe, it, expect } from "vitest";
import {
  dataLimiteDePagamento, descontoPorFaltas, feriadosNacionais, liquidoDoMes,
  nomeCurto, quintoDiaUtil,
} from "@/lib/financeiro/folha-mensal";

/**
 * As duas regras que "não podem ter erro", provadas contra calendários reais.
 *
 * · 5º dia útil (CLT 459 §1º): SÁBADO CONTA, domingo e feriado não. Contar
 *   seg–sex — o erro mais comum — empurra a data e faz a folha parecer
 *   atrasada sem ninguém ter atrasado.
 * · DSR (Lei 605/49 art. 6º): falta perde o dia E o descanso da semana; duas
 *   faltas na MESMA semana perdem UM DSR, não dois. Por isso a folha guarda
 *   datas, nunca contagem.
 */

describe("5º dia útil", () => {
  it("setembro/2026: dia 1º é terça, sem feriado no caminho → dia 5 (sábado conta)", () => {
    // ter 1, qua 2, qui 3, sex 4, SÁB 5 → o 5º útil é dia 5.
    expect(quintoDiaUtil(2026, 9)).toBe("2026-09-05");
  });

  it("novembro/2026: começa em domingo → seg 2 é FERIADO (Finados) e pula", () => {
    // dom 1 (fora), seg 2 (feriado), ter 3, qua 4, qui 5, sex 6, sáb 7 → 5º útil = 7.
    expect(quintoDiaUtil(2026, 11)).toBe("2026-11-07");
  });

  it("janeiro/2027: dia 1º é feriado e sexta → sáb 2, seg 4, ter 5, qua 6, qui 7", () => {
    // dom 3 não conta. O sábado 2 SIM — sem ele a data cairia em 8.
    expect(quintoDiaUtil(2027, 1)).toBe("2027-01-07");
  });

  it("maio/2026: 1º de maio é feriado e sexta", () => {
    // sáb 2, dom 3 (fora), seg 4, ter 5, qua 6, qui 7 → 5º útil = 7.
    expect(quintoDiaUtil(2026, 5)).toBe("2026-05-07");
  });

  it("feriado municipal entra por parâmetro e empurra a data", () => {
    // Declarando o dia 3 como feriado local: ter 1, qua 2, [3 feriado], sex 4,
    // sáb 5, dom 6 fora — e seg 7 é a INDEPENDÊNCIA, pula também. 5º útil = 8.
    // (A primeira versão deste teste esperava dia 7: esqueceu o feriado
    // nacional. Foi o código que corrigiu o teste.)
    expect(quintoDiaUtil(2026, 9, ["2026-09-03"])).toBe("2026-09-08");
  });

  it("a competência aponta o mês SEGUINTE: trabalhou em agosto, recebe até o 5º útil de setembro", () => {
    expect(dataLimiteDePagamento("2026-08-01")).toBe("2026-09-05");
  });

  it("dezembro vira janeiro do ano seguinte, sem quebrar", () => {
    expect(dataLimiteDePagamento("2026-12-01")).toBe("2027-01-07");
  });

  it("a Sexta-feira Santa é calculada, não tabelada", () => {
    // Páscoa 2026 = 5/abr → Sexta-feira Santa = 3/abr.
    expect(feriadosNacionais(2026).has("2026-04-03")).toBe(true);
    // E a de 2027 (Páscoa 28/mar → sexta 26/mar).
    expect(feriadosNacionais(2027).has("2027-03-26")).toBe(true);
  });
});

describe("Faltas e DSR", () => {
  const SALARIO = 3000;   // diária = 100

  it("uma falta perde o dia E o domingo — exatamente o que o dono descreveu", () => {
    // Terça 2026-09-08: perde a terça (100) e o DSR da semana (100).
    const d = descontoPorFaltas(["2026-09-08"], SALARIO);
    expect(d).toMatchObject({ dias: 1, semanasComFalta: 1, valorDias: 100, valorDsr: 100, total: 200 });
  });

  it("duas faltas na MESMA semana: dois dias e UM DSR — o descanso da semana é um só", () => {
    // Terça 8 e quinta 10 estão na mesma semana (seg 7 a dom 13).
    const d = descontoPorFaltas(["2026-09-08", "2026-09-10"], SALARIO);
    expect(d).toMatchObject({ dias: 2, semanasComFalta: 1, total: 300 });
  });

  it("duas faltas em semanas DIFERENTES: dois dias e dois DSR", () => {
    // Terça 8 (semana de 7/9) e terça 15 (semana de 14/9).
    const d = descontoPorFaltas(["2026-09-08", "2026-09-15"], SALARIO);
    expect(d).toMatchObject({ dias: 2, semanasComFalta: 2, total: 400 });
  });

  it("sábado e a segunda seguinte são semanas DIFERENTES", () => {
    // A semana fecha no domingo: sáb 12/9 pertence à semana de 7/9; seg 14/9
    // abre outra. Errar esse corte é fundir dois DSR em um.
    const d = descontoPorFaltas(["2026-09-12", "2026-09-14"], SALARIO);
    expect(d.semanasComFalta).toBe(2);
  });

  it("falta no DOMINGO conta na semana que TERMINA nele", () => {
    // Dom 13/9 fecha a semana de seg 7/9 — mesma semana da terça 8/9.
    const d = descontoPorFaltas(["2026-09-08", "2026-09-13"], SALARIO);
    expect(d.semanasComFalta).toBe(1);
  });

  it("data repetida não desconta duas vezes", () => {
    const d = descontoPorFaltas(["2026-09-08", "2026-09-08"], SALARIO);
    expect(d.dias).toBe(1);
  });

  it("lixo na lista é ignorado, não vira desconto", () => {
    const d = descontoPorFaltas(["2026-09-08", "não-é-data", ""], SALARIO);
    expect(d.dias).toBe(1);
  });

  it("sem faltas, zero — e sem NaN", () => {
    expect(descontoPorFaltas([], SALARIO).total).toBe(0);
  });

  it("a diária é salário/30, em centavos redondos — e as PARCELAS somam o total", () => {
    // 2.567/30 = 85,5666… → dia 85,57 e DSR 85,57. O total é a soma das
    // parcelas JÁ arredondadas (171,14), não o arredondamento da soma crua
    // (171,13): o holerite mostra as duas linhas, e linhas que não somam o
    // total é o tipo de centavo que ninguém acha depois.
    const d = descontoPorFaltas(["2026-09-08"], 2567);
    expect(d.valorDias).toBe(85.57);
    expect(d.valorDsr).toBe(85.57);
    expect(d.total).toBe(171.14);
  });
});

describe("Líquido do mês", () => {
  const base = {
    salario: 3000, bonus: 200, comissao: 150, gratificacao: 100, beneficios: 300,
    convenio_farmacia: 80, mercadinho: 120, vale: 500, faltas: [] as string[],
  };

  it("ganhos − descontos, na ponta do lápis", () => {
    const r = liquidoDoMes(base);
    expect(r.ganhos).toBe(3750);
    expect(r.descontos).toBe(700);
    expect(r.liquido).toBe(3050);
  });

  it("as faltas entram no desconto com o DSR junto", () => {
    const r = liquidoDoMes({ ...base, faltas: ["2026-09-08"] });
    expect(r.descontos).toBe(900);   // 700 + 100 (dia) + 100 (DSR)
    expect(r.liquido).toBe(2850);
  });

  it("nunca fica negativo — a folha não cria dívida", () => {
    const r = liquidoDoMes({ ...base, vale: 99999 });
    expect(r.liquido).toBe(0);
  });
});

describe("Nome curto", () => {
  it("dois primeiros nomes", () => {
    expect(nomeCurto("Maria Aparecida dos Santos Silva")).toBe("Maria Aparecida");
  });

  it("partícula arrasta o nome seguinte — 'João de' seria pior que o inteiro", () => {
    expect(nomeCurto("João de Souza Lima")).toBe("João de Souza");
  });

  it("nome já curto fica como está", () => {
    expect(nomeCurto("Ana")).toBe("Ana");
    expect(nomeCurto("Ana Souza")).toBe("Ana Souza");
  });

  it("espaços sobrando não viram nome", () => {
    expect(nomeCurto("  Ana   Clara   Braga ")).toBe("Ana Clara");
  });
});
