import { describe, it, expect } from "vitest";
import {
  caminhoProduto, descontoPercentual, idDoCaminho, lerValor, lucroDe, margemDe,
  precoVigente, slugDe, urlDaLoja, validarProduto, valorParaCampo, type Loja,
} from "../lojas";

// O que se testa aqui é o que o formulário de produto NÃO pode errar em
// silêncio: ler o que a pessoa digitou num campo de dinheiro, e dizer a
// verdade sobre lucro e margem. Errar isso não quebra a tela — publica um
// produto com o preço errado.

describe("lerValor — o campo de dinheiro é texto, não number", () => {
  it("lê o formato brasileiro", () => {
    expect(lerValor("89,90")).toBe(89.9);
    expect(lerValor("R$ 1.234,56")).toBe(1234.56);
    expect(lerValor("1.000,00")).toBe(1000);
    expect(lerValor("0,5")).toBe(0.5);
  });

  it("lê o ponto como decimal quando NÃO é separador de milhar", () => {
    // Quem tem teclado numérico americano digita "89.90" o dia inteiro. Tratar
    // o ponto como milhar aqui lançaria um produto de R$ 8.990 — o erro caro.
    expect(lerValor("89.90")).toBe(89.9);
    expect(lerValor("1234.56")).toBe(1234.56);
    expect(lerValor("0.5")).toBe(0.5);
  });

  it("trata o ponto como milhar só no formato de milhar", () => {
    expect(lerValor("1.234")).toBe(1234);
    expect(lerValor("12.345.678")).toBe(12345678);
    // Quatro casas depois do ponto não é milhar nenhum.
    expect(lerValor("1.2345")).toBe(1.2345);
  });

  it("com vírgula, a vírgula manda e o ponto é milhar", () => {
    expect(lerValor("1.234.567,89")).toBe(1234567.89);
  });

  it("devolve null para vazio e para o que não é número", () => {
    expect(lerValor("")).toBeNull();
    expect(lerValor("   ")).toBeNull();
    expect(lerValor("abc")).toBeNull();
    expect(lerValor("R$")).toBeNull();
  });

  it("volta pro campo no formato que a pessoa espera", () => {
    expect(valorParaCampo(89.9)).toBe("89,90");
    expect(valorParaCampo(null)).toBe("");
    expect(lerValor(valorParaCampo(1234.56))).toBe(1234.56);
  });
});

describe("preço vigente, desconto, lucro e margem", () => {
  const base = { preco: 157.9, precoPromocional: 115.9, custo: 48.2 };

  it("quem manda é o promocional, quando de fato desconta", () => {
    expect(precoVigente(base)).toBe(115.9);
    expect(precoVigente({ preco: 157.9, precoPromocional: null })).toBe(157.9);
    // Promocional maior que o preço não é promoção: o cliente paga o de sempre.
    expect(precoVigente({ preco: 100, precoPromocional: 120 })).toBe(100);
    expect(precoVigente({ preco: 100, precoPromocional: 0 })).toBe(100);
  });

  it("desconto sai arredondado, como a vitrine mostra", () => {
    expect(descontoPercentual(base)).toBe(27);
    expect(descontoPercentual({ preco: 157.9, precoPromocional: null })).toBeNull();
    expect(descontoPercentual({ preco: 100, precoPromocional: 100 })).toBeNull();
  });

  it("lucro e margem saem do preço que o cliente PAGA, não do 'de'", () => {
    // O ponto: com promoção ativa, calcular margem sobre o preço cheio é o
    // painel mentindo pra quem está decidindo o preço.
    expect(lucroDe(base)).toBeCloseTo(67.7, 2);
    expect(margemDe(base)).toBeCloseTo(58.41, 2);

    const semPromo = { preco: 157.9, precoPromocional: null, custo: 48.2 };
    expect(lucroDe(semPromo)).toBeCloseTo(109.7, 2);
    expect(margemDe(semPromo)).toBeCloseTo(69.47, 2);
  });

  it("sem custo não há margem — e liquidação abaixo do custo dá negativo", () => {
    expect(lucroDe({ preco: 100, precoPromocional: null, custo: null })).toBeNull();
    expect(margemDe({ preco: 100, precoPromocional: null, custo: null })).toBeNull();
    expect(lucroDe({ preco: 40, precoPromocional: null, custo: 50 })).toBe(-10);
    expect(margemDe({ preco: 40, precoPromocional: null, custo: 50 })).toBeCloseTo(-25, 2);
  });
});

