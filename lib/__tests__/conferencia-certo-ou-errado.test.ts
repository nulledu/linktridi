import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A conferência é BINÁRIA, e cada lado tem um efeito só.
 *
 *   CERTO  → nasce UMA etiqueta (a caixa lacrada) com a quantidade que a
 *            PESSOA registrou ao concluir. Uma etiqueta, não N: são 50 folhas
 *            dentro de uma caixa só, com um código colado por fora. A
 *            atividade fecha com `estoque_lancado`.
 *   ERRADO → não entra NADA no estoque e a atividade volta pra pessoa refazer
 *            (`em_andamento`). O material de entrada já saiu do estoque quando
 *            foi bipado no começo do trabalho, então a perda se contabiliza
 *            sozinha — ninguém lança nada, e é por isso que "errado" não tem
 *            campo de quantidade.
 *
 * O erro que este teste existe pra pegar é o de sempre nesta função: gerar N
 * unidades pra N peças (o formato antigo). Uma caixa de 50 viraria 50
 * etiquetas, ninguém colaria as 50, e o estoque contaria 50 caixas de 50.
 */

interface PedidoDeUnidade {
  item_id: string; quantidade: number; pecasPorUnidade?: number;
  origem?: string; criado_por_id?: string | null; criado_por?: string | null;
}
const mockGerarUnidades = vi.fn(async (_pedido: PedidoDeUnidade) =>
  [{ id: "u-1", codigo: "PC-0007-000001", seq: 1, pecas: 50 }]);
vi.mock("@/lib/estoque-unidades-gerar", async () => {
  const real = await vi.importActual<typeof import("@/lib/estoque-unidades-gerar")>("@/lib/estoque-unidades-gerar");
  return { ...real, gerarUnidades: (pedido: PedidoDeUnidade) => mockGerarUnidades(pedido) };
});

let db: ReturnType<typeof fakeDb>;
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => db }));

const {
  registrarConferencia, ErroResultadoInvalido, ErroDefeitoInvalido,
  ErroConferenteEExecutor, ErroQuantidadeIndefinida, ErroItemNaoEncontrado,
  ErroDestinoNaoEscolhido, ErroSchemaDesatualizado,
} = await import("../estoque-conferencia");

interface Op { tabela: string; metodo: string; payload?: Record<string, unknown> }
type Resposta = { data?: unknown; error?: unknown };

function fakeDb(fila: Resposta[]) {
  const ops: Op[] = [];
  const from = (tabela: string) => {
    const builder: Record<string, unknown> = {};
    const passa = () => builder;
    for (const m of ["select", "eq", "ilike", "in", "limit", "order", "not", "gte"]) builder[m] = passa;
    for (const m of ["insert", "update", "upsert"]) {
      builder[m] = (payload: Record<string, unknown>) => { ops.push({ tabela, metodo: m, payload }); return builder; };
    }
    // `delete()` não leva payload — o alvo vem do `.eq()` encadeado depois.
    builder.delete = () => { ops.push({ tabela, metodo: "delete" }); return builder; };
    const resolver = () => Promise.resolve(fila.shift() ?? { data: null, error: null });
    builder.maybeSingle = resolver;
    builder.single = resolver;
    builder.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => resolver().then(ok, falha);
    return builder;
  };
  return { from, ops };
}

const BASE = {
  atividadeId: "ativ-1",
  defeitos: [] as string[],
  obs: null,
  conferidoPorId: "gestor-1",
  conferidoPorNome: "Gestora",
  ocorridoEm: "2026-08-12T18:00:00.000Z",
};

// A pessoa concluiu dizendo que fez 50 alavancas.
const ATIVIDADE = {
  para_id: "operador-1", para_nome: "Operador",
  produto_nome: "Alavanca montada", quantidade_alvo: 60, quantidade_feita: 50,
  status: "concluida",
};

const ITEM_ETIQUETADO = {
  id: "item-1", nome: "Alavanca montada", serializado: true,
  quantidade: 0, unidade: "un", local_id: null, cor: null, largura_mm: null, altura_mm: null,
};
/** Pilha antiga: nunca foi etiquetado e já tem saldo contado na prateleira. */
const ITEM_PILHA_ANTIGA = { ...ITEM_ETIQUETADO, serializado: false, quantidade: 10 };
/** Zerado e contável: dá pra passar a etiquetar sem perder saldo nenhum. */
const ITEM_ZERADO = { ...ITEM_ETIQUETADO, serializado: false, quantidade: 0 };
/** Granel: 1,5 kg não cabe numa caixa de `int > 0`. Nunca vira etiqueta. */
const ITEM_GRANEL = { ...ITEM_ZERADO, unidade: "kg" };

