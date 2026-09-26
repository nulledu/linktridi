import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ForcaDaSenha, REGRAS_PADRAO } from "../ForcaDaSenha";

afterEach(cleanup);

// TRAVA do medidor consultivo. Ele NÃO é porteiro (o piso de 8 mora no
// servidor), mas precisa contar a verdade: score, rótulo e regras têm que
// andar juntos, e padrão batido não pode passar por "forte".

function medidor() {
  return screen.getByRole("meter");
}
function regrasAtendidas() {
  return document.querySelectorAll('.fs-regra[data-ok="1"]').length;
}

describe("ForcaDaSenha", () => {
  it("campo vazio: score 0, sem rótulo, nenhuma regra atendida", () => {
    render(<ForcaDaSenha value="" />);
    expect(medidor().getAttribute("aria-valuenow")).toBe("0");
    expect(medidor().getAttribute("aria-valuemax")).toBe(String(REGRAS_PADRAO.length));
    expect(medidor().getAttribute("aria-valuetext")).toBe("Vazia");
    expect(regrasAtendidas()).toBe(0);
    expect(document.querySelector(".fs-rotulo")?.textContent).toBe("");
  });

  it("só o comprimento (e nada batido): Fraca, uma regra", () => {
    render(<ForcaDaSenha value="montanhaverde" />);
    expect(medidor().getAttribute("aria-valuenow")).toBe("1");
    expect(medidor().getAttribute("aria-valuetext")).toBe("Fraca");
    expect(regrasAtendidas()).toBe(1);
    expect(screen.queryByText("Fácil de adivinhar")).toBeNull();
  });

  it("tudo atendido e sem padrão batido: Forte, quatro regras", () => {
    render(<ForcaDaSenha value="Montanha7Verde!" />);
    expect(medidor().getAttribute("aria-valuenow")).toBe(String(REGRAS_PADRAO.length));
    expect(medidor().getAttribute("aria-valuetext")).toBe("Forte");
    expect(regrasAtendidas()).toBe(REGRAS_PADRAO.length);
    expect(screen.queryByText("Fácil de adivinhar")).toBeNull();
  });

  it("padrão batido cai para Fraca mesmo passando em regras", () => {
    // "Senha123!" atende maiúscula/minúscula, número e símbolo — mas começa com
    // "senha", então é a primeira que qualquer um tenta.
    render(<ForcaDaSenha value="Senha123!" />);
    expect(medidor().getAttribute("aria-valuenow")).toBe("1");
    expect(medidor().getAttribute("aria-valuetext")).toBe("Fraca");
    expect(screen.getByText("Fácil de adivinhar")).toBeTruthy();
  });

  it("mostrarRegras=false esconde a lista mas mantém o medidor", () => {
    render(<ForcaDaSenha value="abc" mostrarRegras={false} />);
    expect(medidor()).toBeTruthy();
    expect(document.querySelector(".fs-regras")).toBeNull();
  });
});
