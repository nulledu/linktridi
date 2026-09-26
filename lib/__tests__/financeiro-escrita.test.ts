import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * As operações que mexem em dinheiro (lib/financeiro/escrita.ts).
 *
 * O banco de mentira daqui APLICA os índices únicos de verdade
 * (`supabase/financeiro.sql`): `(empresa_id, idempotency_key)` nos compromissos
 * e movimentos, `(compra_id, numero)` nas parcelas. Sem isso o teste provaria
 * só que o código chama as funções na ordem certa — e a pergunta do §22 é outra:
 * o que acontece quando a MESMA chamada chega duas vezes.
 *
 * É o cenário real: clique duplo, retry de timeout do celular na rede da
 * empresa, e o job de recorrência rodando de novo depois de uma falha.
 */

type Linha = Record<string, unknown>;

// Os índices únicos que o SQL declara. Repetidos aqui de propósito: se um sair
// do arquivo .sql sem sair daqui, o teste continua verde e a trava some em
// produção — então o par tem que ser conferido junto (financeiro-sql-roda.test.ts
// prova que eles existem no banco de verdade).
const UNICOS: Record<string, string[][]> = {
  fin_compromissos: [["empresa_id", "idempotency_key"]],
  fin_movimentos: [["empresa_id", "idempotency_key"]],
  fin_compra_parcelas: [["compra_id", "numero"]],
  fin_patrimonio: [["empresa_id", "idempotency_key"], ["empresa_id", "codigo"]],
};

const DUPLICADO = { code: "23505", message: "duplicate key value violates unique constraint" };

class Banco {
  tabelas: Record<string, Linha[]> = {};
  seq = 0;

  linhas(t: string): Linha[] {
    return (this.tabelas[t] ??= []);
  }

  proximoId(): string {
    return `id-${++this.seq}`;
  }

  /** Devolve a chave única violada, ou null. `null` na chave não conflita (é o `where … is not null` do índice parcial). */
  conflito(tabela: string, linha: Linha): string[] | null {
    for (const cols of UNICOS[tabela] ?? []) {
      if (cols.some((c) => linha[c] == null)) continue;
      const bate = this.linhas(tabela).some((l) => cols.every((c) => l[c] === linha[c]));
      if (bate) return cols;
    }
    return null;
  }
}

type Filtro = (l: Linha) => boolean;

class Consulta implements PromiseLike<{ data: unknown; error: unknown }> {
  private filtros: Filtro[] = [];
  private acao: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private carga: Linha[] = [];
  private patch: Linha = {};
  private opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private unico = false;
  private devolve = false;

  constructor(private banco: Banco, private tabela: string) {}

