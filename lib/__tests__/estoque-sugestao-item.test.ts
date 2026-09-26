import { describe, it, expect } from "vitest";
import { sugerirItens, palavrasUteis, singular, mesmaCategoria } from "../estoque-sugestao-item";

/**
 * A ponte entre o que o galpão ESCREVE e o que o catálogo CHAMA.
 *
 * Os casos são reais: as tarefas saíram das atividades concluídas em produção
 * ("Montar alavancas", "Limpar folhas de alavanca", "Colar PS nas bases") e os
 * nomes de item são os do catálogo de 192 linhas do mesmo banco. É de propósito
 * — uma sugestão testada com "Item A"/"Item B" acerta sempre e não diz nada
 * sobre a única pergunta que importa: quem confere vai achar o destino sem
 * procurar numa lista de 192?
 */

// Recorte do catálogo de produção — categoria "Chancelas" (19 itens) mais
// vizinhos de outras categorias que existem pra atrapalhar de verdade.
const CATALOGO = [
  { id: "1", nome: "Parede Base", categoria: "Chancelas" },
  { id: "2", nome: "Pinça Superior", categoria: "Chancelas" },
  { id: "3", nome: "Reforço Inferior", categoria: "Chancelas" },
  { id: "4", nome: "Clichê", categoria: "Chancelas" },
  { id: "5", nome: "Alavanca", categoria: "Chancelas" },
  { id: "6", nome: "Acrilico Chan. 5cm", categoria: "Chancelas" },
  { id: "7", nome: "Chancela 4cm", categoria: "Chancelas" },
  { id: "8", nome: "Chancela 5cm", categoria: "Chancelas" },
  { id: "9", nome: "Bolacha Superior", categoria: "Chancelas" },
  { id: "10", nome: "Circulo Alavanca", categoria: "Chancelas" },
  { id: "11", nome: "Guia Alavanca", categoria: "Chancelas" },
  { id: "12", nome: "Pinça Inferior", categoria: "Chancelas" },
  { id: "13", nome: "PS Acabamento", categoria: "Chancelas" },
  { id: "14", nome: "PS Circulo Alavanca", categoria: "Chancelas" },
  { id: "15", nome: "Folha Alavanca", categoria: "Chancelas" },
  { id: "16", nome: "Corpo Base", categoria: "Chancelas" },
  { id: "17", nome: "Trava Clichê", categoria: "Chancelas" },
  { id: "18", nome: "Travas", categoria: "Chancelas" },
  { id: "19", nome: "Bolinha Puxador", categoria: "Carimbos" },
  { id: "20", nome: "Base Carimbo 10cm", categoria: "Carimbos" },
  { id: "21", nome: "Base 11", categoria: "Almofadas" },
  { id: "22", nome: "Lateral Frente 11", categoria: "Almofadas" },
];

const paraChancela = (tarefa: string) =>
  sugerirItens({ tarefa, categoria: "Chancela" }, CATALOGO);

