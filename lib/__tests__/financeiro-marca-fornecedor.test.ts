import { describe, expect, it } from "vitest";

const { contatoCanonicoDaConsultaFornecedor, resolverContatoDaMarcaFornecedor } = await import("@/lib/financeiro/marca-fornecedor");

describe("resolução da marca canônica do fornecedor", () => {
  it("recua para a marca legada somente quando contato_id ainda não existe no schema", () => {
    expect(contatoCanonicoDaConsultaFornecedor({
      data: null,
      error: { code: "42703", message: "column fin_fornecedores.contato_id does not exist" },
    })).toBeNull();
  });

  it("propaga erro operacional em vez de escolher a marca legada", () => {
    const erro = { code: "42501", message: "permission denied for table fin_fornecedores" };

    try {
      contatoCanonicoDaConsultaFornecedor({ data: null, error: erro });
      expect.unreachable("o erro operacional não pode virar fallback legado");
    } catch (recebido) {
      expect(recebido).toBe(erro);
    }
  });

  it("transforma falha operacional em resposta JSON para os dois handlers usarem", async () => {
    const resultado = await resolverContatoDaMarcaFornecedor(async () => ({
      data: null,
      error: { code: "42501", message: "permission denied for table fin_fornecedores" },
    }));

    expect("resposta" in resultado).toBe(true);
    if ("resposta" in resultado) {
      expect(resultado.resposta.status).toBe(500);
      await expect(resultado.resposta.json()).resolves.toEqual({
        erro: "Não deu para resolver a marca canônica do fornecedor: permission denied for table fin_fornecedores",
      });
    }
  });
});