/** Respostas na ordem em que registrarConferencia consulta o banco. */
function fila(item: Record<string, unknown>, atividade = ATIVIDADE): Resposta[] {
  return [
    { data: atividade },   // 1. lê a atividade
    { data: null },        // 2. já existe APROVAÇÃO? não
    // 3. resolve o item pelo nome — LISTA: a resolução pede várias linhas pra
    // poder detectar DOIS itens com o mesmo nome (não há UNIQUE em
    // `estoque_itens.nome`) em vez de sortear um com `.limit(1)`.
    { data: item ? [item] : [] },
    { data: { id: "conf-1" } }, // 4. insert em estoque_conferencias
    { error: null },       // 5. soma no item (a granel) ou amarra a unidade
    // 5b. linhas da ficha com o toggle "desconta" LIGADO — nenhuma (o padrão).
    // Só o CERTO consulta; no errado a fila anda sem este slot, e sobra um
    // `{ error: null }` no fim, que é inofensivo.
    { data: [] },
    { error: null },       // 6. fecha/reabre a atividade
    { error: null },
  ];
}

const updateDe = (ops: Op[], tabela: string) => ops.filter((o) => o.tabela === tabela && o.metodo === "update");
const insertConferencia = (ops: Op[]) => ops.find((o) => o.tabela === "estoque_conferencias" && o.metodo === "insert");

beforeEach(() => { mockGerarUnidades.mockClear(); });

