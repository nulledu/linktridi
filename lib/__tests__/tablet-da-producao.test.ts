import { describe, expect, it } from "vitest";
import { escolherTabletDaProducao } from "../tablet-da-producao";

// Sem o seletor "Onde cai" no PC, a atividade dirigida nascia mesa_alvo=null
// ("só no sistema") e nunca tocava no tablet. O servidor escolhe sozinho.
describe("escolherTabletDaProducao", () => {
  it("prefere o tablet do setor Produção, ignorando o do ponto", () => {
    expect(escolherTabletDaProducao([
      { nome_mesa: "Ponto", setor: "Produção", tipo: "ponto" },
      { nome_mesa: "Logística", setor: "Logística" },
      { nome_mesa: "Produção", setor: "Produção" },
    ])).toBe("Produção");
  });
  it("sem setor marcado, usa o único ativo", () => {
    expect(escolherTabletDaProducao([{ nome_mesa: "Mesa 1", setor: null }])).toBe("Mesa 1");
  });
  it("vários sem desempate → null (não chuta)", () => {
    expect(escolherTabletDaProducao([{ nome_mesa: "A" }, { nome_mesa: "B" }])).toBeNull();
  });
});
