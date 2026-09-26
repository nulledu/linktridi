import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useState } from "react";
import { Campo } from "../controles";

/**
 * ── O campo recusado TREME ───────────────────────────────────────────────────
 *
 * `data-erro` já pintava a borda e escrevia a mensagem. Faltava o movimento, e
 * ele resolve um caso que a cor não resolve:
 *
 * A pessoa clica em "Salvar", um campo é inválido, a mensagem aparece. Ela
 * clica de novo sem corrigir — e a tela fica IDÊNTICA: a mesma borda vermelha,
 * o mesmo texto. A mensagem é a MESMA string, então o React não vê mudança
 * nenhuma. Sem sinal novo não há como saber se o clique chegou, e o passo
 * seguinte é clicar mais uma vez.
 *
 * É para esse caso que existe o `sinal` — um contador que o formulário
 * incrementa por tentativa. A primeira versão deste componente dependia só do
 * texto do erro e por isso NÃO tremia na segunda tentativa, que é justamente
 * quando o tremor faz falta.
 *
 * O tremor é ORTOGONAL ao tratamento: `data-erro` pinta, `.is-shaking` sacode.
 * Fundidos, a borda e o texto piscariam a cada nova tentativa.
 *
 * NÃO coberto aqui: o refluxo forçado (`void el.offsetWidth`) que reinicia a
 * animação. jsdom não tem layout nem roda animação, então a diferença entre
 * "reiniciou" e "continuou" é invisível daqui — o que dá pra afirmar é que a
 * classe é reposta, e é isso que os testes abaixo checam.
 */

function comMatchMedia(reduz: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (q: string) => ({
      matches: reduz && q.includes("prefers-reduced-motion"),
      media: q, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

/**
 * Casca que imita um formulário de verdade: "Salvar" recusa com SEMPRE a mesma
 * mensagem e incrementa o contador de tentativa — que é exatamente o que uma
 * validação de submit faz.
 */
function Formulario({ inicial }: { inicial?: string }) {
  const [erro, setErro] = useState<string | undefined>(inicial);
  const [tentativa, setTentativa] = useState(0);
  return (
    <>
      <Campo label="CNPJ" erro={erro} sinal={tentativa}><input aria-label="CNPJ" /></Campo>
      <button onClick={() => { setErro("CNPJ inválido"); setTentativa((t) => t + 1); }}>salvar</button>
      <button onClick={() => setErro("CNPJ deve ter 14 dígitos")}>outro erro</button>
      <button onClick={() => setErro(undefined)}>limpar</button>
    </>
  );
}

const campoDe = () => document.querySelector(".ui-campo") as HTMLElement;

describe("Campo · tremor de recusa", () => {
  beforeEach(() => { vi.useFakeTimers(); comMatchMedia(false); });
  afterEach(() => { vi.useRealTimers(); });

  it("nasce parado quando não há erro", () => {
    render(<Formulario />);
    expect(campoDe().className).not.toContain("is-shaking");
    expect(campoDe().getAttribute("data-erro")).toBe(null);
  });

  it("treme quando o erro aparece, e pinta a borda junto", () => {
    render(<Formulario />);
    act(() => { screen.getByText("salvar").click(); });
    expect(campoDe().className).toContain("is-shaking");
    // O tratamento continua sendo do `data-erro` — as duas coisas são separadas.
    expect(campoDe().getAttribute("data-erro")).toBe("1");
    expect(screen.getByRole("alert")).toHaveTextContent("CNPJ inválido");
  });

  it("para de tremer sozinho, sem apagar o tratamento de erro", () => {
    render(<Formulario />);
    act(() => { screen.getByText("salvar").click(); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(campoDe().className).not.toContain("is-shaking");
    // A borda vermelha e a mensagem FICAM: o erro não foi corrigido.
    expect(campoDe().getAttribute("data-erro")).toBe("1");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("treme DE NOVO na segunda tentativa, com a mensagem IDÊNTICA", () => {
    render(<Formulario />);
    act(() => { screen.getByText("salvar").click(); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(campoDe().className).not.toContain("is-shaking");

    // Sem corrigir nada: mesma mensagem, mesma borda, mesmo tudo. É o `sinal`
    // que faz o campo reagir — a primeira versão do componente olhava só o
    // texto do erro e ficava PARADA aqui, que é o defeito que este caso trava.
    act(() => { screen.getByText("salvar").click(); });
    expect(screen.getByRole("alert")).toHaveTextContent("CNPJ inválido");
    expect(campoDe().className).toContain("is-shaking");
  });

  it("treme quando a mensagem MUDA, mesmo sem o sinal mudar", () => {
    render(<Formulario />);
    act(() => { screen.getByText("salvar").click(); });
    act(() => { vi.advanceTimersByTime(500); });
    act(() => { screen.getByText("outro erro").click(); });
    expect(campoDe().className).toContain("is-shaking");
  });

  it("re-render sem novidade NÃO sacode", () => {
    render(<Formulario />);
    act(() => { screen.getByText("salvar").click(); });
    act(() => { vi.advanceTimersByTime(500); });
    // Mesmo erro, mesmo sinal: um re-render por outro motivo não pode virar
    // tremor, senão o campo treme sozinho enquanto a pessoa digita noutro lugar.
    act(() => { screen.getByText("outro erro").click(); });
    act(() => { vi.advanceTimersByTime(500); });
    act(() => { screen.getByText("outro erro").click(); });
    expect(campoDe().className).not.toContain("is-shaking");
  });

  it("quem pediu menos movimento recebe o tratamento, não o tremor", () => {
    comMatchMedia(true);
    render(<Formulario />);
    act(() => { screen.getByText("salvar").click(); });
    expect(campoDe().className).not.toContain("is-shaking");
    // Menos movimento não é menos INFORMAÇÃO: a borda e a mensagem continuam.
    expect(campoDe().getAttribute("data-erro")).toBe("1");
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