describe("conferência CERTA", () => {
  it("gera UMA etiqueta valendo as peças que a pessoa fez — não 50 etiquetas", async () => {
    db = fakeDb(fila(ITEM_ETIQUETADO));
    const r = await registrarConferencia({ ...BASE, resultado: "certo" });

    expect(mockGerarUnidades).toHaveBeenCalledTimes(1);
    const arg = mockGerarUnidades.mock.calls[0][0];
    expect(arg.quantidade, "gerou uma etiqueta por peça: a caixa é UMA etiqueta").toBe(1);
    expect(arg.pecasPorUnidade).toBe(50);
    expect(arg.origem).toBe("producao");
    // A etiqueta acompanha a peça: quem assina é quem FEZ, não quem conferiu.
    expect(arg.criado_por_id).toBe("operador-1");

    expect(r.unidades).toEqual(["PC-0007-000001"]);
    expect(r.etiquetas).toHaveLength(1);
    expect(r.etiquetas[0]).toMatchObject({ quantidade: 50, responsavel: "Operador", nome: "Alavanca montada" });
    expect(r.quantidade).toBe(50);
    expect(r.reaberta).toBe(false);
  });

  it("a quantidade é a que a PESSOA registrou, não a que o gerente digitou", async () => {
    // O corpo da requisição não tem campo de quantidade — este teste é a trava
    // contra alguém reintroduzir um.
    db = fakeDb(fila(ITEM_ETIQUETADO));
    await registrarConferencia({ ...BASE, resultado: "certo", quantidade: 999 } as never);

    const arg = mockGerarUnidades.mock.calls[0][0];
    expect(arg.pecasPorUnidade).toBe(50);
    expect(insertConferencia(db.ops)!.payload).toMatchObject({ resultado: "certo", quantidade: 50 });
  });

  it("fecha a atividade com estoque_lancado", async () => {
    db = fakeDb(fila(ITEM_ETIQUETADO));
    await registrarConferencia({ ...BASE, resultado: "certo" });

    expect(updateDe(db.ops, "atividades")[0].payload).toMatchObject({
      status: "concluida", quantidade_feita: 50, estoque_lancado: true,
    });
  });

  it("amarra a caixa que nasceu à conferência que a criou", async () => {
    db = fakeDb(fila(ITEM_ETIQUETADO));
    await registrarConferencia({ ...BASE, resultado: "certo" });

    expect(updateDe(db.ops, "estoque_conferencias")[0].payload).toEqual({ unidade_id: "u-1" });
  });

  it("pilha antiga: soma no catálogo, não gera etiqueta e DIZ como preparar o item", async () => {
    // Converter uma pilha de 10 numa caixa única de 10 criaria um fantasma: a
    // baixa é tudo-ou-nada, a guarda do banco passa a recusar digitar a
    // quantidade e não há papel colado em nada pra bipar. Aprovar segue
    // funcionando (a linha de produção não regride); o que muda é a resposta
    // carregar o próximo passo em vez de a etiqueta sumir em silêncio.
    db = fakeDb(fila(ITEM_PILHA_ANTIGA));
    const r = await registrarConferencia({ ...BASE, resultado: "certo", podeAjustar: true });

    expect(mockGerarUnidades).not.toHaveBeenCalled();
    expect(updateDe(db.ops, "estoque_itens")[0].payload).toMatchObject({ quantidade: 60 }); // 10 que havia + 50
    expect(r.etiquetas).toEqual([]);
    expect(r.quantidade).toBe(50);
    // A contagem que viaja é a de ANTES (10), não a de depois (60): é a pilha
    // que precisa virar papel, e é o número que o gesto de preparo oferece.
    expect(r.preparo).toMatchObject({
      estado: "precisa_preparo", itemId: "item-1", itemNome: "Alavanca montada",
      quantidade: 10, unidade: "un",
    });
    expect(r.preparo!.motivo.length, "aviso sem frase é aviso que ninguém entende").toBeGreaterThan(20);
  });

  it("defeito marcado no certo é ignorado, não recusado", async () => {
    // Um chip esquecido na tela não pode derrubar uma aprovação legítima.
    db = fakeDb(fila(ITEM_ETIQUETADO));
    await registrarConferencia({ ...BASE, resultado: "certo", defeitos: ["avaria"] });
    expect(insertConferencia(db.ops)!.payload).toMatchObject({ defeitos: [] });
  });

  it("sem quantidade nenhuma (nem feita, nem alvo) recusa em vez de criar caixa vazia", async () => {
    // `check (quantidade > 0)` recusaria a etiqueta DEPOIS de a conferência já
    // estar gravada — e aí a atividade ficaria conferida sem estoque nenhum.
    db = fakeDb(fila(ITEM_ETIQUETADO, { ...ATIVIDADE, quantidade_feita: 0, quantidade_alvo: 0 }));
    await expect(registrarConferencia({ ...BASE, resultado: "certo" }))
      .rejects.toBeInstanceOf(ErroQuantidadeIndefinida);
    expect(insertConferencia(db.ops), "gravou a conferência antes de recusar").toBeUndefined();
  });

  it("quem concluiu sem informar quantidade entra com o alvo", async () => {
    db = fakeDb(fila(ITEM_ETIQUETADO, { ...ATIVIDADE, quantidade_feita: 0 }));
    await registrarConferencia({ ...BASE, resultado: "certo" });
    expect(mockGerarUnidades.mock.calls[0][0].pecasPorUnidade).toBe(60);
  });

  it("aprovar sem item no catálogo é recusado — não há onde dar entrada", async () => {
    db = fakeDb(fila(null as unknown as Record<string, unknown>));
    await expect(registrarConferencia({ ...BASE, resultado: "certo" }))
      .rejects.toBeInstanceOf(ErroItemNaoEncontrado);
  });
});

