import { describe, it, expect } from "vitest";
import {
  rastrear, porAtividadeConsumidora, porAtividadeConferida, MAX_NIVEIS,
  type FonteGenealogia, type UnidadeRaw, type ConferenciaRaw, type AtividadeRaw,
} from "../atividades-genealogia";

/**
 * "Fulano de tal fez chancela, usou tal material que ciclano fez."
 *
 * Três coisas que este teste existe pra impedir:
 *
 *  1. **N+1.** Encadear genealogia convida a "pra cada caixa, buscar quem a
 *     fez". Este projeto já caiu DUAS vezes por consumo. O teste conta as
 *     chamadas: dobrar o número de caixas de um nível não pode dobrar as
 *     consultas — só um nível a mais pode.
 *  2. **Corrente que não termina.** Peça que consome peça do mesmo item (ou um
 *     dado torto) faz a travessia girar pra sempre. Tem que parar.
 *  3. **Árvore vazia mentindo.** Sem `baixa_atividade_id` no banco a resposta
 *     certa é `semVinculo`, não "essa peça não usou material nenhum" — que é o
 *     que o galpão leria de uma árvore vazia.
 */

// ── Um galpão de mentira, com a corrente inteira montada ─────────────────────
//
//   folha-limpa (feita por Ciclano)
//        └─ consumida pela atividade A1 "Montar alavancas" (Fulano)
//             └─ produziu a caixa "alavanca"
//                  └─ consumida por A2 "Montar base da chancela" (Beltrano)
//                       └─ produziu "base"

const U = (over: Partial<UnidadeRaw> & { id: string }): UnidadeRaw => ({
  codigo: over.codigo ?? over.id.toUpperCase(),
  item_id: over.item_id ?? "item-1",
  status: over.status ?? "consumido",
  quantidade: over.quantidade ?? 1,
  criado_por: over.criado_por ?? null,
  criado_em: over.criado_em ?? "2026-08-10T12:00:00Z",
  baixado_por: over.baixado_por ?? null,
  baixado_em: over.baixado_em ?? null,
  ...over,
});

const A = (id: string, tarefa: string, quem: string): AtividadeRaw => ({
  id, tarefa, categoria: "Chancela", para_id: `${quem}-id`, para_nome: quem,
  produto_nome: null, iniciada_at: "2026-08-10T12:00:00Z", concluida_at: "2026-08-10T13:00:00Z",
});

const C = (atividade_id: string, unidade_id: string | null, resultado = "certo"): ConferenciaRaw => ({
  atividade_id, unidade_id, resultado, conferido_por_nome: "Gerente", conferido_em: "2026-08-10T14:00:00Z",
});

interface Mundo {
  unidades: UnidadeRaw[];
  atividades: AtividadeRaw[];
  conferencias: ConferenciaRaw[];
  /** `true` = o SQL do vínculo não rodou neste banco. */
  semColuna?: boolean;
}

function fonte(mundo: Mundo) {
  const chamadas: string[] = [];
  const semColuna = (u: UnidadeRaw): UnidadeRaw => {
    if (!mundo.semColuna) return u;
    const copia = { ...u };
    delete copia.baixa_atividade_id;   // coluna ausente = propriedade ausente
    return copia;
  };
  const f: FonteGenealogia = {
    async unidadesPorCodigo(codigos) {
      chamadas.push("unidadesPorCodigo");
      return mundo.unidades.filter((u) => codigos.includes(u.codigo)).map(semColuna);
    },
    async unidadesPorId(ids) {
      chamadas.push("unidadesPorId");
      return mundo.unidades.filter((u) => ids.includes(u.id)).map(semColuna);
    },
    async unidadesConsumidasPor(ids) {
      chamadas.push("unidadesConsumidasPor");
      if (mundo.semColuna) return null;
      return mundo.unidades.filter((u) => u.baixa_atividade_id && ids.includes(u.baixa_atividade_id));
    },
    async conferenciasPorUnidade(ids) {
      chamadas.push("conferenciasPorUnidade");
      return mundo.conferencias.filter((c) => c.unidade_id && ids.includes(c.unidade_id));
    },
    async conferenciasPorAtividade(ids) {
      chamadas.push("conferenciasPorAtividade");
      return mundo.conferencias.filter((c) => ids.includes(c.atividade_id));
    },
    async atividades(ids) {
      chamadas.push("atividades");
      return mundo.atividades.filter((a) => ids.includes(a.id));
    },
    async nomesDeItens(ids) {
      chamadas.push("nomesDeItens");
      return new Map(ids.map((id) => [id, `Item ${id}`]));
    },
  };
  return { f, chamadas };
}

