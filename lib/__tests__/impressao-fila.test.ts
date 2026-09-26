import { describe, it, expect } from "vitest";
import {
  listarFila, trabalhosParaOTablet, confirmarTrabalhos, enfileirar, cancelarTrabalho,
  faltaAFila, TETO_PENDENTES,
} from "../estoque-impressao-fila";
import { TRABALHO_PADRAO, VALIDADE_HORAS, TETO_POR_CICLO } from "../estoque-impressao-livre";

/**
 * Um Supabase de mentira que GRAVA a consulta montada.
 *
 * O que estes testes provam não é "a função devolve o que o banco devolveu" —
 * isso é o mock se conferindo. É a FORMA da consulta: o corte de validade, o
 * `dispositivo_id` de quem está pedindo, o `status = 'fila'` e o teto. Cada um
 * deles é uma regra que, se cair, não quebra nada visível: a fila só passa a
 * entregar trabalho velho, ou de outro aparelho, ou sem limite — e isso aparece
 * como papel saindo sozinho no galpão, semanas depois.
 */
function fakeDb(resultados: {
  data?: unknown;
  error?: { code?: string; message?: string } | null;
  count?: number;
} = {}) {
  const chamadas: { tabela: string; passos: [string, unknown[]][] }[] = [];

  const db = {
    from(tabela: string) {
      const passos: [string, unknown[]][] = [];
      chamadas.push({ tabela, passos });

      const resposta = {
        data: resultados.data ?? [],
        error: resultados.error ?? null,
        count: resultados.count ?? 0,
      };

      const b: Record<string, unknown> = {};
      for (const metodo of ["select", "eq", "in", "gte", "order", "limit", "insert", "update", "not"]) {
        b[metodo] = (...args: unknown[]) => { passos.push([metodo, args]); return b; };
      }
      b.single = async () => { passos.push(["single", []]); return { data: (resultados.data as unknown[])?.[0] ?? resultados.data, error: resposta.error }; };
      b.maybeSingle = b.single;
      // Thenable: `await query` resolve aqui, que é como o supabase-js funciona.
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve(resposta).then(ok);
      return b;
    },
  };

  return {
    db,
    chamadas,
    passosDe(i = 0) { return chamadas[i]?.passos ?? []; },
    filtro(nome: string, i = 0) {
      return (chamadas[i]?.passos ?? []).filter(([m]) => m === nome).map(([, args]) => args);
    },
  };
}

describe("o que desce pro tablet", () => {
  it("só o que é DELE, só o que está na fila, e só o que ainda vale", async () => {
    const f = fakeDb({ data: [] });
    const agora = new Date("2026-08-14T18:00:00Z");
    await trabalhosParaOTablet(f.db, "tablet-1", TETO_POR_CICLO, agora);

    const eqs = Object.fromEntries(f.filtro("eq").map(([col, val]) => [col as string, val]));
    expect(eqs["dispositivo_id"]).toBe("tablet-1");
    expect(eqs["status"]).toBe("fila");

    // O corte de validade entra no WHERE: trabalho velho nem chega a ser lido,
    // quanto mais transmitido no bootstrap de todo ciclo.
    const [[coluna, corte]] = f.filtro("gte");
    expect(coluna).toBe("criado_em");
    const horas = (agora.getTime() - new Date(corte as string).getTime()) / 3600_000;
    expect(horas).toBeCloseTo(VALIDADE_HORAS, 3);
  });

  it("tem teto — a consulta mais quente do módulo não pode ser sem limite", async () => {
    const f = fakeDb({ data: [] });
    await trabalhosParaOTablet(f.db, "tablet-1");
    expect(f.filtro("limit")[0][0]).toBe(TETO_POR_CICLO);
  });

  it("nomeia as colunas — nada de arrastar jsonb que a etiqueta não usa", async () => {
    const f = fakeDb({ data: [] });
    await trabalhosParaOTablet(f.db, "tablet-1");
    const [[colunas]] = f.filtro("select");
    expect(colunas).not.toContain("*");
    expect(colunas).toBe("id,conteudo,copias");
  });

  it("sem a tabela, a lista é vazia — o tablet não para de sincronizar por causa disso", async () => {
    const f = fakeDb({ error: { code: "42P01", message: 'relation "x" does not exist' } });
    expect(await trabalhosParaOTablet(f.db, "tablet-1")).toEqual([]);
  });
});