// ── Aprovar 'certo' tem que devolver etiqueta ────────────────────────────────
//
// Medido no banco de produção: 3 conferências gravadas, `estoque_unidades` com
// ZERO linhas, `etiqueta_impressoes` zerada, `unidade_id` nulo. A caixa só era
// cunhada quando `item.serializado` estava ligado, e nenhum dos 219 itens tinha
// a flag — todo 'certo' caía no ramo que apenas soma peças na contagem. O ciclo
// que o galpão descreve ("marca como certo, GERA A ETIQUETA, ele lacra e
// coloca no estoque") nunca acontecia.
//
// A decisão de quem pode virar etiqueta é pura e mora em lib/estoque-etiquetavel.ts
// (com o porquê de cada estado). Aqui se trava o que a CONFERÊNCIA faz com ela.
describe("o item que ainda não é etiquetado", () => {
  it("zerado e contável: liga a etiquetagem na hora e devolve a etiqueta", async () => {
    // Sem saldo pra perder e sem fração pra truncar — é o único caso em que dá
    // pra converter sozinho. A guarda do banco só barra ligar a serialização de
    // quem tem pilha e nenhuma etiqueta, e aqui a pilha é zero.
    db = fakeDb(fila(ITEM_ZERADO));
    const r = await registrarConferencia({ ...BASE, resultado: "certo", podeAjustar: true });

    const noItem = updateDe(db.ops, "estoque_itens")[0].payload!;
    expect(noItem, "converteu sem ligar a etiquetagem: gerarUnidades recusaria").toMatchObject({ serializado: true });
    expect(noItem, "somou na contagem de um item que virou etiquetado").not.toHaveProperty("quantidade");

    expect(mockGerarUnidades).toHaveBeenCalledTimes(1);
    expect(mockGerarUnidades.mock.calls[0][0]).toMatchObject({ quantidade: 1, pecasPorUnidade: 50 });
    expect(r.etiquetas, "aprovou 'certo' e não saiu etiqueta").toHaveLength(1);
    expect(r.preparo, "não há nada a preparar: a caixa nasceu").toBeUndefined();
  });

  it("sem poder de ajuste, ninguém converte item pela conferência", async () => {
    // A conferência entra por `estoque:itens` (só ver) e a rota do tablet não
    // checa poder nenhum. Converter aqui seria a porta lateral que
    // /api/estoque/unidades/preparar fecha de propósito.
    db = fakeDb(fila(ITEM_ZERADO));
    const r = await registrarConferencia({ ...BASE, resultado: "certo" });

    expect(updateDe(db.ops, "estoque_itens")[0].payload).not.toHaveProperty("serializado");
    expect(mockGerarUnidades).not.toHaveBeenCalled();
    expect(updateDe(db.ops, "estoque_itens")[0].payload).toMatchObject({ quantidade: 50 });
    expect(r.quantidade, "a aprovação em si continua valendo").toBe(50);
    expect(r.preparo).toMatchObject({ estado: "precisa_preparo" });
    expect(r.preparo!.motivo).toMatch(/permiss/i);
  });

  it("pilha antiga NÃO vira caixa única, nem com poder de ajuste", async () => {
    db = fakeDb(fila(ITEM_PILHA_ANTIGA));
    await registrarConferencia({ ...BASE, resultado: "certo", podeAjustar: true });

    expect(updateDe(db.ops, "estoque_itens")[0].payload).not.toHaveProperty("serializado");
    expect(mockGerarUnidades, "10 peças soltas viraram uma caixa de 10 que ninguém consegue bipar").not.toHaveBeenCalled();
  });

  it("granel nunca converte — meio quilo não cabe numa etiqueta", async () => {
    // Mesmo zerado: `estoque_unidades.quantidade` é `int > 0`, então o dia em
    // que entrar 1,5 kg o truncamento apaga saldo em silêncio, pra sempre.
    db = fakeDb(fila(ITEM_GRANEL));
    const r = await registrarConferencia({ ...BASE, resultado: "certo", podeAjustar: true });

    expect(updateDe(db.ops, "estoque_itens")[0].payload).not.toHaveProperty("serializado");
    expect(mockGerarUnidades).not.toHaveBeenCalled();
    expect(r.preparo).toMatchObject({ estado: "nao_etiquetavel" });
  });

  it("item já etiquetado não passa por conversão nenhuma — o caminho de sempre", async () => {
    db = fakeDb(fila(ITEM_ETIQUETADO));
    const r = await registrarConferencia({ ...BASE, resultado: "certo", podeAjustar: true });

    expect(updateDe(db.ops, "estoque_itens"), "mexeu no cadastro de quem já tem papel colado").toHaveLength(0);
    expect(r.etiquetas).toHaveLength(1);
    expect(r.preparo).toBeUndefined();
  });

  it("se ligar a etiquetagem falhar, a aprovação não fica gravada trancando a atividade", async () => {
    // Mesma regra dos outros ramos: nada entrou no estoque, então a linha de
    // aprovação é uma trava sem contrapartida — e é ela que impede a segunda
    // tentativa, a que faria as peças entrarem de verdade.
    db = fakeDb([
      { data: ATIVIDADE },
      { data: null },
      { data: [ITEM_ZERADO] },
      { data: { id: "conf-1" } },
      { error: { message: "falhou ao ligar a serialização" } },
    ]);

    await expect(registrarConferencia({ ...BASE, resultado: "certo", podeAjustar: true })).rejects.toThrow(/serializa/);
    expect(mockGerarUnidades).not.toHaveBeenCalled();
    expect(db.ops.filter((o) => o.tabela === "estoque_conferencias" && o.metodo === "delete")).toHaveLength(1);
    expect(updateDe(db.ops, "atividades"), "fechou a atividade sem estoque nenhum").toHaveLength(0);
  });
});

