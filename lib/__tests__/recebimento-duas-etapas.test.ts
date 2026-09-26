import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  statusAposEvento, precisaGuardar, guardadaAte, faltaGuardar, faltaGuardarDoAviso,
  STATUS_AGUARDANDO_CHEGADA, STATUS_PENDENTES,
} from "../recebimento-etapas";

/**
 * Chegou ≠ está no estoque.
 *
 * O defeito que isto trava: `status = 'recebido'` significava as DUAS coisas ao
 * mesmo tempo — a mercadoria chegou E ela está no estoque. Quem assina a
 * entrega é a recepção (tablet de ponto, caixa fechada na mão); quem abre,
 * confere, etiqueta e guarda é o galpão, horas depois. Enquanto era um ato só,
 * o sistema contava 100 almofadas com a caixa lacrada no corredor, e a conta só
 * aparecia errada num inventário meses depois.
 *
 * As três regras que não podem voltar:
 *
 *  1. ETAPA 1 (chegada) NÃO encosta no estoque. Nenhuma linha de
 *     `estoque_itens`, nenhuma etiqueta gerada.
 *  2. `recebido` continua querendo dizer "está no estoque" — chegada sem guarda
 *     nunca chega nesse status, porque ele é terminal e some dos pendentes.
 *  3. Guardar mais do que chegou é estoque inventado do nada.
 */

// ── Banco falso (mesmo desenho de recebimento-lanca-ou-avisa.test.ts) ─────────
type Resposta = { data?: unknown; error?: { message?: string; code?: string } | null; count?: number };

const chamadas: { tabela: string; metodo: string; args: unknown[] }[] = [];
let fila: Resposta[] = [];

function fakeDb() {
  const from = (tabela: string) => {
    const builder: Record<string, unknown> = {};
    const encadeia = (nome: string) => (...args: unknown[]) => {
      chamadas.push({ tabela, metodo: nome, args });
      return builder;
    };
    for (const m of ["select", "insert", "update", "upsert", "eq", "in", "gt", "gte", "ilike", "not", "order", "limit", "maybeSingle", "single"]) {
      builder[m] = encadeia(m);
    }
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      const resp = fila.shift() ?? { data: null, error: null };
      return Promise.resolve(resp).then(resolve, reject);
    };
    return builder;
  };
  return { from };
}

vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => fakeDb() }));
vi.mock("@/lib/notificacoes", () => ({ notificar: async () => {} }));
const mockGerar = vi.fn(async () => [{ id: "u1", codigo: "MP-1-000001", seq: 1, pecas: 1 }]);
vi.mock("@/lib/estoque-unidades-gerar", () => ({
  gerarUnidadesEmLotes: (...a: unknown[]) => mockGerar(...(a as [])),
}));

const { confirmarRecebimento, guardarNoEstoque, listarCompras } = await import("../recebimento");

/** Compra num banco que AINDA NÃO rodou supabase/recebimento_v4.sql. */
const COMPRA_ANTIGA = {
  id: "c1", item_nome: "Almofada N.3", categoria: "Almofadas", unidade: "un",
  estoque_item_id: null, hierarquia: null,
  quantidade_comprada: 10, quantidade_recebida: 0,
  fornecedor: null, preco_unit: null, preco_total: null,
  status: "aguardando_entrega", solicitante_id: null, criado_por_id: null,
};

/** A MESMA compra num banco migrado — a chave a mais é a sondagem do código. */
const COMPRA_NOVA = { ...COMPRA_ANTIGA, quantidade_guardada: 0, chegou_em: null };

function payload(tabela: string, metodo: "insert" | "update"): Record<string, unknown> | undefined {
  return chamadas.find((c) => c.tabela === tabela && c.metodo === metodo)?.args[0] as Record<string, unknown> | undefined;
}
const tocou = (tabela: string) => chamadas.some((c) => c.tabela === tabela);

beforeEach(() => { chamadas.length = 0; fila = []; mockGerar.mockClear(); });

