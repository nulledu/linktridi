import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A rota existe por causa de um caso real: a central publicada apontava para
// gedux.com.br, que RESPONDE 200 — só que quem responde é o servidor dos
// funis, sem a central. Para quem clicava, "página indisponível" sem nada
// errado na central. O teste guarda as três garantias que fazem a checagem
// valer: pede sessão, olha o corpo (não só o status) e tem prazo.
const fonte = readFileSync("app/api/tridiflow/tutoriais/testar-link/route.ts", "utf8");

describe("teste do link público da central", () => {
  it("exige sessão com o módulo — a rota busca URL externa", () => {
    expect(fonte).toContain('getProfileForAnyModule("marketing", "tridiflow:tutoriais")');
    expect(fonte).toContain("status: 403");
  });
  it("o endereço buscado sai do cadastro, não do pedido", () => {
    // O corpo do POST entrega só o `id`; a URL é montada aqui a partir do
    // domínio salvo. Aceitar uma URL do cliente transformaria a rota num
    // buscador de qualquer endereço (SSRF) usando a sessão de quem edita.
    expect(fonte).toContain("as { id?: string }");
    expect(fonte).toContain("const host = bot.dominioHost");
    expect(fonte).toContain("const url = `https://${host}/p/${bot.slug}`");
  });
  it("200 não basta: confere se o corpo é mesmo a central", () => {
    expect(fonte).toContain('const MARCA = "tut-central"');
    expect(fonte).toContain("corpo.includes(MARCA)");
    expect(fonte).toContain('estado: "outro-servidor"');
  });
  it("tem prazo — domínio errado trava em vez de recusar", () => {
    expect(fonte).toMatch(/AbortSignal\.timeout\(\d+\)/);
  });
});
