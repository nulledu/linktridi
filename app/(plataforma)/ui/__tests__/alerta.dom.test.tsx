import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { Alerta } from "../Alerta";
import { ICONS } from "../../Icon";

/**
 * O `Alerta` substituiu um `Aviso` escrito à mão por módulo. Estes testes
 * fixam o que ele promete a quem chama: ícone do Tabler (nunca o SVG embutido
 * do HeroUI), papel de acessibilidade pelo tom, e ação/dispensar que não
 * vazam o clique pro dono (o toast dispensa no clique do cartão).
 */
afterEach(cleanup);

describe("Alerta", () => {
  it("desenha o ícone do Tabler do tom, não o padrão do HeroUI", () => {
    const { container } = render(<Alerta tom="atencao" titulo="Estoque baixo" />);
    expect(container.querySelector('[data-slot="alert-default-icon"]')).toBeNull();
    const ico = container.querySelector(".ui-alerta__ico svg")!;
    expect(ico.innerHTML).toContain('d="M10.363 3.591');
    expect(ICONS["alert-triangle"]).toContain('d="M10.363 3.591');
  });

  it("erro e atenção interrompem o leitor de tela; o resto espera a vez", () => {
    render(<><Alerta tom="perigo" titulo="Falhou" /><Alerta tom="ok" titulo="Salvo" /></>);
    expect(screen.getByRole("alert").textContent).toContain("Falhou");
    expect(screen.getByRole("status").textContent).toContain("Salvo");
  });

  it("flutuante (toast) não se anuncia sozinho — a pilha já é aria-live", () => {
    const { container } = render(<Alerta flutuante tom="perigo" titulo="Falhou" />);
    expect(container.querySelector(".ui-alerta")!.getAttribute("role")).toBeNull();
    expect(container.querySelector(".ui-alerta")!.className).toContain("glass");
  });

  it("dispensar chama aoFechar e não propaga o clique", () => {
    const aoFechar = vi.fn();
    const dono = vi.fn();
    render(<div onClick={dono}><Alerta titulo="Novidade" aoFechar={aoFechar} /></div>);
    fireEvent.click(screen.getByRole("button", { name: "Dispensar" }));
    expect(aoFechar).toHaveBeenCalledOnce();
    expect(dono).not.toHaveBeenCalled();
  });

  it("sem título, a descrição vira o texto principal; icone={false} tira o ícone", () => {
    const { container } = render(<Alerta icone={false}>3 itens abaixo do mínimo</Alerta>);
    expect(container.querySelector(".ui-alerta")!.getAttribute("data-so-texto")).toBe("1");
    expect(container.querySelector(".ui-alerta__ico")).toBeNull();
    expect(container.textContent).toContain("3 itens abaixo do mínimo");
  });
});