describe("a confirmação do tablet", () => {
  it("um aparelho não escreve na fila de outro", async () => {
    const f = fakeDb({ data: [{ id: "t1" }] });
    await confirmarTrabalhos(f.db, "tablet-1", [{ id: "t1", ok: true }]);

    const eqs = Object.fromEntries(f.filtro("eq").map(([col, val]) => [col as string, val]));
    expect(eqs["dispositivo_id"]).toBe("tablet-1");
    // As confirmações OK sobem em lote — o id vai num `.in()`, e as guardas de
    // dispositivo e de status valem igual pro lote inteiro.
    const ins = Object.fromEntries(f.filtro("in").map(([col, val]) => [col as string, val]));
    expect(ins["id"]).toEqual(["t1"]);
    // `status = fila` é o que faz o reenvio não contar duas vezes.
    expect(eqs["status"]).toBe("fila");
  });

  it("reenviar a mesma confirmação não conta duas vezes", async () => {
    // Segunda passada: a linha já saiu de 'fila', então o update não acha nada.
    const f = fakeDb({ data: [] });
    const { confirmados } = await confirmarTrabalhos(f.db, "tablet-1", [{ id: "t1", ok: true }]);
    expect(confirmados).toBe(0);
  });

  it("falha guarda o motivo — 'não conseguiu' sem o porquê obriga alguém a atravessar o galpão", async () => {
    const f = fakeDb({ data: [{ id: "t1" }] });
    await confirmarTrabalhos(f.db, "tablet-1", [{ id: "t1", ok: false, detalhe: "sem papel" }]);
    const [[payload]] = f.filtro("update");
    expect(payload).toMatchObject({ status: "falhou", detalhe: "sem papel" });
  });

  it("falha sem motivo ainda grava alguma coisa legível", async () => {
    const f = fakeDb({ data: [{ id: "t1" }] });
    await confirmarTrabalhos(f.db, "tablet-1", [{ id: "t1", ok: false }]);
    const [[payload]] = f.filtro("update");
    expect((payload as { detalhe: string }).detalhe).toMatch(/não disse o motivo/);
  });
});

describe("enfileirar e cancelar", () => {
  it("a fila cheia é recusada antes de virar dez tiras", async () => {
    const f = fakeDb({ count: TETO_PENDENTES });
    const r = await enfileirar(f.db, { dispositivoId: "tablet-1", trabalho: TRABALHO_PADRAO, porId: null, porNome: null });
    expect(r).toEqual({ ok: false, motivo: "fila_cheia" });
  });

  it("com espaço, grava e devolve o id", async () => {
    const f = fakeDb({ data: [{ id: "novo" }], count: 0 });
    const r = await enfileirar(f.db, {
      dispositivoId: "tablet-1",
      trabalho: { ...TRABALHO_PADRAO, linhas: [{ texto: "A3", tamanho: "grande" }] },
      porId: "u1", porNome: "Ana",
    });
    expect(r).toEqual({ ok: true, id: "novo" });
    // O título vem da primeira linha quando ninguém deu um — a fila tem de ser
    // legível pra quem mandou.
    const [[payload]] = f.filtro("insert", 1);
    expect(payload).toMatchObject({ dispositivo_id: "tablet-1", titulo: "A3", criado_por_nome: "Ana" });
  });

  it("sem o SQL, a escrita falha ALTO — 'mandei' que não mandou é o pior desfecho", async () => {
    const f = fakeDb({ error: { code: "42P01", message: "relation does not exist" }, count: 0 });
    const r = await enfileirar(f.db, { dispositivoId: "t", trabalho: TRABALHO_PADRAO, porId: null, porNome: null });
    expect(r).toEqual({ ok: false, motivo: "sem_sql" });
  });

  it("cancelar o que o tablet já pegou responde 'tarde demais', não 'cancelado'", async () => {
    const f = fakeDb({ data: [] });
    expect(await cancelarTrabalho(f.db, "t1")).toEqual({ ok: false, motivo: "tarde_demais" });
  });

  it("cancelar só age sobre o que ainda está na fila", async () => {
    const f = fakeDb({ data: [{ id: "t1" }] });
    await cancelarTrabalho(f.db, "t1");
    const eqs = Object.fromEntries(f.filtro("eq").map(([col, val]) => [col as string, val]));
    expect(eqs["status"]).toBe("fila");
  });
});

describe("a fila que a tela mostra", () => {
  const agora = new Date("2026-08-14T18:00:00Z");

  it("trabalho velho que ninguém imprimiu aparece como EXPIRADO, sem ninguém ter passado pra reescrever", async () => {
    const velho = new Date(agora.getTime() - (VALIDADE_HORAS + 2) * 3600_000).toISOString();
    const f = fakeDb({ data: [{ id: "t1", status: "fila", criado_em: velho, titulo: "A3", conteudo: {}, copias: 1 }] });
    const { trabalhos } = await listarFila(f.db, 40, agora);
    expect(trabalhos[0].status).toBe("expirado");
  });

  it("mostra também o que já saiu — a pergunta que traz alguém aqui é 'saiu?'", async () => {
    const f = fakeDb({
      data: [{ id: "t1", status: "impresso", criado_em: agora.toISOString(), titulo: "A3", conteudo: {}, copias: 1 }],
    });
    const { trabalhos } = await listarFila(f.db, 40, agora);
    expect(trabalhos[0].status).toBe("impresso");
  });

  it("sem a tabela, a fila é vazia e diz que falta o SQL", async () => {
    const f = fakeDb({ error: { code: "42P01", message: "relation does not exist" } });
    const r = await listarFila(f.db);
    expect(r).toEqual({ trabalhos: [], faltaSql: true });
  });

  it("reconhece o schema faltando pelo código e pela mensagem", () => {
    expect(faltaAFila({ code: "42P01" })).toBe(true);
    expect(faltaAFila({ message: "Could not find the table in the schema cache" })).toBe(true);
    expect(faltaAFila({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(faltaAFila(null)).toBe(false);
  });
});
