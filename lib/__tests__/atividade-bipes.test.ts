import { describe, it, expect, vi, afterEach } from "vitest";
import {
  MOTIVOS_DISPENSA,
  motivoDispensaValido,
  rotuloDispensa,
  normalizarCodigos,
  eventosDoConsumo,
  eventoDeDispensa,
  resumirBipes,
  registrarBipes,
  bipesDaAtividade,
  exigeBipeParaIniciar,
  uuidOuNulo,
  LOTE_MAXIMO_BIPES,
} from "@/lib/atividade-bipes";

afterEach(() => vi.restoreAllMocks());

describe("motivos da dispensa", () => {
  it("todo motivo tem chave, rótulo e ícone", () => {
    for (const m of MOTIVOS_DISPENSA) {
      expect(m.key).toMatch(/^[a-z_]+$/);
      expect(m.label.length).toBeGreaterThan(4);
      expect(m.icon.length).toBeGreaterThan(2);
    }
    expect(new Set(MOTIVOS_DISPENSA.map((m) => m.key)).size).toBe(MOTIVOS_DISPENSA.length);
  });

  it('"esta atividade não usa material" é um motivo de verdade, não um esquecimento', () => {
    // Se não existisse, quem faz "organizar bancada" teria que mentir
    // "etiqueta rasgada" — e o número que diz que o interruptor está ligado
    // pra tarefa errada nunca apareceria.
    expect(MOTIVOS_DISPENSA.map((m) => m.key)).toContain("sem_material");
  });

  it("valida só o que existe", () => {
    expect(motivoDispensaValido("sem_etiqueta")).toBe(true);
    expect(motivoDispensaValido("porque sim")).toBe(false);
    expect(motivoDispensaValido(null)).toBe(false);
    expect(motivoDispensaValido(42)).toBe(false);
  });

  it("motivo que este servidor não conhece sobrevive no rótulo", () => {
    // App novo, servidor velho: engolir o que a pessoa escolheu pra mostrar um
    // genérico apagaria a única informação da linha.
    expect(rotuloDispensa("motivo_do_futuro")).toBe("motivo_do_futuro");
    expect(rotuloDispensa("sem_etiqueta")).toBe("O material não tem etiqueta");
  });
});

describe("normalizarCodigos", () => {
  it("tira repetido PRESERVANDO a ordem", () => {
    expect(normalizarCodigos(["B-000002", "A-000001", "B-000002"])).toEqual(["B-000002", "A-000001"]);
  });

  it("descarta vazio e espaço", () => {
    expect(normalizarCodigos(["  A-000001  ", "", "   ", null, undefined])).toEqual(["A-000001"]);
  });

  it("corta no teto", () => {
    const muitos = Array.from({ length: LOTE_MAXIMO_BIPES + 25 }, (_, i) => `C-${1000 + i}`);
    expect(normalizarCodigos(muitos)).toHaveLength(LOTE_MAXIMO_BIPES);
  });

  it("o que não é lista vira lista vazia", () => {
    expect(normalizarCodigos("A-000001")).toEqual([]);
    expect(normalizarCodigos(null)).toEqual([]);
  });
});

describe("eventos", () => {
  it("traduz o resultado da baixa sem inventar peça", () => {
    const eventos = eventosDoConsumo([
      { codigo: "A-000001", situacao: "baixada", item: "Folha de alavanca", pecas: 50 },
      { codigo: "B-000002", situacao: "desconhecida", item: null, pecas: 0 },
      { codigo: "C-000003", situacao: "ja_baixada", item: "Chapa", pecas: 0 },
    ]);
    expect(eventos.map((e) => e.pecas)).toEqual([50, 0, 0]);
    expect(eventos.every((e) => e.motivo === null)).toBe(true);
  });

  it("peça só conta quando a etiqueta de fato saiu", () => {
    // `baixarUnidades` já devolve 0 nesses casos; a guarda existe porque esta
    // função é a fronteira do que entra no banco (a coluna tem check >= 0).
    const [e] = eventosDoConsumo([{ codigo: "X-1", situacao: "ja_baixada", item: "Chapa", pecas: 7 }]);
    expect(e.pecas).toBe(0);
  });

  it("dispensa não tem código nem item", () => {
    const e = eventoDeDispensa("etiqueta_ilegivel");
    expect(e).toEqual({ codigo: null, situacao: "dispensado", item: null, pecas: 0, motivo: "etiqueta_ilegivel" });
  });

  it("dispensa sem motivo ainda deixa rastro", () => {
    expect(eventoDeDispensa("").motivo).toBe("sem_motivo");
  });
});