describe("validarProduto — o que impede salvar", () => {
  const ok = { titulo: "Carimbo Personalizado", preco: 89.9, precoPromocional: null, custo: 30, estoque: 10 };

  it("um produto completo passa", () => {
    expect(validarProduto(ok)).toEqual({});
  });

  it("exige nome e preço de verdade", () => {
    expect(validarProduto({ ...ok, titulo: "  " }).titulo).toBeTruthy();
    expect(validarProduto({ ...ok, titulo: "ab" }).titulo).toBeTruthy();
    expect(validarProduto({ ...ok, preco: null }).preco).toBeTruthy();
    expect(validarProduto({ ...ok, preco: 0 }).preco).toBeTruthy();
    expect(validarProduto({ ...ok, preco: -5 }).preco).toBeTruthy();
  });

  it("promocional maior ou igual ao preço não é promoção", () => {
    expect(validarProduto({ ...ok, precoPromocional: 99.9 }).precoPromocional).toBeTruthy();
    expect(validarProduto({ ...ok, precoPromocional: 89.9 }).precoPromocional).toBeTruthy();
    expect(validarProduto({ ...ok, precoPromocional: 59.9 }).precoPromocional).toBeUndefined();
  });

  it("estoque é inteiro e não é negativo — mas zero é válido", () => {
    expect(validarProduto({ ...ok, estoque: 0 }).estoque).toBeUndefined();
    expect(validarProduto({ ...ok, estoque: -1 }).estoque).toBeTruthy();
    expect(validarProduto({ ...ok, estoque: 2.5 }).estoque).toBeTruthy();
    expect(validarProduto({ ...ok, estoque: null }).estoque).toBeTruthy();
  });

  it("custo acima da venda NÃO impede salvar", () => {
    // Liquidação abaixo do custo existe. A tela mostra a margem em vermelho e
    // deixa a pessoa decidir — barrar aqui seria o sistema achando que sabe
    // mais que o dono do preço.
    expect(validarProduto({ ...ok, custo: 200 })).toEqual({});
  });
});

describe("endereço da loja", () => {
  const loja = (dominio: string | null): Loja => ({
    id: "x", nome: "Carimbos Tridi", slug: "carimbos-tridi", dominio,
    status: "publicada", checkout: "nenhum", whatsapp: "",
    cor: "var(--primary-texto)", criadaEm: "2026-02-11T09:00:00.000Z",
  });

  it("usa o domínio próprio quando existe, e o padrão quando não", () => {
    expect(urlDaLoja(loja("carimbostridi.com.br"))).toBe("https://carimbostridi.com.br");
    expect(urlDaLoja(loja(null))).toBe("https://tridigaius.vercel.app/l/carimbos-tridi");
  });

  it("endereço do produto leva o título na frente e o id no fim", () => {
    const p = { id: "3f7c1e2a-8b4d-4c9e-a1f0-9d2b6e5c7a41", titulo: "Carimbo de Cera — Sinete" };
    const caminho = caminhoProduto(p);
    expect(caminho).toBe(`carimbo-de-cera-sinete-${p.id}`);
    // Quem resolve é o ID: renomear o produto não quebra o link antigo.
    expect(idDoCaminho(caminho)).toBe(p.id);
    expect(idDoCaminho(caminhoProduto({ ...p, titulo: "Outro nome" }))).toBe(p.id);
  });

  it("produto sem título utilizável ainda tem endereço", () => {
    const p = { id: "3f7c1e2a-8b4d-4c9e-a1f0-9d2b6e5c7a41", titulo: "!!!" };
    expect(caminhoProduto(p)).toBe(p.id);
    expect(idDoCaminho(p.id)).toBe(p.id);
  });

  it("caminho que não termina em id devolve null em vez de consultar à toa", () => {
    expect(idDoCaminho("carimbo-de-cera")).toBeNull();
    expect(idDoCaminho("")).toBeNull();
    expect(idDoCaminho("../../etc/passwd")).toBeNull();
    // 36 caracteres que não são um uuid não podem passar por um.
    expect(idDoCaminho("x".repeat(36))).toBeNull();
  });

  it("slug tira acento, espaço e pontuação", () => {
    expect(slugDe("Carimbo de Cera — Sinete")).toBe("carimbo-de-cera-sinete");
    expect(slugDe("Ateliê Terra Nova")).toBe("atelie-terra-nova");
    expect(slugDe("  ")).toBe("");
  });
});