// ── A régua, sozinha ─────────────────────────────────────────────────────────
describe("a régua das duas etapas", () => {
  const base = { statusAtual: "aguardando_entrega" as const, houveDivergencia: false, falhaEstoque: false };

  it("chegou tudo e ninguém guardou = `chegou`, que NÃO é terminal", () => {
    const s = statusAposEvento({ ...base, comprada: 10, recebidaTotal: 10, guardadaTotal: 0 });
    expect(s).toBe("chegou");
    expect(STATUS_PENDENTES, "mercadoria parada no corredor é pendência, não fim").toContain(s);
    expect(STATUS_AGUARDANDO_CHEGADA, "o que já chegou não pode ser confirmado como chegado de novo").not.toContain(s);
  });

  it("só fecha em `recebido` quando o que chegou está guardado", () => {
    expect(statusAposEvento({ ...base, comprada: 10, recebidaTotal: 10, guardadaTotal: 10 })).toBe("recebido");
    expect(statusAposEvento({ ...base, comprada: 10, recebidaTotal: 10, guardadaTotal: 9 })).toBe("chegou");
  });

  it("estoque que foi TENTADO e falhou é erro (vermelho), não espera", () => {
    expect(statusAposEvento({ ...base, comprada: 10, recebidaTotal: 10, guardadaTotal: 0, falhaEstoque: true })).toBe("divergencia");
  });

  it("nada chegou ainda não vira 'chegou parcialmente'", () => {
    expect(statusAposEvento({ ...base, comprada: 10, recebidaTotal: 0, guardadaTotal: 0 })).toBe("aguardando_entrega");
  });

  it("parcial continua parcial, guardado ou não", () => {
    expect(statusAposEvento({ ...base, comprada: 10, recebidaTotal: 4, guardadaTotal: 0 })).toBe("chegou_parcial");
    expect(statusAposEvento({ ...base, comprada: 10, recebidaTotal: 4, guardadaTotal: 4 })).toBe("chegou_parcial");
  });

  it("no banco antigo, o que dedura a fila é o estoque_erro", () => {
    // Sem a coluna, "chegou e não subiu" só cabe em `estoque_erro` — e é ele
    // que segura a compra na fila do corredor em vez de deixá-la sumir.
    const antiga = { status: "divergencia" as const, quantidade_comprada: 10, quantidade_recebida: 10, estoque_erro: "ninguém guardou ainda" };
    expect(guardadaAte(antiga)).toBe(0);
    expect(precisaGuardar(antiga)).toBe(true);
    // Compra velha que deu certo continua fora da fila: no mundo antigo chegar
    // e entrar no estoque eram o mesmo ato.
    const velha = { status: "recebido" as const, quantidade_comprada: 10, quantidade_recebida: 10 };
    expect(precisaGuardar(velha)).toBe(false);
    expect(faltaGuardar(velha)).toBe(0);
  });

  it("cancelada e recebida nunca aparecem na fila", () => {
    expect(precisaGuardar({ status: "cancelado", quantidade_comprada: 10, quantidade_recebida: 10, quantidade_guardada: 0 })).toBe(false);
    expect(precisaGuardar({ status: "recebido", quantidade_comprada: 10, quantidade_recebida: 10, quantidade_guardada: 0 })).toBe(false);
  });
});

