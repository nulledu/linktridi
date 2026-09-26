import { describe, it, expect } from "vitest";
import { centavosDeReais, centavosDoTexto, reaisDeCentavos, reaisInteirosDoTexto, textoDeCentavos, textoDeReaisInteiros } from "../tridimarket/moeda";

// É um campo de LANÇAR PAGAMENTO: digitar 1250 e cobrar R$ 1.250,00 em vez de
// R$ 12,50 é o tipo de erro que só aparece na conciliação, dias depois.
//
// O Intl separa "R$" do número com espaço NÃO-QUEBRÁVEL (U+00A0), que na tela é
// idêntico a um espaço comum. Comparar com espaço normal faz o teste falhar
// exibindo duas strings visualmente iguais — daí a normalização.
const exibido = (centavos: number) => textoDeCentavos(centavos).replace(/\u00a0/g, " ");
const digitando = (teclas: string) => exibido(centavosDoTexto(teclas));

describe("campo de dinheiro", () => {
  it("os dígitos entram pela direita, em centavos", () => {
    expect(digitando("1")).toBe("R$ 0,01");
    expect(digitando("12")).toBe("R$ 0,12");
    expect(digitando("125")).toBe("R$ 1,25");
    expect(digitando("1250")).toBe("R$ 12,50");
  });

  it("ignora o que não é dígito, venha de onde vier", () => {
    // Colar "R$ 1.250,00" tem que dar o mesmo que digitar 125000.
    expect(centavosDoTexto("R$ 1.250,00")).toBe(125000);
    expect(centavosDoTexto("abc")).toBe(0);
    expect(centavosDoTexto("")).toBe(0);
  });

  it("zeros à esquerda não enchem o campo", () => {
    expect(centavosDoTexto("007")).toBe(7);
    expect(digitando("007")).toBe("R$ 0,07");
  });

  it("campo zerado aparece VAZIO, não R$ 0,00", () => {
    // Um campo que já vem com zero obriga a apagar antes de digitar.
    expect(textoDeCentavos(0)).toBe("");
    expect(textoDeCentavos(-5)).toBe("");
  });

  it("converte para reais sem sobra de ponto flutuante", () => {
    expect(reaisDeCentavos(1250)).toBe(12.5);
    expect(reaisDeCentavos(1)).toBe(0.01);
    // 0.1 + 0.2 !== 0.3 em float; em centavos o problema não existe.
    expect(reaisDeCentavos(centavosDeReais(0.1) + centavosDeReais(0.2))).toBe(0.3);
  });

  it("preenche a partir de um saldo existente (botão quitar tudo)", () => {
    expect(centavosDeReais(37.9)).toBe(3790);
    expect(exibido(centavosDeReais(37.9))).toBe("R$ 37,90");
    expect(centavosDeReais(0)).toBe(0);
  });

  it("segurar a tecla não estoura o número", () => {
    const muitos = "9".repeat(40);
    expect(Number.isSafeInteger(centavosDoTexto(muitos))).toBe(true);
  });
});

// Limite de crédito NÃO é um campo de dinheiro. Ele reusava a máscara de
// centavos acima, então quem digitava 100 — o número que a pessoa tem na
// cabeça — liberava R$ 1,00 e só descobria quando o tablet barrava a compra.
// Mesma normalização do espaço não-quebrável usada no campo de dinheiro acima.
const semNbsp = (s: string) => s.replace(/\u00a0/g, " ");
const limite = (teclas: string) => semNbsp(textoDeReaisInteiros(reaisInteirosDoTexto(teclas)));

describe("campo de limite", () => {
  it("cada dígito vale UM REAL", () => {
    expect(reaisInteirosDoTexto("100")).toBe(100);
    expect(limite("50")).toBe("R$ 50");
    expect(limite("100")).toBe("R$ 100");
    expect(limite("1500")).toBe("R$ 1.500");
  });

  it("não mostra centavo nenhum — limite é 50, 100, 150", () => {
    expect(textoDeReaisInteiros(500)).not.toContain(",");
  });

  it("o que o campo mostra volta valendo o mesmo", () => {
    // O valor exibido é reinjetado a cada tecla; se o separador de milhar
    // virasse dígito o limite subiria sozinho a cada digitação.
    expect(reaisInteirosDoTexto(textoDeReaisInteiros(1500))).toBe(1500);
    expect(reaisInteirosDoTexto(textoDeReaisInteiros(500))).toBe(500);
  });

  it("apagar um dígito tira uma casa, não muda de ordem", () => {
    // "R$ 1.500" com um backspace é "R$ 1.50" na tela — tem que virar R$ 150.
    expect(limite("R$ 1.50")).toBe("R$ 150");
  });

  it("limite legado com centavo arredonda em vez de sumir", () => {
    expect(textoDeReaisInteiros(137.42).replace(/\u00a0/g, " ")).toBe("R$ 137");
    expect(textoDeReaisInteiros(0.5).replace(/\u00a0/g, " ")).toBe("R$ 1");
  });

  it("campo zerado aparece vazio", () => {
    expect(textoDeReaisInteiros(0)).toBe("");
    expect(textoDeReaisInteiros(-1)).toBe("");
    expect(reaisInteirosDoTexto("")).toBe(0);
  });

  it("segurar a tecla não estoura o número", () => {
    expect(Number.isSafeInteger(reaisInteirosDoTexto("9".repeat(40)))).toBe(true);
  });
});
