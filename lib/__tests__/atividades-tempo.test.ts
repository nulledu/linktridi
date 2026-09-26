import { describe, it, expect } from "vitest";
import {
  classificarAmostra, tempoPorProduto, mediana, percentil,
  PISO_DURACAO_MIN, TETO_DURACAO_MIN, AMOSTRAS_PARA_CONFIAR,
  type AtividadeMedida,
} from "../atividades-tempo";

/**
 * "No final de tudo ele calcula o tempo médio pra fazer cada produto."
 *
 * O risco desta tela não é errar a conta — é ACERTAR a conta sobre um dado
 * envenenado e devolver um número que parece informação. Três venenos reais,
 * todos observados na tabela `atividades`:
 *
 *  1. **A ordem que dormiu.** Ninguém pausa às 18h: a atividade fica aberta a
 *     noite inteira e é concluída às 8h do dia seguinte. Uma sozinha (14h) num
 *     conjunto de dez de 30 min põe a MÉDIA em 110 min — quase quatro vezes o
 *     que a bancada de fato leva.
 *  2. **O toque duplo.** "Iniciar" e "Concluir" no mesmo gesto: dois segundos
 *     pra 50 peças. Puxa a média pra baixo com a mesma força.
 *  3. **`iniciada_at` nulo.** Atividade concluída direto no computador nunca
 *     passou por "iniciar". Não é rápida: é IMENSURÁVEL, e tratar nulo como
 *     zero é a mentira mais fácil de cometer aqui.
 *
 * Por isso o número da frente é MEDIANA, não média, e todo descarte é contado
 * com nome — número que ninguém confia é pior que número nenhum.
 */

// Uma atividade com duração de `min` minutos e `feito` peças.
function medida(over: Partial<AtividadeMedida> & { min?: number } = {}): AtividadeMedida {
  const min = over.min ?? 30;
  const inicio = Date.parse("2026-08-10T12:00:00Z");
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    tarefa: over.tarefa ?? "Montar alavancas",
    categoria: over.categoria ?? "Chancela",
    produto_nome: over.produto_nome ?? null,
    para_id: over.para_id ?? "p1",
    para_nome: over.para_nome ?? "Fulano",
    iniciada_at: over.iniciada_at !== undefined ? over.iniciada_at : new Date(inicio).toISOString(),
    concluida_at: over.concluida_at !== undefined ? over.concluida_at : new Date(inicio + min * 60000).toISOString(),
    tempo_estimado_min: over.tempo_estimado_min !== undefined ? over.tempo_estimado_min : 30,
    quantidade_feita: over.quantidade_feita ?? 10,
  };
}