  select() { if (this.acao === "select") this.acao = "select"; this.devolve = true; return this; }
  eq(c: string, v: unknown) { this.filtros.push((l) => l[c] === v); return this; }
  neq(c: string, v: unknown) { this.filtros.push((l) => l[c] !== v); return this; }
  is(c: string, v: unknown) { this.filtros.push((l) => (l[c] ?? null) === v); return this; }
  in(c: string, vs: unknown[]) { this.filtros.push((l) => vs.includes(l[c])); return this; }
  gte(c: string, v: string) { this.filtros.push((l) => String(l[c] ?? "") >= v); return this; }
  lte(c: string, v: string) { this.filtros.push((l) => String(l[c] ?? "") <= v); return this; }
  ilike() { return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { this.unico = true; return this; }

  insert(rows: Linha | Linha[]) { this.acao = "insert"; this.carga = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows: Linha | Linha[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.acao = "upsert"; this.carga = Array.isArray(rows) ? rows : [rows]; this.opts = opts; return this;
  }
  update(p: Linha) { this.acao = "update"; this.patch = p; return this; }
  delete() { this.acao = "delete"; return this; }

  private casam(): Linha[] {
    return this.banco.linhas(this.tabela).filter((l) => this.filtros.every((f) => f(l)));
  }

  private executar(): { data: unknown; error: unknown } {
    const t = this.tabela;
    switch (this.acao) {
      case "insert": {
        const criadas: Linha[] = [];
        for (const bruta of this.carga) {
          const linha = { id: this.banco.proximoId(), ...bruta };
          if (this.banco.conflito(t, linha)) return { data: null, error: DUPLICADO };
          this.banco.linhas(t).push(linha);
          criadas.push(linha);
        }
        return { data: this.unico ? (criadas[0] ?? null) : criadas, error: null };
      }
      case "upsert": {
        const criadas: Linha[] = [];
        for (const bruta of this.carga) {
          const linha = { id: this.banco.proximoId(), ...bruta };
          if (this.banco.conflito(t, linha)) {
            // `ignoreDuplicates` é o "on conflict do nothing" do PostgREST.
            if (this.opts.ignoreDuplicates) continue;
            return { data: null, error: DUPLICADO };
          }
          this.banco.linhas(t).push(linha);
          criadas.push(linha);
        }
        return { data: this.unico ? (criadas[0] ?? null) : criadas, error: null };
      }
      case "update": {
        const alvos = this.casam();
        for (const l of alvos) Object.assign(l, this.patch);
        return { data: this.unico ? (alvos[0] ?? null) : alvos, error: null };
      }
      case "delete": {
        const alvos = new Set(this.casam());
        this.banco.tabelas[t] = this.banco.linhas(t).filter((l) => !alvos.has(l));
        return { data: null, error: null };
      }
      default: {
        const alvos = this.casam();
        return { data: this.unico ? (alvos[0] ?? null) : alvos, error: null };
      }
    }
  }

  then<R1 = { data: unknown; error: unknown }, R2 = never>(
    ok?: ((v: { data: unknown; error: unknown }) => R1 | PromiseLike<R1>) | null,
    falha?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.executar()).then(ok, falha);
  }
}

let banco: Banco;
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({ from: (t: string) => new Consulta(banco, t) }),
}));

const { confirmarCompra, pagarCompromisso, reverterPagamento, transferir, gerarRecorrencias, gerarFolha,
  ajustarSaldo } =
  await import("../financeiro/escrita");

const AUTOR = { id: "u1", nome: "Douglas" };
const EMP = "emp-tridi";

beforeEach(() => {
  banco = new Banco();
  banco.linhas("fin_contas").push(
    { id: "conta-itau", empresa_id: EMP, nome: "Itaú" },
    { id: "conta-inter", empresa_id: EMP, nome: "Inter" },
    { id: "conta-gedux", empresa_id: "emp-gedux", nome: "Conta da Gedux" },
  );
});

const compromissos = () => banco.linhas("fin_compromissos");
const movimentos = () => banco.linhas("fin_movimentos");

function criarCompra(over: Linha = {}) {
  const compra = {
    id: "compra-1", empresa_id: EMP, descricao: "MDF 3mm", data: "2026-08-13",
    categoria: "materia_prima", valor_total: 9000, plano: "parcelado", parcelas: 3,
    prazo_dias: null, primeiro_vencimento: null, conta_id: "conta-itau",
    fornecedor_id: null, status: "rascunho", ...over,
  };
  banco.linhas("fin_compras").push(compra);
  return compra;
}

describe("Confirmar compra", () => {
  it("compra de R$ 9.000 em 3x gera exatamente 3 compromissos", async () => {
    criarCompra();
    const r = await confirmarCompra("compra-1", AUTOR);

    expect(r.ok).toBe(true);
    expect(compromissos()).toHaveLength(3);
    expect(compromissos().map((c) => c.valor)).toEqual([3000, 3000, 3000]);
    expect(compromissos().map((c) => c.descricao)).toEqual([
      "MDF 3mm (1/3)", "MDF 3mm (2/3)", "MDF 3mm (3/3)",
    ]);
    expect(banco.linhas("fin_compra_parcelas")).toHaveLength(3);
    expect(banco.linhas("fin_compras")[0].status).toBe("confirmada");
  });

  it("reprocessar a compra NÃO duplica parcela nem compromisso", async () => {
    criarCompra();
    await confirmarCompra("compra-1", AUTOR);
    await confirmarCompra("compra-1", AUTOR);
    await confirmarCompra("compra-1", AUTOR);

    expect(compromissos()).toHaveLength(3);
    expect(banco.linhas("fin_compra_parcelas")).toHaveLength(3);
  });

  it("compra à vista gera um compromisso só, na data da compra", async () => {
    criarCompra({ plano: "a_vista", parcelas: 1, valor_total: 780, data: "2026-08-09" });
    await confirmarCompra("compra-1", AUTOR);

    expect(compromissos()).toHaveLength(1);
    expect(compromissos()[0]).toMatchObject({ vencimento: "2026-08-09", valor: 780, descricao: "MDF 3mm" });
  });

  it("compra cancelada não vira compromisso", async () => {
    criarCompra({ status: "cancelada" });
    const r = await confirmarCompra("compra-1", AUTOR);
    expect(r.ok).toBe(false);
    expect(compromissos()).toHaveLength(0);
  });

  it("o compromisso aponta para a compra que o gerou", async () => {
    criarCompra();
    await confirmarCompra("compra-1", AUTOR);
    expect(compromissos()[0]).toMatchObject({ origem: "compra", origem_id: "compra-1", parcela_total: 3 });
  });
});

