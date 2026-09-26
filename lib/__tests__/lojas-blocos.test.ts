import { describe, expect, it } from "vitest";
import {
  MODELOS_PAGINA, blocoNovo, moverBloco, normalizarBlocos, resumoDoBloco, textoDaPagina,
  type BlocoPagina,
} from "@/lib/lojas-blocos";

describe("blocos de página", () => {
  it("descarta bloco de tipo desconhecido em vez de renderizar pela metade", () => {
    const lidos = normalizarBlocos([
      { id: "a", tipo: "texto", titulo: "Oi", conteudo: "<p>x</p>", alinhamento: "left" },
      { id: "b", tipo: "carrossel-3d", titulo: "de outra versão" },
      { id: "c", tipo: "botoes", alinhamento: "center", botoes: [{ texto: "Ver", destino: "/c", estilo: "primario" }] },
    ]);
    expect(lidos.map((b) => b.tipo)).toEqual(["texto", "botoes"]);
  });

  it("sobrevive a lixo: null, string, número, campo faltando", () => {
    expect(normalizarBlocos(null)).toEqual([]);
    expect(normalizarBlocos("nada disso")).toEqual([]);
    const [b] = normalizarBlocos([{ tipo: "texto" }]);
    expect(b.tipo).toBe("texto");
    expect(b.id).toBeTruthy();      // ganha um id em vez de quebrar a key do React
    expect((b as { titulo: string }).titulo).toBe("");
  });

  it("cai no padrão quando a opção guardada não existe mais", () => {
    const [b] = normalizarBlocos([{ tipo: "texto", alinhamento: "justificado" }]);
    expect((b as { alinhamento: string }).alinhamento).toBe("left");
  });

  it("botão sem texto é descartado — botão em branco na loja não é clicável", () => {
    const [b] = normalizarBlocos([{ tipo: "botoes", botoes: [{ texto: "", destino: "/c" }, { texto: "Ver", destino: "/c" }] }]);
    expect((b as { botoes: unknown[] }).botoes).toHaveLength(1);
  });

  it("mover não sai da lista nem duplica bloco", () => {
    const bs = [blocoNovo("texto"), blocoNovo("botoes"), blocoNovo("chamada")];
    expect(moverBloco(bs, bs[0].id, -1)).toBe(bs);            // já é o primeiro
    expect(moverBloco(bs, bs[2].id, 1)).toBe(bs);             // já é o último
    expect(moverBloco(bs, "nao-existe", 1)).toBe(bs);
    const trocado = moverBloco(bs, bs[0].id, 1);
    expect(trocado.map((b) => b.id)).toEqual([bs[1].id, bs[0].id, bs[2].id]);
  });

  it("todo modelo nasce com blocos que passam pela normalização", () => {
    for (const m of MODELOS_PAGINA) {
      const blocos = m.blocos();
      expect(blocos.length, m.chave).toBeGreaterThan(0);
      expect(normalizarBlocos(blocos), m.chave).toHaveLength(blocos.length);
    }
  });

  it("todo bloco tem resumo — a lista do construtor não mostra linha vazia", () => {
    for (const t of ["texto", "imagem", "imagem-texto", "botoes", "produtos", "destaques", "perguntas", "chamada"] as const) {
      expect(resumoDoBloco(blocoNovo(t)), t).toBeTruthy();
    }
  });

  it("a descrição de busca sai dos blocos quando o HTML antigo está vazio", () => {
    const blocos = normalizarBlocos([
      { tipo: "texto", titulo: "Sobre a Tridi", conteudo: "<p>Fabricamos carimbos.</p>" },
      { tipo: "botoes", botoes: [{ texto: "Ver" }] },
    ]) as BlocoPagina[];
    const texto = textoDaPagina({ conteudo: "", blocos });
    expect(texto).toContain("Sobre a Tridi");
    expect(texto).toContain("Fabricamos carimbos");
  });

  it("página antiga (só HTML) continua devolvendo o HTML", () => {
    expect(textoDaPagina({ conteudo: "<p>7 dias.</p>", blocos: [] })).toBe("<p>7 dias.</p>");
  });
});
