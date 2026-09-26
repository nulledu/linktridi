import { describe, it, expect } from "vitest";
import { producaoEmAndamento, coberturaDeProducao, linhasProducaoDia, type ItemParaLinha } from "../requisicoes";

/**
 * `producaoEmAndamento` foi extraída de dentro de `atribuirProducao` porque a
 * tela "Produção do dia" (app/api/estoque/producao-dia) precisa mostrar o
 * MESMO número que o motor usa pra decidir "já está coberto, não crio
 * atividade". Este teste trava o contrato dessa função sozinha — sem ele,
 * um ajuste na regra dentro de `atribuirProducao` poderia divergir da conta
 * mostrada na tela sem nenhum teste acusar.
 *
 * COBERTURA é o que ainda vai acontecer: atividade `pendente`/`em_andamento` e
 * programação aberta na máquina. A concluída contava enquanto existiu a
 * conferência de atividade (a peça estava na caixa esperando virar estoque);
 * ela saiu em 11/09/2026 e a concluída não cobre mais nada.
 */
type Resposta = { data?: unknown; error?: unknown };

/**
 * Banco falso com TRÊS respostas: a das atividades em andamento (filtradas por
 * `.in("status", [...])`), a das que esperam conferência (`.eq("status",
 * "concluida")`) e a da fila de máquinas (tabela `maquina_programacoes` — o
 * destino MÁQUINA também é cobertura). Uma resposta só serviria as consultas
 * todas e o teste passaria contando a mesma linha várias vezes.
 */
function fakeDb(
  emAndamento: Resposta,
  aguardando: Resposta = { data: [], error: null },
  naMaquina: Resposta = { data: [], error: null },
) {
  const chamadas: { tabela: string; tabelas: string[]; trilha: string[] } = { tabela: "", tabelas: [], trilha: [] };
  const from = (tabela: string) => {
    chamadas.tabela = tabela;
    chamadas.tabelas.push(tabela);
    const deMaquina = tabela === "maquina_programacoes";
    let concluida = false;
    const builder: Record<string, unknown> = {};
    const encadeia = (nome: string) => (...args: unknown[]) => {
      chamadas.trilha.push(`${nome}(${args.map((a) => JSON.stringify(a)).join(",")})`);
      if (nome === "eq" && args[0] === "status" && args[1] === "concluida") concluida = true;
      return builder;
    };
    // `limit` faz parte da cadeia porque toda listagem tem teto (CLAUDE.md) —
    // o teto entrou depois deste teste, e sem ele aqui a cadeia quebra.
    for (const m of ["select", "ilike", "in", "eq", "gte", "limit"]) builder[m] = encadeia(m);
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(deMaquina ? naMaquina : concluida ? aguardando : emAndamento).then(resolve);
    return builder;
  };
  return { from, chamadas };
}

const linha = (nome: string, alvo: number, feita: number) =>
  ({ produto_nome: nome, quantidade_alvo: alvo, quantidade_feita: feita });

