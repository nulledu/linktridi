import { describe, it, expect } from "vitest";
import {
  varrerPendentesDeConferencia, itensPorNome, chaveDeNome, contarAcervoAnterior,
  corteDaFila, fotosDeExecutores, ErroVarredura, JANELA, DIAS_DA_FILA,
} from "../estoque-fila-conferencia";

/**
 * A fila de conferência é perguntada de dois lugares — o navegador e o TABLET
 * do galpão, que é o aparelho principal de conferência. Eram duas cópias, e a
 * do aparelho ficou pra trás. Estes testes travam o desenho compartilhado,
 * porque os dois defeitos que ele conserta são invisíveis em uso normal e
 * catastróficos no galpão:
 *
 *  1. sem a tabela `estoque_conferencias` (o SQL pendente não rodou), o erro
 *     era engolido e TUDO voltava como pendente — o tablet listava 100% das
 *     atividades concluídas e recusava cada toque;
 *  2. o filtro do "já conferida" rodava em JavaScript DEPOIS do teto, então
 *     linhas presas comiam a janela e uma caixa real sumia da fila sem erro.
 */
type Resposta = { data?: unknown; error?: unknown };

interface Chamada { tabela: string; filtros: string[] }

/**
 * Banco falso: `atividades` responde de uma FILA (uma resposta por janela, o
 * que deixa o teste encadear varreduras) e `estoque_conferencias` responde
 * sempre a mesma coisa.
 */
function fakeDb(janelas: Resposta[], conferencias: Resposta = { data: [], error: null }) {
  const chamadas: Chamada[] = [];
  const from = (tabela: string) => {
    const chamada: Chamada = { tabela, filtros: [] };
    chamadas.push(chamada);
    const builder: Record<string, unknown> = {};
    const encadeia = (nome: string) => (...args: unknown[]) => {
      chamada.filtros.push(`${nome}(${args.map((a) => JSON.stringify(a)).join(",")})`);
      return builder;
    };
    for (const m of ["select", "eq", "in", "not", "order", "limit", "lt", "gte"]) builder[m] = encadeia(m);
    builder.then = (resolve: (v: unknown) => unknown) => {
      const resp = tabela === "atividades"
        ? (janelas.shift() ?? { data: [], error: null })
        : conferencias;
      return Promise.resolve(resp).then(resolve);
    };
    return builder;
  };
  return { from, chamadas };
}

const ativ = (id: string, quando = "2026-08-10T12:00:00.000Z") => ({
  id, produto_nome: null, tarefa: "Montar alavancas", detalhe: null, categoria: "Chancela",
  quantidade_alvo: 10, quantidade_feita: 10,
  para_id: "op-1", para_nome: "Operador", concluida_at: quando,
  // O contexto que o gerente lê antes de decidir: a foto do trabalho pronto, o
  // carimbo de início e o tempo esperado.
  foto_url: null, iniciada_at: null, tempo_estimado_min: null,
});

/** Uma janela cheia (JANELA linhas) — é o que faz a varredura continuar. */
const janelaCheia = (prefixo: string, quando: string) =>
  Array.from({ length: JANELA }, (_, i) => ativ(`${prefixo}-${i}`, quando));

