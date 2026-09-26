import { describe, it, expect } from "vitest";
import { atributosDe, tipoPeloRotulo } from "../campos";

/**
 * O teclado que abre no celular é decidido aqui. Errar não dá erro em lugar
 * nenhum — só faz a pessoa lutar com o aparelho, todo dia, sem saber por quê.
 */

describe("tipoPeloRotulo", () => {
  it("campo de BUSCA vence o que ele menciona", () => {
    // O erro real que estes casos travam: "Buscar por ID, cliente ou telefone…"
    // virou `type="tel"` e quem quisesse buscar pelo NOME não conseguia mais
    // digitar letras. "Buscar nome ou e-mail…" virou `type="email"` e passou a
    // REJEITAR um nome na validação. Um campo de busca aceita qualquer coisa
    // por definição — é o único que nunca pode restringir.
    expect(tipoPeloRotulo("Buscar por ID, cliente ou telefone…")).toBe("busca");
    expect(tipoPeloRotulo("Buscar nome ou e-mail…")).toBe("busca");
    expect(tipoPeloRotulo("Filtrar por valor")).toBe("busca");
  });

  it("na dúvida devolve texto — palpite errado custa mais que palpite nenhum", () => {
    // "No que o canal está focado agora" virava INTEIRO porque o padrão casava
    // o "No" inicial. Duas letras não distinguem intenção.
    expect(tipoPeloRotulo("No que o canal está focado agora")).toBe("texto");
    expect(tipoPeloRotulo("Observações")).toBe("texto");
    expect(tipoPeloRotulo("")).toBe("texto");
    expect(tipoPeloRotulo(null)).toBe("texto");
  });

  it("reconhece o que é inequívoco", () => {
    expect(tipoPeloRotulo("seu@email.com")).toBe("email");
    expect(tipoPeloRotulo("(00) 00000-0000")).toBe("telefone");
    expect(tipoPeloRotulo("R$ 0,00")).toBe("dinheiro");
    expect(tipoPeloRotulo("Código de rastreio")).toBe("codigo");
    expect(tipoPeloRotulo("Qtd")).toBe("inteiro");
    expect(tipoPeloRotulo("Nome completo")).toBe("nome");
  });
});

describe("atributosDe", () => {
  it("dinheiro NÃO usa type=number", () => {
    // `type="number"` parece a escolha óbvia e traz três armadilhas: a roda do
    // mouse altera o valor quando a pessoa só rolava a página, o Firefox aceita
    // letras dentro dele, e o separador decimal muda com a região — "5,50" pode
    // virar vazio. Texto + inputMode dá o mesmo teclado sem nenhuma delas.
    const a = atributosDe("dinheiro");
    expect(a.type).toBeUndefined();
    expect(a.inputMode).toBe("decimal");
  });

  it("e-mail pede o teclado com @ e desliga o corretor", () => {
    const a = atributosDe("email");
    expect(a.inputMode).toBe("email");
    expect(a.autoComplete).toBe("email");
    expect(a.autoCapitalize).toBe("none");
    expect(a.spellCheck).toBe(false);
  });

  it("telefone é tel, não number — tem parêntese, traço e o + do país", () => {
    expect(atributosDe("telefone").type).toBe("tel");
  });

  it("a tecla Enter promete o que vai acontecer", () => {
    expect(atributosDe("texto", { ultimo: true }).enterKeyHint).toBe("done");
    expect(atributosDe("texto", { ultimo: false }).enterKeyHint).toBe("next");
    // Busca já define a sua e não deve ser sobrescrita: ali o Enter busca,
    // esteja o campo onde estiver no formulário.
    expect(atributosDe("busca", { ultimo: false }).enterKeyHint).toBe("search");
  });

  it("senha nova pede senha NOVA ao gerenciador", () => {
    // Sem isto o gerenciador tenta preencher a senha ANTIGA num campo de troca,
    // em vez de sugerir uma forte.
    expect(atributosDe("senha").autoComplete).toBe("current-password");
    expect(atributosDe("senha", { novaSenha: true }).autoComplete).toBe("new-password");
  });
});
