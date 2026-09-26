import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { GlassDate } from "../../GlassPicker";

// GlassDate abre o `CalendarioDia` (Calendar do HeroUI) e continua devolvendo
// "YYYY-MM-DD" — o CalendarDate do @internationalized/date não vaza pra tela.
function Palco({ min }: { min?: string }) {
  const [v, setV] = useState("2026-09-24");
  return (<><GlassDate value={v} onChange={setV} min={min} aria-label="Data" /><output data-testid="v">{v}</output></>);
}

const dia = (n: string) => screen.getAllByText(n).find((el) =>
  el.closest("[role=gridcell]") && el.getAttribute("data-outside-month") !== "true")!;

describe("GlassDate · Calendar do HeroUI", () => {
  it("abre no mês do valor, em pt-BR, e o toque no dia devolve ISO e fecha", () => {
    render(<Palco />);
    fireEvent.click(screen.getByRole("button", { name: "Data" }));
    expect(document.body.textContent).toMatch(/setembro/i);
    fireEvent.click(dia("10"));
    expect(screen.getByTestId("v").textContent).toBe("2026-09-10");
    expect(document.querySelector(".ui-calendario")).toBeNull();
  });

  it("dia antes do min fica indisponível e não muda o valor", () => {
    render(<Palco min="2026-09-15" />);
    fireEvent.click(screen.getByRole("button", { name: "Data" }));
    fireEvent.click(dia("10"));
    expect(screen.getByTestId("v").textContent).toBe("2026-09-24");
  });
});
