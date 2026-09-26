import { describe, it, expect } from "vitest";
import { dnsPara, hostExemplo, limparHost, partesHost, VERCEL_A, VERCEL_CNAME } from "../dominio-dns";

// A instrução de DNS é lida por quem NÃO é técnico, num painel de provedor que
// ela abre uma vez na vida. Errar aqui não dá erro na tela: dá um domínio que
// não sobe, ou — no caso da raiz — o site do cliente fora do ar.

describe("partesHost", () => {
  it("separa subdomínio de raiz", () => {
    expect(partesHost("loja.tridi.com.br")).toEqual({ sub: "loja", apex: false });
    expect(partesHost("chat.suaempresa.com")).toEqual({ sub: "chat", apex: false });
    expect(partesHost("a.b.tridi.com.br")).toEqual({ sub: "a.b", apex: false });
  });

  it("reconhece a RAIZ, inclusive com sufixo de dois níveis", () => {
    // O caso que a lista de sufixos existe pra resolver: sem ela, "gedux.com.br"
    // pareceria subdomínio "gedux" de "com.br" — e a tela mandaria criar um
    // CNAME na raiz, que derruba o site inteiro do cliente.
    expect(partesHost("gedux.com.br")).toEqual({ sub: null, apex: true });
    expect(partesHost("tridi.com")).toEqual({ sub: null, apex: true });
    expect(partesHost("loja")).toEqual({ sub: null, apex: true });
  });

  it("aceita o que a pessoa cola: protocolo, caminho e maiúscula", () => {
    expect(partesHost("https://Loja.Tridi.com.br/produtos")).toEqual({ sub: "loja", apex: false });
  });
});

describe("dnsPara", () => {
  it("subdomínio vira CNAME apontando pra Vercel", () => {
    const l = dnsPara("loja.tridi.com.br");
    expect(l.map((x) => x.valor)).toEqual(["CNAME", "loja", VERCEL_CNAME]);
  });

  it("raiz vira registro A — porque raiz não aceita CNAME", () => {
    const l = dnsPara("tridi.com.br");
    expect(l.map((x) => x.valor)).toEqual(["A", "@", VERCEL_A]);
  });

  it("sem cadastro, cada tela mostra o exemplo do seu contexto", () => {
    // A única diferença entre a tela do bot e a da loja é o subdomínio do
    // exemplo. Ele entra pelo HOST, não por um parâmetro do dnsPara — ali ele
    // era código morto (host com subdomínio nunca tem `sub` vazio).
    expect(dnsPara(hostExemplo("loja"))[1].valor).toBe("loja");
    expect(dnsPara(hostExemplo("chat"))[1].valor).toBe("chat");
    expect(dnsPara(hostExemplo("loja"))[0].valor).toBe("CNAME");
  });
});

describe("limparHost", () => {
  it("guarda sempre no mesmo formato", () => {
    expect(limparHost("  HTTPS://Loja.Tridi.com.br/algo  ")).toBe("loja.tridi.com.br");
    expect(limparHost("loja.tridi.com.br.")).toBe("loja.tridi.com.br");
    expect(limparHost("")).toBe("");
  });
});
