import { describe, expect, it } from "vitest";
import { nomesCompativeis, unirPessoas, type ContaComCodigo } from "../tridimarket/identidade";

const conta = (p: Partial<ContaComCodigo> & { id: number; name: string }): ContaComCodigo => ({
  profileId: "p1", companyId: 4, imageUrl: null, active: true,
  normalLimit: 500, overdraftLimit: 0, open: 0, previousOpen: 0, overdue: 0, available: 500,
  status: "good", lastPaymentAt: null, score: 0, scoreManual: false, ...p,
  // Sem dizer o contrário, o que está em aberto é gasto DESTE mês — é ele que
  // ocupa o limite.
  cycleOpen: p.cycleOpen ?? p.open ?? 0,
  // Idem para os dois baldes de cobrança: sem dizer o contrário, tudo é do mês novo.
  currentMonth: p.currentMonth ?? p.open ?? 0,
  closedUntil: p.closedUntil ?? 0,
});

describe("identidade: quem é a mesma pessoa", () => {
  it("une cadastros de empresas diferentes pelo código de acesso", () => {
    const pessoas = unirPessoas([
      conta({ id: 1, name: "Pedro Guilherme Martins", codigoAcesso: "123456", profileId: "escritorio", open: 40 }),
      conta({ id: 2, name: "Pedro Guilherme Martins", codigoAcesso: "123456", profileId: "producao", open: 25 }),
      conta({ id: 3, name: "Pedro Guilherme Martins", codigoAcesso: "123456", profileId: "zellux", open: 10.5 }),
    ]);
    expect(pessoas).toHaveLength(1);
    expect(pessoas[0]).toMatchObject({ name: "Pedro Guilherme Martins", open: 75.5, unified: true });
    expect(pessoas[0].accounts).toHaveLength(3);
    // Cada carteira tem teto próprio e todas valem ao mesmo tempo.
    expect(pessoas[0].normalLimit).toBe(1500);
    expect(pessoas[0].available).toBe(1424.5);
  });

  it("soma só cadastros ATIVOS (cadastro velho inativo não infla o total)", () => {
    // Felipe recadastrado: 122 ativo + 123 inativo, mesmo código.
    const pessoas = unirPessoas([
      conta({ id: 122, name: "Felipe", codigoAcesso: "170210", open: 299.4, active: true }),
      conta({ id: 123, name: "Felipe", codigoAcesso: "170210", open: 94.7, active: false }),
    ]);
    expect(pessoas).toHaveLength(1);
    expect(pessoas[0].open).toBe(299.4);       // só o ativo entra na soma
    expect(pessoas[0].accounts).toHaveLength(2); // mas o inativo continua visível
    expect(pessoas[0].normalLimit).toBe(500);   // teto só do ativo
  });

  it("pessoa 100% inativa ainda mostra o saldo (não some do painel)", () => {
    const pessoas = unirPessoas([
      conta({ id: 1, name: "Antigo", codigoAcesso: "111222", open: 15, active: false }),
    ]);
    expect(pessoas).toHaveLength(1);
    expect(pessoas[0].open).toBe(15);
  });

  it("aceita apelido como o mesmo nome (Dani × Daniel)", () => {
    const pessoas = unirPessoas([
      conta({ id: 1, name: "Dani", codigoAcesso: "999999", open: 12 }),
      conta({ id: 2, name: "Daniel", codigoAcesso: "999999", open: 8 }),
    ]);
    expect(pessoas).toHaveLength(1);
    expect(pessoas[0].open).toBe(20);
    // Exibe o nome mais completo do grupo.
    expect(pessoas[0].name).toBe("Daniel");
  });

  it("NÃO une pessoas diferentes que dividem um código", () => {
    const pessoas = unirPessoas([
      conta({ id: 1, name: "Ana Souza", codigoAcesso: "555555", open: 30 }),
      conta({ id: 2, name: "Bruno Lima", codigoAcesso: "555555", open: 70 }),
    ]);
    expect(pessoas).toHaveLength(2);
    expect(pessoas.map((p) => p.open).sort((a, b) => a - b)).toEqual([30, 70]);
  });

  it("NÃO une por nome de uma palavra só", () => {
    // Dois "Felipe" sem código podem ser pessoas diferentes — juntar a dívida
    // seria cobrar de quem não deve.
    const pessoas = unirPessoas([
      conta({ id: 1, name: "Felipe", open: 100 }),
      conta({ id: 2, name: "Felipe", open: 5 }),
    ]);
    expect(pessoas).toHaveLength(2);
  });

  it("une por nome COMPLETO quando não há código", () => {
    const pessoas = unirPessoas([
      conta({ id: 1, name: "Fernando Bataglini", profileId: "a", open: 15 }),
      conta({ id: 2, name: "Fernando Bataglini", profileId: "b", open: 25 }),
    ]);
    expect(pessoas).toHaveLength(1);
    expect(pessoas[0].open).toBe(40);
  });

  it("soma atraso e gasto do período entre os cadastros", () => {
    const gasto = new Map([[1, 18.5], [2, 6.25]]);
    const pessoas = unirPessoas([
      conta({ id: 1, name: "Douglas Ferreira", codigoAcesso: "111111", open: 60, overdue: 20 }),
      conta({ id: 2, name: "Douglas Ferreira", codigoAcesso: "111111", open: 15, overdue: 5 }),
    ], gasto);
    expect(pessoas[0]).toMatchObject({ open: 75, overdue: 25, spent: 24.75 });
  });

  it("uma conta bloqueada bloqueia a pessoa inteira", () => {
    const pessoas = unirPessoas([
      conta({ id: 1, name: "Carla Dias", codigoAcesso: "222222", open: 10, status: "good" }),
      conta({ id: 2, name: "Carla Dias", codigoAcesso: "222222", open: 5, status: "blocked" }),
    ]);
    expect(pessoas[0].status).toBe("blocked");
  });

  it("nunca devolve o código de acesso", () => {
    const pessoas = unirPessoas([conta({ id: 1, name: "Ana Júlia", codigoAcesso: "424242" })]);
    expect(JSON.stringify(pessoas)).not.toContain("424242");
    expect(pessoas[0].key).not.toContain("424242");
  });

  it("cadastro sem código e sem par continua aparecendo", () => {
    const pessoas = unirPessoas([conta({ id: 7, name: "Mickael", open: 4.8 })]);
    expect(pessoas).toHaveLength(1);
    expect(pessoas[0]).toMatchObject({ open: 4.8, unified: false });
  });

  it("ordena por quem deve mais", () => {
    const pessoas = unirPessoas([
      conta({ id: 1, name: "Ana Souza", open: 10 }),
      conta({ id: 2, name: "Bruno Lima", open: 90 }),
      conta({ id: 3, name: "Caio Nunes", open: 50 }),
    ]);
    expect(pessoas.map((p) => p.name)).toEqual(["Bruno Lima", "Caio Nunes", "Ana Souza"]);
  });
});

