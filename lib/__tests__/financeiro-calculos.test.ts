import { describe, it, expect } from "vitest";
import {
  parcelasDaCompra, geracoesPendentes, equivalenteMensal, statusEfetivo,
  resumoVisaoGeral, chaveDaCompra, chaveDaRecorrencia, diaSeguro, somarMeses,
  competenciaDe, centavos, fatias, alertas, noPatrimonio, hojeISO, unirPorId, fimDoMesSeguinte,
  diaDoVencimento,
} from "@/lib/financeiro/calculos";

/**
 * Os testes de aceite do §22 da especificação, mais as armadilhas de data que
 * já morderam este repositório antes (fuso e dia 31).
 */

describe("Parcelamento", () => {
  it("compra de R$ 9.000 em 3x gera exatamente 3 parcelas de R$ 3.000", () => {
    const p = parcelasDaCompra({ valor_total: 9000, plano: "parcelado", parcelas: 3, data: "2026-08-13" });
    expect(p).toHaveLength(3);
    expect(p.map((x) => x.valor)).toEqual([3000, 3000, 3000]);
    expect(p.map((x) => x.vencimento)).toEqual(["2026-09-13", "2026-10-13", "2026-11-13"]);
  });

  it("a soma das parcelas é o total — a sobra do centavo vai na última", () => {
    const p = parcelasDaCompra({ valor_total: 1000, plano: "parcelado", parcelas: 3, data: "2026-08-01" });
    expect(p.map((x) => x.valor)).toEqual([333.33, 333.33, 333.34]);
    expect(centavos(p.reduce((s, x) => s + x.valor, 0))).toBe(1000);
  });

  it("à vista é uma parcela na data da compra", () => {
    const p = parcelasDaCompra({ valor_total: 780, plano: "a_vista", data: "2026-08-09" });
    expect(p).toEqual([{ numero: 1, vencimento: "2026-08-09", valor: 780 }]);
  });

  it("a prazo respeita os dias combinados", () => {
    const p = parcelasDaCompra({ valor_total: 4500, plano: "prazo", prazo_dias: 30, data: "2026-08-13" });
    expect(p).toEqual([{ numero: 1, vencimento: "2026-09-12", valor: 4500 }]);
  });

  it("reprocessar a mesma compra devolve as MESMAS chaves (não duplica)", () => {
    const uma = parcelasDaCompra({ valor_total: 9000, plano: "parcelado", parcelas: 3, data: "2026-08-13" })
      .map((p) => chaveDaCompra("c1", p.numero));
    const outra = parcelasDaCompra({ valor_total: 9000, plano: "parcelado", parcelas: 3, data: "2026-08-13" })
      .map((p) => chaveDaCompra("c1", p.numero));
    expect(outra).toEqual(uma);
    expect(new Set(uma).size).toBe(3);
  });

  it("vencimento dia 31 não escorrega para o mês seguinte", () => {
    const p = parcelasDaCompra({
      valor_total: 300, plano: "parcelado", parcelas: 3, data: "2026-12-31", primeiro_vencimento: "2026-12-31",
    });
    // Janeiro tem 31, fevereiro não: vira 28 em vez de virar 3 de março.
    expect(p.map((x) => x.vencimento)).toEqual(["2026-12-31", "2027-01-31", "2027-02-28"]);
  });
});

