import { describe, expect, it } from "vitest";
import {
  CHAVE_VARIANTE, COOKIE_AB, ROTULO_VARIANTE, ehVariante, mostraNaVariante, pesoValido,
  resumoAB, sortearVariante, varianteEfetiva, type LinhaEvento, type Variante,
} from "../tridiflow-ab";

// Teste A/B nativo da página. Duas coisas fazem esta feature valer ou destruir
// valor:
//
// 1. **Desligar o teste devolve a versão A**, que é a página original — e não
//    uma página sem os dois lados do teste. Os blocos marcados "só B" somem
//    junto, porque são a variação e não a página; a revisão pré-publicação
//    avisa disso.
// 2. **Não anunciar vencedor cedo.** Quem confia num vencedor de 12 visitantes
//    troca a página que estava vendendo por uma que não estava. É a única forma
//    de um teste A/B deixar o resultado PIOR do que antes de existir.

describe("sortearVariante", () => {
  it("respeita o peso", () => {
    expect(sortearVariante(50, 0.10)).toBe("a");
    expect(sortearVariante(50, 0.90)).toBe("b");
    expect(sortearVariante(80, 0.70)).toBe("a");
    expect(sortearVariante(80, 0.85)).toBe("b");
  });

  it("peso 0 manda tudo pra B e 100 tudo pra A", () => {
    // É como se pausa um lado sem apagar o outro.
    expect(sortearVariante(0, 0)).toBe("b");
    expect(sortearVariante(0, 0.99)).toBe("b");
    expect(sortearVariante(100, 0)).toBe("a");
    expect(sortearVariante(100, 0.99)).toBe("a");
  });

  it("peso ausente é meio a meio", () => {
    expect(sortearVariante(undefined, 0.49)).toBe("a");
    expect(sortearVariante(undefined, 0.51)).toBe("b");
  });

  it("entrada estranha não quebra o sorteio", () => {
    expect(sortearVariante(-40, 0.5)).toBe("b");
    expect(sortearVariante(9999, 0.5)).toBe("a");
    expect(ehVariante(sortearVariante(50, NaN))).toBe(true);
  });

  it("divide perto do peso em volume", () => {
    let a = 0;
    for (let i = 0; i < 1000; i++) if (sortearVariante(70, i / 1000) === "a") a++;
    expect(a).toBe(700);
  });
});

describe("pesoValido", () => {
  it("limita e arredonda", () => {
    expect(pesoValido(33.6)).toBe(34);
    expect(pesoValido(-10)).toBe(0);
    expect(pesoValido(160)).toBe(100);
    expect(pesoValido(undefined)).toBe(50);
    expect(pesoValido(NaN)).toBe(50);
  });
});

describe("varianteEfetiva", () => {
  it("teste desligado é sempre a versão A (o controle)", () => {
    // Esta é a invariante do item 1 do cabeçalho.
    expect(varianteEfetiva(undefined, "b")).toBe("a");
    expect(varianteEfetiva({ ativo: false }, "b")).toBe("a");
  });

  it("teste ligado usa a variante atribuída", () => {
    expect(varianteEfetiva({ ativo: true }, "b")).toBe("b");
    expect(varianteEfetiva({ ativo: true }, "a")).toBe("a");
  });

  it("sem atribuição, cai na A", () => {
    expect(varianteEfetiva({ ativo: true }, null)).toBe("a");
    expect(varianteEfetiva({ ativo: true }, "z" as unknown as Variante)).toBe("a");
  });
});

describe("mostraNaVariante", () => {
  it("bloco sem marca aparece nas duas", () => {
    expect(mostraNaVariante(undefined, "a")).toBe(true);
    expect(mostraNaVariante(undefined, "b")).toBe(true);
  });

  it("bloco marcado só aparece na sua", () => {
    expect(mostraNaVariante("a", "a")).toBe(true);
    expect(mostraNaVariante("a", "b")).toBe(false);
    expect(mostraNaVariante("b", "b")).toBe(true);
    expect(mostraNaVariante("b", "a")).toBe(false);
  });

  it("marca inválida de documento antigo não some com o bloco", () => {
    expect(mostraNaVariante("x" as unknown as Variante, "a")).toBe(true);
    expect(mostraNaVariante(null, "b")).toBe(true);
  });
});

describe("ROTULO_VARIANTE", () => {
  it("usa o nome dado, e cai num padrão quando falta", () => {
    expect(ROTULO_VARIANTE({ nomeA: "Preço cheio" }, "a")).toBe("Preço cheio");
    expect(ROTULO_VARIANTE({ nomeA: "Preço cheio" }, "b")).toBe("Versão B");
    expect(ROTULO_VARIANTE(undefined, "a")).toBe("Versão A");
  });
});

