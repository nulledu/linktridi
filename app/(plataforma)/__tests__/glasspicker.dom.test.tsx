// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GlassSelect } from "../GlassPicker";
import { PainelLateral } from "../ui/controles";

const FRUTAS = [
  { value: "uva", label: "Uva" },
  { value: "caju", label: "Caju" },
  { value: "manga", label: "Manga" },
];

function Controlado({ inicial = "uva", options = FRUTAS }: { inicial?: string; options?: typeof FRUTAS }) {
  const [v, setV] = useState(inicial);
  return <GlassSelect value={v} onChange={setV} options={options} />;
}

describe("GlassSelect", () => {
  // Este é o erro clássico da conversão mecânica de `<select>` nativo: o
  // `value` salvo não existe em `options`, e o campo mostra o placeholder como
  // se estivesse vazio — a pessoa "perde" o que tinha escolhido.
  it("mostra o rótulo do valor atual, não o placeholder", () => {
    render(<GlassSelect value="caju" onChange={() => {}} options={FRUTAS} />);
    expect(screen.getByRole("button")).toHaveTextContent("Caju");
  });

  it("valor fora das opções cai no placeholder em vez de quebrar", () => {
    render(<GlassSelect value="jabuticaba" onChange={() => {}} options={FRUTAS} placeholder="Escolha" />);
    expect(screen.getByRole("button")).toHaveTextContent("Escolha");
  });

  it("abre, escolhe e devolve o valor", async () => {
    const aoMudar = vi.fn();
    render(<GlassSelect value="uva" onChange={aoMudar} options={FRUTAS} />);
    await userEvent.click(screen.getByRole("button"));
    await userEvent.click(screen.getByRole("button", { name: "Manga" }));
    expect(aoMudar).toHaveBeenCalledWith("manga");
  });

  it("o gatilho reflete a escolha", async () => {
    render(<Controlado />);
    const gatilho = screen.getByRole("button");
    expect(gatilho).toHaveTextContent("Uva");
    await userEvent.click(gatilho);
    await userEvent.click(screen.getByRole("button", { name: "Caju" }));
    expect(screen.getByRole("button")).toHaveTextContent("Caju");
  });

  it("anuncia que abre uma lista e se está aberta", async () => {
    render(<Controlado />);
    const g = screen.getByRole("button");
    expect(g).toHaveAttribute("aria-haspopup", "listbox");
    expect(g).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(g);
    expect(g).toHaveAttribute("aria-expanded", "true");
  });

  // Substituiu o `<option disabled>` nativo: a opção continua VISÍVEL (o texto
  // explica por que está travada) mas não pode ser escolhida.
  it("opção desabilitada aparece e não é escolhível", async () => {
    const aoMudar = vi.fn();
    render(
      <GlassSelect value="" onChange={aoMudar} options={[
        { value: "a", label: "Livre" },
        { value: "b", label: "Ocupado — já é do João", disabled: true },
      ]} />,
    );
    await userEvent.click(screen.getByRole("button"));
    const travada = screen.getByRole("button", { name: /Ocupado/ });
    expect(travada).toBeVisible();
    expect(travada).toBeDisabled();
    await userEvent.click(travada);
    expect(aoMudar).not.toHaveBeenCalled();
  });

  // Sem `id` no gatilho, trocar um `<select>` que tinha `<label htmlFor>`
  // quebraria a associação silenciosamente.
  it("aceita id para o <label htmlFor> continuar valendo", () => {
    render(<><label htmlFor="cat">Categoria</label><GlassSelect id="cat" value="uva" onChange={() => {}} options={FRUTAS} /></>);
    expect(screen.getByLabelText("Categoria")).toHaveAttribute("aria-haspopup", "listbox");
  });

  it("desabilitado não abre", async () => {
    render(<GlassSelect value="uva" onChange={() => {}} options={FRUTAS} disabled />);
    await userEvent.click(screen.getByRole("button"));
    expect(screen.queryByRole("button", { name: "Caju" })).toBeNull();
  });

  // O painel lateral tem véu em 1200 e folha em 1201. Com o popover em 1000 a
  // lista nascia ATRÁS do véu: invisível, e o toque na opção acertava o véu, que
  // fecha o painel. Todo formulário em folha ficou com os dropdowns mortos.
  // jsdom não faz empilhamento, então o que dá pra travar aqui é o CONTRATO: o
  // popover precisa declarar z-index acima da folha.
  it("a lista abre ACIMA da folha, não atrás do véu", async () => {
    render(
      <PainelLateral titulo="Formulário" onFechar={() => {}}>
        <GlassSelect value="uva" onChange={() => {}} options={FRUTAS} />
      </PainelLateral>,
    );
    await userEvent.click(screen.getByRole("button", { name: /Uva/ }));
    const pop = document.querySelector(".gp-pop") as HTMLElement;
    expect(pop, "o popover não abriu").toBeTruthy();
    // `var(--z-pop, 1400)` — o fallback é o que vale sem folha de estilo.
    expect(pop.style.zIndex).toMatch(/var\(--z-pop|1400/);
    const painel = screen.getByRole("dialog");
    expect(Number(getComputedStyle(painel).zIndex) || 1201).toBeLessThan(1400);
  });

  it("Escape fecha a lista", async () => {
    render(<Controlado />);
    await userEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button", { name: "Caju" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Caju" })).toBeNull();
  });

  // Lista longa liga a busca sozinha (o `searchable` é automático acima de 8).
  it("lista longa ganha busca e filtra", async () => {
    const muitas = Array.from({ length: 12 }, (_, i) => ({ value: `v${i}`, label: `Opção ${i}` }));
    render(<GlassSelect value="v0" onChange={() => {}} options={muitas} />);
    await userEvent.click(screen.getByRole("button", { name: /Opção 0/ }));
    const busca = screen.getByPlaceholderText("Buscar…");
    await userEvent.type(busca, "Opção 11");
    expect(screen.getByRole("button", { name: "Opção 11" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Opção 5" })).toBeNull();
  });
});