describe("Compra que vira patrimônio", () => {
  it("compra marcada gera o bem, vinculado à compra", async () => {
    criarCompra({ gera_patrimonio: true, descricao: "Empilhadeira elétrica", valor_total: 18900, fornecedor_id: "f1" });
    await confirmarCompra("compra-1", AUTOR);

    const bens = banco.linhas("fin_patrimonio");
    expect(bens).toHaveLength(1);
    expect(bens[0]).toMatchObject({
      descricao: "Empilhadeira elétrica",
      valor: 18900,
      compra_id: "compra-1",
      fornecedor_id: "f1",
      status: "em_uso",
    });
  });

  it("o bem NÃO cria despesa nova — o custo já foi contado na compra", async () => {
    criarCompra({ gera_patrimonio: true, plano: "a_vista", parcelas: 1, valor_total: 890 });
    await confirmarCompra("compra-1", AUTOR);

    // Um compromisso (o da compra) e nenhum a mais por causa do bem. Contar de
    // novo dobraria a saída no dashboard (§21).
    expect(compromissos()).toHaveLength(1);
    expect(compromissos()[0].origem).toBe("compra");
    expect(movimentos()).toHaveLength(0);
  });

  it("reprocessar a compra NÃO duplica o bem", async () => {
    criarCompra({ gera_patrimonio: true });
    await confirmarCompra("compra-1", AUTOR);
    await confirmarCompra("compra-1", AUTOR);
    await confirmarCompra("compra-1", AUTOR);

    // Patrimônio duplicado não é uma linha a mais numa lista: é o total do
    // patrimônio da empresa contando duas vezes o que existe uma vez só.
    expect(banco.linhas("fin_patrimonio")).toHaveLength(1);
  });

  it("compra sem a marca não gera bem nenhum", async () => {
    criarCompra({ gera_patrimonio: false });
    await confirmarCompra("compra-1", AUTOR);
    expect(banco.linhas("fin_patrimonio")).toHaveLength(0);
  });
});