describe("varredura da fila de conferência", () => {
  it("devolve as caixas que ninguém conferiu ainda", async () => {
    const db = fakeDb([{ data: [ativ("a"), ativ("b")], error: null }]);
    const r = await varrerPendentesDeConferencia(db, { pagina: 50 });
    expect(r.pendentes.map((a) => a.id)).toEqual(["a", "b"]);
    expect(r.qcDesligado).toBe(false);
    expect(r.travadas).toBe(0);
  });

  it("QC desligado (tabela inexistente): fila VAZIA e o motivo — nunca a fila inteira", async () => {
    // Este é o estado do banco hoje. Engolindo o erro, o tablet listava as 100
    // atividades concluídas mais recentes como conferíveis.
    const db = fakeDb(
      [{ data: [ativ("a"), ativ("b")], error: null }],
      { data: null, error: { code: "42P01", message: 'relation "estoque_conferencias" does not exist' } },
    );
    const r = await varrerPendentesDeConferencia(db, { pagina: 50 });
    expect(r.qcDesligado).toBe(true);
    expect(r.pendentes).toEqual([]);
    expect(r.proximoCursor).toBeNull();
  });

  it("erro de verdade no SELECT da conferência NÃO vira fila vazia silenciosa", async () => {
    const db = fakeDb(
      [{ data: [ativ("a")], error: null }],
      { data: null, error: { code: "57014", message: "statement timeout" } },
    );
    await expect(varrerPendentesDeConferencia(db, { pagina: 50 })).rejects.toBeInstanceOf(ErroVarredura);
  });

  it("atividade com aprovação gravada não é pendência: vira o alerta de TRAVADA", async () => {
    const db = fakeDb(
      [{ data: [ativ("a"), ativ("presa")], error: null }],
      { data: [{ atividade_id: "presa" }], error: null },
    );
    const r = await varrerPendentesDeConferencia(db, { pagina: 50 });
    expect(r.pendentes.map((a) => a.id)).toEqual(["a"]);
    expect(r.travadas).toBe(1);
  });

  it("uma janela inteira de linhas presas NÃO esconde a caixa real da janela seguinte", async () => {
    // O defeito do desenho antigo: filtrar em JavaScript depois de um teto sem
    // cursor. Com 200 presas na frente, a caixa real de três semanas atrás
    // sumia da fila do tablet sem erro nenhum.
    const presas = janelaCheia("presa", "2026-08-11T12:00:00.000Z");
    const db = fakeDb(
      [
        { data: presas, error: null },
        { data: [ativ("real", "2026-08-01T12:00:00.000Z")], error: null },
      ],
      { data: presas.map((a) => ({ atividade_id: a.id })), error: null },
    );
    const r = await varrerPendentesDeConferencia(db, { pagina: 50 });
    expect(r.pendentes.map((a) => a.id)).toEqual(["real"]);
    expect(r.travadas).toBe(JANELA);
  });

  it("pagina por DATA (cursor), não por offset — quem confere no meio não faz linha repetir", async () => {
    const cheia = janelaCheia("x", "2026-08-11T12:00:00.000Z");
    const db = fakeDb([{ data: cheia, error: null }]);
    const r = await varrerPendentesDeConferencia(db, { pagina: 50 });
    expect(r.pendentes).toHaveLength(50);
    expect(r.proximoCursor).toBe("2026-08-11T12:00:00.000Z");
  });

  it("chegou ao fim da tabela: não oferece 'carregar mais'", async () => {
    const db = fakeDb([{ data: [ativ("a")], error: null }]);
    const r = await varrerPendentesDeConferencia(db, { pagina: 50 });
    expect(r.proximoCursor).toBeNull();
  });

  it("filtra pelo PAR que define a fila: concluída e sem estoque lançado", async () => {
    const db = fakeDb([{ data: [], error: null }]);
    await varrerPendentesDeConferencia(db, { pagina: 50 });
    const filtros = db.chamadas[0].filtros.join(" ");
    expect(filtros).toContain('eq("status","concluida")');
    expect(filtros).toContain('eq("estoque_lancado",false)');
  });

  it("NÃO exige produto: é o filtro que descartava 103 das 104 atividades reais", async () => {
    // O defeito medido em produção: a fila pedia `produto_nome not null`, e a
    // atividade do galpão nasce com uma TAREFA em texto ("Montar alavancas") e
    // uma categoria. Resultado: 104 concluídas, 0 na fila, três semanas de
    // produção paradas sem ninguém ver.
    const db = fakeDb([{ data: [ativ("sem-produto")], error: null }]);
    const r = await varrerPendentesDeConferencia(db, { pagina: 50 });
    expect(db.chamadas[0].filtros.join(" ")).not.toContain('not("produto_nome","is",null)');
    expect(r.pendentes.map((a) => a.id)).toEqual(["sem-produto"]);
    expect(r.pendentes[0].tarefa).toBe("Montar alavancas");
  });

  it("a atividade JÁ lançada continua fora — não há como somar o estoque dela duas vezes", async () => {
    // A de 27/07 foi somada pelo auto-lançamento antigo (removido no 71268c1) e
    // ficou com `estoque_lancado = true`. Abrir a fila pra quem não tem produto
    // não pode trazê-la de volta: aprovar de novo dobraria as peças.
    const db = fakeDb([{ data: [], error: null }]);
    await varrerPendentesDeConferencia(db, { pagina: 50 });
    expect(db.chamadas[0].filtros.join(" ")).toContain('eq("estoque_lancado",false)');
  });

  it("a tarefa e o detalhe vêm junto — é o que a tela mostra no lugar do produto", async () => {
    const db = fakeDb([{ data: [], error: null }]);
    await varrerPendentesDeConferencia(db, { pagina: 50 });
    const select = db.chamadas[0].filtros.find((f) => f.startsWith("select("))!;
    expect(select).toContain("tarefa");
    expect(select).toContain("detalhe");
  });

  it("a janela é um filtro no BANCO, não um corte em JavaScript", async () => {
    // Cortar depois de ler comeria a página: 83 atividades antigas na frente
    // esconderiam as 21 da semana, que é o mesmo defeito do "já conferida"
    // filtrado depois do teto.
    const db = fakeDb([{ data: [], error: null }]);
    await varrerPendentesDeConferencia(db, { pagina: 50, desde: "2026-08-07T00:00:00.000Z" });
    expect(db.chamadas[0].filtros.join(" ")).toContain('gte("concluida_at","2026-08-07T00:00:00.000Z")');
  });

  it("sem janela (o acervo) não filtra por data nenhuma", async () => {
    const db = fakeDb([{ data: [], error: null }]);
    await varrerPendentesDeConferencia(db, { pagina: 50, desde: null });
    expect(db.chamadas[0].filtros.join(" ")).not.toContain("gte(");
  });

  it("só a APROVAÇÃO conta como conferida — a reprovação tem de voltar pra fila", async () => {
    // Sem o filtro por 'certo', a linha da reprovação excluiria a atividade da
    // fila pra sempre e o refazer sumiria em silêncio.
    const db = fakeDb([{ data: [ativ("a")], error: null }]);
    await varrerPendentesDeConferencia(db, { pagina: 50 });
    const conf = db.chamadas.find((c) => c.tabela === "estoque_conferencias")!;
    expect(conf.filtros.join(" ")).toContain('eq("resultado","certo")');
  });

  it("erro na varredura das atividades sobe como ErroVarredura, com o detalhe", async () => {
    const db = fakeDb([{ data: null, error: { message: "boom" } }]);
    await expect(varrerPendentesDeConferencia(db, { pagina: 50 })).rejects.toMatchObject({ detalhe: "boom" });
  });
});

