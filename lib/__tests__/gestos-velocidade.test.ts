import { describe, expect, it } from "vitest";
import { projetar, rastro } from "../../app/(plataforma)/ui/gestos";

// A gaveta e o painel lateral decidem fechar por `posição + projetar(velocidade)`.
// Se a velocidade vier inflada, um encostão de 15px vira "arremesso" e a folha
// fecha sozinha — foi exatamente o que aconteceu com `Math.max(1, dt)`.
describe("velocidade do gesto", () => {
  it("dois pontos no mesmo milissegundo não viram velocidade nenhuma", () => {
    const r = rastro();
    r.anota(280, 1000);
    r.anota(265, 1000); // eventos coalescidos: mesmo carimbo de tempo
    expect(r.velocidade()).toBe(0);
  });

  it("janela curta demais não é evidência de gesto", () => {
    const r = rastro();
    r.anota(280, 1000);
    r.anota(265, 1005); // 5ms — abaixo do mínimo
    expect(r.velocidade()).toBe(0);
  });

  it("arrasto lento e curto NÃO fecha (o caso do toque acidental)", () => {
    const r = rastro();
    r.anota(280, 0);
    r.anota(272, 300);
    r.anota(265, 900); // 15px em 900ms
    const largura = 300, limiar = -largura * 0.34;
    const destino = -15 + projetar(r.velocidade());
    expect(destino).toBeGreaterThan(limiar); // não passa do limiar → volta
  });

  it("peteleco curto e rápido FECHA, mesmo sem percorrer o caminho todo", () => {
    const r = rastro();
    r.anota(280, 0);
    r.anota(230, 30);
    r.anota(200, 60); // 80px em 60ms ≈ 1333 px/s
    const largura = 300, limiar = -largura * 0.34;
    const destino = -80 + projetar(r.velocidade());
    expect(destino).toBeLessThan(limiar);
  });

  it("velocidade impossível é aparada — nenhum dedo faz 50.000 px/s", () => {
    const r = rastro();
    r.anota(1000, 0);
    r.anota(0, 20); // 1000px em 20ms = 50.000 px/s
    expect(Math.abs(r.velocidade())).toBeLessThanOrEqual(4000);
  });

  it("sem amostras suficientes devolve zero em vez de NaN", () => {
    const r = rastro();
    expect(r.velocidade()).toBe(0);
    r.anota(10, 0);
    expect(r.velocidade()).toBe(0);
  });

  it("a janela é curta: só as últimas amostras contam", () => {
    const r = rastro(3);
    r.anota(0, 0); r.anota(10, 100); r.anota(20, 200); r.anota(30, 300);
    // A primeira amostra (0,0) já saiu — a janela agora começa em (10,100).
    expect(r.velocidade()).toBeCloseTo(100, 0);
  });
});
