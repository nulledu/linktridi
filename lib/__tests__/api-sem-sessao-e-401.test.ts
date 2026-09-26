import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ehRotaDeApi } from "@/middleware";

// Sem sessão, o middleware mandava TODA rota pro /login — inclusive as de API.
// O `fetch` do navegador segue o redirect sozinho, chega no /login e recebe
// **200 com HTML**. Pro cliente isso é indistinguível de sucesso: `r.ok` é
// `true` e o `catch` não roda.
//
// O estrago era geral, não local: das 196 escritas do app, 129 checam
// exatamente `r.ok`. Todas mantinham o estado otimista na tela — "aprovado",
// "salvo", "concluído" — sem nada ter sido gravado.
//
// Estes testes seguram as duas metades: o RECORTE (o que conta como API) e o
// COMPORTAMENTO (API leva 401, página leva redirect).

describe("ehRotaDeApi", () => {
  it("casa a raiz e o que está abaixo dela", () => {
    expect(ehRotaDeApi("/api")).toBe(true);
    expect(ehRotaDeApi("/api/tarefas")).toBe(true);
    expect(ehRotaDeApi("/api/central/solicitacoes")).toBe(true);
  });

  it("NÃO casa página que só começa com as mesmas letras", () => {
    // Um `startsWith("/api")` ingênuo devolveria JSON pra uma página inteira.
    expect(ehRotaDeApi("/apionline")).toBe(false);
    expect(ehRotaDeApi("/apiario")).toBe(false);
    expect(ehRotaDeApi("/central/api-doc")).toBe(false);
  });

  it("não casa página comum", () => {
    expect(ehRotaDeApi("/central/tarefas")).toBe(false);
    expect(ehRotaDeApi("/")).toBe(false);
  });
});

describe("middleware: sem sessão, API responde 401 e não redireciona", () => {
  const src = readFileSync(join(process.cwd(), "middleware.ts"), "utf8");

  it("o desvio de API vem ANTES do redirect pro /login", () => {
    // A ordem é o que importa: com o redirect antes, o `return` acontece e o
    // 401 nunca roda — que é exatamente o estado em que o bug existia.
    const i401 = src.indexOf("ehRotaDeApi(path)");
    const iRedirect = src.indexOf("NextResponse.redirect(url)");
    expect(i401, "guarda de API sumiu do middleware").toBeGreaterThan(-1);
    expect(iRedirect).toBeGreaterThan(-1);
    expect(i401, "o redirect pro /login passou na frente do 401 de API").toBeLessThan(iRedirect);
  });

  it("responde 401 com JSON, não com HTML", () => {
    const trecho = src.slice(src.indexOf("ehRotaDeApi(path)"), src.indexOf("NextResponse.redirect(url)"));
    expect(trecho).toMatch(/NextResponse\.json/);
    expect(trecho).toMatch(/status:\s*401/);
  });

  it("página comum continua indo pro /login", () => {
    // O 401 não pode ter substituído o redirect: quem digita um endereço de
    // página sem estar logado tem que ver a tela de login, não um JSON.
    expect(src).toMatch(/url\.pathname\s*=\s*"\/login"/);
  });
});
