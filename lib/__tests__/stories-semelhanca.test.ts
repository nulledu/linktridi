import { describe, it, expect } from "vitest";
import {
  casaBusca, compararConteudo, dhashDePixels, ehParecido, hamming, mesmoFormato, normalizar, palavras, parecidos,
} from "../marketing-stories/semelhanca";

/**
 * "Já postamos isso?" era a pergunta que o Miro respondia rolando meses. O que
 * este arquivo trava:
 *  1. a MESMA ARTE é reconhecida pela imagem (dHash), mesmo recomprimida;
 *  2. o MESMO CONTEÚDO é reconhecido pelo texto, sem acusar o dia a dia de uma
 *     campanha (mesmo produto e tipo, tema diferente) de repetição;
 *  3. o original nunca é acusado de copiar a cópia (`antes`).
 */

describe("texto", () => {
  it("normaliza acento e pontuação", () => {
    expect(normalizar("Promoção: -20%!")).toBe("promocao 20");
  });

  it("fica com as palavras que carregam sentido, sem o plural simples", () => {
    expect([...palavras("Os carimbos da Promoção de 20%")]).toEqual(["carimbo", "promocao", "20"]);
  });

  it("a busca acha em qualquer ordem, sem acento e pelo começo da palavra", () => {
    expect(casaBusca("Carimbo — kit com 20% OFF", "kit carimbo")).toBe(true);
    expect(casaBusca("Promoção relâmpago", "promocao")).toBe(true);
    expect(casaBusca("Carimbo", "car")).toBe(true);
    expect(casaBusca("Chancela", "carimbo")).toBe(false);
    expect(casaBusca("encarimbado", "carimbo")).toBe(false);
  });
});

describe("mesma arte (dHash)", () => {
  // Cada linha clareia pra direita: nenhum pixel é mais claro que o vizinho.
  const gradiente = Array.from({ length: 72 }, (_, i) => (i % 9) * 10);

  it("é determinístico e cabe em 16 hex", () => {
    expect(dhashDePixels(gradiente)).toBe("0000000000000000");
    expect(dhashDePixels(gradiente.map((v) => 80 - v))).toBe("ffffffffffffffff");
  });

  it("recompressão (ruído leve) não muda o hash", () => {
    const base = Array.from({ length: 72 }, (_, i) => ((i * 37) % 97) * 2);
    const recomprimida = base.map((v, i) => v + (i % 2 ? 0.8 : -0.8));
    expect(hamming(dhashDePixels(base), dhashDePixels(recomprimida))).toBe(0);
  });

  it("hash ausente ou torto não casa com nada", () => {
    expect(hamming("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hamming(null, "0000000000000000")).toBe(64);
    expect(hamming("xyz", "xyz")).toBe(64);
  });
});

describe("mesmo conteúdo", () => {
  const base = { produtoId: "p1", tipo: "oferta", tema: "Desconto de 20% no kit", cta: "Comprar agora", campanha: "Black Friday" };

  it("mesmo produto, tipo e tema (em outras palavras) = parecido", () => {
    const c = compararConteudo(base, { ...base, tema: "Kit com desconto 20%" });
    expect(c.nota).toBe(1);
    expect(ehParecido(c)).toBe(true);
  });

  it("mesmo produto e tipo com tema diferente é o dia a dia, não repetição", () => {
    const c = compararConteudo(base, { ...base, tema: "Depoimento da cliente Ana", cta: "Saiba mais", campanha: null });
    expect(c.nota).toBe(0.55);
    expect(ehParecido(c)).toBe(false);
  });

  it("sem tema dos dois lados não há evidência de repetição", () => {
    const c = compararConteudo({ produtoId: "p1", tipo: "oferta" }, { produtoId: "p1", tipo: "oferta" });
    expect(ehParecido(c)).toBe(false);
  });

  it("a mesma arte vence qualquer texto", () => {
    const c = compararConteudo({ hashVisual: "00000000000000ff" }, { hashVisual: "00000000000000fe", tema: "outra coisa" });
    expect(c).toEqual({ nota: 1, mesmaArte: true });
  });

  it("com `antes`, o original não é acusado de copiar a cópia", () => {
    const hist = [
      { id: "velho", publicadoEm: "2026-08-01T00:00:00.000Z", ...base },
      { id: "novo", publicadoEm: "2026-09-01T00:00:00.000Z", ...base },
    ];
    expect(parecidos(hist[0], hist, { antes: true })).toHaveLength(0);
    expect(parecidos(hist[1], hist, { antes: true }).map((p) => p.item.id)).toEqual(["velho"]);
    // sem `antes` (o aviso do cadastro), os dois lados aparecem
    expect(parecidos({ ...base }, hist).map((p) => p.item.id)).toEqual(["novo", "velho"]);
  });

  it("mesmo formato conta produto + tipo e acha o último", () => {
    const hist = [
      { id: "1", publicadoEm: "2026-09-01T00:00:00.000Z", produtoId: "p1", tipo: "oferta" },
      { id: "2", publicadoEm: "2026-09-10T00:00:00.000Z", produtoId: "p1", tipo: "oferta" },
      { id: "3", publicadoEm: "2026-09-12T00:00:00.000Z", produtoId: "p1", tipo: "depoimento" },
    ];
    expect(mesmoFormato({ produtoId: "p1", tipo: "oferta" }, hist)).toEqual({ total: 2, ultimo: "2026-09-10T00:00:00.000Z" });
    expect(mesmoFormato({ produtoId: "p1", tipo: null }, hist)).toEqual({ total: 0, ultimo: null });
  });
});
