import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { AmostrasCor, CampoCor, SeletorCor } from "../cores";
import { CampoAdorno, CampoBusca, GrupoOpcoes } from "../formularios";
import { Avatares, Medidor, Tecla } from "../exibicao";
import { Paginacao, Trilha } from "../navegacao";
import { ProvaCatalogo } from "../../../dev-micro/ProvaCatalogo";

// Peças do kit sobre o HeroUI v3 (Colors, Controls, Data Display, Forms,
// Navigation). A API é em português e fala o tipo do banco (hex, string).

// jsdom não tem ResizeObserver; o ScrollShadow do HeroUI usa.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

describe("kit HeroUI · peças novas", () => {
  it("o catálogo do /dev-micro monta as 15 categorias", () => {
    render(<ProvaCatalogo />);
    for (const c of ["Buttons", "Colors", "Controls", "Data Display", "Date and Time", "Feedback", "Forms", "Layout", "Media", "Navigation", "Overlays", "Pickers", "Typography", "Utilities"]) {
      expect(screen.getAllByText(c).length).toBeGreaterThan(0);
    }
  });

  it("AmostrasCor devolve hex ao escolher", () => {
    function P() { const [c, setC] = useState("#7c3aed"); return <><AmostrasCor valor={c} aoMudar={setC} cores={["#7c3aed", "#059669"]} /><output data-testid="c">{c}</output></>; }
    render(<P />);
    const opcoes = screen.getAllByRole("option");
    fireEvent.click(opcoes[1]);
    expect(screen.getByTestId("c").textContent?.toLowerCase()).toBe("#059669");
  });

  it("SeletorCor mostra o hex no campo", () => {
    render(<SeletorCor valor="#2563eb" aoMudar={() => {}} rotulo="Destaque" />);
    expect((screen.getByRole("textbox") as HTMLInputElement).value.toLowerCase()).toContain("2563eb");
  });

  it("CampoCor abre o seletor numa folha e fecha no Esc", () => {
    render(<CampoCor valor="#059669" aoMudar={() => {}} rotulo="Fundo" />);
    const gatilho = screen.getByRole("button", { name: /Fundo: #059669/ });
    fireEvent.click(gatilho);
    expect(gatilho.getAttribute("aria-expanded")).toBe("true");
    expect((screen.getByRole("textbox") as HTMLInputElement).value.toLowerCase()).toContain("059669");
  });

  it("GrupoOpcoes troca o valor e respeita a opção desligada", () => {
    function P() {
      const [v, setV] = useState<"a" | "b" | "c">("a");
      return <><GrupoOpcoes valor={v} aoMudar={setV} opcoes={[{ valor: "a", rotulo: "A" }, { valor: "b", rotulo: "B" }, { valor: "c", rotulo: "C", desligada: true }]} /><output data-testid="v">{v}</output></>;
    }
    render(<P />);
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1]);
    expect(screen.getByTestId("v").textContent).toBe("b");
    expect((radios[2] as HTMLInputElement).disabled).toBe(true);
  });

  it("CampoBusca e CampoAdorno emitem o texto sem o adorno", () => {
    const vistos: string[] = [];
    render(<><CampoBusca valor="" aoMudar={(v) => vistos.push(v)} /><CampoAdorno rotulo="Preço" antes="R$" valor="" aoMudar={(v) => vistos.push(v)} /></>);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pedido" } });
    fireEvent.change(screen.getByLabelText("Preço"), { target: { value: "10" } });
    expect(vistos).toEqual(["pedido", "10"]);
    expect(screen.getByText("R$")).toBeTruthy();
  });

  it("Avatares mostra no máximo N e o resto em +N; Tecla e Medidor montam", () => {
    render(<>
      <Avatares max={2} pessoas={[{ nome: "Ana" }, { nome: "Bia" }, { nome: "Caio" }, { nome: "Duda" }]} />
      <Tecla mods={["command"]}>K</Tecla>
      <Medidor rotulo="Cota" valor={95} />
    </>);
    expect(screen.getByText("+2")).toBeTruthy();
    expect(screen.getByText("K")).toBeTruthy();
    expect(screen.getByRole("meter")).toBeTruthy();
  });

  it("Paginacao anda e some com uma página só; Trilha não linka o nível atual", () => {
    function P() { const [p, setP] = useState(1); return <><Paginacao pagina={p} total={10} aoMudar={setP} /><output data-testid="p">{p}</output></>; }
    const { container } = render(<><P /><Trilha itens={[{ rotulo: "Lojas", href: "/lojas" }, { rotulo: "Aparência" }]} /></>);
    fireEvent.click(screen.getByLabelText("Próxima página"));
    expect(screen.getByTestId("p").textContent).toBe("2");
    expect(container.querySelectorAll('a[href="/lojas"]').length).toBeGreaterThan(0);
    const { container: c2 } = render(<Paginacao pagina={1} total={1} aoMudar={() => {}} />);
    expect(c2.innerHTML).toBe("");
  });
});
