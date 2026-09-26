import { describe, it, expect } from "vitest";
import { geracoesPendentes, type RegraRecorrente } from "@/lib/financeiro/calculos";

/**
 * Recorrência de valor VARIÁVEL — luz, água, cartão, comissão.
 *
 * A regra guardava um `valor` só, e isso obriga a escolher entre duas mentiras:
 * repetir o valor do mês passado (a agenda mostra um número que ninguém
 * combinou) ou deixar zero (o "a pagar" some, e previsão de caixa que engana
 * PARA MENOS é pior que número nenhum, porque ninguém desconfia dela).
 *
 * A saída é dizer a verdade: o `valor` da regra vira ESTIMATIVA, a linha nasce
 * marcada como palpite, e quem sabe o número do mês o informa antes — aí o
 * combinado vence e a marca some.
 */

const regra = (over: Partial<RegraRecorrente> = {}): RegraRecorrente => ({
  id: "r1", valor: 300, periodicidade: "mensal", intervalo_meses: 1,
  dia_vencimento: 10, inicio: "2026-01-10", proxima_competencia: "2026-08-01",
  status: "ativa", ...over,
});

describe("Regra de valor FIXO — nada muda", () => {
  it("continua gerando o valor da regra", () => {
    const g = geracoesPendentes(regra(), "2026-09-30");
    expect(g.map((x) => x.valor)).toEqual([300, 300]);
  });

  it("nunca é marcada como estimativa", () => {
    // Só a regra que AVISA que varia produz palpite. Sem o aviso, o valor é
    // combinado por definição.
    for (const g of geracoesPendentes(regra(), "2026-09-30")) {
      expect(g.estimado).toBeUndefined();
    }
  });

  it("ignora valores combinados que não pediu", () => {
    // Defesa contra dado velho: apagar o `valor_variavel` de uma regra não
    // pode fazer combinados antigos continuarem mandando... mas o combinado
    // explícito PARA AQUELE MÊS ainda vale, porque alguém o escreveu.
    const g = geracoesPendentes(regra(), "2026-08-31", { "2026-08-01": 512 });
    expect(g[0].valor).toBe(512);
    expect(g[0].estimado).toBeUndefined();
  });
});

describe("Regra de valor VARIÁVEL", () => {
  const luz = regra({ valor_variavel: true, valor: 480 });

  it("gera assim mesmo — a conta de luz existe antes da fatura chegar", () => {
    const g = geracoesPendentes(luz, "2026-10-31");
    expect(g).toHaveLength(3);
    expect(g.map((x) => x.vencimento)).toEqual(["2026-08-10", "2026-09-10", "2026-10-10"]);
  });

  it("sem número informado, usa a estimativa E marca como palpite", () => {
    // Zerar faria o "a pagar" mentir para menos, que é a pior direção.
    const g = geracoesPendentes(luz, "2026-08-31");
    expect(g[0].valor).toBe(480);
    expect(g[0].estimado).toBe(true);
  });

  it("o número combinado vence a estimativa, e a marca some", () => {
    const g = geracoesPendentes(luz, "2026-09-30", { "2026-09-01": 617.42 });
    expect(g[0]).toMatchObject({ competencia: "2026-08-01", valor: 480, estimado: true });
    expect(g[1]).toMatchObject({ competencia: "2026-09-01", valor: 617.42 });
    expect(g[1].estimado).toBeUndefined();
  });

  it("combinar zero é combinar — não vira estimativa", () => {
    // Mês sem cobrança é informação, não ausência dela.
    const g = geracoesPendentes(luz, "2026-08-31", { "2026-08-01": 0 });
    expect(g[0].valor).toBe(0);
    expect(g[0].estimado).toBeUndefined();
  });

  it("combinado de outro mês não vaza", () => {
    const g = geracoesPendentes(luz, "2026-09-30", { "2026-12-01": 999 });
    expect(g.every((x) => x.valor === 480 && x.estimado)).toBe(true);
  });

  it("valor combinado é arredondado a centavos, como todo dinheiro do módulo", () => {
    const g = geracoesPendentes(luz, "2026-08-31", { "2026-08-01": 100.005 });
    expect(g[0].valor).toBe(100.01);
  });

  it("a chave de idempotência não muda com o valor", () => {
    // Informar o número depois não pode gerar um SEGUNDO compromisso do mesmo
    // mês — a chave é (regra, competência), e o valor não entra nela.
    const semValor = geracoesPendentes(luz, "2026-08-31");
    const comValor = geracoesPendentes(luz, "2026-08-31", { "2026-08-01": 617 });
    expect(comValor[0].idempotency_key).toBe(semValor[0].idempotency_key);
  });

  it("regra pausada não gera, variável ou não", () => {
    expect(geracoesPendentes(regra({ valor_variavel: true, status: "pausada" }), "2026-12-31")).toEqual([]);
  });
});
