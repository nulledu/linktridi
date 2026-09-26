import { describe, it, expect } from "vitest";
import { motivoDaFalha, respostaConfiavel } from "../rede";

// O caso que motivou o arquivo: `PATCH /api/central/solicitacoes` sem sessão
// não devolve 401. O middleware desvia pra tela de login, e ela responde
// **200 com HTML**. Medido no navegador: `{ status: 200, ok: true, corpo:
// "<!DOCTYPE html>…" }`. Quem testa só `r.ok` lê isso como sucesso e mantém o
// estado otimista — a pessoa vê "aprovado" e nada foi aprovado.
const resposta = (status: number, tipo: string) =>
  new Response(tipo.includes("json") ? "{}" : "<!DOCTYPE html>", {
    status,
    headers: { "content-type": tipo },
  });

describe("respostaConfiavel", () => {
  it("200 com JSON é sucesso", () => {
    expect(respostaConfiavel(resposta(200, "application/json"))).toBe(true);
    expect(respostaConfiavel(resposta(200, "application/json; charset=utf-8"))).toBe(true);
  });

  it("200 com HTML NÃO é sucesso — é o desvio pro login", () => {
    expect(respostaConfiavel(resposta(200, "text/html; charset=utf-8"))).toBe(false);
  });

  it("erro continua sendo erro", () => {
    expect(respostaConfiavel(resposta(401, "application/json"))).toBe(false);
    expect(respostaConfiavel(resposta(500, "text/html"))).toBe(false);
  });

  it("resposta sem content-type não passa", () => {
    // Sem o cabeçalho não dá pra afirmar que é JSON, e afirmar sucesso é
    // justamente o erro que este arquivo existe pra impedir.
    expect(respostaConfiavel(new Response("{}", { status: 200 }))).toBe(false);
  });
});

describe("motivoDaFalha", () => {
  it("sessão expirada diz o que fazer, não só que falhou", () => {
    const frase = motivoDaFalha(new Error("sessao_expirada"), "atualizar a solicitação");
    expect(frase).toContain("sessão expirou");
    expect(frase).toMatch(/recarregue/i);
  });

  it("qualquer outra falha nomeia a ação que não aconteceu", () => {
    expect(motivoDaFalha(new Error("http_500"), "atualizar a solicitação"))
      .toBe("Não deu pra atualizar a solicitação.");
  });
});