describe("classificarAmostra — o que entra na conta e o que é descartado com nome", () => {
  it("aceita a ordem normal e mede minutos por peça", () => {
    const r = classificarAmostra(medida({ min: 30, quantidade_feita: 10 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.amostra.duracaoMin).toBe(30);
    expect(r.amostra.minPorPeca).toBe(3);
  });

  it("descarta iniciada_at nulo como IMENSURÁVEL, não como zero", () => {
    const r = classificarAmostra(medida({ iniciada_at: null }));
    expect(r).toEqual({ ok: false, motivo: "sem_inicio" });
  });

  it("descarta a ordem que dormiu (acima do teto de jornada)", () => {
    const r = classificarAmostra(medida({ min: TETO_DURACAO_MIN + 1 }));
    expect(r).toEqual({ ok: false, motivo: "esquecida" });
  });

  it("aceita a ordem longa que ainda cabe na jornada", () => {
    expect(classificarAmostra(medida({ min: TETO_DURACAO_MIN })).ok).toBe(true);
  });

  it("descarta o toque duplo (abaixo do piso)", () => {
    const r = classificarAmostra(medida({ min: PISO_DURACAO_MIN / 2 }));
    expect(r).toEqual({ ok: false, motivo: "instantanea" });
  });

  it("descarta relógio invertido (concluída antes de iniciada)", () => {
    const r = classificarAmostra(medida({ min: -20 }));
    expect(r).toEqual({ ok: false, motivo: "relogio_invertido" });
  });

  it("descarta quantidade feita zero — não há por que dividir", () => {
    const r = classificarAmostra(medida({ quantidade_feita: 0 }));
    expect(r).toEqual({ ok: false, motivo: "sem_producao" });
  });

  it("descarta quem nem foi concluída", () => {
    const r = classificarAmostra(medida({ concluida_at: null }));
    expect(r).toEqual({ ok: false, motivo: "sem_fim" });
  });
});

describe("mediana e percentil", () => {
  it("mediana de lista ímpar é o do meio", () => {
    expect(mediana([5, 1, 3])).toBe(3);
  });
  it("mediana de lista par é a média dos dois do meio", () => {
    expect(mediana([1, 2, 3, 4])).toBe(2.5);
  });
  it("mediana de lista vazia é 0", () => {
    expect(mediana([])).toBe(0);
  });
  it("p90 aponta a cauda lenta, não o meio", () => {
    const dez = [1, 2, 3, 4, 5, 6, 7, 8, 9, 100];
    expect(percentil(dez, 90)).toBeGreaterThan(9);
    expect(mediana(dez)).toBe(5.5);
  });
});

describe("tempoPorProduto — a ordem que dormiu não pode virar o número da tela", () => {
  const dezDe30 = () => Array.from({ length: 10 }, (_, i) => medida({ id: `n${i}`, min: 30, quantidade_feita: 10 }));

  it("uma noite esquecida no meio não mexe na mediana nem na média", () => {
    const semVeneno = tempoPorProduto(dezDe30());
    const comVeneno = tempoPorProduto([...dezDe30(), medida({ id: "dormiu", min: 14 * 60, quantidade_feita: 10 })]);

    expect(semVeneno[0].medianaMinPorPeca).toBe(3);
    expect(comVeneno[0].medianaMinPorPeca).toBe(3);
    // A média também: a esquecida é DESCARTADA, não amortecida.
    expect(comVeneno[0].mediaMinPorPeca).toBe(semVeneno[0].mediaMinPorPeca);
    expect(comVeneno[0].amostras).toBe(10);
    expect(comVeneno[0].descartadas).toBe(1);
    expect(comVeneno[0].descartes.esquecida).toBe(1);
  });

  it("a mediana segura o número mesmo quando a lentidão passa no teto", () => {
    // Nove de 30 min e uma de 9h (cabe na jornada, então É amostra válida): a
    // média sobe 10%, a mediana não se move. É por isso que a mediana é o
    // número da frente.
    const lista = [...Array.from({ length: 9 }, (_, i) => medida({ id: `n${i}`, min: 30, quantidade_feita: 10 })),
      medida({ id: "lenta", min: 540, quantidade_feita: 10 })];
    const [t] = tempoPorProduto(lista);
    expect(t.amostras).toBe(10);
    expect(t.medianaMinPorPeca).toBe(3);
    expect(t.mediaMinPorPeca).toBeGreaterThan(3);
  });

  it("agrupa por PRODUTO quando existe, e por tarefa quando não existe", () => {
    const r = tempoPorProduto([
      medida({ produto_nome: "Chancela", tarefa: "Montar alavancas" }),
      medida({ produto_nome: "Chancela", tarefa: "Colar PS nas bases" }),
      medida({ produto_nome: null, tarefa: "Testar carimbo" }),
    ]);
    const chaves = r.map((x) => x.rotulo).sort();
    expect(chaves).toEqual(["Chancela", "Testar carimbo"]);
    expect(r.find((x) => x.rotulo === "Chancela")!.amostras).toBe(2);
  });

  it("marca poucos dados: mediana de duas ordens é anedota", () => {
    const [t] = tempoPorProduto([medida({ id: "a" }), medida({ id: "b" })]);
    expect(t.amostras).toBeLessThan(AMOSTRAS_PARA_CONFIAR);
    expect(t.poucosDados).toBe(true);
  });

  it("compara com o estimado: acima de 1 demora mais do que devia", () => {
    const [t] = tempoPorProduto(Array.from({ length: 5 }, (_, i) =>
      medida({ id: `x${i}`, min: 60, tempo_estimado_min: 30 })));
    expect(t.estimadoMin).toBe(30);
    expect(t.aderencia).toBe(2);
  });

  it("sem estimativa não inventa aderência", () => {
    const [t] = tempoPorProduto([medida({ tempo_estimado_min: null })]);
    expect(t.estimadoMin).toBeNull();
    expect(t.aderencia).toBeNull();
  });

  it("um grupo que só tem lixo aparece com zero amostras, não some", () => {
    // Sumir é o pior desfecho: quem procura "por que não aparece a chancela"
    // não descobre que o problema é ninguém apertar "iniciar" no tablet.
    const [t] = tempoPorProduto([
      medida({ produto_nome: "Chancela", iniciada_at: null }),
      medida({ produto_nome: "Chancela", iniciada_at: null }),
    ]);
    expect(t.rotulo).toBe("Chancela");
    expect(t.amostras).toBe(0);
    expect(t.descartes.sem_inicio).toBe(2);
    expect(t.medianaMinPorPeca).toBe(0);
    expect(t.poucosDados).toBe(true);
  });

  it("ordena por tempo TOTAL gasto — é onde a decisão mora", () => {
    const r = tempoPorProduto([
      // Muito lento por peça, mas só uma ordem: pouco impacto.
      medida({ id: "raro", produto_nome: "Raro", min: 120, quantidade_feita: 1 }),
      // Rápido por peça, mas o galpão faz isso o dia inteiro.
      ...Array.from({ length: 8 }, (_, i) => medida({ id: `c${i}`, produto_nome: "Comum", min: 60, quantidade_feita: 30 })),
    ]);
    expect(r[0].rotulo).toBe("Comum");
    expect(r[0].totalMin).toBeGreaterThan(r[1].totalMin);
  });

  it("soma as peças só das amostras válidas", () => {
    const r = tempoPorProduto([
      medida({ id: "ok", quantidade_feita: 10 }),
      medida({ id: "lixo", quantidade_feita: 99, iniciada_at: null }),
    ]);
    expect(r[0].pecas).toBe(10);
  });
});