describe("producaoEmAndamento", () => {
  it("soma o que falta (alvo - feito) de cada atividade pendente/em_andamento", async () => {
    const db = fakeDb({
      data: [
        linha("Carimbo automático", 10, 4), // falta 6
        linha("Carimbo automático", 5, 5),  // falta 0
        linha("Carimbo automático", 3, 0),  // falta 3
      ],
      error: null,
    });
    expect(await producaoEmAndamento(db, "Carimbo automático")).toBe(9);
  });

  it("atividade feita além do alvo não gera número negativo (piso em 0)", async () => {
    const db = fakeDb({ data: [linha("X", 5, 8)], error: null });
    expect(await producaoEmAndamento(db, "X")).toBe(0);
  });

  it("nenhuma atividade em andamento: zero", async () => {
    const db = fakeDb({ data: [], error: null });
    expect(await producaoEmAndamento(db, "X")).toBe(0);
  });

  it("nome vazio: zero, sem nem consultar o banco", async () => {
    const db = fakeDb({ data: [linha("X", 99, 0)], error: null });
    expect(await producaoEmAndamento(db, "   ")).toBe(0);
    expect(db.chamadas.tabela).toBe(""); // never called .from()
  });

  it("filtra por nome (ilike) e pelos dois status em andamento", async () => {
    const db = fakeDb({ data: [], error: null });
    await producaoEmAndamento(db, "Refil de tinta");
    // A fila de máquina também é consultada (e por último): o que se trava
    // aqui é que as ATIVIDADES entram na conta.
    expect(db.chamadas.tabelas).toContain("atividades");
    expect(db.chamadas.trilha.some((t) => t.startsWith("ilike("))).toBe(true);
    expect(db.chamadas.trilha.find((t) => t.startsWith("in("))).toContain("pendente");
    expect(db.chamadas.trilha.find((t) => t.startsWith("in("))).toContain("em_andamento");
  });

  it("nome com coringa de LIKE não vira padrão: o casamento é refeito em JS", async () => {
    // "ADESIVO 100% PP" como padrão de LIKE casa "ADESIVO 100" + qualquer coisa.
    // O banco falso devolve o vizinho de propósito — quem tem de descartá-lo é
    // o filtro em JavaScript, não a sorte.
    const db = fakeDb({
      data: [
        linha("ADESIVO 100% PP", 10, 0),      // este conta
        linha("ADESIVO 100 GRAMAS", 40, 0),   // este NÃO
      ],
      error: null,
    });
    expect(await producaoEmAndamento(db, "ADESIVO 100% PP")).toBe(10);
    // E o padrão que foi pro banco leva o `%` escapado.
    expect(db.chamadas.trilha.find((t) => t.startsWith("ilike("))).toContain("ADESIVO 100\\\\% PP");
  });
});

describe("cobertura: a concluída não cobre (a conferência de atividade saiu)", () => {
  // Em 11/09/2026 a conferência de atividade saiu (lib/conferencia-de-atividade.ts):
  // peça concluída só vira estoque pela mão de alguém no Estoque. Contar a
  // concluída como cobertura prenderia a reposição do item pra sempre.
  it("peça concluída não conta como coberta", async () => {
    const db = fakeDb(
      { data: [], error: null },                          // ninguém produzindo
      { data: [linha("Alavanca", 30, 30)], error: null }, // 30 concluídas
    );
    expect(await coberturaDeProducao(db, "Alavanca")).toEqual({ emAndamento: 0, aguardando: 0, total: 0 });
  });

  it("só o que ainda vai ser feito cobre", async () => {
    const db = fakeDb(
      { data: [linha("Alavanca", 12, 2)], error: null },  // faltam 10
      { data: [linha("Alavanca", 8, 8)], error: null },   // concluídas: não contam
    );
    expect(await coberturaDeProducao(db, "Alavanca")).toEqual({ emAndamento: 10, aguardando: 0, total: 10 });
  });

  it("a programação ABERTA na fila de máquina também é cobertura", async () => {
    // Item tipo máquina: a reposição virou programação no painel, não
    // atividade no tablet. Sem esta soma, "Produção do dia" mostraria o item
    // sem ninguém produzindo enquanto o motor se recusa a criar outra.
    const db = fakeDb(
      { data: [linha("Travas", 10, 4)], error: null },     // tablet: falta 6
      { data: [], error: null },
      { data: [{ produto_nome: "Travas", quantidade_alvo: 30 }], error: null },
    );
    const c = await coberturaDeProducao(db, "Travas");
    expect(c.emAndamento).toBe(36);
    expect(c.total).toBe(36);
  });

  it("fila de máquina inexistente (SQL não rodado) conta zero, não derruba", async () => {
    const db = fakeDb(
      { data: [linha("Travas", 10, 4)], error: null },
      { data: [], error: null },
      { data: null, error: { code: "42P01", message: "relation does not exist" } },
    );
    expect((await coberturaDeProducao(db, "Travas")).emAndamento).toBe(6);
  });

});

/**
 * `linhasProducaoDia` é a mesma regra de `verificarReabastecimento` (ativo +
 * `qtd_minima > 0` + `ideal = max(estoque_ideal, mínimo)`), só que sem
 * escrever nada — é o que a tela "Produção do dia" mostra ANTES de alguém
 * apertar "Gerar atividades". Uma divergência aqui faria a tela prometer uma
 * atividade que o botão, ao rodar de verdade, não criaria (ou vice-versa).
 */