describe("itensPorNome", () => {
  it("indexa sem caixa: 'Alavanca' na atividade acha 'alavanca' no catálogo", async () => {
    // Indexado pelo texto cru, a diferença de maiúscula fazia a tela apagar o
    // botão "Certo" de uma caixa que `registrarConferencia` (que usa ilike)
    // aprovaria sem reclamar.
    const db = fakeDb([], { data: [], error: null });
    const dbItens = {
      from: () => {
        const b: Record<string, unknown> = {};
        for (const m of ["select", "in", "limit"]) b[m] = () => b;
        b.then = (r: (v: unknown) => unknown) =>
          Promise.resolve({ data: [{ id: "i-1", nome: "alavanca montada", serializado: true }], error: null }).then(r);
        return b;
      },
    };
    void db;
    const mapa = await itensPorNome(dbItens, ["Alavanca Montada"], 50);
    expect(mapa.get(chaveDeNome("Alavanca Montada"))?.id).toBe("i-1");
  });

  it("serializado ausente conta como etiquetado (o padrão do catálogo)", async () => {
    const dbItens = {
      from: () => {
        const b: Record<string, unknown> = {};
        for (const m of ["select", "in", "limit"]) b[m] = () => b;
        b.then = (r: (v: unknown) => unknown) =>
          Promise.resolve({ data: [{ id: "i-1", nome: "X", serializado: null }], error: null }).then(r);
        return b;
      },
    };
    expect((await itensPorNome(dbItens, ["X"], 50)).get("x")?.serializado).toBe(true);
  });

  it("nenhum nome: nem consulta o banco", async () => {
    let tocou = false;
    const dbItens = { from: () => { tocou = true; return {}; } };
    expect((await itensPorNome(dbItens, [], 50)).size).toBe(0);
    expect(tocou).toBe(false);
  });
});

describe("a janela e o acervo", () => {
  it("o corte é o começo da semana móvel — a fila do dia a dia", () => {
    const agora = new Date("2026-08-14T12:00:00.000Z");
    expect(corteDaFila(agora)).toBe("2026-08-07T12:00:00.000Z");
    expect(DIAS_DA_FILA).toBe(7);
  });

  it("o acervo é CONTADO, não listado nem apagado", async () => {
    // As duas maneiras de errar com 83 atividades de três semanas atrás:
    // despejar todas na tela (e ninguém começa por nenhuma) ou sumir com elas
    // (e o trabalho de alguém evapora sem decisão). O número fica visível e a
    // lista inteira está a um toque.
    let filtros: string[] = [];
    const db = {
      from: () => {
        const b: Record<string, unknown> = {};
        filtros = [];
        for (const m of ["select", "eq", "lt"]) {
          b[m] = (...args: unknown[]) => { filtros.push(`${m}(${args.map((a) => JSON.stringify(a)).join(",")})`); return b; };
        }
        b.then = (r: (v: unknown) => unknown) => Promise.resolve({ count: 83, error: null }).then(r);
        return b;
      },
    };
    expect(await contarAcervoAnterior(db, "2026-08-07T00:00:00.000Z")).toBe(83);
    // Só o número: `head: true` deixa o corpo vazio em vez de arrastar 83 linhas.
    expect(filtros.join(" ")).toContain('select("id",{"count":"exact","head":true})');
    expect(filtros.join(" ")).toContain('lt("concluida_at","2026-08-07T00:00:00.000Z")');
  });

  it("erro na contagem do acervo não derruba a fila", async () => {
    const db = {
      from: () => {
        const b: Record<string, unknown> = {};
        for (const m of ["select", "eq", "lt"]) b[m] = () => b;
        b.then = (r: (v: unknown) => unknown) => Promise.resolve({ count: null, error: { message: "boom" } }).then(r);
        return b;
      },
    };
    expect(await contarAcervoAnterior(db, "2026-08-07T00:00:00.000Z")).toBe(0);
  });
});

