import { describe, expect, it } from "vitest";
import {
  Ocupacao, colocar, remover, acrescentar, empacotar, adaptar, levarParaBase, normalizar,
  valido, comHisterese, celulaContinua, medidaDoSpan, ordemDeLeitura, type Item,
} from "@/app/(plataforma)/trafego/lattice";

// ── Tridify Layout Engine ────────────────────────────────────────────────────
// Trava do motor único do "Meu painel": grade lógica, ocupação, colisão,
// reorganização em cadeia, resize pelo mesmo caminho, responsivo e salvo.

const P = (id: string, x: number, y: number): Item => ({ id, x, y, w: 1, h: 1 });
const linha = (itens: Item[], y = 0) => ordemDeLeitura(itens).filter((i) => i.y === y).map((i) => i.id).join("");
const medida = (m: Record<string, number>) => (id: string) => medidaDoSpan(m[id] ?? 1, 4);

describe("layout engine · ocupação", () => {
  it("sabe quem ocupa, o que está livre, se cabe e a próxima casa livre", () => {
    const oc = new Ocupacao(8, [{ id: "a", x: 0, y: 0, w: 4, h: 2 }, { id: "b", x: 4, y: 2, w: 4, h: 2 }]);
    expect(oc.quem(3, 1)).toBe("a");
    expect(oc.quem(4, 0)).toBeNull();
    expect(oc.cabe(4, 0, 4, 2)).toBe(true);
    expect(oc.cabe(2, 0, 4, 2)).toBe(false);
    expect(oc.cabe(6, 0, 4, 1)).toBe(false); // sai da grade
    expect(oc.colisoes(3, 1, 3, 2).sort()).toEqual(["a", "b"]);
    expect(oc.proximaLivre(4, 2)).toEqual({ x: 4, y: 0 });
    expect(oc.livres(2)).toHaveLength(8);
  });

  it("layout com dois cards na mesma célula é inválido", () => {
    expect(valido([P("a", 0, 0), P("b", 0, 0)], 4)).toBe(false);
    expect(valido([P("a", 0, 0), P("b", 1, 0)], 4)).toBe(true);
  });
});

describe("layout engine · reorganização", () => {
  const abcd = () => [P("a", 0, 0), P("b", 1, 0), P("c", 2, 0), P("d", 3, 0)];

  it("A arrastado pra casa de C: os outros abrem espaço em ordem (Home Screen)", () => {
    const r = colocar(abcd(), { ...P("a", 2, 0) }, 4);
    expect(linha(r)).toBe("bcad");
    expect(valido(r, 4)).toBe(true);
  });

  it("cadeia: um M no começo empurra A → B → C → D pra frente, sem sobrepor", () => {
    const base = [P("a", 0, 0), P("b", 1, 0), P("c", 2, 0), P("d", 3, 0), P("e", 0, 1)];
    const r = colocar([...base, { id: "m", x: 0, y: 2, w: 2, h: 2 }], { id: "m", x: 0, y: 0, w: 2, h: 2 }, 4);
    expect(valido(r, 4)).toBe(true);
    expect(r.find((i) => i.id === "m")).toMatchObject({ x: 0, y: 0 });
    expect(linha(r, 0)).toBe("mab");
    expect(linha(r, 1)).toBe("cd"); // o M segue ocupando as duas colunas da esquerda
    expect(r.find((i) => i.id === "e")).toMatchObject({ x: 0, y: 2 });
  });

  it("quem está antes do alvo não se mexe", () => {
    const r = colocar(abcd(), P("d", 2, 0), 4);
    expect(r.find((i) => i.id === "a")).toMatchObject({ x: 0, y: 0 });
    expect(r.find((i) => i.id === "b")).toMatchObject({ x: 1, y: 0 });
  });

  it("determinístico, e sem mudança devolve a mesma referência", () => {
    const x = abcd();
    expect(colocar(x, P("a", 0, 0), 4)).toBe(x);
    expect(colocar(abcd(), P("a", 2, 0), 4)).toEqual(colocar(abcd(), P("a", 2, 0), 4));
  });

  it("alvo fora da grade é trazido pra dentro e nunca abre fileiras vazias", () => {
    const r = colocar(abcd(), { id: "a", x: 9, y: 40, w: 2, h: 1 }, 4);
    const a = r.find((i) => i.id === "a")!;
    expect(a.x + a.w).toBeLessThanOrEqual(4);
    expect(a.y).toBeLessThanOrEqual(1);
    expect(valido(r, 4)).toBe(true);
  });

  it("resize usa o mesmo motor: crescer empurra quem não cabe", () => {
    const r = colocar(abcd(), { id: "a", x: 0, y: 0, w: 2, h: 2 }, 4);
    expect(valido(r, 4)).toBe(true);
    expect(linha(r, 0)).toBe("abc");
    expect(linha(r, 1)).toBe("d");
  });

  it("remover fecha o buraco; acrescentar entra na primeira casa livre", () => {
    expect(linha(remover(abcd(), "b", 4))).toBe("acd");
    const r = acrescentar(remover(abcd(), "b", 4), "z", 1, 1, 4);
    expect(r.find((i) => i.id === "z")).toMatchObject({ x: 3, y: 0 });
  });
});