describe("conferência ERRADA", () => {
  it("não entra nada no estoque e a atividade volta pra pessoa refazer", async () => {
    db = fakeDb(fila(ITEM_ETIQUETADO));
    const r = await registrarConferencia({ ...BASE, resultado: "errado", defeitos: ["peca_suja", "avaria"] });

    expect(mockGerarUnidades, "reprovou e mesmo assim gerou etiqueta").not.toHaveBeenCalled();
    expect(updateDe(db.ops, "estoque_itens"), "reprovou e mesmo assim somou no catálogo").toHaveLength(0);
    expect(r.quantidade).toBe(0);
    expect(r.unidades).toEqual([]);
    expect(r.reaberta).toBe(true);

    const fecha = updateDe(db.ops, "atividades")[0].payload!;
    expect(fecha).toMatchObject({ status: "em_andamento", estoque_lancado: false });
    // O carimbo de conclusão sai junto: o trabalho NÃO está concluído, e deixá-lo
    // faria a atividade reaberta contar como terminada em todo cálculo de tempo.
    expect(fecha.concluida_at).toBeNull();
  });

  it("grava o porquê — os defeitos que o gerente marcou", async () => {
    db = fakeDb(fila(ITEM_ETIQUETADO));
    await registrarConferencia({ ...BASE, resultado: "errado", defeitos: ["medida_errada"] });

    expect(insertConferencia(db.ops)!.payload).toMatchObject({
      resultado: "errado", quantidade: 0, defeitos: ["medida_errada"],
    });
  });

  it("reprovar não exige item no catálogo — a caixa errada não pode ficar presa na fila", async () => {
    db = fakeDb(fila(null as unknown as Record<string, unknown>));
    const r = await registrarConferencia({ ...BASE, resultado: "errado", defeitos: ["avaria"] });
    expect(r.reaberta).toBe(true);
    expect(insertConferencia(db.ops)!.payload).toMatchObject({ item_id: null });
  });

  it("defeito fora do catálogo fechado é recusado ANTES de gravar", async () => {
    db = fakeDb(fila(ITEM_ETIQUETADO));
    await expect(registrarConferencia({ ...BASE, resultado: "errado", defeitos: ["risco na tinta"] }))
      .rejects.toBeInstanceOf(ErroDefeitoInvalido);
    expect(insertConferencia(db.ops)).toBeUndefined();
  });
});

