import { describe, it, expect } from "vitest";
import {
  reduceScan, chavesDeBusca, normalizarCodigo, liberarRepeticao,
  SCAN_INICIAL, JANELA_REPETICAO_MS,
} from "../scan-codigo";

// Estes casos são os MESMOS de tridimarket-app/.../scan/ScanRules.kt. Se um lado
// mudar sozinho, o mesmo produto passa a ser encontrado num e não no outro.
describe("scan-codigo (paridade com ScanRules.kt)", () => {
  describe("chavesDeBusca", () => {
    it("UPC-A de 12 dígitos também procura como EAN-13 (zero na frente)", () => {
      // Sem isto, produto cadastrado como EAN-13 dá "não encontrado" quando a
      // câmera lê a mesma embalagem como UPC-A.
      expect(chavesDeBusca("012345678905")).toContain("0012345678905");
    });

    it("EAN-13 começando com zero também procura sem ele", () => {
      expect(chavesDeBusca("0012345678905")).toContain("012345678905");
    });

    it("tira zeros à esquerda", () => {
      expect(chavesDeBusca("000123")).toContain("123");
    });

    it("código só de zeros não vira string vazia", () => {
      // "".trimStart('0') = "" faria a busca casar com QUALQUER coisa.
      expect(chavesDeBusca("0000")).toContain("0");
      expect(chavesDeBusca("0000")).not.toContain("");
    });

    it("não inventa variação pra código com letra", () => {
      expect(chavesDeBusca("ABC-01")).toEqual(["ABC-01"]);
    });

    it("vazio não gera chave nenhuma", () => {
      expect(chavesDeBusca("   ")).toEqual([]);
    });
  });

  describe("reduceScan", () => {
    it("primeira leitura é aceita", () => {
      const t = reduceScan(SCAN_INICIAL, "789", 1000);
      expect(t.resultado).toEqual({ tipo: "aceito", codigo: "789" });
    });

    it("mesmo código dentro da janela é repetido", () => {
      const a = reduceScan(SCAN_INICIAL, "789", 1000);
      const b = reduceScan(a.estado, "789", 1000 + JANELA_REPETICAO_MS - 1);
      expect(b.resultado.tipo).toBe("repetido");
    });

    it("a janela DESLIZA: segurar o produto na frente da lente não conta de novo", () => {
      // Com janela fixa, um produto parado 3s viraria 2 no carrinho.
      let st = reduceScan(SCAN_INICIAL, "789", 0).estado;
      for (let t = 500; t <= 5000; t += 500) {
        const r = reduceScan(st, "789", t);
        expect(r.resultado.tipo).toBe("repetido");
        st = r.estado;
      }
    });

    it("depois de sumir de vista pela janela, volta a valer", () => {
      const a = reduceScan(SCAN_INICIAL, "789", 1000);
      const b = reduceScan(a.estado, "789", 1000 + JANELA_REPETICAO_MS);
      expect(b.resultado).toEqual({ tipo: "aceito", codigo: "789" });
    });

    it("código diferente passa na hora", () => {
      const a = reduceScan(SCAN_INICIAL, "789", 1000);
      const b = reduceScan(a.estado, "123", 1010);
      expect(b.resultado).toEqual({ tipo: "aceito", codigo: "123" });
    });

    it("leitura vazia é inválida e não mexe no estado", () => {
      const a = reduceScan(SCAN_INICIAL, "789", 1000);
      const b = reduceScan(a.estado, "  ", 1010);
      expect(b.resultado.tipo).toBe("invalido");
      expect(b.estado).toBe(a.estado);
    });

    it("liberarRepeticao faz o mesmo código valer de novo", () => {
      const a = reduceScan(SCAN_INICIAL, "789", 1000);
      const b = reduceScan(liberarRepeticao(a.estado), "789", 1010);
      expect(b.resultado.tipo).toBe("aceito");
    });
  });

  it("normalizarCodigo só apara espaço", () => {
    expect(normalizarCodigo("  789  ")).toBe("789");
    expect(normalizarCodigo(null)).toBe("");
  });
});
