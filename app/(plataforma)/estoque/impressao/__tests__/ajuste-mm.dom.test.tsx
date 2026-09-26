import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { AjusteMm } from "../AjusteMm";

// ── "Não tá dando pra ajustar pelo teclado" ──────────────────────────────────
//
// Era literal: o ajuste de altura era só um par de botões +/−, e no tablet o
// passo era de 5 em 5 — as alturas intermediárias existiam no layout e nenhuma
// era alcançável pela interface. Aqui, atravessar de 10 a 80mm custava setenta
// toques.
//
// O que este teste guarda é o comportamento que quase se quebra sozinho num
// campo controlado: digitar um número PARCIAL não pode ser corrigido embaixo do
// dedo. Quem vai digitar "48" passa por "4", e se "4" virasse 25 na hora (o
// mínimo), o campo se reescreveria no meio da digitação e o segundo dígito
// cairia no lugar errado.
//
// jsdom não tem layout: alvo de toque e rolagem não se medem aqui (ver
// `testes-de-componente`). O que se mede é a aritmética e o que o campo aceita.

function Palco({ inicial = 15, min = 10, max = 80 }: { inicial?: number; min?: number; max?: number }) {
  const [v, setV] = useState(inicial);
  return (
    <>
      <AjusteMm id="teste" rotulo="Altura da etiqueta" valor={v} min={min} max={max} onMuda={setV} />
      <output data-testid="valor">{v}</output>
    </>
  );
}

const campo = () => screen.getByLabelText("Altura da etiqueta") as HTMLInputElement;
const valor = () => screen.getByTestId("valor").textContent;

// ── O teste que faltava: TECLAR, não `change` com a string pronta ───────────
//
// Os casos abaixo usam `fireEvent.change` com o valor FINAL ("48"), e por isso
// deixaram passar um campo em que nada se digitava. A sequência de um navegador
// de verdade é outra: cada tecla dispara um `change` com o texto ATUAL do
// campo, e num campo controlado o texto atual é o que o React acabou de
// reescrever. Se o dígito parcial for descartado em vez de guardado, a segunda
// tecla não cai em "48" — cai em "728", e o campo nunca sai do lugar.
//
// `userEvent.keyboard` reproduz essa sequência. É a diferença entre testar a
// aritmética e testar o que a pessoa consegue fazer com o dedo.
describe("AjusteMm — dá pra DIGITAR, tecla por tecla", () => {
  it("teclar 4 e 8 chega em 48, mesmo com o mínimo em 25", async () => {
    // O primeiro dígito de QUALQUER número está abaixo do mínimo (10 na altura,
    // 25 na largura). Era esse o bug: "4" era recusado, o campo voltava pra
    // "72" e o "8" caía em "728", também recusado. Resultado: o campo aceitava
    // seta e +/− e recusava o teclado — exatamente o relato que ele veio
    // atender.
    const u = userEvent.setup();
    render(<Palco inicial={72} min={25} max={72} />);
    await u.click(campo());
    await u.keyboard("48");
    expect(campo().value, "o que a pessoa teclou tem de continuar na tela").toBe("48");
    expect(valor()).toBe("48");
  });

  it("teclar 3 e 0 chega em 30, com o mínimo em 10", async () => {
    const u = userEvent.setup();
    render(<Palco inicial={15} />);
    await u.click(campo());
    await u.keyboard("30");
    expect(campo().value).toBe("30");
    expect(valor()).toBe("30");
  });

  it("o dígito parcial fica VISÍVEL sem mexer no valor de verdade", async () => {
    // "4" a caminho de "48" aparece no campo (senão não dá pra digitar) e não
    // empurra a prévia pra 25 (senão a etiqueta pisca num tamanho que ninguém
    // escolheu). As duas coisas ao mesmo tempo é o ponto do rascunho.
    const u = userEvent.setup();
    render(<Palco inicial={72} min={25} max={72} />);
    await u.click(campo());
    await u.keyboard("4");
    expect(campo().value).toBe("4");
    expect(valor(), "a etiqueta não muda por causa de um dígito solto").toBe("72");
  });

  it("valor vindo de FORA apaga o rascunho — o campo não mente", async () => {
    // Atalho de tamanho, +/− e "voltar ao padrão" mudam `valor` por fora. Se o
    // rascunho sobrevivesse, o campo mostraria "4" enquanto a etiqueta já está
    // desenhada em 71mm.
    //
    // A seta é o gesto certo pra provar isso: ela muda o valor SEM tirar o foco
    // do campo, então o rascunho tem de morrer por decisão e não porque o
    // `blur` passou por cima.
    const u = userEvent.setup();
    render(<Palco inicial={72} min={25} max={72} />);
    await u.click(campo());
    await u.keyboard("4");
    expect(campo().value).toBe("4");

    await u.keyboard("{ArrowDown}");
    expect(valor()).toBe("71");
    expect(campo().value, "o rascunho não pode sobreviver ao valor mudar por fora").toBe("71");
  });

  it("sair do campo com um dígito solto prende na faixa, sem desfazer nada", async () => {
    // Tocar o "−" tira o foco antes de decrementar, então o rascunho "4" vira
    // 25 (o mínimo) no `blur` e SÓ DEPOIS o botão age. O resultado é o mínimo,
    // não 71 — e está certo: a pessoa deixou um 4 escrito no campo, e 4mm de
    // etiqueta não existe.
    const u = userEvent.setup();
    render(<Palco inicial={72} min={25} max={72} />);
    await u.click(campo());
    await u.keyboard("4");
    await u.click(screen.getByRole("button", { name: /Diminuir/ }));
    expect(valor()).toBe("25");
    expect(campo().value).toBe("25");
  });
});