// ── Quando o estoque NÃO recebe, a conferência não pode ficar gravada ────────
//
// A ordem aqui é deliberada: a conferência é gravada ANTES de mexer no estoque,
// pra o histórico do que o gestor viu sobreviver a uma falha no meio. Só que uma
// aprovação gravada é o que TRANCA a atividade: `registrarConferencia` recusa a
// segunda aprovação (ErroAtividadeJaConferida) e o índice único parcial do banco
// recusa também. Se a caixa não chegou a nascer, a linha não é histórico — é uma
// aprovação que mente ("50 peças entraram") e que impede pra sempre a tentativa
// que faria as 50 entrarem de verdade. A atividade fica `estoque_lancado=false`
// com aprovação gravada: some da fila de pendentes, aparece só como o contador
// `travadas`, e não há tela no sistema que a destrave.
//
// O caminho que torna isso rotina, e não azar: `gerarUnidades` grava a coluna
// `estoque_unidades.quantidade` quando a caixa vale mais de uma peça, e essa
// coluna vem do SQL que o usuário roda NA MÃO. Num banco onde
// estoque_conferencias já existe e a coluna da caixa não (rodar
// estoque_conferencias.sql sozinho é exatamente isso), TODA aprovação de caixa
// com mais de uma peça cai aqui.
describe("estoque que não entrou não deixa aprovação gravada", () => {
  it("a caixa que não nasceu apaga a conferência, pra dar pra tentar de novo", async () => {
    db = fakeDb(fila(ITEM_ETIQUETADO));
    mockGerarUnidades.mockRejectedValueOnce(new ErroSchemaDesatualizado());

    await expect(registrarConferencia({ ...BASE, resultado: "certo" }))
      .rejects.toBeInstanceOf(ErroSchemaDesatualizado);

    // Gravou (é o desenho), mas desfez ao ver que nada entrou no estoque.
    expect(insertConferencia(db.ops), "nem tentou gravar").toBeDefined();
    expect(
      db.ops.filter((o) => o.tabela === "estoque_conferencias" && o.metodo === "delete"),
      "a aprovação ficou gravada sem estoque: a atividade tranca pra sempre",
    ).toHaveLength(1);
    // E a atividade NÃO pode ter sido fechada: nada entrou.
    expect(updateDe(db.ops, "atividades"), "fechou a atividade sem estoque nenhum").toHaveLength(0);
  });

  it("vale pro item que só soma na contagem também — quem falha ali é o UPDATE da quantidade", async () => {
    db = fakeDb([
      { data: ATIVIDADE },
      { data: null },
      { data: [ITEM_PILHA_ANTIGA] },
      { data: { id: "conf-1" } },
      { error: { code: "57014", message: "canceling statement due to statement timeout" } },
    ]);

    await expect(registrarConferencia({ ...BASE, resultado: "certo" })).rejects.toThrow(/timeout/);
    expect(db.ops.filter((o) => o.tabela === "estoque_conferencias" && o.metodo === "delete")).toHaveLength(1);
    expect(updateDe(db.ops, "atividades")).toHaveLength(0);
  });

  it("ERRADO não apaga nada: reprovar não mexe em estoque, então não há o que desfazer", async () => {
    db = fakeDb(fila(ITEM_ETIQUETADO));
    await registrarConferencia({ ...BASE, resultado: "errado", defeitos: ["avaria"] });
    expect(db.ops.filter((o) => o.metodo === "delete")).toHaveLength(0);
  });

  it("depois que a caixa NASCEU, a conferência fica — apagar ali duplicaria o estoque", async () => {
    // A falha é no passo seguinte (fechar a atividade). A etiqueta já existe e o
    // estoque já recebeu: apagar a conferência liberaria uma segunda aprovação,
    // que geraria uma SEGUNDA caixa. Trancado é ruim; contado duas vezes é pior.
    db = fakeDb([
      { data: ATIVIDADE },
      { data: null },
      { data: [ITEM_ETIQUETADO] },
      { data: { id: "conf-1" } },
      { error: null },                                   // amarra a unidade
      { data: [] },                                      // ficha: nada com "desconta"
      { error: { message: "falhou ao fechar a atividade" } },
    ]);

    await expect(registrarConferencia({ ...BASE, resultado: "certo" })).rejects.toThrow(/fechar a atividade/);
    expect(db.ops.filter((o) => o.tabela === "estoque_conferencias" && o.metodo === "delete")).toHaveLength(0);
  });
});

describe("o que a conferência recusa de saída", () => {
  it("resultado que não é certo nem errado — inclusive as notas antigas", async () => {
    db = fakeDb(fila(ITEM_ETIQUETADO));
    await expect(registrarConferencia({ ...BASE, resultado: "mediano" }))
      .rejects.toBeInstanceOf(ErroResultadoInvalido);
    expect(db.ops).toHaveLength(0);
  });

  it("quem confere não pode ser quem fez", async () => {
    db = fakeDb(fila(ITEM_ETIQUETADO));
    await expect(registrarConferencia({ ...BASE, resultado: "certo", conferidoPorId: "operador-1" }))
      .rejects.toBeInstanceOf(ErroConferenteEExecutor);
    expect(insertConferencia(db.ops)).toBeUndefined();
  });
});