// ── ETAPA 1 · chegou ─────────────────────────────────────────────────────────
describe("etapa 1 — chegou (recepção)", () => {
  it("não encosta no estoque, e a compra fica pendente", async () => {
    fila = [
      { data: COMPRA_NOVA },                                   // busca a compra
      { data: null },                                          // evento
      { data: { ...COMPRA_NOVA, status: "chegou", quantidade_recebida: 10 } },
    ];

    const r = await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 10, correto: true, recebido_por: "Recepção", etapa: "chegada" });

    expect(tocou("estoque_itens"), "a caixa ainda está fechada — nada pode subir").toBe(false);
    expect(mockGerar).not.toHaveBeenCalled();
    expect(r.status).toBe("chegou");
    expect(r.falta_guardar).toBe(10);
    expect(r.estoque).toBeNull();

    const up = payload("compras", "update")!;
    expect(up.quantidade_recebida).toBe(10);
    expect(up.quantidade_guardada, "nada entrou no estoque").toBe(0);
    expect(up.chegou_em, "quem assinou a entrega e quando fica separado de quem guardou").toBeTruthy();
    expect(up.chegou_por).toBe("Recepção");
    expect(up.guardado_em, "ninguém guardou nada ainda").toBeUndefined();
    expect(up.estoque_erro, "não é erro: é etapa que falta").toBeNull();

    expect(payload("recebimentos", "insert")!.etapa).toBe("chegada");
  });

  it("num banco sem a migração, cai em `divergencia` com o motivo escrito — nunca em `recebido`", async () => {
    fila = [
      { data: COMPRA_ANTIGA },
      { data: null },
      { data: { ...COMPRA_ANTIGA, status: "divergencia", quantidade_recebida: 10 } },
    ];

    const r = await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 10, correto: true, etapa: "chegada" });

    expect(r.status, "`recebido` é terminal e promete estoque — não pode ser alcançado pela chegada").toBe("divergencia");
    const up = payload("compras", "update")!;
    expect(up.status).toBe("divergencia");
    expect(up.estoque_erro).toContain("ninguém guardou");
    expect(up, "coluna que não existe não vai pro banco").not.toHaveProperty("quantidade_guardada");
    expect(payload("recebimentos", "insert")!, "nem no evento").not.toHaveProperty("etapa");
  });

  it("confirmar de novo o que já chegou inteiro é recusado", async () => {
    fila = [{ data: { ...COMPRA_NOVA, quantidade_recebida: 10, status: "chegou" } }];
    await expect(confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 10, correto: true, etapa: "chegada" }))
      .rejects.toThrow("compra_ja_chegou");
    expect(tocou("recebimentos"), "recusa antes de gravar qualquer coisa").toBe(false);
  });
});

// ── ETAPA 2 · guardado ───────────────────────────────────────────────────────
describe("etapa 2 — guardado (galpão)", () => {
  it("sobe o estoque do que já tinha chegado e fecha a compra", async () => {
    const chegou = { ...COMPRA_NOVA, quantidade_recebida: 10, quantidade_guardada: 0, status: "chegou", estoque_item_id: "i1", preco_unit: 7.5 };
    fila = [
      { data: chegou },
      { data: null },                                                          // evento
      { data: { nome: "Almofada N.3", quantidade: 2, serializado: false } },   // item
      { data: null },                                                          // soma no item
      { data: null },                                                          // custo
      { data: { ...chegou, status: "recebido", quantidade_guardada: 10 } },
    ];

    const r = await guardarNoEstoque({ compra_id: "c1", quantidade: 10, guardado_por: "Diego" });

    expect(payload("estoque_itens", "update")!.quantidade).toBe(12);
    expect(r.status).toBe("recebido");
    expect(r.falta_guardar).toBe(0);

    const up = payload("compras", "update")!;
    expect(up.quantidade_recebida, "guardar não muda o que chegou").toBe(10);
    expect(up.quantidade_guardada).toBe(10);
    expect(up.guardado_por).toBe("Diego");
    expect(up.guardado_em).toBeTruthy();
    expect(up.chegou_por, "quem guardou não reescreve quem recebeu").toBeUndefined();
    expect(payload("recebimentos", "insert")!.etapa).toBe("estoque");
  });

  it("guardar em duas vezes deixa a compra na fila até o último item entrar", async () => {
    const chegou = { ...COMPRA_NOVA, quantidade_recebida: 10, quantidade_guardada: 0, status: "chegou", estoque_item_id: "i1" };
    fila = [
      { data: chegou },
      { data: null },
      { data: { nome: "Almofada N.3", quantidade: 0, serializado: false } },
      { data: null },
      { data: { ...chegou, status: "chegou", quantidade_guardada: 4 } },
    ];

    const r = await guardarNoEstoque({ compra_id: "c1", quantidade: 4 });

    expect(r.status).toBe("chegou");
    expect(r.falta_guardar).toBe(6);
    expect(payload("compras", "update")!.quantidade_guardada).toBe(4);
  });

  it("guardar mais do que chegou é recusado — senão é estoque inventado", async () => {
    fila = [{ data: { ...COMPRA_NOVA, quantidade_recebida: 10, quantidade_guardada: 8, status: "chegou" } }];
    await expect(guardarNoEstoque({ compra_id: "c1", quantidade: 5 }))
      .rejects.toThrow("quantidade_maior_que_o_recebido");
    expect(tocou("estoque_itens")).toBe(false);
  });

  it("compra que ninguém recebeu não tem o que guardar", async () => {
    fila = [{ data: COMPRA_NOVA }];
    await expect(guardarNoEstoque({ compra_id: "c1", quantidade: 3 })).rejects.toThrow("nada_para_guardar");
  });
});

