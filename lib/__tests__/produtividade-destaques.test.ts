import { describe, it, expect } from "vitest";
import { podio, destaques, resumoRapido, primeiroNome, MIN_CONFERENCIAS, type PessoaMedida } from "../produtividade-destaques";

const p = (over: Partial<PessoaMedida> & { id: string; nome: string }): PessoaMedida => ({
  setor: "Produção", concluidas: 0, pecas: 0, mediaMin: null, acerto: null, retrabalhos: 0, conferencias: 0, ...over,
});

describe("pódio", () => {
  it("são os três que mais concluíram, em ordem", () => {
    const r = podio([
      p({ id: "a", nome: "Ana", concluidas: 38 }),
      p({ id: "b", nome: "Bruno", concluidas: 25 }),
      p({ id: "c", nome: "Carla", concluidas: 27 }),
      p({ id: "d", nome: "Davi", concluidas: 31 }),
    ]);
    expect(r.map((x) => x.nome)).toEqual(["Ana", "Davi", "Carla"]);
  });

  it("quem não concluiu nada não sobe no pódio, mesmo faltando gente", () => {
    const r = podio([p({ id: "a", nome: "Ana", concluidas: 2 }), p({ id: "b", nome: "Bruno", concluidas: 0 })]);
    expect(r.map((x) => x.nome)).toEqual(["Ana"]);
  });

  it("empate em atividades desempata por peças", () => {
    const r = podio([
      p({ id: "a", nome: "Ana", concluidas: 5, pecas: 10 }),
      p({ id: "b", nome: "Bruno", concluidas: 5, pecas: 40 }),
    ]);
    expect(r[0].nome).toBe("Bruno");
  });
});

describe("destaques", () => {
  it("dia sem nenhum dado não inventa cartão nenhum", () => {
    expect(destaques([p({ id: "a", nome: "Ana" })])).toEqual([]);
  });

  it("100% com UMA conferência não vira 'fez mais certo'", () => {
    const d = destaques([
      p({ id: "a", nome: "Ana", concluidas: 1, acerto: 1, conferencias: 1 }),
      p({ id: "b", nome: "Bruno", concluidas: 1, acerto: 0.9, conferencias: 20, retrabalhos: 2 }),
    ]);
    expect(d.find((x) => x.key === "acerto")?.pessoa.nome).toBe("Bruno");
    expect(MIN_CONFERENCIAS).toBeGreaterThan(1);
  });

  it("'mais rápido' ignora quem entregou uma atividade só", () => {
    const d = destaques([
      p({ id: "a", nome: "Ana", concluidas: 1, mediaMin: 3 }),
      p({ id: "b", nome: "Bruno", concluidas: 9, mediaMin: 18 }),
    ]);
    expect(d.find((x) => x.key === "rapidez")?.pessoa.nome).toBe("Bruno");
  });

  it("dia impecável não elege ponto de atenção", () => {
    const d = destaques([
      p({ id: "a", nome: "Ana", concluidas: 10, acerto: 1, conferencias: 10 }),
      p({ id: "b", nome: "Bruno", concluidas: 8, acerto: 1, conferencias: 8 }),
    ]);
    expect(d.some((x) => x.key === "atencao")).toBe(false);
  });

  it("quem tem retrabalho é o ponto de atenção", () => {
    const d = destaques([
      p({ id: "a", nome: "Ana", concluidas: 10, acerto: 0.98, conferencias: 50, retrabalhos: 1 }),
      p({ id: "c", nome: "Carla", concluidas: 27, acerto: 0.91, conferencias: 44, retrabalhos: 4 }),
    ]);
    const at = d.find((x) => x.key === "atencao");
    expect(at?.pessoa.nome).toBe("Carla");
    expect(at?.tom).toBe("alerta");
  });

  it("sem conferência nenhuma, ninguém é acusado de nada", () => {
    const d = destaques([p({ id: "a", nome: "Ana", concluidas: 10, mediaMin: 40 })]);
    expect(d.some((x) => x.key === "atencao")).toBe(false);
    expect(d.some((x) => x.key === "acerto")).toBe(false);
    expect(d.map((x) => x.key)).toContain("volume");
  });
});

describe("resumo rápido", () => {
  const time = [
    p({ id: "a", nome: "Ana Souza", concluidas: 38, acerto: 0.98, conferencias: 50, retrabalhos: 1, mediaMin: 21 }),
    p({ id: "c", nome: "Carla Mendes", concluidas: 27, acerto: 0.91, conferencias: 44, retrabalhos: 4, mediaMin: 26 }),
  ];

  it("fala em primeiro nome e mostra a fatia do total", () => {
    const [primeira] = resumoRapido(time);
    expect(primeira.titulo).toBe("Ana lidera o volume do dia");
    expect(primeira.texto).toContain("38 atividades concluídas");
    expect(primeira.texto).toContain("58% do total");
  });

  it("a frase de atenção diz a fatia dos retrabalhos", () => {
    const f = resumoRapido(time).find((x) => x.tom === "alerta");
    expect(f?.titulo).toBe("Carla concentra mais retrabalhos");
    expect(f?.texto).toContain("4 de 5");
    expect(f?.texto).toContain("80%");
  });

  it("time sem dado nenhum não gera frase", () => {
    expect(resumoRapido([p({ id: "a", nome: "Ana" })])).toEqual([]);
  });

  it("primeiroNome não quebra em nome vazio", () => {
    expect(primeiroNome("")).toBe("");
    expect(primeiroNome("  Davi  Lima ")).toBe("Davi");
  });
});