describe("Folha do mês", () => {
  function equipe() {
    banco.linhas("fin_colaboradores").push(
      { id: "p1", empresa_id: EMP, nome: "Douglas", salario_base: 3000, beneficios: 500, dia_pagamento: 5, status: "ativo" },
      { id: "p2", empresa_id: EMP, nome: "Amanda", salario_base: 2500, beneficios: 0, dia_pagamento: 31, status: "afastado" },
      { id: "p3", empresa_id: EMP, nome: "Ex-funcionário", salario_base: 9000, beneficios: 0, dia_pagamento: 5, status: "desligado" },
      { id: "p4", empresa_id: EMP, nome: "Estagiário sem cadastro", salario_base: 0, beneficios: 0, dia_pagamento: 5, status: "ativo" },
      { id: "p5", empresa_id: "emp-gedux", nome: "Da Gedux", salario_base: 4000, beneficios: 0, dia_pagamento: 5, status: "ativo" },
    );
  }

  it("gera um compromisso por pessoa que tem o que receber", async () => {
    equipe();
    const r = await gerarFolha(EMP, "2026-02-01", AUTOR);

    expect(r.ok).toBe(true);
    expect(compromissos()).toHaveLength(2);
    expect(compromissos().map((c) => c.descricao)).toEqual(["Folha — Douglas", "Folha — Amanda"]);
    expect(compromissos().map((c) => c.valor)).toEqual([3500, 2500]);
  });

  it("desligado não entra; afastado entra", async () => {
    equipe();
    await gerarFolha(EMP, "2026-02-01", AUTOR);
    const nomes = compromissos().map((c) => c.descricao);
    expect(nomes).not.toContain("Folha — Ex-funcionário");
    expect(nomes).toContain("Folha — Amanda");
  });

  it("dia 31 em fevereiro vira 28 — folha não escorrega para o mês seguinte", async () => {
    equipe();
    await gerarFolha(EMP, "2026-02-01", AUTOR);
    const amanda = compromissos().find((c) => c.descricao === "Folha — Amanda");
    expect(amanda?.vencimento).toBe("2026-02-28");
  });

  it("quem está zerado não vira uma conta de R$ 0,00 na agenda", async () => {
    equipe();
    await gerarFolha(EMP, "2026-02-01", AUTOR);
    expect(compromissos().map((c) => c.descricao)).not.toContain("Folha — Estagiário sem cadastro");
  });

  it("gerar de novo não paga ninguém duas vezes", async () => {
    equipe();
    await gerarFolha(EMP, "2026-02-01", AUTOR);
    await gerarFolha(EMP, "2026-02-01", AUTOR);
    await gerarFolha(EMP, "2026-02-01", AUTOR);
    expect(compromissos()).toHaveLength(2);
  });

  it("o fechamento sobrevive: editar o valor e gerar de novo não desfaz a edição", async () => {
    equipe();
    await gerarFolha(EMP, "2026-02-01", AUTOR);
    // §13: o salário-base é projeção; o fechamento confirma o valor real.
    const douglas = compromissos().find((c) => c.descricao === "Folha — Douglas")!;
    douglas.valor = 3712.45;

    await gerarFolha(EMP, "2026-02-01", AUTOR);

    expect(compromissos().find((c) => c.descricao === "Folha — Douglas")!.valor).toBe(3712.45);
  });

  it("cada mês é uma competência — março não conflita com fevereiro", async () => {
    equipe();
    await gerarFolha(EMP, "2026-02-01", AUTOR);
    await gerarFolha(EMP, "2026-03-01", AUTOR);
    expect(compromissos()).toHaveLength(4);
  });

  it("não vaza para outra empresa", async () => {
    equipe();
    await gerarFolha(EMP, "2026-02-01", AUTOR);
    expect(compromissos().every((c) => c.empresa_id === EMP)).toBe(true);
  });

  /**
   * O que muda no mês. Todo `valor` aqui é POSITIVO — quem decide se soma ou
   * subtrai é o catálogo `LANCAMENTO`. É a regra que impede o vale de virar
   * crédito quando alguém digita "-200" num campo que já desconta.
   */
  function lancar(colaborador_id: string, tipo: string, valor: number, competencia = "2026-02-01") {
    banco.linhas("fin_folha_lancamentos").push({
      id: `l-${banco.linhas("fin_folha_lancamentos").length + 1}`,
      empresa_id: EMP, colaborador_id, competencia, tipo, valor,
    });
  }

  it("bônus soma e vale desconta, sem ninguém digitar sinal", async () => {
    equipe();
    lancar("p1", "bonus", 400);
    lancar("p1", "adiantamento", 150);
    await gerarFolha(EMP, "2026-02-01", AUTOR);
    // 3000 + 500 + 400 − 150
    expect(compromissos().find((c) => c.descricao === "Folha — Douglas")?.valor).toBe(3750);
  });

  it("farmácia e mercadinho descontam", async () => {
    equipe();
    lancar("p1", "farmacia", 80);
    lancar("p1", "mercadinho", 120);
    await gerarFolha(EMP, "2026-02-01", AUTOR);
    expect(compromissos().find((c) => c.descricao === "Folha — Douglas")?.valor).toBe(3300);
  });

  it("a gratificação é fixa e entra todo mês", async () => {
    banco.linhas("fin_colaboradores").push(
      { id: "g1", empresa_id: EMP, nome: "Com gratificação", salario_base: 2000, beneficios: 0, gratificacao: 350, dia_pagamento: 5, status: "ativo" },
    );
    await gerarFolha(EMP, "2026-02-01", AUTOR);
    expect(compromissos().find((c) => c.descricao === "Folha — Com gratificação")?.valor).toBe(2350);
  });

  it("lançamento de OUTRO mês não entra nesta competência", async () => {
    equipe();
    lancar("p1", "adiantamento", 900, "2026-03-01");
    await gerarFolha(EMP, "2026-02-01", AUTOR);
    // Sem o filtro de competência, o vale de março derrubaria a folha de
    // fevereiro para 2600 — e o erro só apareceria no pagamento.
    expect(compromissos().find((c) => c.descricao === "Folha — Douglas")?.valor).toBe(3500);
  });

  it("desconto maior que o salário para em zero, e a pessoa sai da folha", async () => {
    equipe();
    lancar("p1", "adiantamento", 99_000);
    await gerarFolha(EMP, "2026-02-01", AUTOR);
    // Compromisso NEGATIVO seria a empresa cobrando da pessoa pela agenda de
    // contas a pagar. Acerto de dívida é outro assunto, com outro documento.
    expect(compromissos().map((c) => c.descricao)).not.toContain("Folha — Douglas");
    expect(compromissos().every((c) => Number(c.valor) > 0)).toBe(true);
  });
});