// ── Placar ───────────────────────────────────────────────────────────────────

/** Monta n visitantes numa variante, dos quais `conv` converteram. */
function linhas(v: Variante, n: number, conv: number): LinhaEvento[] {
  const out: LinhaEvento[] = [];
  for (let i = 0; i < n; i++) out.push({ evento: "page_view", visitante: `${v}${i}`, variante: v });
  for (let i = 0; i < conv; i++) out.push({ evento: "form_submitted", visitante: `${v}${i}`, variante: v });
  return out;
}

describe("resumoAB", () => {
  it("conta visitante único, clique e conversão por braço", () => {
    const l: LinhaEvento[] = [
      { evento: "page_view", visitante: "v1", variante: "a" },
      { evento: "page_view", visitante: "v1", variante: "a" },   // mesmo visitante, 2 views
      { evento: "page_view", visitante: "v2", variante: "a" },
      { evento: "cta_clicked", visitante: "v1", variante: "a" },
      { evento: "form_submitted", visitante: "v1", variante: "a" },
      { evento: "page_view", visitante: "v3", variante: "b" },
    ];
    const r = resumoAB(l);
    expect(r.a.visitantes).toBe(2);
    expect(r.a.cliques).toBe(1);
    expect(r.a.conversoes).toBe(1);
    expect(r.a.taxa).toBe(50);
    expect(r.b.visitantes).toBe(1);
  });

  it("evento sem variante não entra em braço nenhum", () => {
    // São as visitas de antes do teste começar. Contá-las na A inflaria o
    // controle com gente que nunca participou do teste.
    const r = resumoAB([
      { evento: "page_view", visitante: "v1", variante: null },
      { evento: "form_submitted", visitante: "v1", variante: null },
    ]);
    expect(r.a.visitantes).toBe(0);
    expect(r.b.visitantes).toBe(0);
  });

  it("com pouca gente NÃO declara vencedor, mesmo com diferença enorme", () => {
    // 10 visitantes, 100% x 0%: parece esmagador e não significa nada.
    const r = resumoAB([...linhas("a", 10, 10), ...linhas("b", 10, 0)]);
    expect(r.vencedora).toBeNull();
    expect(r.motivo).toContain("cedo");
  });

  it("diz quantos visitantes ainda faltam", () => {
    const r = resumoAB([...linhas("a", 300, 30), ...linhas("b", 40, 2)]);
    expect(r.vencedora).toBeNull();
    expect(r.motivo).toContain("60");
  });

  it("com amostra e diferença real, aponta a vencedora e o ganho", () => {
    // 1000 por braço: 12% contra 6% — o dobro, e fora do acaso.
    const r = resumoAB([...linhas("a", 1000, 120), ...linhas("b", 1000, 60)]);
    expect(r.vencedora).toBe("a");
    expect(r.ganho).toBe(100);
    expect(r.motivo).toContain("100%");
  });

  it("aponta a B quando é a B que ganha", () => {
    const r = resumoAB([...linhas("a", 1000, 60), ...linhas("b", 1000, 120)]);
    expect(r.vencedora).toBe("b");
  });

  it("amostra grande com diferença pequena continua sem vencedor", () => {
    // 10,0% x 10,4% em 1000: dentro do acaso. Anunciar aqui seria trocar a
    // página por outra igual e chamar isso de otimização.
    const r = resumoAB([...linhas("a", 1000, 100), ...linhas("b", 1000, 104)]);
    expect(r.vencedora).toBeNull();
    expect(r.motivo).toContain("acaso");
  });

  it("empate exato é dito como empate", () => {
    const r = resumoAB([...linhas("a", 500, 50), ...linhas("b", 500, 50)]);
    expect(r.vencedora).toBeNull();
    expect(r.motivo).toContain("igual");
  });

  it("lista vazia não explode", () => {
    const r = resumoAB([]);
    expect(r.a.visitantes).toBe(0);
    expect(r.b.taxa).toBe(0);
    expect(r.vencedora).toBeNull();
  });

  it("ninguém converteu dos dois lados: sem vencedor", () => {
    const r = resumoAB([...linhas("a", 500, 0), ...linhas("b", 500, 0)]);
    expect(r.vencedora).toBeNull();
  });
});

describe("constantes", () => {
  it("a chave da variante e o cookie são estáveis", () => {
    // O nome da chave vai pro webhook e pro CSV do cliente; o cookie decide a
    // variante entre visitas. Mudar qualquer um dos dois quebra teste em curso.
    expect(CHAVE_VARIANTE).toBe("variante");
    expect(COOKIE_AB).toBe("tf_ab");
  });
});