// ── O destino escolhido na hora de conferir ──────────────────────────────────
//
// Medido em produção: 104 atividades concluídas, 103 SEM `produto_nome`. Elas
// nascem com uma tarefa em texto ("Montar alavancas") e uma categoria, porque
// quem lança o trabalho não conhece o catálogo de 192 itens. Enquanto o vínculo
// era PRÉ-REQUISITO, a fila entregava zero e a produção de três semanas ficava
// no chão do galpão.
//
// O vínculo virou parte da conferência: quem aprova diz em qual item aquilo
// entra. Quem REPROVA não diz nada — o material já saiu do estoque quando foi
// bipado, e exigir destino pra recusar prenderia a caixa errada na fila pra
// sempre esperando um cadastro.
describe("o destino é escolhido por quem confere", () => {
  const SEM_PRODUTO = { ...ATIVIDADE, produto_nome: null, tarefa: "Montar alavancas" };

  /** Fila do caminho novo: o item vem por id (maybeSingle), não por nome. */
  function filaComDestino(
    item: Record<string, unknown> | null,
    atividade: Record<string, unknown> = SEM_PRODUTO,
  ): Resposta[] {
    return [
      { data: atividade },        // 1. lê a atividade
      { data: null },             // 2. já existe APROVAÇÃO? não
      { data: item },             // 3. busca o item ESCOLHIDO, por id
      { data: { id: "conf-1" } }, // 4. insert em estoque_conferencias
      { error: null },
      { error: null },
      { error: null },
    ];
  }

  it("aprova a atividade que nunca teve produto, no item que o gerente escolheu", async () => {
    db = fakeDb(filaComDestino(ITEM_ETIQUETADO));
    const r = await registrarConferencia({ ...BASE, resultado: "certo", destinoId: "item-1" });

    expect(mockGerarUnidades.mock.calls[0][0].item_id).toBe("item-1");
    expect(r.quantidade).toBe(50);
    expect(insertConferencia(db.ops)!.payload).toMatchObject({ item_id: "item-1", resultado: "certo" });
  });

  it("o vínculo VOLTA pra atividade — ela deixa de ser 'sem produto' pro resto do sistema", async () => {
    db = fakeDb(filaComDestino(ITEM_ETIQUETADO));
    await registrarConferencia({ ...BASE, resultado: "certo", destinoId: "item-1" });

    expect(updateDe(db.ops, "atividades")[0].payload).toMatchObject({
      estoque_lancado: true, produto_nome: "Alavanca montada",
    });
  });

  it("não sobrescreve o produto que a atividade já tinha", async () => {
    // Conferir não é reescrever o que foi pedido: se a atividade já apontava um
    // produto, ele é o registro do pedido e fica como está.
    db = fakeDb(filaComDestino({ ...ITEM_ETIQUETADO, id: "outro", nome: "Outra coisa" }, ATIVIDADE));
    await registrarConferencia({ ...BASE, resultado: "certo", destinoId: "outro" });

    expect(updateDe(db.ops, "atividades")[0].payload).not.toHaveProperty("produto_nome");
  });

  it("aprovar sem destino e sem produto tem frase PRÓPRIA — é uma escolha que falta, não um cadastro errado", async () => {
    db = fakeDb(filaComDestino(null));
    await expect(registrarConferencia({ ...BASE, resultado: "certo" }))
      .rejects.toBeInstanceOf(ErroDestinoNaoEscolhido);
    expect(insertConferencia(db.ops), "gravou antes de recusar").toBeUndefined();
  });

  it("REPROVAR não precisa de destino nenhum", async () => {
    db = fakeDb(filaComDestino(null));
    const r = await registrarConferencia({ ...BASE, resultado: "errado", defeitos: ["avaria"] });
    expect(r.reaberta).toBe(true);
    expect(insertConferencia(db.ops)!.payload).toMatchObject({ item_id: null });
  });

  it("item apagado do catálogo entre a tela abrir e o toque confirmar é recusado", async () => {
    db = fakeDb(filaComDestino(null));
    await expect(registrarConferencia({ ...BASE, resultado: "certo", destinoId: "sumiu" }))
      .rejects.toBeInstanceOf(ErroItemNaoEncontrado);
  });

  it("o destino escolhido GANHA do nome — nada de resolver por texto quando há id", async () => {
    // O caminho por nome tem `ilike`, ambiguidade e cadastro pra corrigir. O id
    // veio de uma lista real do catálogo: não há o que interpretar.
    db = fakeDb(filaComDestino({ ...ITEM_ETIQUETADO, id: "escolhido" }, ATIVIDADE));
    await registrarConferencia({ ...BASE, resultado: "certo", destinoId: "escolhido" });
    expect(mockGerarUnidades.mock.calls[0][0].item_id).toBe("escolhido");
  });
});