describe("Pagar compromisso", () => {
  async function umCompromisso(over: Linha = {}) {
    banco.linhas("fin_compromissos").push({
      id: "cmp-1", empresa_id: EMP, descricao: "Internet Vivo", valor: 350,
      status: "pendente", origem: "manual", origem_id: null, ...over,
    });
  }

  it("grava a baixa, cria o movimento e mexe no saldo", async () => {
    await umCompromisso();
    const r = await pagarCompromisso({ compromissoId: "cmp-1", contaId: "conta-itau" }, AUTOR);

    expect(r.ok).toBe(true);
    expect(compromissos()[0].status).toBe("pago");
    expect(movimentos()).toHaveLength(1);
    // Saída é NEGATIVA — o saldo da conta é uma soma, não um `case`.
    expect(movimentos()[0]).toMatchObject({ valor: -350, tipo: "saida", conta_id: "conta-itau" });
  });

  it("clique duplo gera SOMENTE um movimento", async () => {
    await umCompromisso();
    const [a, b] = await Promise.all([
      pagarCompromisso({ compromissoId: "cmp-1", contaId: "conta-itau" }, AUTOR),
      pagarCompromisso({ compromissoId: "cmp-1", contaId: "conta-itau" }, AUTOR),
    ]);

    expect(movimentos()).toHaveLength(1);
    // As duas chamadas respondem sucesso: o estado final é o que a pessoa
    // pediu. Devolver erro na segunda faria a tela dizer "falhou" para uma
    // conta que acabou de ser paga.
    expect(a.ok && b.ok).toBe(true);
    expect(a.jaEstava || b.jaEstava).toBe(true);
  });

  it("pagar de novo depois de já pago não cria movimento novo", async () => {
    await umCompromisso();
    await pagarCompromisso({ compromissoId: "cmp-1", contaId: "conta-itau" }, AUTOR);
    const r = await pagarCompromisso({ compromissoId: "cmp-1", contaId: "conta-itau" }, AUTOR);

    expect(r.jaEstava).toBe(true);
    expect(movimentos()).toHaveLength(1);
  });

  it("recusa conta de outra empresa", async () => {
    await umCompromisso();
    const r = await pagarCompromisso({ compromissoId: "cmp-1", contaId: "conta-gedux" }, AUTOR);

    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/outra empresa/);
    expect(movimentos()).toHaveLength(0);
  });

  it("compromisso cancelado não pode ser pago", async () => {
    await umCompromisso({ status: "cancelado" });
    const r = await pagarCompromisso({ compromissoId: "cmp-1", contaId: "conta-itau" }, AUTOR);
    expect(r.ok).toBe(false);
    expect(movimentos()).toHaveLength(0);
  });

  it("pagamento parcial grava o valor informado, não o do compromisso", async () => {
    await umCompromisso();
    await pagarCompromisso({ compromissoId: "cmp-1", contaId: "conta-itau", valor: 200 }, AUTOR);
    expect(movimentos()[0].valor).toBe(-200);
    expect(compromissos()[0].pago_valor).toBe(200);
  });

  it("compra fica 'recebida' quando a última parcela é paga", async () => {
    criarCompra({ valor_total: 300, parcelas: 2 });
    await confirmarCompra("compra-1", AUTOR);
    const parcelas = compromissos().map((c) => c.id as string);

    await pagarCompromisso({ compromissoId: parcelas[0], contaId: "conta-itau" }, AUTOR);
    expect(banco.linhas("fin_compras")[0].status).toBe("confirmada");

    await pagarCompromisso({ compromissoId: parcelas[1], contaId: "conta-itau" }, AUTOR);
    expect(banco.linhas("fin_compras")[0].status).toBe("recebida");
  });
});