describe("resumirBipes", () => {
  it("soma peça, não etiqueta", () => {
    const r = resumirBipes(eventosDoConsumo([
      { codigo: "A", situacao: "baixada", item: "Folha", pecas: 50 },
      { codigo: "B", situacao: "baixada", item: "Chapa", pecas: 1 },
      { codigo: "C", situacao: "desconhecida", item: null, pecas: 0 },
      { codigo: "D", situacao: "ja_baixada", item: "Chapa", pecas: 0 },
    ]));
    expect(r).toEqual({ baixadas: 2, desconhecidas: 1, repetidas: 1, pecas: 51, dispensado: false });
  });

  it("marca a dispensa", () => {
    expect(resumirBipes([eventoDeDispensa("leitor_parado")]).dispensado).toBe(true);
  });
});

// ── banco (falso) ────────────────────────────────────────────────────────────

function dbQueGrava() {
  const inseridas: Record<string, unknown>[][] = [];
  return {
    inseridas,
    from: () => ({ insert: async (linhas: Record<string, unknown>[]) => { inseridas.push(linhas); return { error: null }; } }),
  };
}

function dbQueFalha(message: string) {
  return { from: () => ({ insert: async () => ({ error: { message } }) }) };
}

describe("registrarBipes", () => {
  it("grava uma linha por evento, com o carimbo do TABLET", async () => {
    const db = dbQueGrava();
    const ok = await registrarBipes(db, {
      atividadeId: "11111111-1111-1111-1111-111111111111",
      colaboradorId: "22222222-2222-2222-2222-222222222222",
      colaboradorNome: "Fulano",
      ocorridoEm: "2026-08-15T11:00:00.000Z",
      eventos: eventosDoConsumo([{ codigo: "A-000001", situacao: "baixada", item: "Folha", pecas: 50 }]),
    });
    expect(ok).toBe(true);
    expect(db.inseridas[0]).toEqual([{
      atividade_id: "11111111-1111-1111-1111-111111111111",
      colaborador_id: "22222222-2222-2222-2222-222222222222",
      colaborador_nome: "Fulano",
      codigo: "A-000001",
      situacao: "baixada",
      item: "Folha",
      pecas: 50,
      motivo: null,
      ocorrido_em: "2026-08-15T11:00:00.000Z",
    }]);
  });

  it("a fila offline não carimba tudo no segundo do flush", async () => {
    // A mesma armadilha do ponto: N bipes represados da manhã inteira subindo
    // juntos às 17h não podem virar 17h todos.
    const db = dbQueGrava();
    await registrarBipes(db, {
      atividadeId: "a", colaboradorId: null, colaboradorNome: null,
      ocorridoEm: "2026-08-15T08:03:00.000Z",
      eventos: [eventoDeDispensa("sem_etiqueta")],
    });
    expect(db.inseridas[0][0].ocorrido_em).toBe("2026-08-15T08:03:00.000Z");
  });

  it("sem a tabela devolve false e NÃO lança", async () => {
    // O SQL roda à mão. Enquanto ninguém rodou, o registro é o que se perde —
    // nunca a baixa, nunca o início da atividade.
    const db = dbQueFalha('relation "public.atividade_bipes" does not exist');
    await expect(registrarBipes(db, {
      atividadeId: "a", colaboradorId: null, colaboradorNome: null,
      eventos: [eventoDeDispensa("sem_etiqueta")],
    })).resolves.toBe(false);
  });

  it("erro qualquer do banco também não derruba o push", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = dbQueFalha("deu ruim de um jeito novo");
    await expect(registrarBipes(db, {
      atividadeId: "a", colaboradorId: null, colaboradorNome: null,
      eventos: [eventoDeDispensa("sem_etiqueta")],
    })).resolves.toBe(false);
  });

  it("lista vazia não vai ao banco", async () => {
    const db = dbQueGrava();
    expect(await registrarBipes(db, { atividadeId: "a", colaboradorId: null, colaboradorNome: null, eventos: [] })).toBe(true);
    expect(db.inseridas).toHaveLength(0);
  });
});