describe("Datas", () => {
  it("dia 31 em fevereiro vira o último dia do mês", () => {
    expect(diaSeguro(2026, 2, 31)).toBe("2026-02-28");
    expect(diaSeguro(2028, 2, 31)).toBe("2028-02-29");
  });

  it("somar mês não perde o dia quando ele existe", () => {
    expect(somarMeses("2026-01-15", 1)).toBe("2026-02-15");
    expect(somarMeses("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("competência é sempre o 1º do mês", () => {
    expect(competenciaDe("2026-08-27")).toBe("2026-08-01");
  });
});

/**
 * "Hoje" é o dia de SÃO PAULO. A Vercel roda em UTC, e `toISOString()` dava o
 * dia da UTC: das 21h às 23h59 todo "vence hoje", "este mês" e "compras do mês"
 * do módulo apontavam para amanhã — e o pagamento das 22h entrava no dia
 * seguinte. O navegador concordava com o erro, então ele nunca apareceu em
 * teste; este aqui existe para ele não voltar.
 */
describe("Hoje é o dia de São Paulo, não o da UTC", () => {
  it("às 22h30 de 31/08 em São Paulo ainda é 31/08 (a UTC já está em 1º/09)", () => {
    expect(hojeISO(new Date("2026-08-31T22:30:00-03:00"))).toBe("2026-08-31");
    expect(hojeISO(new Date("2026-09-01T01:00:00Z"))).toBe("2026-08-31");
  });

  it("de manhã os dois calendários batem", () => {
    expect(hojeISO(new Date("2026-08-22T12:00:00Z"))).toBe("2026-08-22");
  });

  it("a virada do dia acontece à meia-noite de São Paulo (03:00 UTC)", () => {
    expect(hojeISO(new Date("2026-09-01T02:59:59Z"))).toBe("2026-08-31");
    expect(hojeISO(new Date("2026-09-01T03:00:00Z"))).toBe("2026-09-01");
  });

  it("o status 'atrasado' usa esse mesmo dia — a conta de hoje não atrasa às 21h", () => {
    const noite = new Date("2026-08-31T23:00:00-03:00");
    expect(statusEfetivo({ status: "pendente", vencimento: "2026-08-31" }, hojeISO(noite))).toBe("pendente");
  });
});

describe("Listas e janelas", () => {
  // A agenda vem de DUAS consultas (em aberto sem limite para trás + fechados
  // na janela); quem junta é isto, e repetido não pode virar linha dobrada.
  it("unirPorId mantém a primeira ocorrência e descarta o repetido", () => {
    const a = [{ id: "1", v: "a" }, { id: "2", v: "b" }];
    const b = [{ id: "2", v: "B" }, { id: "3", v: "c" }];
    expect(unirPorId(a, b).map((x) => x.id + x.v)).toEqual(["1a", "2b", "3c"]);
    expect(unirPorId()).toEqual([]);
  });

  it("o gerador de recorrências enxerga até o último dia REAL do mês que vem", () => {
    expect(fimDoMesSeguinte("2026-01-15")).toBe("2026-02-28");
    expect(fimDoMesSeguinte("2026-12-03")).toBe("2027-01-31");
    expect(fimDoMesSeguinte("2028-01-31")).toBe("2028-02-29");
  });
});

describe("Dia da recorrência acompanha a data escolhida", () => {
  // O defeito de set/2026: o formulário nascia com o dia de HOJE em
  // `dia_vencimento` e ele vencia a data que a pessoa escolheu. Vencimento
  // 05/10 cadastrado no dia 9 repetia todo dia 9 — e não todo dia 5.
  it("sem dia informado, é o dia do vencimento", () => {
    expect(diaDoVencimento("", "2026-10-05")).toBe(5);
    expect(diaDoVencimento(null, "2026-10-31")).toBe(31);
    expect(diaDoVencimento(undefined, "2026-10-20")).toBe(20);
  });
  it("dia informado vence a data", () => {
    expect(diaDoVencimento("15", "2026-10-05")).toBe(15);
    expect(diaDoVencimento(15, "2026-10-05")).toBe(15);
  });
  it("fora da faixa vira a borda; lixo vira o dia da data", () => {
    expect(diaDoVencimento("45", "2026-10-05")).toBe(31);
    expect(diaDoVencimento("0", "2026-10-05")).toBe(5);
    expect(diaDoVencimento("abc", "2026-10-05")).toBe(5);
    expect(diaDoVencimento("", "")).toBe(1);
  });
});

describe("Recorrências", () => {
  const base = {
    id: "r1", valor: 299, periodicidade: "mensal" as const, dia_vencimento: 10,
    inicio: "2026-06-01", status: "ativa", proxima_competencia: "2026-06-01",
  };

  it("gera exatamente um compromisso por competência", () => {
    const g = geracoesPendentes(base, "2026-08-31");
    expect(g.map((x) => x.competencia)).toEqual(["2026-06-01", "2026-07-01", "2026-08-01"]);
    expect(g.map((x) => x.vencimento)).toEqual(["2026-06-10", "2026-07-10", "2026-08-10"]);
  });

  it("as chaves de idempotência são únicas por competência", () => {
    const chaves = geracoesPendentes(base, "2026-08-31").map((x) => x.idempotency_key);
    expect(chaves).toEqual(["rec:r1:2026-06", "rec:r1:2026-07", "rec:r1:2026-08"]);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("rodar o gerador duas vezes produz o mesmo conjunto de chaves", () => {
    const a = geracoesPendentes(base, "2026-08-31").map((x) => x.idempotency_key);
    const b = geracoesPendentes(base, "2026-08-31").map((x) => x.idempotency_key);
    expect(b).toEqual(a);
  });

  it("pausada não gera nada — e não apaga o que já existe", () => {
    expect(geracoesPendentes({ ...base, status: "pausada" }, "2026-12-31")).toEqual([]);
    expect(geracoesPendentes({ ...base, status: "encerrada" }, "2026-12-31")).toEqual([]);
  });

  it("respeita a data de fim", () => {
    const g = geracoesPendentes({ ...base, fim: "2026-07-15" }, "2026-12-31");
    expect(g.map((x) => x.competencia)).toEqual(["2026-06-01", "2026-07-01"]);
  });

  it("trimestral anda de 3 em 3 meses", () => {
    const g = geracoesPendentes({ ...base, periodicidade: "trimestral" }, "2026-12-31");
    expect(g.map((x) => x.competencia)).toEqual(["2026-06-01", "2026-09-01", "2026-12-01"]);
  });

  it("customizada usa o intervalo declarado", () => {
    const g = geracoesPendentes({ ...base, periodicidade: "customizada", intervalo_meses: 4 }, "2027-01-31");
    expect(g.map((x) => x.competencia)).toEqual(["2026-06-01", "2026-10-01"]);
  });

  it("regra parada há anos não despeja duas décadas de uma vez", () => {
    const g = geracoesPendentes({ ...base, inicio: "1990-01-01", proxima_competencia: "1990-01-01" }, "2026-08-31");
    expect(g.length).toBeLessThanOrEqual(240);
  });

  it("equivalente mensal divide pela periodicidade", () => {
    expect(equivalenteMensal({ valor: 1200, periodicidade: "anual", intervalo_meses: 1 })).toBe(100);
    expect(equivalenteMensal({ valor: 299, periodicidade: "mensal", intervalo_meses: 1 })).toBe(299);
  });
});

describe("Status derivado", () => {
  it("vencido e em aberto é atrasado — sem job nenhum ter rodado", () => {
    expect(statusEfetivo({ status: "pendente", vencimento: "2026-08-01" }, "2026-08-14")).toBe("atrasado");
  });

  it("pago e cancelado nunca viram atrasado", () => {
    expect(statusEfetivo({ status: "pago", vencimento: "2026-01-01" }, "2026-08-14")).toBe("pago");
    expect(statusEfetivo({ status: "cancelado", vencimento: "2026-01-01" }, "2026-08-14")).toBe("cancelado");
  });

  it("quem vence hoje ainda não está atrasado", () => {
    expect(statusEfetivo({ status: "pendente", vencimento: "2026-08-14" }, "2026-08-14")).toBe("pendente");
  });
});

describe("Visão Geral", () => {
  const entrada = {
    contas: [
      { saldo: 62800, ativa: true, inclui_no_saldo: true },
      { saldo: 18200, ativa: true, inclui_no_saldo: true },
      // Cartão: limite não é dinheiro que eu tenho.
      { saldo: -4300, ativa: true, inclui_no_saldo: false },
      { saldo: 999, ativa: false, inclui_no_saldo: true },
    ],
    compromissos: [
      { status: "pendente" as const, vencimento: "2026-08-16", valor: 350 },
      { status: "agendado" as const, vencimento: "2026-08-20", valor: 8000 },
      { status: "pendente" as const, vencimento: "2026-09-05", valor: 12400 },
      { status: "pago" as const, vencimento: "2026-08-10", valor: 5000 },
      { status: "pendente" as const, vencimento: "2026-08-01", valor: 4200 },   // atrasado
    ],
    recorrencias: [
      { valor: 299, periodicidade: "mensal" as const, intervalo_meses: 1, status: "ativa" },
      { valor: 1200, periodicidade: "anual" as const, intervalo_meses: 1, status: "ativa" },
      { valor: 5000, periodicidade: "mensal" as const, intervalo_meses: 1, status: "pausada" },
    ],
    compras: [
      { data: "2026-08-13", valor_total: 4500, status: "recebida" },
      { data: "2026-08-02", valor_total: 890, status: "confirmada" },
      { data: "2026-07-30", valor_total: 9999, status: "recebida" },      // mês passado
      { data: "2026-08-05", valor_total: 7777, status: "cancelada" },     // cancelada não conta
    ],
    colaboradores: [
      { salario_base: 3000, beneficios: 500, status: "ativo" },
      { salario_base: 2000, beneficios: 0, status: "afastado" },
      { salario_base: 9000, beneficios: 0, status: "desligado" },
    ],
    hoje: "2026-08-14",
  };

  const r = resumoVisaoGeral(entrada);

  it("saldo disponível soma só conta ativa que entra no saldo", () => {
    expect(r.saldo_disponivel).toBe(81000);
  });

  it("a pagar 7 dias pega só a janela, e só o que está em aberto", () => {
    // 16/08 e 20/08 cabem na janela de 7 dias a partir de 14/08; o de 05/09
    // não, o pago não conta e o atrasado (01/08) fica de fora — ele é passado,
    // não "a pagar nos próximos dias", e some no cartão de atraso.
    expect(r.a_pagar_7).toBe(8350);
  });

  it("a pagar 30 dias inclui o que vence depois, sem o atrasado nem o pago", () => {
    expect(r.a_pagar_30).toBe(350 + 8000 + 12400);
  });

  it("atrasado é contado à parte", () => {
    expect(r.atrasado).toBe(4200);
  });

  it("recorrências do mês usam o equivalente mensal e ignoram pausada", () => {
    expect(r.recorrencias_mes).toBe(399);
  });

  it("compras do mês ignoram cancelada e outro mês", () => {
    expect(r.compras_mes).toBe(5390);
  });

  it("folha ignora desligado e soma benefício", () => {
    expect(r.folha_mes).toBe(5500);
  });
});

describe("O que ainda é patrimônio da empresa", () => {
  it("baixado e vendido não somam — a empresa não tem mais", () => {
    // O total dizia R$ 156.430 com R$ 22.100 de coisa descartada ou com dono
    // novo. Mesma regra da compra cancelada, que não entra em "compras do mês".
    expect(noPatrimonio("baixado")).toBe(false);
    expect(noPatrimonio("vendido")).toBe(false);
  });

  it("em uso, estoque e manutenção somam — continuam sendo dela", () => {
    // Manutenção é o que mais confunde: o bem está fora de operação, mas
    // continua sendo da empresa e volta.
    expect(noPatrimonio("em_uso")).toBe(true);
    expect(noPatrimonio("estoque")).toBe(true);
    expect(noPatrimonio("manutencao")).toBe(true);
  });

  it("status desconhecido soma — na dúvida o bem é da empresa", () => {
    // Sumir do total por causa de um status que o catálogo ainda não conhece
    // esconderia patrimônio; aparecer a mais é erro que alguém percebe.
    expect(noPatrimonio("qualquer_coisa_nova")).toBe(true);
  });
});

describe("Fatias (barras de resumo)", () => {
  it("a barra é proporcional ao maior, não ao total", () => {
    const f = fatias(
      [{ c: "a", v: 100 }, { c: "b", v: 50 }, { c: "a", v: 100 }],
      (x) => x.c, (x) => x.v, (id) => ({ label: id.toUpperCase(), cor: "var(--cat-1)" }),
    );
    expect(f[0]).toMatchObject({ id: "a", valor: 200, proporcao: 1 });
    expect(f[1]).toMatchObject({ id: "b", valor: 50, proporcao: 0.25 });
  });

  it("categoria com valor zero ainda aparece (não vira barra invisível)", () => {
    const f = fatias([{ c: "z", v: 0 }], (x) => x.c, (x) => x.v, (id) => ({ label: id, cor: "var(--neutro)" }));
    expect(f[0].proporcao).toBe(0);
  });
});

describe("Alertas", () => {
  const base = {
    compromissos: [
      { id: "1", descricao: "Internet", status: "pendente" as const, vencimento: "2026-08-14", valor: 350 },
      { id: "2", descricao: "Aluguel", status: "pendente" as const, vencimento: "2026-08-16", valor: 8000 },
      { id: "3", descricao: "DAS", status: "pendente" as const, vencimento: "2026-08-01", valor: 4200 },
      { id: "4", descricao: "Pago", status: "pago" as const, vencimento: "2026-08-01", valor: 1 },
    ],
    notasSemCompra: 2,
    patrimonioGarantia: [{ descricao: "Notebook", garantia_ate: "2026-09-01" }],
    hoje: "2026-08-14",
  };

  it("aponta atrasado, hoje, em 3 dias, nota sem compra e garantia", () => {
    expect(alertas(base).map((a) => a.chave))
      .toEqual(["atrasado", "hoje", "em3", "nota_sem_compra", "garantia"]);
  });

  it("compromisso pago não vira alerta", () => {
    const so = alertas({ ...base, compromissos: [base.compromissos[3]], notasSemCompra: 0, patrimonioGarantia: [] });
    expect(so).toEqual([]);
  });

  // §18 "Renovação": a regra ATIVA cujo contrato acaba em até 30 dias. Depois
  // do `fim` ela para de gerar sozinha, e a primeira notícia seria o serviço
  // cortado.
  it("recorrência ativa que acaba em 30 dias pede renovação; pausada e longe não", () => {
    const chaves = alertas({
      ...base,
      recorrencias: [
        { descricao: "Software", status: "ativa", fim: "2026-09-01" },     // 18 dias: alerta
        { descricao: "Aluguel", status: "ativa", fim: "2026-12-31" },      // longe: não
        { descricao: "Internet", status: "pausada", fim: "2026-08-20" },   // pausada: não
        { descricao: "Sem fim", status: "ativa", fim: null },              // sem fim: não
        { descricao: "Já acabou", status: "ativa", fim: "2026-08-01" },    // passado: não
      ],
    });
    const renov = chaves.find((a) => a.chave === "renovacao");
    expect(renov?.titulo).toBe("1 recorrência vence em 30 dias");
    expect(renov?.detalhe).toBe("Software");
  });

  // §18 "Compra sem nota": o contador chega pronto (a tolerância de dias é do
  // `contarComprasSemNota`); aqui só se prova que zero não alerta e N alerta.
  it("compra confirmada sem nota vira alerta; zero não", () => {
    expect(alertas({ ...base, comprasSemNota: 0 }).map((a) => a.chave)).not.toContain("compra_sem_nota");
    const com = alertas({ ...base, comprasSemNota: 2 }).find((a) => a.chave === "compra_sem_nota");
    expect(com?.titulo).toBe("2 compras confirmadas sem nota");
    expect(com?.href).toContain("/financeiro/compras");
  });

  it("a ordem dos alertas é fixa — o mais urgente primeiro", () => {
    // A tela e o sino leem a lista na ordem; se ela mudar por acaso, o atrasado
    // cai para baixo de uma garantia que vence daqui a um mês.
    const todos = alertas({
      ...base,
      recorrencias: [{ descricao: "Software", status: "ativa", fim: "2026-09-01" }],
      comprasSemNota: 1,
    }).map((a) => a.chave);
    expect(todos).toEqual([
      "atrasado", "hoje", "em3", "nota_sem_compra", "renovacao", "compra_sem_nota", "garantia",
    ]);
  });
});