describe("Reverter pagamento", () => {
  it("preserva o movimento original e lança um estorno", async () => {
    banco.linhas("fin_compromissos").push({
      id: "cmp-1", empresa_id: EMP, descricao: "DAS", valor: 18000, status: "pendente", origem: "manual",
    });
    await pagarCompromisso({ compromissoId: "cmp-1", contaId: "conta-itau" }, AUTOR);
    const r = await reverterPagamento("cmp-1", AUTOR);

    expect(r.ok).toBe(true);
    expect(movimentos()).toHaveLength(2);

    const [original, estorno] = movimentos();
    // O original CONTINUA lá — apagar destruiria o extrato (§19).
    expect(original).toMatchObject({ valor: -18000, status: "revertido" });
    expect(estorno).toMatchObject({ valor: 18000, tipo: "reversao", reverte_id: original.id });
    // Somados, os dois se anulam: o saldo volta ao que era.
    expect(Number(original.valor) + Number(estorno.valor)).toBe(0);

    expect(compromissos()[0]).toMatchObject({ status: "pendente", pago_em: null, pago_valor: null });
  });

  it("reverter duas vezes não empilha estorno", async () => {
    banco.linhas("fin_compromissos").push({
      id: "cmp-1", empresa_id: EMP, descricao: "DAS", valor: 100, status: "pendente", origem: "manual",
    });
    await pagarCompromisso({ compromissoId: "cmp-1", contaId: "conta-itau" }, AUTOR);
    await reverterPagamento("cmp-1", AUTOR);
    const r = await reverterPagamento("cmp-1", AUTOR);

    expect(r.jaEstava).toBe(true);
    expect(movimentos()).toHaveLength(2);
  });
});

describe("Transferência entre contas", () => {
  it("cria duas pernas com o mesmo grupo", async () => {
    const r = await transferir({ empresaId: EMP, deId: "conta-itau", paraId: "conta-inter", valor: 5000 }, AUTOR);

    expect(r.ok).toBe(true);
    expect(movimentos()).toHaveLength(2);
    const [saida, entrada] = movimentos();
    expect(saida.valor).toBe(-5000);
    expect(entrada.valor).toBe(5000);
    expect(saida.transfer_group_id).toBe(entrada.transfer_group_id);
  });

  it("recusa transferir para a mesma conta", async () => {
    const r = await transferir({ empresaId: EMP, deId: "conta-itau", paraId: "conta-itau", valor: 100 }, AUTOR);
    expect(r.ok).toBe(false);
    expect(movimentos()).toHaveLength(0);
  });

  it("recusa conta de outra empresa", async () => {
    const r = await transferir({ empresaId: EMP, deId: "conta-itau", paraId: "conta-gedux", valor: 100 }, AUTOR);
    expect(r.ok).toBe(false);
    expect(movimentos()).toHaveLength(0);
  });
});