describe("o interruptor", () => {
  const config = (resposta: { data?: unknown; error?: { message: string } }) => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => resposta };
    return { from: () => q };
  };

  it("ligado é ligado", async () => {
    expect(await exigeBipeParaIniciar(config({ data: { bipe_para_iniciar: true } }))).toBe(true);
  });

  it("DESLIGADO é sempre a resposta segura", async () => {
    // Sem a coluna, sem a tabela, com o banco fora do ar: o tablet segue
    // trabalhando como trabalha hoje. O contrário — um erro de leitura virando
    // "exige bipe" — para a bancada inteira por causa de uma consulta que
    // falhou, e ninguém no galpão teria como adivinhar o motivo.
    expect(await exigeBipeParaIniciar(config({ data: { bipe_para_iniciar: false } }))).toBe(false);
    expect(await exigeBipeParaIniciar(config({ data: null }))).toBe(false);
    expect(await exigeBipeParaIniciar(config({ error: { message: 'column "bipe_para_iniciar" does not exist' } }))).toBe(false);
    expect(await exigeBipeParaIniciar(config({ error: { message: "connection reset" } }))).toBe(false);
    expect(await exigeBipeParaIniciar({ from: () => { throw new Error("caiu"); } })).toBe(false);
  });
});

describe("uuidOuNulo", () => {
  it("string vazia vira null, não vira uuid", () => {
    // `""` numa coluna `uuid` é 22P02 e derruba o INSERT inteiro.
    expect(uuidOuNulo("")).toBeNull();
    expect(uuidOuNulo("atividade-do-joão")).toBeNull();
    expect(uuidOuNulo(undefined)).toBeNull();
    expect(uuidOuNulo("11111111-1111-1111-1111-111111111111")).toBe("11111111-1111-1111-1111-111111111111");
  });
});

describe("bipesDaAtividade", () => {
  const consulta = (resposta: { data?: unknown; error?: { message: string } }) => {
    const q = {
      select: () => q, eq: () => q, order: () => q,
      limit: async () => resposta,
    };
    return { from: () => q };
  };

  it("vazio POR FALTA DE TABELA é diferente de vazio de verdade", async () => {
    const semTabela = await bipesDaAtividade(
      consulta({ error: { message: "Could not find the table 'public.atividade_bipes' in the schema cache" } }), "a");
    expect(semTabela).toEqual({ lista: [], semLivro: true });

    const vazioMesmo = await bipesDaAtividade(consulta({ data: [] }), "a");
    expect(vazioMesmo).toEqual({ lista: [], semLivro: false });
  });

  it("peça nula (banco sem a coluna) lê como zero, nunca NaN", async () => {
    const { lista } = await bipesDaAtividade(consulta({
      data: [{ codigo: null, situacao: "dispensado", item: null, pecas: null, motivo: "sem_etiqueta", colaborador_nome: "Fulano", ocorrido_em: "2026-08-15T08:00:00Z" }],
    }), "a");
    expect(lista[0].pecas).toBe(0);
    expect(lista[0].colaboradorNome).toBe("Fulano");
  });

  it("erro que não é falta de tabela sobe", async () => {
    await expect(bipesDaAtividade(consulta({ error: { message: "permission denied" } }), "a")).rejects.toThrow("permission denied");
  });
});
