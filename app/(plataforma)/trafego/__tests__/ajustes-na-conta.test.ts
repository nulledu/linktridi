import { describe, expect, it } from "vitest";
import { decidir, ehAjusteTridify } from "../ajustes-na-conta";

const EU = "11111111-2222-3333-4444-555555555555";
const OUTRO = "99999999-2222-3333-4444-555555555555";

describe("personalização da Tridify segue a conta", () => {
  it("navegador novo adota o que está na conta", () => {
    expect(decidir({ em: null, temAlgo: false }, { em: 10, itens: {} })).toBe("adotar");
  });
  it("conta vazia recebe o layout que o aparelho já tinha", () => {
    expect(decidir({ em: null, temAlgo: true }, null)).toBe("subir");
    expect(decidir({ em: null, temAlgo: false }, null)).toBe("nada");
  });
  it("troca pendente deste aparelho vence e sobe", () => {
    expect(decidir({ em: "pendente", temAlgo: true }, { em: 99, itens: {} })).toBe("subir");
  });
  it("conta mais nova vence; cópia igual ou mais nova fica", () => {
    expect(decidir({ em: "5", temAlgo: true }, { em: 10, itens: {} })).toBe("adotar");
    expect(decidir({ em: "10", temAlgo: true }, { em: 10, itens: {} })).toBe("nada");
  });
  it("sem sessão não mexe em nada", () => {
    expect(decidir({ em: "pendente", temAlgo: true }, undefined)).toBe("nada");
  });
  it("só leva chaves da Tridify e da própria pessoa", () => {
    expect(ehAjusteTridify(`trafego.painel.${EU}`, EU)).toBe(true);
    expect(ehAjusteTridify(`trafego.painel.${OUTRO}`, EU)).toBe(false);
    expect(ehAjusteTridify("tridify:com-imposto", EU)).toBe(true);
    expect(ehAjusteTridify("trafego.tab", EU)).toBe(false);
    expect(ehAjusteTridify("theme", EU)).toBe(false);
  });
});