describe("sugestão do destino, com os nomes que o galpão usa", () => {
  it("'Montar alavancas' → Alavanca, na frente das alavancas compostas", () => {
    // Cinco itens têm "alavanca" no nome. O que a pessoa montou é o simples;
    // "Circulo Alavanca" e "PS Circulo Alavanca" são peças de outra etapa.
    expect(paraChancela("Montar alavancas")[0].nome).toBe("Alavanca");
  });

  it("'Limpar folhas de alavanca' → Folha Alavanca (o nome inteiro está na tarefa)", () => {
    // O caso que dá o desenho da conta: o item cujo nome INTEIRO aparece na
    // tarefa ganha de "Alavanca", que só casa metade.
    expect(paraChancela("Limpar folhas de alavanca")[0].nome).toBe("Folha Alavanca");
  });

  it("'Montar estruturas laterais + travas' → Travas", () => {
    // Plural do galpão: "travas" tem de casar com o item "Travas" e com
    // "Trava Clichê" — o genérico primeiro.
    const nomes = paraChancela("Montar estruturas laterais + travas").map((s) => s.nome);
    expect(nomes[0]).toBe("Travas");
    expect(nomes).toContain("Trava Clichê");
  });

  it("'Colar PS nas bases' devolve as opções de PS e de base, não uma só", () => {
    // Tarefa genuinamente ambígua: quatro itens plausíveis. A sugestão não
    // inventa certeza — devolve as candidatas pra pessoa escolher.
    const nomes = paraChancela("Colar PS nas bases").map((s) => s.nome);
    expect(nomes.length).toBeGreaterThan(1);
    expect(nomes.some((n) => n.startsWith("PS "))).toBe(true);
  });

  it("acento e caixa não separam: 'limpar cliches' acha 'Clichê'", () => {
    expect(paraChancela("limpar cliches")[0].nome).toBe("Clichê");
  });

  it("a categoria só DESEMPATA — não traz item sem palavra em comum", () => {
    // 19 itens são da categoria "Chancelas". Se a categoria pontuasse sozinha,
    // "Montar alavancas" devolveria os 19 e a fileira viraria uma lista pra
    // rolar, que é exatamente o que a sugestão existe pra evitar.
    const todos = sugerirItens({ tarefa: "Montar alavancas", categoria: "Chancela" }, CATALOGO, 50);
    expect(todos.every((s) => /alavanca/i.test(s.nome))).toBe(true);
  });

  it("mesma palavra em categoria diferente perde pra quem bate a categoria", () => {
    // "Base" existe em Chancelas ("Parede Base", "Corpo Base") e em Almofadas
    // ("Base 11"). A atividade é de Chancela.
    const nomes = paraChancela("Montar base da chancela").map((s) => s.nome);
    expect(nomes[0]).not.toBe("Base 11");
    expect(nomes.some((n) => n === "Parede Base" || n === "Corpo Base" || /Chancela/.test(n))).toBe(true);
  });

  it("tarefa que não é produção não casa com nada — e não inventa sugestão", () => {
    // "varrer o chão do barracão" e "limpe sua parte antes de ir embora" são
    // atividades reais do banco. Nenhuma vira peça no estoque, e sugerir um
    // item pra elas seria pior do que não sugerir nada.
    expect(sugerirItens({ tarefa: "varrer o chão do barracão", categoria: "Personalizadas" }, CATALOGO)).toEqual([]);
    expect(sugerirItens({ tarefa: "limpe sua parte antes de ir embora", categoria: "Personalizadas" }, CATALOGO)).toEqual([]);
  });

  it("o produto que a atividade já apontava manda", () => {
    const s = sugerirItens({ produtoNome: "Clichê", tarefa: "Montar alavancas", categoria: "Chancela" }, CATALOGO);
    expect(s[0].nome).toBe("Clichê");
  });

  it("tarefa vazia não devolve palpite nenhum", () => {
    expect(sugerirItens({ tarefa: "", categoria: "Chancela" }, CATALOGO)).toEqual([]);
    expect(sugerirItens({ tarefa: null }, CATALOGO)).toEqual([]);
  });

  it("catálogo vazio não estoura", () => {
    expect(sugerirItens({ tarefa: "Montar alavancas" }, [])).toEqual([]);
  });

  it("item não serializado chega marcado — a tela promete coisa diferente pros dois", () => {
    const s = sugerirItens({ tarefa: "Montar alavancas" }, [
      { id: "x", nome: "Alavanca", categoria: "Chancelas", serializado: false },
    ]);
    expect(s[0].serializado).toBe(false);
    // `null` no banco é o padrão do catálogo: etiquetado.
    const t = sugerirItens({ tarefa: "Montar alavancas" }, [
      { id: "y", nome: "Alavanca", categoria: "Chancelas", serializado: null },
    ]);
    expect(t[0].serializado).toBe(true);
  });

  it("o teto é respeitado", () => {
    expect(sugerirItens({ tarefa: "alavanca" }, CATALOGO, 2)).toHaveLength(2);
  });
});

describe("as peças da normalização", () => {
  it("verbo e ligação saem; substantivo fica", () => {
    expect(palavrasUteis("Montar alavancas de chancela")).toEqual(["alavanca", "chancela"]);
  });

  it("plural do galpão vira singular", () => {
    expect(singular("alavancas")).toBe("alavanca");
    expect(singular("laterais")).toBe("lateral");
    expect(singular("travas")).toBe("trava");
    expect(singular("PS".toLowerCase())).toBe("ps"); // curto demais pra mexer
  });

  it("'Chancela' na atividade é 'Chancelas' no catálogo", () => {
    expect(mesmaCategoria("Chancela", "Chancelas")).toBe(true);
    expect(mesmaCategoria("Chancela", "Carimbos")).toBe(false);
    expect(mesmaCategoria(null, "Chancelas")).toBe(false);
  });
});
