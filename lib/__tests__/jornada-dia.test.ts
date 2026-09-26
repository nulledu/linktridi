/**
 * A precedência do dia — a tabela-verdade de `diaDaPessoa`.
 *
 * Quatro sistemas falavam do mesmo dia sem se enxergar, e o resultado em
 * produção era 30 dias de férias virando 30 faltas e ~240h de débito no banco
 * de horas. A regra que conserta isso é uma ordem, e ordem é exatamente o tipo
 * de coisa que um refactor desfaz sem ninguém notar até a folha do mês.
 *
 * Do mais forte pro mais fraco:
 *   férias > atestado > feriado > folga compensatória > domingo > sábado > escala
 */
import { describe, it, expect } from "vitest";
import { diaDaPessoa, diasDaPessoa, SEM_FERIADOS } from "../jornada/dia";
import type { Afastamento, Compensacao } from "../jornada/tipos";
import { ROTULO_MOTIVO, MOTIVOS_DO_DIA, compensacaoVale } from "../jornada/tipos";
import { ICONS } from "../../app/(plataforma)/Icon";

// 2026-09: 14 = seg, 15 = ter, 19 = sáb, 20 = dom.
const SEG = "2026-09-14";
const TER = "2026-09-15";
const SAB = "2026-09-19";
const DOM = "2026-09-20";

const pessoa = { jornadaMin: 480, trabalhaSabado: false, sabadoMin: 240 };
const sabadista = { ...pessoa, trabalhaSabado: true };

const feriados = (m: Record<string, "folga" | "troca">) =>
  new Map<string, "folga" | "troca">(Object.entries(m));

const ferias = (de: string, ate: string): Afastamento =>
  ({ tipo: "ferias", de, ate, id: "f1", situacao: "Programada" });
const atestado = (de: string, ate: string): Afastamento =>
  ({ tipo: "atestado", de, ate, id: "a1", situacao: "Aceito" });

const par = (extra: Partial<Compensacao> = {}): Compensacao => ({
  id: "c1", employeeId: "p1", tipo: "feriado_trocado",
  diaOrigem: SEG, diaFolga: TER, minutos: 480, status: "aprovada",
  observacao: null, autorNome: null, aprovadorNome: null, aprovadoEm: null,
  createdAt: "2026-09-14T12:00:00Z", ...extra,
});

describe("escala — o que já valia continua valendo", () => {
  it("segunda a sexta deve a jornada da pessoa", () => {
    const d = diaDaPessoa(SEG, pessoa, { feriados: SEM_FERIADOS });
    expect(d.jornadaMin).toBe(480);
    expect(d.motivo).toBeNull();
    expect(d.extraEspecial).toBe(false);
  });

  it("domingo não deve nada, e a hora dele vale adicional", () => {
    const d = diaDaPessoa(DOM, pessoa, { feriados: SEM_FERIADOS });
    expect(d.jornadaMin).toBe(0);
    expect(d.motivo).toBe("domingo");
    expect(d.extraEspecial).toBe(true);
  });

  it("sábado só existe pra quem tem o toggle", () => {
    expect(diaDaPessoa(SAB, pessoa, { feriados: SEM_FERIADOS }).motivo).toBe("sabado_fora_escala");
    expect(diaDaPessoa(SAB, sabadista, { feriados: SEM_FERIADOS }).jornadaMin).toBe(240);
    // Sábado é dia comum: quem trabalha fora da escala faz extra NORMAL.
    expect(diaDaPessoa(SAB, pessoa, { feriados: SEM_FERIADOS }).extraEspecial).toBe(false);
  });

  it("sem jornada cadastrada, cai na meta padrão", () => {
    expect(diaDaPessoa(SEG, {}, { feriados: SEM_FERIADOS }).jornadaMin).toBe(480);
  });
});

describe("feriado", () => {
  it("zera a jornada e a hora vale adicional", () => {
    const d = diaDaPessoa(SEG, pessoa, { feriados: feriados({ [SEG]: "folga" }) });
    expect(d.jornadaMin).toBe(0);
    expect(d.motivo).toBe("feriado");
    expect(d.extraEspecial).toBe(true);
  });

  it("feriado TROCADO pela empresa não tem adicional — a folga é que devolve", () => {
    const d = diaDaPessoa(SEG, pessoa, { feriados: feriados({ [SEG]: "troca" }) });
    expect(d.jornadaMin).toBe(0);
    expect(d.extraEspecial).toBe(false);
    expect(d.feriado?.tipo).toBe("troca");
  });

  it("o nome e a esfera viajam com o dia quando a fonte os conhece", () => {
    const d = diaDaPessoa(SEG, pessoa, {
      feriados: feriados({ [SEG]: "folga" }),
      detalheFeriado: new Map([[SEG, { nome: "Independência", esfera: "nacional" as const }]]),
    });
    expect(d.feriado).toEqual({ nome: "Independência", esfera: "nacional", tipo: "folga" });
  });

  it("feriado vindo do ponto_feriados legado não inventa esfera", () => {
    const d = diaDaPessoa(SEG, pessoa, { feriados: feriados({ [SEG]: "folga" }) });
    expect(d.feriado?.esfera).toBeNull();
  });
});

