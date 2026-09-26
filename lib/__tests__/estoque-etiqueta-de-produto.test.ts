import { describe, it, expect } from "vitest";
import {
  etiquetasDeProduto, problemaDaEtiquetaDeProduto, corDimensoesDoItem,
  ErroSemSku, ErroItemSerializado, MAX_COPIAS_DE_PRODUTO,
  type ItemParaEtiqueta,
} from "../estoque-etiqueta-de-produto";

/**
 * A etiqueta de PRODUTO: o mesmo código em todas as peças.
 *
 * Pedido do dono: "fui etiquetar almofada, e como todas elas são iguais eu achei
 * melhor gerar as etiquetas com o mesmo código, só pra identificar o produto".
 *
 * O que este arquivo trava não é o formato do papel — é a fronteira: esta
 * etiqueta NÃO é unidade. Se um dia alguém fizer ela criar linha em
 * `estoque_unidades`, o código repetido bate no índice único, a baixa por
 * bipagem não sabe qual marcar, e o gatilho passa a recalcular o estoque a
 * partir de linhas inertes.
 */

const ALMOFADA: ItemParaEtiqueta = {
  nome: "Almofada 22x22", sku: "AMF09", cor: "Branco",
  largura_mm: 220, altura_mm: 220, espessura_mm: null, dim_unidade: "mm",
  serializado: false,
};

describe("etiqueta de produto", () => {
  it("vinte almofadas saem com o MESMO código — é o pedido inteiro", () => {
    const etqs = etiquetasDeProduto(ALMOFADA, 20);
    expect(etqs).toHaveLength(20);
    expect(new Set(etqs.map((e) => e.codigo)).size).toBe(1);
    expect(etqs[0].codigo).toBe("AMF09");
  });

  it("o código é o SKU CRU, sem sequencial", () => {
    // O sequencial é o que distingue peça de peça. Aqui ele não pode existir:
    // "AMF09-000001" mandaria o leitor procurar uma unidade que ninguém criou.
    const [e] = etiquetasDeProduto(ALMOFADA, 1);
    expect(e.codigo).toBe("AMF09");
    expect(e.codigo).not.toMatch(/-\d{6}$/);
  });

  it("cada etiqueta vale UMA peça — nunca é caixa", () => {
    // `quantidade > 1` faz a etiqueta imprimir o selo "N un", que numa etiqueta
    // de produto seria mentira: ela está colada numa almofada, não numa caixa
    // com N dentro.
    for (const e of etiquetasDeProduto(ALMOFADA, 5)) expect(e.quantidade).toBe(1);
  });

  it("leva o nome e a linha de cor/dimensões, que é o que se confere olhando", () => {
    const [e] = etiquetasDeProduto(ALMOFADA, 1);
    expect(e.nome).toBe("Almofada 22x22");
    expect(e.corDimensoes).toBe("Branco · 220×220mm");
  });

  it("item SERIALIZADO é recusado — lá o código É a peça", () => {
    const serial = { ...ALMOFADA, serializado: true };
    expect(() => etiquetasDeProduto(serial, 3)).toThrow(ErroItemSerializado);
    expect(problemaDaEtiquetaDeProduto(serial, 3)).toMatch(/contado por etiqueta/);
  });

  it("sem SKU não há código de barras, e a tela diz isso ANTES do clique", () => {
    const semSku = { ...ALMOFADA, sku: null };
    expect(() => etiquetasDeProduto(semSku, 3)).toThrow(ErroSemSku);
    expect(problemaDaEtiquetaDeProduto(semSku, 3)).toMatch(/ainda não tem SKU/);
  });

  it("a quantidade tem teto, porque o desperdício é de ROLO", () => {
    expect(problemaDaEtiquetaDeProduto(ALMOFADA, MAX_COPIAS_DE_PRODUTO)).toBeNull();
    expect(problemaDaEtiquetaDeProduto(ALMOFADA, MAX_COPIAS_DE_PRODUTO + 1)).toMatch(/é demais/);
    // E o gerador satura em vez de estourar, pra um chamador distraído não
    // mandar 5000 tiras pra impressora.
    expect(etiquetasDeProduto(ALMOFADA, 5000)).toHaveLength(MAX_COPIAS_DE_PRODUTO);
  });

  it("quantidade inválida é recusada com frase, não com zero etiquetas", () => {
    for (const n of [0, -3, 1.5, NaN]) {
      expect(problemaDaEtiquetaDeProduto(ALMOFADA, n), `${n}`).toBeTruthy();
    }
    // Mas o gerador nunca devolve lista vazia: quem chegou nele já passou pela
    // frase, e devolver [] silenciosamente imprimiria nada sem dizer por quê.
    expect(etiquetasDeProduto(ALMOFADA, 0)).toHaveLength(1);
  });

  it("item sem cor nem medida não inventa a linha", () => {
    const cru = { nome: "Cola", sku: "COL01", serializado: false };
    expect(corDimensoesDoItem(cru)).toBeNull();
    expect(etiquetasDeProduto(cru, 2)[0].corDimensoes).toBeUndefined();
  });
});