const CORRENTE: Mundo = {
  unidades: [
    U({ id: "u-folha", codigo: "FOLHA-1", criado_por: "Ciclano", baixa_atividade_id: "a1", item_id: "folha" }),
    U({ id: "u-alav", codigo: "ALAV-1", criado_por: "Fulano", baixa_atividade_id: "a2", item_id: "alavanca" }),
    U({ id: "u-base", codigo: "BASE-1", criado_por: "Beltrano", baixa_atividade_id: null, status: "em_estoque", item_id: "base" }),
  ],
  atividades: [A("a1", "Montar alavancas", "Fulano"), A("a2", "Montar base da chancela", "Beltrano")],
  conferencias: [C("a1", "u-alav"), C("a2", "u-base")],
};

describe("pra trás — de onde veio esta caixa", () => {
  it("conta a história completa: quem fez a peça e quem fez o material dela", async () => {
    const { f } = fonte(CORRENTE);
    const r = await rastrear(f, { codigo: "BASE-1", direcao: "tras" });

    expect(r.raiz?.codigo).toBe("BASE-1");
    expect(r.semVinculo).toBe(false);

    // Nível 0: a atividade que produziu a base, e o que entrou nela.
    expect(r.niveis[0].elos[0].atividade.tarefa).toBe("Montar base da chancela");
    expect(r.niveis[0].elos[0].atividade.quem).toBe("Beltrano");
    expect(r.niveis[0].elos[0].unidades.map((u) => u.codigo)).toEqual(["ALAV-1"]);
    // "usou tal material que ciclano fez" — a autoria do material está lá.
    expect(r.niveis[0].elos[0].unidades[0].criadoPor).toBe("Fulano");

    // Nível 1: um elo acima — quem fez a alavanca, e com o quê.
    expect(r.niveis[1].elos[0].atividade.tarefa).toBe("Montar alavancas");
    expect(r.niveis[1].elos[0].unidades[0].codigo).toBe("FOLHA-1");
    expect(r.niveis[1].elos[0].unidades[0].criadoPor).toBe("Ciclano");
  });

  it("código que não existe devolve raiz nula, e não uma árvore inventada", async () => {
    const { f, chamadas } = fonte(CORRENTE);
    const r = await rastrear(f, { codigo: "NAO-EXISTE", direcao: "tras" });
    expect(r.raiz).toBeNull();
    expect(r.niveis).toEqual([]);
    expect(chamadas).toEqual(["unidadesPorCodigo"]);   // desiste na primeira consulta
  });
});

describe("pra frente — onde este material foi parar", () => {
  it("segue o lote ruim até a peça pronta", async () => {
    const { f } = fonte(CORRENTE);
    const r = await rastrear(f, { codigo: "FOLHA-1", direcao: "frente" });

    expect(r.niveis[0].elos[0].atividade.tarefa).toBe("Montar alavancas");
    expect(r.niveis[0].elos[0].unidades.map((u) => u.codigo)).toEqual(["ALAV-1"]);
    expect(r.niveis[1].elos[0].atividade.tarefa).toBe("Montar base da chancela");
    expect(r.niveis[1].elos[0].unidades.map((u) => u.codigo)).toEqual(["BASE-1"]);
  });

  it("marca a atividade que já teve conferência reprovada", async () => {
    const mundo: Mundo = { ...CORRENTE, conferencias: [C("a1", "u-alav"), C("a1", null, "errado"), C("a2", "u-base")] };
    const { f } = fonte(mundo);
    const r = await rastrear(f, { codigo: "FOLHA-1", direcao: "frente" });
    expect(r.niveis[0].elos[0].reprovada).toBe(true);
  });
});

