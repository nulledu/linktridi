// A fila de salvar em segundo plano decide, por resposta, entre "deu certo",
// "tenta de novo" e "recusado". Errar a classificação custa caro nos dois
// sentidos: tratar recusa como falha de rede reenvia pra sempre um pedido que
// o servidor nunca vai aceitar; tratar falha de rede como recusa JOGA FORA a
// mudança que a pessoa achou que tinha salvado.
import { describe, it, expect, vi } from "vitest";

vi.mock("../../app/(plataforma)/Toast", () => ({ toast: Object.assign(() => {}, { ok: () => {}, erro: () => {}, info: () => {} }) }));

const { destinoDaResposta, esperaDaTentativa } = await import("../../app/(plataforma)/ui/salvarEmSegundoPlano");

describe("destinoDaResposta", () => {
  it("2xx com JSON é sucesso", () => {
    expect(destinoDaResposta(200, true)).toBe("ok");
    expect(destinoDaResposta(204, true)).toBe("ok");
  });
  it("200 com HTML é a tela de login: sessão expirada, NUNCA sucesso", () => {
    expect(destinoDaResposta(200, false)).toBe("sessao");
    expect(destinoDaResposta(401, true)).toBe("sessao");
  });
  it("sem resposta, 5xx, 408 e 429 ficam guardados pra tentar de novo", () => {
    for (const s of [null, 500, 502, 503, 504, 408, 425, 429]) expect(destinoDaResposta(s, true)).toBe("tentar_de_novo");
  });
  it("4xx de validação/conflito é recusa — repetir daria a mesma resposta", () => {
    for (const s of [400, 403, 404, 409, 422]) expect(destinoDaResposta(s, true)).toBe("recusado");
  });
});

describe("esperaDaTentativa", () => {
  it("começa em 2s e dobra até 1 minuto", () => {
    expect(esperaDaTentativa(1)).toBe(2_000);
    expect(esperaDaTentativa(2)).toBe(4_000);
    expect(esperaDaTentativa(5)).toBe(32_000);
    expect(esperaDaTentativa(6)).toBe(60_000);
    expect(esperaDaTentativa(40)).toBe(60_000);
  });
});