// ── O toggle "desconta" da ficha ────────────────────────────────────────────
// A baixa pela ficha acontece na APROVAÇÃO (é quando a peça entra no estoque),
// só nas linhas LIGADAS, e deixa rastro em estoque_movimentos.
describe("baixa pela ficha na aprovação", () => {
  /** Pilha antiga: a entrada soma no item e não nasce caixa — a fila é curta. */
  function filaComFicha(linhas: unknown[], componente: Record<string, unknown>): Resposta[] {
    return [
      { data: ATIVIDADE },                 // 1. atividade (50 feitas)
      { data: null },                      // 2. aprovação anterior? não
      { data: [ITEM_PILHA_ANTIGA] },       // 3. item
      { data: { id: "conf-1" } },          // 4. grava a conferência
      { error: null },                     // 5. soma as 50 no item
      { data: linhas },                    // 5b. linhas com "desconta" ligado
      { data: [componente] },              // 5c. o componente
      { data: [] },                        // 5d. nada saiu por bipe nesta atividade
      { error: null },                     // 5e. baixa no componente
      { error: null },                     // 5f. rastro em estoque_movimentos
      { error: null },                     // 6. fecha a atividade
      { error: null },
    ];
  }
  const CHAPA = { id: "chapa-1", nome: "Chapa EVA", quantidade: 30, serializado: false };

  it("linha LIGADA: tira o que as peças gastaram e grava o rastro", async () => {
    db = fakeDb(filaComFicha([{ componente_id: "chapa-1", quantidade: 0.5, desconta: true }], CHAPA));
    const r = await registrarConferencia({ ...BASE, resultado: "certo" });

    // 50 aprovadas × 0,5 = 25 chapas; havia 30, sobram 5.
    expect(r.baixaFicha?.descontados).toEqual([{ nome: "Chapa EVA", quantidade: 25, saldo: 5, faltou: 0 }]);
    expect(updateDe(db.ops, "estoque_itens").map((o) => o.payload?.quantidade)).toEqual([60, 5]);
    const mov = db.ops.find((o) => o.tabela === "estoque_movimentos" && o.metodo === "insert");
    expect(mov?.payload).toMatchObject({ item_id: "chapa-1", delta: -25, origem: "atividade" });
  });

  it("linha DESLIGADA não mexe no estoque de ninguém — o padrão", async () => {
    db = fakeDb(filaComFicha([{ componente_id: "chapa-1", quantidade: 0.5, desconta: false }], CHAPA));
    const r = await registrarConferencia({ ...BASE, resultado: "certo" });

    expect(r.baixaFicha).toBeUndefined();
    expect(updateDe(db.ops, "estoque_itens").map((o) => o.payload?.quantidade)).toEqual([60]);   // só a entrada
    expect(db.ops.some((o) => o.tabela === "estoque_movimentos")).toBe(false);
  });

  it("componente etiquetado não tem saldo em número: fica em 'pulados', com o motivo", async () => {
    db = fakeDb(filaComFicha(
      [{ componente_id: "chapa-1", quantidade: 0.5, desconta: true }],
      { ...CHAPA, serializado: true },
    ));
    const r = await registrarConferencia({ ...BASE, resultado: "certo" });
    expect(r.baixaFicha?.descontados).toEqual([]);
    expect(r.baixaFicha?.pulados[0]).toMatchObject({ nome: "Chapa EVA" });
    expect(updateDe(db.ops, "estoque_itens").map((o) => o.payload?.quantidade)).toEqual([60]);
  });

  it("estoque contado a menos: desconta até zero e diz quanto faltou", async () => {
    db = fakeDb(filaComFicha(
      [{ componente_id: "chapa-1", quantidade: 1, desconta: true }],   // 50 × 1 = 50
      { ...CHAPA, quantidade: 30 },
    ));
    const r = await registrarConferencia({ ...BASE, resultado: "certo" });
    expect(r.baixaFicha?.descontados[0]).toMatchObject({ quantidade: 50, saldo: 0, faltou: 20 });
  });
});