// ── O contexto que a fila carrega ────────────────────────────────────────────
// A varredura ficou três meses lendo dez colunas e deixando pra trás justamente
// as que decidem a conferência: a foto do trabalho pronto (101 das 107
// concluídas em produção têm) e os dois carimbos de tempo.
describe("o que a varredura traz pro gerente decidir", () => {
  it("lê a foto do trabalho e os carimbos de tempo — nomeando as colunas", async () => {
    const db = fakeDb([{
      data: [{
        ...ativ("a"),
        foto_url: "https://exemplo/alavancas.jpg",
        iniciada_at: "2026-08-10T11:26:00.000Z",
        tempo_estimado_min: 40,
      }],
      error: null,
    }]);
    const r = await varrerPendentesDeConferencia(db, { pagina: 50 });
    expect(r.pendentes[0].foto_url).toBe("https://exemplo/alavancas.jpg");
    expect(r.pendentes[0].iniciada_at).toBe("2026-08-10T11:26:00.000Z");
    expect(r.pendentes[0].tempo_estimado_min).toBe(40);

    // `select("*")` é proibido em lib/ — e aqui ele arrastaria `motivo_impedimento`
    // e todo texto longo de `atividades` numa varredura de até 1200 linhas.
    const select = db.chamadas.find((c) => c.tabela === "atividades")!.filtros[0];
    expect(select).toContain("foto_url");
    expect(select).not.toContain("*");
  });
});

describe("o rosto de quem fez", () => {
  /** Banco falso de `employees`, guardando os filtros que a consulta usou. */
  function fakeEmployees(resp: { data?: unknown; error?: unknown }) {
    const filtros: string[] = [];
    const b: Record<string, unknown> = {};
    for (const m of ["select", "in", "limit"]) {
      b[m] = (...a: unknown[]) => { filtros.push(`${m}(${a.map((x) => JSON.stringify(x)).join(",")})`); return b; };
    }
    b.then = (r: (v: unknown) => unknown) => Promise.resolve(resp).then(r);
    return { db: { from: () => b }, filtros };
  }

  it("traz a foto por id, sem repetir a mesma pessoa na consulta", async () => {
    const { db, filtros } = fakeEmployees({
      data: [{ id: "op-1", photo_url: "https://exemplo/davi.jpg" }, { id: "op-2", photo_url: null }],
      error: null,
    });
    // Cinco pessoas produzem no galpão: 23 cartões viram 2 ids na consulta.
    const mapa = await fotosDeExecutores(db, ["op-1", "op-2", "op-1", "op-1", ""], 50);
    expect(mapa.get("op-1")).toBe("https://exemplo/davi.jpg");
    // Sem foto cadastrada não vira chave: a tela desenha as iniciais.
    expect(mapa.has("op-2")).toBe(false);
    expect(filtros.join(" ")).toContain('in("id",["op-1","op-2"])');
    expect(filtros.join(" ")).toContain("limit(50)");
  });

  // O rosto é contexto. Uma tabela de pessoas fora do ar não pode parar a
  // conferência do galpão — a fila continua, só sem as fotos.
  it("erro não derruba a fila: volta vazio", async () => {
    const { db } = fakeEmployees({ data: null, error: { message: "boom" } });
    expect((await fotosDeExecutores(db, ["op-1"], 50)).size).toBe(0);
  });

  it("sem ninguém pra procurar, não consulta nada", async () => {
    let chamou = false;
    const db = { from: () => { chamou = true; return {}; } };
    expect((await fotosDeExecutores(db, ["", ""], 50)).size).toBe(0);
    expect(chamou).toBe(false);
  });
});