describe("o custo — é por NÍVEL, nunca por caixa", () => {
  it("duzentas caixas no mesmo nível custam o mesmo que uma", async () => {
    const muitas = (n: number): Mundo => ({
      unidades: [
        U({ id: "raiz", codigo: "RAIZ", item_id: "pronta" }),
        ...Array.from({ length: n }, (_, i) => U({ id: `m${i}`, codigo: `M${i}`, baixa_atividade_id: "a1", item_id: `mat${i}` })),
      ],
      atividades: [A("a1", "Montar", "Fulano")],
      conferencias: [C("a1", "raiz")],
    });

    const uma = fonte(muitas(1));
    const duzentas = fonte(muitas(200));
    await rastrear(uma.f, { codigo: "RAIZ", direcao: "tras" });
    await rastrear(duzentas.f, { codigo: "RAIZ", direcao: "tras" });

    expect(duzentas.chamadas.length).toBe(uma.chamadas.length);
  });

  it("a corrente inteira de dois níveis custa nove consultas — e a nona tem nome", async () => {
    const { f, chamadas } = fonte(CORRENTE);
    const r = await rastrear(f, { codigo: "BASE-1", direcao: "tras" });
    // 1 (a caixa raiz) + 2 níveis × 3 (conferências, atividades, consumidas)
    // + 1 (a pergunta que DESCOBRE que a corrente acabou — não há como saber
    //      que o topo chegou sem perguntar uma vez a mais)
    // + 1 (o nome de todos os itens, de uma vez só, no fim).
    // O número exato é o ponto: um laço com `await` dentro faria isto virar 20
    // sem ninguém notar até a fatura.
    expect(chamadas.length).toBe(9);
    expect(r.consultas).toBe(chamadas.length);
    // E o `nomesDeItens` aparece UMA vez, não uma por nível.
    expect(chamadas.filter((c) => c === "nomesDeItens").length).toBe(1);
  });

  it("nunca passa do teto de níveis, mesmo numa corrente longa", async () => {
    // Dez elos encadeados: u0 ← a0 ← u1 ← a1 ← …
    const n = 10;
    const mundo: Mundo = {
      unidades: Array.from({ length: n }, (_, i) =>
        U({ id: `u${i}`, codigo: `U${i}`, item_id: `i${i}`, baixa_atividade_id: i > 0 ? `a${i - 1}` : null })),
      atividades: Array.from({ length: n }, (_, i) => A(`a${i}`, `Etapa ${i}`, "Fulano")),
      conferencias: Array.from({ length: n }, (_, i) => C(`a${i}`, `u${i}`)),
    };
    const { f, chamadas } = fonte(mundo);
    const r = await rastrear(f, { codigo: "U0", direcao: "tras" });
    expect(r.niveis.length).toBe(MAX_NIVEIS);
    expect(r.truncado).toBe(true);
    expect(chamadas.length).toBeLessThanOrEqual(1 + MAX_NIVEIS * 3 + 1);
  });

  it("ciclo não faz a travessia girar pra sempre", async () => {
    // A caixa X foi consumida por A, e A produziu a própria X. Dado torto, mas
    // um `update` errado escreve isso — e um laço sem memória trava o servidor.
    const mundo: Mundo = {
      unidades: [U({ id: "x", codigo: "X", baixa_atividade_id: "a", item_id: "i" })],
      atividades: [A("a", "Loop", "Fulano")],
      conferencias: [C("a", "x")],
    };
    const { f } = fonte(mundo);
    const r = await rastrear(f, { codigo: "X", direcao: "tras" });
    expect(r.niveis.length).toBeLessThanOrEqual(MAX_NIVEIS);
  });
});

describe("degradação — o SQL do vínculo ainda não rodou", () => {
  it("pra trás: mostra QUEM fez, avisa que falta o com quê, e não finge lista vazia", async () => {
    const { f } = fonte({ ...CORRENTE, semColuna: true });
    const r = await rastrear(f, { codigo: "BASE-1", direcao: "tras" });
    expect(r.semVinculo).toBe(true);
    expect(r.niveis[0].elos[0].atividade.quem).toBe("Beltrano");
    expect(r.niveis[0].elos[0].unidades).toEqual([]);
  });

  it("pra frente: sem a coluna não há por onde seguir, e a resposta diz isso", async () => {
    const { f } = fonte({ ...CORRENTE, semColuna: true });
    const r = await rastrear(f, { codigo: "FOLHA-1", direcao: "frente" });
    expect(r.semVinculo).toBe(true);
    expect(r.niveis).toEqual([]);
  });
});

describe("agrupamentos puros", () => {
  it("porAtividadeConsumidora ignora unidade sem vínculo", () => {
    const m = porAtividadeConsumidora([
      U({ id: "a", baixa_atividade_id: "x" }),
      U({ id: "b", baixa_atividade_id: "x" }),
      U({ id: "c", baixa_atividade_id: null }),
    ]);
    expect(m.get("x")!.length).toBe(2);
    expect(m.size).toBe(1);
  });

  it("porAtividadeConferida junta as conferências da mesma atividade", () => {
    const m = porAtividadeConferida([C("a", "u1"), C("a", null, "errado"), C("b", "u2")]);
    expect(m.get("a")!.length).toBe(2);
    expect(m.get("b")!.length).toBe(1);
  });
});
