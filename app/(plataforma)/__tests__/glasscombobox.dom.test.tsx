// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GlassCombobox } from "../GlassPicker";

const PRODUTOS = ["Carimbo automático", "Carimbo de madeira", "Almofada azul", "Datador"];

function Controlado({ allowCustom = true }: { allowCustom?: boolean }) {
  const [v, setV] = useState("");
  return (
    <>
      <GlassCombobox value={v} onChange={setV} options={PRODUTOS} featured={["Datador"]} allowCustom={allowCustom} placeholder="Buscar produto…" />
      <output>{v || "vazio"}</output>
    </>
  );
}

describe("GlassCombobox (ComboBox do HeroUI)", () => {
  it("é um combobox digitável e escolhe da lista filtrada", async () => {
    const u = userEvent.setup();
    render(<Controlado />);
    const campo = screen.getByRole("combobox");
    await u.type(campo, "madeira");
    await u.click(await screen.findByRole("option", { name: /Carimbo de madeira/ }));
    expect(screen.getByText("Carimbo de madeira", { selector: "output" })).toBeTruthy();
  });

  it("mostra os favoritos sem busca", async () => {
    const u = userEvent.setup();
    render(<Controlado />);
    await u.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: /Datador/ })).toBeTruthy();
  });

  it("aceita texto livre ao sair do campo quando allowCustom", async () => {
    const u = userEvent.setup();
    render(<Controlado />);
    await u.type(screen.getByRole("combobox"), "Produto novo");
    await u.tab();
    expect(screen.getByText("Produto novo", { selector: "output" })).toBeTruthy();
  });

  it("sem allowCustom, texto fora da lista não vira valor", async () => {
    const u = userEvent.setup();
    render(<Controlado allowCustom={false} />);
    await u.type(screen.getByRole("combobox"), "xyz");
    await u.tab();
    expect(screen.getByText("vazio", { selector: "output" })).toBeTruthy();
  });
});
