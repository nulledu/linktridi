// A reposição automática criava a ordem e ela NUNCA chegava na bancada. Não era
// o motor do estoque: era o roteamento do claim. Este teste trava as duas
// réguas que barravam, com os dados reais medidos no banco em 2026-09-08.
import { describe, it, expect } from "vitest";
import { pessoaAceitaCategoria, familiaCategoria, podePegarDoPool } from "../device";
import { faixaDaCategoria, faixaDaAtividade, podeFaixa } from "../atividade-faixa";

describe("pessoaAceitaCategoria", () => {
  it("categoria de PRODUTO não restringe ninguém (era o bug)", () => {
    for (const esp of ["Chancela", "Carimbo", "Ambos", "Máquinas", "Preparo", "", null]) {
      expect(pessoaAceitaCategoria(esp, "Tintas")).toBe(true);
      expect(pessoaAceitaCategoria(esp, "Brindes")).toBe(true);
      expect(pessoaAceitaCategoria(esp, "Máquinas")).toBe(true);
      expect(pessoaAceitaCategoria(esp, "Embalagem")).toBe(true);
      expect(pessoaAceitaCategoria(esp, "Almofadas")).toBe(true);
    }
  });
  it("o eixo chancela × carimbo continua valendo", () => {
    expect(pessoaAceitaCategoria("Chancela", "Chancelas")).toBe(true);
    expect(pessoaAceitaCategoria("Chancela", "Carimbos")).toBe(false);
    expect(pessoaAceitaCategoria("Carimbo", "Carimbos")).toBe(true);
    expect(pessoaAceitaCategoria("Carimbo", "Chancelas")).toBe(false);
    expect(pessoaAceitaCategoria("Ambos", "Carimbos")).toBe(true);
    expect(pessoaAceitaCategoria(null, "Chancelas")).toBe(true);
  });
  it("Máquinas/Preparo não são o eixo: quem separa é a faixa", () => {
    expect(pessoaAceitaCategoria("Máquinas", "Chancelas")).toBe(true);
    expect(pessoaAceitaCategoria("Preparo", "Carimbos")).toBe(true);
    expect(familiaCategoria("Máquinas")).toBeNull();
  });
});

describe("faixaDaCategoria", () => {
  it("classifica sem depender de setor_responsavel (que ninguém preenche)", () => {
    expect(faixaDaCategoria("Máquinas")).toBe("maquinas");
    expect(faixaDaCategoria("Tintas")).toBe("preparo");
    expect(faixaDaCategoria("Colas")).toBe("preparo");
    expect(faixaDaCategoria("Sprays")).toBe("preparo");
    expect(faixaDaCategoria("Brindes")).toBeNull();
    expect(faixaDaCategoria("Almofadas")).toBeNull();
    expect(faixaDaCategoria(null)).toBeNull();
  });
  it("o campo do item continua mandando mais que a categoria", () => {
    expect(faixaDaAtividade("Montagem Final", "Produzir X", "Máquinas")).toBe("producao");
    expect(faixaDaAtividade(null, "Produzir Folha de borracha A4", "Máquinas")).toBe("maquinas");
    expect(faixaDaAtividade(null, "Produzir Coração", "Brindes")).toBe("producao");
  });
});

describe("as 9 ordens paradas no pool agora encontram dono", () => {
  // (tarefa, categoria) reais + a faixa que a ordem passa a ter.
  const pool = [
    ["Produzir Folha de borracha A4", "Máquinas"],
    ["Produzir Polvo chaveiro", "Brindes"],
    ["Produzir Coração", "Brindes"],
    ["Produzir Tinta papel preta 30ml", "Tintas"],
    ["Produzir Puxador Macho", "Carimbos"],
  ] as const;
  const equipe = [
    { esp: "Máquinas" }, { esp: "Preparo" }, { esp: "Ambos" },
  ];
  it("cada ordem tem pelo menos uma pessoa da mesa que pode pegá-la", () => {
    for (const [tarefa, categoria] of pool) {
      const faixa = faixaDaAtividade(null, tarefa, categoria);
      const donos = equipe.filter((p) => pessoaAceitaCategoria(p.esp, categoria) && podeFaixa(p.esp, faixa));
      expect(donos.length, `${tarefa} (${categoria}/${faixa}) ficou sem ninguém`).toBeGreaterThan(0);
    }
  });
  it("máquina vai pro maquinista, tinta vai pro preparo", () => {
    const donoDe = (t: string, c: string) => equipe
      .filter((p) => pessoaAceitaCategoria(p.esp, c) && podeFaixa(p.esp, faixaDaAtividade(null, t, c)))
      .map((p) => p.esp);
    expect(donoDe("Produzir Folha de borracha A4", "Máquinas")).toEqual(["Máquinas"]);
    expect(donoDe("Produzir Tinta papel preta 30ml", "Tintas")).toEqual(["Preparo"]);
    expect(donoDe("Produzir Coração", "Brindes")).toEqual(["Ambos"]);
  });
});

describe("podePegarDoPool — a régua única da pessoa × ordem", () => {
  const PECA_MAQUINA = { setor: "Produção", faixa: "maquinas", categoria: "Almofadas" };
  const PECA_PRODUCAO = { setor: "Produção", faixa: "producao", categoria: "Almofadas" };
  const LOGISTICA = { setor: "Logística", faixa: "producao", categoria: "Envio" };

  it("sem especialidade não pega ordem da Produção (o caso do Felipe, 11/09)", () => {
    expect(podePegarDoPool(null, PECA_PRODUCAO)).toBe(false);
    expect(podePegarDoPool("", PECA_MAQUINA)).toBe(false);
  });
  it("especialidade decide a faixa", () => {
    expect(podePegarDoPool("Máquinas", PECA_MAQUINA)).toBe(true);
    expect(podePegarDoPool("Ambos", PECA_MAQUINA)).toBe(false);
    expect(podePegarDoPool("Ambos", PECA_PRODUCAO)).toBe(true);
    expect(podePegarDoPool("Preparo", PECA_PRODUCAO)).toBe(false);
  });
  it("ordem de outro setor não passa pela faixa — Logística segue só pelo setor", () => {
    expect(podePegarDoPool(null, LOGISTICA)).toBe(true);
  });
});