describe("AjusteMm — o campo que faltava", () => {
  it("digitar o número chega nele direto, sem setenta toques", () => {
    render(<Palco />);
    fireEvent.change(campo(), { target: { value: "47" } });
    expect(valor()).toBe("47");
  });

  it("o dígito parcial NÃO é corrigido embaixo do dedo", () => {
    // Quem digita "48" passa por "4". Prender "4" em 10 na hora reescreveria o
    // campo no meio da digitação, e o "8" cairia depois de um valor que a
    // pessoa não escolheu.
    render(<Palco inicial={15} />);
    fireEvent.change(campo(), { target: { value: "4" } });
    expect(valor()).toBe("15");
    fireEvent.change(campo(), { target: { value: "48" } });
    expect(valor()).toBe("48");
  });

  it("mas ao SAIR do campo o que sobrou é preso na faixa", () => {
    // A correção acontece — depois que a pessoa terminou de falar.
    render(<Palco inicial={15} />);
    fireEvent.change(campo(), { target: { value: "4" } });
    fireEvent.blur(campo(), { target: { value: "4" } });
    expect(valor()).toBe("10");

    fireEvent.change(campo(), { target: { value: "900" } });
    fireEvent.blur(campo(), { target: { value: "900" } });
    expect(valor()).toBe("80");
  });

  it("campo esvaziado volta ao valor anterior, nunca a zero", () => {
    // Uma etiqueta de 0mm não existe, e um campo em branco não é um pedido —
    // é alguém a meio caminho de digitar outra coisa e desistindo.
    render(<Palco inicial={30} />);
    fireEvent.change(campo(), { target: { value: "" } });
    fireEvent.blur(campo(), { target: { value: "" } });
    expect(valor()).toBe("30");
  });

  it("letra e vírgula não entram — milímetro aqui é inteiro", () => {
    render(<Palco inicial={30} />);
    fireEvent.change(campo(), { target: { value: "4x5" } });
    expect(valor()).toBe("45");
  });

  it("o passo é de 1mm, e as setas do teclado andam junto", () => {
    // 5 em 5 era o passo do tablet, e ele tornava inalcançável toda altura que
    // não fosse múltipla de 5 — inclusive as que o layout trata de forma
    // diferente e avisa a respeito.
    render(<Palco inicial={15} />);
    fireEvent.click(screen.getByTitle("Aumentar altura da etiqueta"));
    expect(valor()).toBe("16");
    fireEvent.click(screen.getByTitle("Diminuir altura da etiqueta"));
    expect(valor()).toBe("15");

    fireEvent.keyDown(campo(), { key: "ArrowUp" });
    expect(valor()).toBe("16");
    fireEvent.keyDown(campo(), { key: "ArrowDown" });
    fireEvent.keyDown(campo(), { key: "ArrowDown" });
    expect(valor()).toBe("14");
  });

  it("nas pontas da faixa o botão apaga em vez de passar do limite", () => {
    render(<Palco inicial={80} />);
    expect(screen.getByTitle("Aumentar altura da etiqueta")).toBeDisabled();
    expect(screen.getByTitle("Diminuir altura da etiqueta")).not.toBeDisabled();
  });

  it("a faixa fica escrita — o limite não pode ser descoberto por tentativa", () => {
    render(<Palco min={25} max={72} />);
    expect(screen.getByText("de 25 a 72mm")).toBeTruthy();
  });
});