describe("férias e atestado — o buraco que este módulo veio fechar", () => {
  it("dia de férias não deve jornada e não é falta", () => {
    const d = diaDaPessoa(SEG, pessoa, { feriados: SEM_FERIADOS, afastamentos: [ferias(SEG, "2026-09-25")] });
    expect(d.jornadaMin).toBe(0);
    expect(d.motivo).toBe("ferias");
    expect(d.afastamento?.situacao).toBe("Programada");
  });

  it("a janela do afastamento é FECHADA nos dois extremos", () => {
    const af = [ferias("2026-09-14", "2026-09-15")];
    expect(diaDaPessoa("2026-09-14", pessoa, { feriados: SEM_FERIADOS, afastamentos: af }).motivo).toBe("ferias");
    expect(diaDaPessoa("2026-09-15", pessoa, { feriados: SEM_FERIADOS, afastamentos: af }).motivo).toBe("ferias");
    expect(diaDaPessoa("2026-09-16", pessoa, { feriados: SEM_FERIADOS, afastamentos: af }).motivo).toBeNull();
  });

  it("atestado zera a jornada igual às férias", () => {
    const d = diaDaPessoa(SEG, pessoa, { feriados: SEM_FERIADOS, afastamentos: [atestado(SEG, SEG)] });
    expect(d.jornadaMin).toBe(0);
    expect(d.motivo).toBe("atestado");
  });

  it("férias vence atestado no mesmo dia", () => {
    const d = diaDaPessoa(SEG, pessoa, {
      feriados: SEM_FERIADOS, afastamentos: [atestado(SEG, SEG), ferias(SEG, SEG)],
    });
    expect(d.motivo).toBe("ferias");
  });

  it("feriado DENTRO das férias continua sendo férias — mas o feriado aparece", () => {
    const d = diaDaPessoa(SEG, pessoa, {
      feriados: feriados({ [SEG]: "folga" }),
      detalheFeriado: new Map([[SEG, { nome: "Finados", esfera: "nacional" as const }]]),
      afastamentos: [ferias("2026-09-10", "2026-09-30")],
    });
    expect(d.motivo).toBe("ferias");
    expect(d.feriado?.nome).toBe("Finados");
    // Ninguém trabalha de férias: não há hora especial a prometer.
    expect(d.extraEspecial).toBe(false);
  });

  it("férias num domingo continua sem jornada, e o domingo não promete adicional", () => {
    const d = diaDaPessoa(DOM, pessoa, { feriados: SEM_FERIADOS, afastamentos: [ferias(DOM, DOM)] });
    expect(d.jornadaMin).toBe(0);
    expect(d.motivo).toBe("ferias");
    expect(d.extraEspecial).toBe(false);
  });
});

