import { describe, it, expect } from "vitest";
import { normalizarDominio } from "../infraestrutura";

// Foi faltar essa normalização que fez "http://tridii.com.br" nascer como
// domínio NOVO em vez de atualizar "tridii.com.br" — duas linhas pro mesmo
// domínio, uma delas travada em "sem vencimento" pra sempre.
describe("normalizarDominio", () => {
  it("tira http:// e https://", () => {
    expect(normalizarDominio("http://tridii.com.br")).toBe("tridii.com.br");
    expect(normalizarDominio("https://tridii.com.br")).toBe("tridii.com.br");
    expect(normalizarDominio("HTTPS://TRIDII.COM.BR")).toBe("tridii.com.br");
  });

  it("tira barra e caminho no fim", () => {
    expect(normalizarDominio("produtostridi.com.br/")).toBe("produtostridi.com.br");
    expect(normalizarDominio("https://tridii.com.br/algum/caminho")).toBe("tridii.com.br");
  });

  it("baixa a caixa e tira espaço nas pontas", () => {
    expect(normalizarDominio(" TridiXP.com.br ")).toBe("tridixp.com.br");
  });

  it("domínio normal passa direto", () => {
    expect(normalizarDominio("tridii.com.br")).toBe("tridii.com.br");
  });

  it("vazio ou lixo vira null (nunca exceção)", () => {
    expect(normalizarDominio("")).toBeNull();
    expect(normalizarDominio("   ")).toBeNull();
    expect(normalizarDominio(undefined)).toBeNull();
    expect(normalizarDominio(null)).toBeNull();
    expect(normalizarDominio(123)).toBeNull();
  });
});
