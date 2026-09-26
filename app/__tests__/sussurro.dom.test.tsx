import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { Sussurro } from "../Sussurro";

/**
 * O sussurro sumia quase instantaneamente e ninguém sabia por quê — porque o
 * defeito não estava no tempo de vida, estava na DISCORDÂNCIA entre dois
 * números que precisavam ser um só.
 *
 * A animação `@sussurro` tem o desaparecimento embutido (termina em opacity 0),
 * então a duração dela é a vida do elemento. Ela rodava em `.5s` enquanto o
 * componente só era removido aos 3600ms. Com os marcos internos em 22%/78%, a
 * janela LEGÍVEL era de 280ms — e depois `fill-mode: both` prendia em opacity 0
 * por mais 3,1 segundos, deixando um elemento invisível parado na tela. Medido
 * no navegador antes do conserto: opacidade já era 0 aos 564ms.
 *
 * Nenhum teste pegaria isso olhando só um dos dois lados. Por isso o que se
 * verifica aqui é o ACOPLAMENTO.
 */
afterEach(cleanup);

const egg = { titulo: "Svalbard", frase: "Quod servatur, crescit.", nota: "o que se guarda volta a crescer" };

describe("Sussurro", () => {
  it("a duração da animação é a vida — os dois não podem divergir", () => {
    const { container } = render(<Sussurro egg={egg} onFim={() => {}} vida={9000} />);
    const corpo = container.querySelector('[role="status"]') as HTMLElement;
    expect(corpo.style.animation).toContain("9000ms");
  });

  it("vida diferente move a animação junto", () => {
    const { container } = render(<Sussurro egg={egg} onFim={() => {}} vida={4200} />);
    const corpo = container.querySelector('[role="status"]') as HTMLElement;
    expect(corpo.style.animation).toContain("4200ms");
    expect(corpo.style.animation).not.toContain("500ms");
  });

  it("quem PEDIU ganha mais tempo que quem só recebeu", () => {
    // A frase da meia-noite aparece sozinha e passa. A das coordenadas foi
    // clicada — a pessoa pediu pra ver, e latim se lê devagar.
    const { container } = render(<Sussurro egg={egg} onFim={() => {}} />);
    const corpo = container.querySelector('[role="status"]') as HTMLElement;
    const ms = Number(/(\d+)ms/.exec(corpo.style.animation)?.[1]);
    expect(ms).toBeGreaterThanOrEqual(9000);
  });

  it("avisa o leitor de tela sem roubar o foco", () => {
    // `role=status` + `aria-live=polite`: é anunciado quando a pessoa terminar
    // o que está fazendo. Um detalhe decorativo nunca interrompe.
    render(<Sussurro egg={egg} onFim={() => {}} />);
    const el = screen.getByRole("status");
    expect(el.getAttribute("aria-live")).toBe("polite");
  });

  it("chama onFim ao fim da vida, não antes", () => {
    vi.useFakeTimers();
    const fim = vi.fn();
    render(<Sussurro egg={egg} onFim={fim} vida={6000} />);
    vi.advanceTimersByTime(5999);
    expect(fim).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(fim).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