describe("o par de compensação", () => {
  it("o dia de folga deixa de dever a jornada", () => {
    const d = diaDaPessoa(TER, pessoa, { feriados: SEM_FERIADOS, compensacoes: [par()] });
    expect(d.jornadaMin).toBe(0);
    expect(d.motivo).toBe("folga_compensatoria");
    expect(d.compensacao).toMatchObject({ papel: "folga", outroDia: SEG, minutos: 480 });
  });

  it("meio período compensado deixa o RESTO devido", () => {
    const d = diaDaPessoa(TER, pessoa, { feriados: SEM_FERIADOS, compensacoes: [par({ minutos: 240 })] });
    expect(d.jornadaMin).toBe(240);
    expect(d.motivo).toBe("folga_compensatoria");
  });

  it("o dia de origem se identifica, pra o banco RESERVAR os minutos trocados", () => {
    const d = diaDaPessoa(SEG, pessoa, { feriados: feriados({ [SEG]: "folga" }), compensacoes: [par()] });
    expect(d.compensacao).toMatchObject({ papel: "origem", outroDia: TER, minutos: 480 });
  });

  it("o par NÃO desliga o adicional do dia — quem reserva é o banco de horas", () => {
    // Os minutos trocados saem do crédito antes de virar saldo, então não são
    // hora extra de espécie nenhuma. O que SOBRA é hora de feriado de verdade:
    // trabalhou 10h, trocou 8 por folga, as outras 2 têm adicional.
    const ctx = { feriados: feriados({ [SEG]: "folga" }), compensacoes: [par()] };
    expect(diaDaPessoa(SEG, pessoa, ctx).extraEspecial).toBe(true);
  });

  it("o par pessoal existe mesmo quando a empresa não trocou o feriado", () => {
    // A empresa diz "folga" (com adicional); Fulano tem o par dele mesmo assim.
    const d = diaDaPessoa(SEG, pessoa, { feriados: feriados({ [SEG]: "folga" }), compensacoes: [par()] });
    expect(d.compensacao?.papel).toBe("origem");
    expect(d.feriado?.tipo).toBe("folga");
  });

  it("par que não está aprovado não mexe em nada", () => {
    for (const status of ["pendente", "recusada", "cancelada"] as const) {
      const d = diaDaPessoa(TER, pessoa, { feriados: SEM_FERIADOS, compensacoes: [par({ status })] });
      expect(d.jornadaMin, status).toBe(480);
      expect(d.motivo, status).toBeNull();
      expect(d.compensacao, status).toBeNull();
    }
    expect(compensacaoVale({ status: "aprovada" })).toBe(true);
    expect(compensacaoVale({ status: "pendente" })).toBe(false);
  });

  it("férias vence o par: quem está de férias não está compensando nada", () => {
    const d = diaDaPessoa(TER, pessoa, {
      feriados: SEM_FERIADOS, afastamentos: [ferias(TER, TER)], compensacoes: [par()],
    });
    expect(d.motivo).toBe("ferias");
  });

  it("folga marcada num domingo não inventa jornada nem motivo novo", () => {
    const d = diaDaPessoa(DOM, pessoa, { feriados: SEM_FERIADOS, compensacoes: [par({ diaFolga: DOM })] });
    expect(d.jornadaMin).toBe(0);
    expect(d.motivo).toBe("domingo");
  });

  it("compensação ADIANTADA (folgou antes) não perdoa nada — vira dívida combinada", () => {
    // A hora ainda não existe: perdoar o dia seria adiantar crédito. O motivo
    // tira o dia de "falta", e o trabalho futuro quita pelo motor de débito.
    const adiantada = par({ tipo: "compensacao_jornada", diaFolga: SEG, diaOrigem: TER });
    const d = diaDaPessoa(SEG, pessoa, { feriados: SEM_FERIADOS, compensacoes: [adiantada] });
    expect(d.jornadaMin).toBe(480);
    expect(d.motivo).toBe("folga_compensatoria");
    expect(d.compensacao).toMatchObject({ papel: "folga", adiantada: true, outroDia: TER });
  });

  it("ser folga de um par vence ser origem de outro", () => {
    const d = diaDaPessoa(TER, pessoa, {
      feriados: SEM_FERIADOS,
      compensacoes: [par({ id: "c2", diaOrigem: TER, diaFolga: "2026-09-16" }), par()],
    });
    expect(d.compensacao?.papel).toBe("folga");
    expect(d.jornadaMin).toBe(0);
  });
});

describe("a precedência inteira, numa tabela só", () => {
  const casos: [string, Parameters<typeof diaDaPessoa>[2], string | null][] = [
    ["férias por cima de tudo", { feriados: feriados({ [SEG]: "folga" }), afastamentos: [ferias(SEG, SEG), atestado(SEG, SEG)], compensacoes: [par({ diaFolga: SEG })] }, "ferias"],
    ["atestado por cima de feriado", { feriados: feriados({ [SEG]: "folga" }), afastamentos: [atestado(SEG, SEG)] }, "atestado"],
    ["feriado por cima de folga compensatória", { feriados: feriados({ [SEG]: "folga" }), compensacoes: [par({ diaFolga: SEG })] }, "feriado"],
    ["folga compensatória por cima da escala", { feriados: SEM_FERIADOS, compensacoes: [par({ diaFolga: SEG })] }, "folga_compensatoria"],
    ["escala, quando nada mais fala", { feriados: SEM_FERIADOS }, null],
  ];
  for (const [nome, ctx, esperado] of casos) {
    it(nome, () => expect(diaDaPessoa(SEG, pessoa, ctx).motivo).toBe(esperado));
  }
});

describe("o mês inteiro", () => {
  it("devolve um dia por data, na ordem", () => {
    const dias = diasDaPessoa(["2026-09-14", "2026-09-15", "2026-09-16"], pessoa, { feriados: SEM_FERIADOS });
    expect(dias.map((d) => d.dia)).toEqual(["2026-09-14", "2026-09-15", "2026-09-16"]);
  });

  it("férias de 30 dias não devem NENHUM minuto", () => {
    const dias = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
    const out = diasDaPessoa(dias, pessoa, { feriados: SEM_FERIADOS, afastamentos: [ferias("2026-09-01", "2026-09-30")] });
    expect(out.reduce((s, d) => s + d.jornadaMin, 0)).toBe(0);
    expect(out.every((d) => d.motivo === "ferias")).toBe(true);
  });
});

describe("os rótulos", () => {
  it("todo motivo tem rótulo, e todo ícone existe no Tabler do projeto", () => {
    for (const m of MOTIVOS_DO_DIA) {
      expect(ROTULO_MOTIVO[m]?.label, m).toBeTruthy();
      expect(ICONS[ROTULO_MOTIVO[m].icone], `${m} → ${ROTULO_MOTIVO[m].icone}`).toBeTruthy();
    }
  });
});