describe("empresa principal de quem tem vários cadastros", () => {
  const contas = [
    conta({ id: 1, name: "Pedro Martins", codigoAcesso: "777777", profileId: "escritorio", open: 10 }),
    conta({ id: 2, name: "Pedro Martins", codigoAcesso: "777777", profileId: "producao", open: 90 }),
  ];

  it("é onde a pessoa mais GASTOU, não onde mais deve", () => {
    // Ela deve mais na produção, mas consome no escritório — é lá que ela
    // trabalha. A dívida só diz onde ainda não pagou.
    const gasto = new Map([[1, 300], [2, 20]]);
    expect(unirPessoas(contas, gasto)[0].mainProfileId).toBe("escritorio");
  });

  it("sem consumo em lugar nenhum, usa a maior dívida", () => {
    expect(unirPessoas(contas)[0].mainProfileId).toBe("producao");
  });

  it("empate total resolve pelo menor id, sem ficar alternando", () => {
    const iguais = [
      conta({ id: 9, name: "Ana Souza", codigoAcesso: "888888", profileId: "b", open: 0 }),
      conta({ id: 4, name: "Ana Souza", codigoAcesso: "888888", profileId: "a", open: 0 }),
    ];
    expect(unirPessoas(iguais)[0].mainProfileId).toBe("a");
    expect(unirPessoas([...iguais].reverse())[0].mainProfileId).toBe("a");
  });

  it("escolha manual do gestor manda mais que o histórico", () => {
    const gasto = new Map([[1, 300], [2, 20]]);
    const comManual = contas.map((c) => ({ ...c, empresaPrincipalManual: "producao" }));
    const p = unirPessoas(comManual, gasto)[0];
    expect(p.mainProfileId).toBe("producao");
    expect(p.mainProfileManual).toBe(true);
  });

  it("escolha manual apontando para empresa que ela não tem é ignorada", () => {
    const comLixo = contas.map((c) => ({ ...c, empresaPrincipalManual: "empresa-que-nao-existe" }));
    expect(unirPessoas(comLixo, new Map([[1, 300]]))[0].mainProfileId).toBe("escritorio");
  });

  it("quem tem um cadastro só tem essa empresa como principal", () => {
    const p = unirPessoas([conta({ id: 7, name: "Mickael", profileId: "escritorio" })])[0];
    expect(p.mainProfileId).toBe("escritorio");
    expect(p.mainProfileManual).toBe(false);
  });
});

describe("nomesCompativeis", () => {
  it("ignora acento, caixa e espaço extra", () => {
    expect(nomesCompativeis("Ana Júlia", "  ana  julia ")).toBe(true);
    expect(nomesCompativeis("LEOZÃO", "Leozao")).toBe(true);
  });
  it("recusa nomes distintos", () => {
    expect(nomesCompativeis("Pedro", "Paulo")).toBe(false);
    expect(nomesCompativeis("Ana Souza", "Ana Lima")).toBe(false);
  });
  it("recusa vazio", () => {
    expect(nomesCompativeis("", "Ana")).toBe(false);
  });
});