describe("Ajuste de saldo", () => {
  it("lança o movimento de ajuste com o motivo", async () => {
    const r = await ajustarSaldo(
      { empresaId: EMP, contaId: "conta-itau", valor: -120, motivo: "Tarifa não lançada" }, AUTOR);

    expect(r.ok).toBe(true);
    expect(movimentos()).toHaveLength(1);
    expect(movimentos()[0]).toMatchObject({ tipo: "ajuste", valor: -120, descricao: "Ajuste — Tarifa não lançada" });
  });

  it("clique duplo ajusta UMA vez", async () => {
    // Era o único caminho de dinheiro sem trava: dois ajustes de -120 viravam
    // -240, e como o saldo é derivado não há estado de "já ajustei" para a tela
    // perceber — o número fica errado e a pessoa ajusta de novo tentando
    // consertar.
    const pedido = { empresaId: EMP, contaId: "conta-itau", valor: -120, motivo: "Tarifa não lançada" };
    const [a, b] = await Promise.all([ajustarSaldo(pedido, AUTOR), ajustarSaldo(pedido, AUTOR)]);

    expect(movimentos()).toHaveLength(1);
    expect(a.ok && b.ok).toBe(true);
    expect(a.jaEstava || b.jaEstava).toBe(true);
  });

  it("ajuste com valor diferente na mesma conta passa — não é repetição", async () => {
    await ajustarSaldo({ empresaId: EMP, contaId: "conta-itau", valor: -120, motivo: "Tarifa" }, AUTOR);
    await ajustarSaldo({ empresaId: EMP, contaId: "conta-itau", valor: -35, motivo: "Outra tarifa" }, AUTOR);
    expect(movimentos()).toHaveLength(2);
  });

  it("recusa valor zero e motivo vazio", async () => {
    expect((await ajustarSaldo({ empresaId: EMP, contaId: "conta-itau", valor: 0, motivo: "x" }, AUTOR)).ok).toBe(false);
    expect((await ajustarSaldo({ empresaId: EMP, contaId: "conta-itau", valor: 10, motivo: "  " }, AUTOR)).ok).toBe(false);
    expect(movimentos()).toHaveLength(0);
  });
});

describe("Gerador de recorrências", () => {
  function umaRegra(over: Linha = {}) {
    banco.linhas("fin_recorrencias").push({
      id: "rec-1", empresa_id: EMP, descricao: "Adobe", categoria: "software", valor: 299,
      periodicidade: "mensal", intervalo_meses: 1, dia_vencimento: 10,
      conta_id: "conta-itau", fornecedor_id: null,
      inicio: "2026-06-01", fim: null, proxima_competencia: "2026-06-01", status: "ativa", ...over,
    });
  }

  it("gera exatamente um compromisso por competência", async () => {
    umaRegra();
    const r = await gerarRecorrencias(EMP, "2026-08-31", AUTOR);

    expect(r.ok).toBe(true);
    expect(compromissos()).toHaveLength(3);
    expect(compromissos().map((c) => c.vencimento)).toEqual(["2026-06-10", "2026-07-10", "2026-08-10"]);
  });

  it("rodar o gerador de novo não cria nada", async () => {
    umaRegra();
    await gerarRecorrencias(EMP, "2026-08-31", AUTOR);
    await gerarRecorrencias(EMP, "2026-08-31", AUTOR);
    await gerarRecorrencias(EMP, "2026-08-31", AUTOR);

    expect(compromissos()).toHaveLength(3);
  });

  it("a competência anda, então o mês seguinte gera só o que falta", async () => {
    umaRegra();
    await gerarRecorrencias(EMP, "2026-08-31", AUTOR);
    expect(banco.linhas("fin_recorrencias")[0].proxima_competencia).toBe("2026-09-01");

    await gerarRecorrencias(EMP, "2026-09-30", AUTOR);
    expect(compromissos()).toHaveLength(4);
  });

  it("regra pausada não gera — e não apaga o que já existe", async () => {
    umaRegra();
    await gerarRecorrencias(EMP, "2026-08-31", AUTOR);
    banco.linhas("fin_recorrencias")[0].status = "pausada";
    await gerarRecorrencias(EMP, "2026-12-31", AUTOR);

    expect(compromissos()).toHaveLength(3);
  });

  it("não vaza para outra empresa", async () => {
    umaRegra({ id: "rec-gedux", empresa_id: "emp-gedux" });
    umaRegra();
    await gerarRecorrencias(EMP, "2026-08-31", AUTOR);

    expect(compromissos().every((c) => c.empresa_id === EMP)).toBe(true);
    expect(compromissos()).toHaveLength(3);
  });
});