// ── O caminho de sempre ──────────────────────────────────────────────────────
describe("o totem continua fazendo as duas de uma vez", () => {
  it("sem `etapa`, chegar e guardar acontecem no mesmo ato (o app instalado)", async () => {
    fila = [
      { data: { ...COMPRA_NOVA, estoque_item_id: "i1" } },
      { data: null },
      { data: { nome: "Almofada N.3", quantidade: 0, serializado: false } },
      { data: null },
      { data: { ...COMPRA_NOVA, status: "recebido", quantidade_recebida: 10, quantidade_guardada: 10 } },
    ];

    const r = await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 10, correto: true });

    expect(r.etapa).toBe("ambas");
    expect(r.status).toBe("recebido");
    const up = payload("compras", "update")!;
    expect(up.quantidade_recebida).toBe(10);
    expect(up.quantidade_guardada).toBe(10);
    expect(up.chegou_em).toBeTruthy();
    expect(up.guardado_em).toBeTruthy();
  });
});

// ── O banco de HOJE (recebimento_v4.sql não rodado) ──────────────────────────
//
// Aqui mora o defeito mais caro que a separação em duas etapas pode causar: a
// mesma mercadoria somada DUAS vezes no estoque. Sem `quantidade_guardada`, a
// única memória de "chegou e ninguém guardou" é o texto de `estoque_erro` — e
// enquanto ele era um sim/não, a compra que chegou em duas vezes perdia a
// conta do que já estava guardado.
describe("banco antigo — o que já foi guardado não pode ser guardado de novo", () => {
  it("a frase de `estoque_erro` carrega o NÚMERO do que falta guardar", async () => {
    fila = [
      { data: COMPRA_ANTIGA },
      { data: null },
      { data: { ...COMPRA_ANTIGA, status: "chegou_parcial", quantidade_recebida: 5 } },
    ];

    await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 5, correto: true, etapa: "chegada" });

    const erro = String(payload("compras", "update")!.estoque_erro);
    expect(erro, "a pessoa continua lendo a frase inteira no card").toContain("ninguém guardou");
    expect(faltaGuardarDoAviso(erro), "e o número volta pra quem calcula a fila").toBe(5);
  });

  it("chegada parcial GUARDADA, resto chegando: a fila é 5, nunca 10", async () => {
    // A sequência real do galpão, num banco sem a migração:
    //   comprada 10 → chegam 5 → o galpão guarda os 5 → chegam os outros 5.
    // Com o sim/não antigo, `guardadaAte` voltava a ZERO aqui e a tela oferecia
    // "guardar 10": o estoque fechava com 15 peças de uma compra de 10.
    const meioGuardada = {
      ...COMPRA_ANTIGA, status: "chegou_parcial", quantidade_recebida: 5, estoque_erro: null,
    };
    fila = [
      { data: meioGuardada },
      { data: null },
      { data: { ...meioGuardada, quantidade_recebida: 10, status: "divergencia" } },
    ];

    const r = await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 5, correto: true, etapa: "chegada" });

    expect(r.falta_guardar, "só os 5 que acabaram de chegar").toBe(5);
    const compraDepois = {
      status: "divergencia" as const, quantidade_comprada: 10, quantidade_recebida: 10,
      estoque_erro: String(payload("compras", "update")!.estoque_erro),
    };
    expect(faltaGuardar(compraDepois), "a fila do corredor não pode dobrar").toBe(5);
    expect(guardadaAte(compraDepois), "os 5 primeiros continuam no estoque").toBe(5);
  });

  it("guardar mais do que falta é recusado mesmo sem a coluna", async () => {
    // O teto da etapa 2 sai da mesma régua: se ela mentir, a guarda mente junto.
    fila = [{
      data: {
        ...COMPRA_ANTIGA, status: "divergencia", quantidade_recebida: 10,
        estoque_erro: "ninguém guardou ainda — faltam 5 para guardar; dê entrada pela aba Recebimento",
      },
    }];
    await expect(guardarNoEstoque({ compra_id: "c1", quantidade: 10 }))
      .rejects.toThrow("quantidade_maior_que_o_recebido");
    expect(tocou("estoque_itens"), "nada pode subir numa guarda recusada").toBe(false);
  });

  it("a chegada correta NÃO chega ao tablet como divergência", async () => {
    // `divergencia` é só o que cabe no CHECK antigo. O app da recepção pinta
    // esse status de vermelho com "Recebido com divergência" — em toda entrega
    // certa. O que a rota devolve é o status honesto.
    fila = [
      { data: COMPRA_ANTIGA },
      { data: null },
      { data: { ...COMPRA_ANTIGA, status: "divergencia", quantidade_recebida: 10 } },
    ];

    const r = await confirmarRecebimento({ compra_id: "c1", quantidade_recebida: 10, correto: true, etapa: "chegada" });

    expect(r.status, "o que ficou GRAVADO na linha").toBe("divergencia");
    expect(r.status_efetivo, "o que de fato aconteceu").toBe("chegou");
  });

  it("divergência de verdade continua sendo divergência nos dois campos", async () => {
    fila = [
      { data: COMPRA_ANTIGA },
      { data: null },
      { data: { ...COMPRA_ANTIGA, status: "divergencia", quantidade_recebida: 10 } },
    ];

    const r = await confirmarRecebimento({
      compra_id: "c1", quantidade_recebida: 10, correto: false,
      divergencia_motivo: "embalagem rasgada", etapa: "chegada",
    });

    expect(r.status).toBe("divergencia");
    expect(r.status_efetivo, "aqui o vermelho do tablet é o certo").toBe("divergencia");
  });
});

// ── A tela de quem ASSINA a entrega ──────────────────────────────────────────
describe("a recepção só vê o que ainda pode chegar", () => {
  it("compra que chegou inteira sai da lista do tablet da recepção", async () => {
    // `divergencia` está em STATUS_AGUARDANDO_CHEGADA porque uma entrega torta
    // pode ter resto a caminho — e no banco de hoje TODA chegada vira
    // `divergencia`. Sem o filtro por "ainda falta chegar", a caixa já assinada
    // ficava pra sempre na tela de quem assina, com "faltam 0" do lado.
    fila = [{
      data: [
        { ...COMPRA_ANTIGA, id: "a", status: "aguardando_entrega", quantidade_recebida: 0 },
        { ...COMPRA_ANTIGA, id: "b", status: "chegou_parcial", quantidade_recebida: 4 },
        { ...COMPRA_ANTIGA, id: "c", status: "divergencia", quantidade_recebida: 10, estoque_erro: "ninguém guardou ainda — faltam 10 para guardar" },
      ],
    }];

    const lista = await listarCompras({ aguardandoChegada: true });

    expect(lista.map((c) => c.id)).toEqual(["a", "b"]);
  });
});
