// @vitest-environment jsdom
//
// O teclado da Operação escreve num campo que NÃO é dele.
//
// Todo o valor deste componente está em quatro comportamentos que não se veem
// olhando a tela — e cujas falhas se parecem com "o teclado não funciona":
// escrever de um jeito que o React perceba, não roubar o foco do campo (senão a
// pistola de código para junto), calar o teclado do sistema, e sumir quando não
// há onde escrever. Um refactor inocente quebra qualquer um deles em silêncio.

import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TecladoNaTela } from "../TecladoNaTela";

/**
 * Um campo CONTROLADO, como os das telas do Estoque.
 *
 * Controlado de propósito: é a única forma de provar a armadilha do setter. Num
 * campo não controlado, escrever direto em `el.value` "funcionaria" e o teste
 * passaria enquanto a tela de verdade continuaria quebrada.
 */
function Cena({ onSubmit }: { onSubmit?: () => void }) {
  const [v, setV] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}>
      <input aria-label="Código" value={v} onChange={(e) => setV(e.target.value)} inputMode="numeric" />
      <output>{v}</output>
      <TecladoNaTela />
    </form>
  );
}

function tecla(nome: string) {
  return screen.getByRole("button", { name: nome });
}

describe("teclado na tela", () => {
  it("escreve no campo focado, e o React enxerga o texto", () => {
    render(<Cena />);
    const campo = screen.getByLabelText("Código") as HTMLInputElement;
    act(() => campo.focus());

    fireEvent.click(tecla("1"));
    fireEvent.click(tecla("2"));

    // O `<output>` mostra o ESTADO, não o DOM: se o React não tivesse recebido
    // as teclas, ele estaria vazio com o campo escrito — o defeito silencioso.
    expect(screen.getByText("12")).toBeTruthy();
    expect(campo.value).toBe("12");
  });

  it("não rouba o foco do campo — é o que mantém a pistola funcionando", () => {
    render(<Cena />);
    const campo = screen.getByLabelText("Código") as HTMLInputElement;
    act(() => campo.focus());

    // `Event` e não `PointerEvent`: o jsdom não implementa a segunda classe, e
    // o que está sendo medido é o `preventDefault` do handler — que não olha
    // nada além do tipo do evento.
    const ev = new Event("pointerdown", { bubbles: true, cancelable: true });
    tecla("1").dispatchEvent(ev);

    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(campo);
  });

  it("apaga o último caractere", () => {
    render(<Cena />);
    const campo = screen.getByLabelText("Código") as HTMLInputElement;
    act(() => campo.focus());

    fireEvent.click(tecla("1"));
    fireEvent.click(tecla("2"));
    fireEvent.click(tecla("Apagar"));

    expect(campo.value).toBe("1");
  });

  it("cala o teclado do sistema enquanto está no ar, e devolve o atributo depois", () => {
    const { unmount } = render(<Cena />);
    const campo = screen.getByLabelText("Código") as HTMLInputElement;
    act(() => campo.focus());

    // Dois teclados abertos ao mesmo tempo é o defeito que este atributo evita.
    expect(campo.getAttribute("inputmode")).toBe("none");

    unmount();
    // E o campo volta a ser o que era: ele pertence a outra tela, que continua
    // servindo o Estoque com o teclado numérico do aparelho.
    expect(campo.getAttribute("inputmode")).toBe("numeric");
  });

  it("Confirmar envia o formulário", () => {
    const enviou = vi.fn();
    render(<Cena onSubmit={enviou} />);
    act(() => (screen.getByLabelText("Código") as HTMLInputElement).focus());

    fireEvent.click(tecla("1"));
    fireEvent.click(screen.getByRole("button", { name: /Confirmar/ }));

    expect(enviou).toHaveBeenCalledTimes(1);
  });

  it("sem campo focado não existe teclado nenhum", () => {
    render(<Cena />);
    // Nada focado: o teclado ocuparia um terço da tela oferecendo teclas que
    // não escrevem em lugar nenhum.
    expect(screen.queryByRole("group", { name: "Teclado na tela" })).toBeNull();
  });

  it("campo numérico abre direto no bloco de números", () => {
    render(<Cena />);
    act(() => (screen.getByLabelText("Código") as HTMLInputElement).focus());

    // O campo declara `inputMode="numeric"`: quem vai digitar um código não
    // deve precisar de um toque em "123" antes de cada leitura.
    expect(screen.getByRole("button", { name: "ABC" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "q" })).toBeNull();
  });
});

describe("a letra sai no toque, não na soltura", () => {
  /*
   * Digitar rápido é soltar uma tecla enquanto o dedo já desce na próxima. Com
   * o commit no `click` (que só chega no levantar do dedo), a letra fica atrás
   * da mão e o teclado parece engasgar — sem nenhuma lentidão real.
   */
  it("o pointerdown já escreve", () => {
    render(<Cena />);
    const campo = screen.getByLabelText("Código") as HTMLInputElement;
    act(() => campo.focus());

    fireEvent.pointerDown(tecla("1"));

    expect(campo.value).toBe("1");
  });

  it("toque seguido de clique escreve UMA vez", () => {
    // O navegador manda os dois pelo mesmo toque. Sem a trava, cada tecla
    // sairia dobrada — e "11" num código de etiqueta não se percebe olhando.
    render(<Cena />);
    const campo = screen.getByLabelText("Código") as HTMLInputElement;
    act(() => campo.focus());

    fireEvent.pointerDown(tecla("1"));
    fireEvent.click(tecla("1"));

    expect(campo.value).toBe("1");
  });

  it("o caminho do clique sozinho continua valendo", () => {
    // É por ele que passam o teclado físico e o leitor de tela: Enter num botão
    // dispara `click` sem `pointerdown` nenhum.
    render(<Cena />);
    const campo = screen.getByLabelText("Código") as HTMLInputElement;
    act(() => campo.focus());

    fireEvent.click(tecla("1"));

    expect(campo.value).toBe("1");
  });
});