describe("linhasProducaoDia", () => {
  // Banco falso indexado pelo NOME filtrado no `.ilike()` — cada item da
  // lista dispara suas próprias consultas de cobertura, e a ordem de chamada
  // não deveria importar pro teste, só o nome perguntado.
  //
  // `aguardandoPorNome` é a segunda consulta (atividade concluída esperando
  // conferência). Sem separar as duas, a MESMA resposta serviria as duas
  // perguntas e cada peça contaria em dobro.
  function fakeDbPorNome(porNome: Record<string, Resposta>, aguardandoPorNome: Record<string, Resposta> = {}) {
    const chamadas: string[] = [];
    const from = (tabela: string) => {
      let nome = "";
      let concluida = false;
      const builder: Record<string, unknown> = {
        select: () => builder,
        ilike: (_col: string, valor: string) => { nome = valor; return builder; },
        in: () => builder,
        eq: (col: string, valor: unknown) => { if (col === "status" && valor === "concluida") concluida = true; return builder; },
        gte: () => builder,
        limit: () => builder,
        then: (resolve: (v: unknown) => unknown) => {
          chamadas.push(nome);
          // A fila de máquinas responde vazia aqui: estes testes travam a
          // conta das ATIVIDADES; a soma da máquina tem teste próprio acima.
          const fonte = tabela === "maquina_programacoes" ? {} : concluida ? aguardandoPorNome : porNome;
          const resp = (fonte as Record<string, Resposta>)[nome] ?? { data: [], error: null };
          return Promise.resolve(resp).then(resolve);
        },
      };
      return builder;
    };
    return { from, chamadas };
  }

  const item = (over: Partial<ItemParaLinha>): ItemParaLinha => ({
    id: "1", nome: "Item", categoria: "Chancela", hierarquia: "componente",
    quantidade: 0, qtd_minima: 0, estoque_ideal: null, ativo: true,
    ...over,
  });

  it("item inativo não entra, mesmo abaixo do mínimo", async () => {
    const db = fakeDbPorNome({});
    const { linhas } = await linhasProducaoDia(db, [item({ nome: "A", quantidade: 0, qtd_minima: 10, ativo: false })]);
    expect(linhas).toEqual([]);
  });

  it("item sem regra (qtd_minima 0 ou ausente) não entra", async () => {
    const db = fakeDbPorNome({});
    const { linhas } = await linhasProducaoDia(db, [
      item({ nome: "A", quantidade: 0, qtd_minima: 0 }),
      item({ nome: "B", quantidade: 0, qtd_minima: undefined }),
    ]);
    expect(linhas).toEqual([]);
  });

  it("quantidade já no ideal (ou acima): falta 0, fora da lista", async () => {
    const db = fakeDbPorNome({});
    const { linhas } = await linhasProducaoDia(db, [item({ nome: "A", quantidade: 20, qtd_minima: 10, estoque_ideal: 20 })]);
    expect(linhas).toEqual([]);
  });

  it("ideal é o MAIOR entre estoque_ideal e o mínimo — nunca menor que o mínimo", async () => {
    const db = fakeDbPorNome({ "Sem ideal cadastrado": { data: [], error: null } });
    const { linhas } = await linhasProducaoDia(db, [
      item({ nome: "Sem ideal cadastrado", quantidade: 2, qtd_minima: 10, estoque_ideal: null }),
    ]);
    expect(linhas[0].ideal).toBe(10); // caiu pro mínimo, não pro estoque_ideal ausente
    expect(linhas[0].falta).toBe(8);
  });

  it("falta não coberta por nenhuma atividade: aProduzir = falta inteira", async () => {
    const db = fakeDbPorNome({ "Refil de tinta": { data: [], error: null } });
    const { linhas, totalAProduzir } = await linhasProducaoDia(db, [
      item({ nome: "Refil de tinta", quantidade: 4, qtd_minima: 12, estoque_ideal: 30 }),
    ]);
    expect(linhas[0]).toMatchObject({ minima: 12, ideal: 30, falta: 26, emAndamento: 0, aProduzir: 26 });
    expect(totalAProduzir).toBe(26);
  });

  it("falta PARCIALMENTE coberta por atividade em andamento: aProduzir é só o resto", async () => {
    const db = fakeDbPorNome({
      "Clichê de polímero A5": { data: [linha("Clichê de polímero A5", 10, 0)], error: null }, // 10 em andamento
    });
    const { linhas } = await linhasProducaoDia(db, [
      item({ nome: "Clichê de polímero A5", quantidade: 2, qtd_minima: 40, estoque_ideal: 40 }),
    ]);
    // falta = 38, emAndamento = 10 → aProduzir = 28
    expect(linhas[0]).toMatchObject({ falta: 38, emAndamento: 10, aProduzir: 28 });
  });

  it("falta TOTALMENTE coberta: continua na lista (falta > 0), mas aProduzir é 0 — é o caso 'já está sendo feito'", async () => {
    const db = fakeDbPorNome({
      "Almofada nº 2": { data: [linha("Almofada nº 2", 15, 0)], error: null },
    });
    const { linhas, totalAProduzir } = await linhasProducaoDia(db, [
      item({ nome: "Almofada nº 2", quantidade: 5, qtd_minima: 10, estoque_ideal: 10 }),
    ]);
    expect(linhas[0]).toMatchObject({ falta: 5, emAndamento: 15, aProduzir: 0 });
    expect(totalAProduzir).toBe(0);
  });

  it("acima do mínimo mas abaixo do ideal NÃO entra — o botão 'Gerar atividades' não tocaria nele", async () => {
    const db = fakeDbPorNome({});
    const { linhas } = await linhasProducaoDia(db, [
      item({ nome: "Acima do mínimo", quantidade: 15, qtd_minima: 10, estoque_ideal: 30 }),
    ]);
    // ideal-quantidade = 15 > 0, mas quantidade (15) > mínima (10): fora da
    // regra que verificarReabastecimento usa pra decidir se cria atividade.
    expect(linhas).toEqual([]);
  });

  it("exatamente no mínimo ENTRA (regra é <=, não <)", async () => {
    const db = fakeDbPorNome({ "No mínimo": { data: [], error: null } });
    const { linhas } = await linhasProducaoDia(db, [
      item({ nome: "No mínimo", quantidade: 10, qtd_minima: 10, estoque_ideal: 25 }),
    ]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ falta: 15, aProduzir: 15 });
  });

  it("atividade concluída NÃO cobre a falta (a conferência de atividade saiu)", async () => {
    // Enquanto existia conferência, a caixa concluída cobria a falta — a peça
    // ia virar estoque na aprovação. Desde 11/09/2026 concluída não vira
    // estoque sozinha (lib/conferencia-de-atividade.ts); contá-la seguraria a
    // reposição do item pra sempre.
    const db = fakeDbPorNome(
      { "Alavanca montada": { data: [], error: null } },
      { "Alavanca montada": { data: [linha("Alavanca montada", 30, 30)], error: null } },
    );
    const { linhas, totalAProduzir, totalAguardando } = await linhasProducaoDia(db, [
      item({ nome: "Alavanca montada", quantidade: 0, qtd_minima: 30, estoque_ideal: 30 }),
    ]);
    expect(linhas[0]).toMatchObject({ falta: 30, emAndamento: 0, aguardando: 0, aProduzir: 30 });
    expect(totalAProduzir).toBe(30);
    expect(totalAguardando).toBe(0);
  });

  it("soma aProduzir de várias linhas no total", async () => {
    const db = fakeDbPorNome({
      "A": { data: [], error: null },
      "B": { data: [], error: null },
    });
    const { linhas, totalAProduzir } = await linhasProducaoDia(db, [
      item({ nome: "A", quantidade: 0, qtd_minima: 5, estoque_ideal: 5 }),  // falta 5
      item({ nome: "B", quantidade: 0, qtd_minima: 3, estoque_ideal: 3 }),  // falta 3
    ]);
    expect(linhas).toHaveLength(2);
    expect(totalAProduzir).toBe(8);
  });
});