describe("layout engine · zona de ativação", () => {
  it("só troca de célula depois da metade e mais a margem", () => {
    expect(comHisterese(1.6, 1)).toBe(1);   // passou da metade, mas não da margem
    expect(comHisterese(1.75, 1)).toBe(2);
    expect(comHisterese(0.3, 1)).toBe(1);
    expect(comHisterese(0.25, 1)).toBe(0);
    expect(comHisterese(1.6, null)).toBe(2);
  });

  it("converte tela → célula com gap e altura de fileira", () => {
    const m = { left: 0, top: 0, width: 4 * 100 + 3 * 16, cols: 4, gap: 16, linha: 176 };
    expect(celulaContinua(m, 116, 192)).toEqual({ x: 1, y: 1 });
  });
});

describe("layout engine · responsivo e salvo", () => {
  const itens = empacotar(["g", "a", "m", "b"], medida({ g: 4, m: 2 }), 4);

  it("grade menor mantém a ordem, prende a largura e nunca sai da área", () => {
    const dois = adaptar(itens, 2);
    expect(valido(dois, 2)).toBe(true);
    expect(dois.find((i) => i.id === "g")!.w).toBe(2);
    // "b" sobe pro lado de "a" (sem buraco); "m", que não cabe ali, vem depois.
    expect(ordemDeLeitura(dois).map((i) => i.id)).toEqual(["g", "a", "b", "m"]);
  });

  it("arrumação do tablet volta pra base pela ordem de leitura", () => {
    const base = levarParaBase(adaptar(itens, 2), medida({ g: 4, m: 2 }));
    expect(valido(base, 4)).toBe(true);
    expect(base.find((i) => i.id === "g")!.w).toBe(4);
  });

  it("salvo válido volta EXATO; inválido é reempacotado; faltante entra no fim", () => {
    const salvo = [P("a", 3, 0), P("b", 0, 1)];
    expect(normalizar(salvo, ["a", "b"], medida({}))).toEqual(salvo);
    const ruim = normalizar([P("a", 0, 0), P("b", 0, 0)], ["a", "b"], medida({}));
    expect(valido(ruim, 4)).toBe(true);
    const comNovo = normalizar(salvo, ["a", "b", "c"], medida({}));
    expect(comNovo.find((i) => i.id === "c")).toMatchObject({ x: 0, y: 0 });
    expect(normalizar(salvo, ["b"], medida({})).map((i) => i.id)).toEqual(["b"]);
  });

  it("sem nada salvo, empacota a ordem (layout antigo só com order)", () => {
    expect(normalizar(undefined, ["a", "b"], medida({})).map((i) => [i.x, i.y])).toEqual([[0, 0], [1, 0]]);
  });

  it("G ocupa as quatro colunas e M duas", () => {
    expect(medidaDoSpan(4, 4)).toEqual({ w: 4, h: 3 });
    expect(medidaDoSpan(2, 4)).toEqual({ w: 2, h: 2 });
  });
});
