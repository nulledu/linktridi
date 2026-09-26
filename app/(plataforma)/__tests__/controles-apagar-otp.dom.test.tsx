// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BotaoApagar, CampoOTP } from "../ui/controles";

// Portes do rare-ui. O valor não é o visual (isso o /dev-micro mostra) — é o
// COMPORTAMENTO: confirmar-no-lugar sem confundir apagar com confirmar, e a
// lógica de OTP (sequência, colar, filtro por tipo, apagar no meio) que era o
// motivo de portar este componente em vez de reescrever do zero.

describe("BotaoApagar", () => {
  it("abre e confirma no lugar", async () => {
    const user = userEvent.setup();
    const confirmar = vi.fn();
    render(<BotaoApagar aoConfirmar={confirmar} />);
    const gatilho = screen.getByRole("button", { name: "Apagar" });
    expect(gatilho).toHaveAttribute("aria-expanded", "false");
    await user.click(gatilho);
    expect(gatilho).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(confirmar).toHaveBeenCalledTimes(1);
    expect(gatilho).toHaveAttribute("aria-expanded", "false");
  });

  it("Esc cancela sem confirmar", async () => {
    const user = userEvent.setup();
    const confirmar = vi.fn();
    const cancelar = vi.fn();
    render(<BotaoApagar aoConfirmar={confirmar} aoCancelar={cancelar} />);
    const gatilho = screen.getByRole("button", { name: "Apagar" });
    await user.click(gatilho);
    await user.keyboard("{Escape}");
    expect(cancelar).toHaveBeenCalledTimes(1);
    expect(confirmar).not.toHaveBeenCalled();
    expect(gatilho).toHaveAttribute("aria-expanded", "false");
  });

  it("cancelar fecha e chama aoCancelar", async () => {
    const user = userEvent.setup();
    const cancelar = vi.fn();
    render(<BotaoApagar aoConfirmar={() => {}} aoCancelar={cancelar} />);
    const gatilho = screen.getByRole("button", { name: "Apagar" });
    await user.click(gatilho);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(cancelar).toHaveBeenCalledTimes(1);
    expect(gatilho).toHaveAttribute("aria-expanded", "false");
  });
});

function OtpControlado({ onComplete }: { onComplete?: (v: string) => void }) {
  const [v, setV] = useState("");
  return <CampoOTP length={4} valor={v} aoMudar={setV} aoCompletar={onComplete} />;
}

describe("CampoOTP", () => {
  it("digita em sequência, pulando de casa, e completa", async () => {
    const user = userEvent.setup();
    const completo = vi.fn();
    render(<OtpControlado onComplete={completo} />);
    const casas = screen.getAllByRole("textbox");
    expect(casas).toHaveLength(4);
    await user.click(casas[0]);
    await user.keyboard("1234");
    expect(completo).toHaveBeenCalledWith("1234");
  });

  it("colar preenche de uma vez (autofill de SMS)", async () => {
    const user = userEvent.setup();
    const completo = vi.fn();
    render(<OtpControlado onComplete={completo} />);
    const casas = screen.getAllByRole("textbox");
    await user.click(casas[0]);
    await user.paste("1234");
    expect(completo).toHaveBeenCalledWith("1234");
  });

  it("só aceita o tipo — número recusa letra", async () => {
    const user = userEvent.setup();
    const mudou = vi.fn();
    render(<CampoOTP length={4} aoMudar={mudou} />);
    const casas = screen.getAllByRole("textbox");
    await user.click(casas[0]);
    await user.keyboard("a1");
    expect(mudou).toHaveBeenLastCalledWith("1");
  });

  it("backspace na casa vazia apaga a anterior e volta pra ela", async () => {
    const user = userEvent.setup();
    const mudou = vi.fn();
    render(<CampoOTP length={4} aoMudar={mudou} />);
    const casas = screen.getAllByRole("textbox");
    await user.click(casas[0]);
    await user.keyboard("12");
    await user.keyboard("{Backspace}");
    expect(mudou).toHaveBeenLastCalledWith("1");
  });

  it("estado de erro marca aria-invalid em todas as casas", () => {
    render(<CampoOTP length={4} estado="erro" />);
    for (const casa of screen.getAllByRole("textbox")) {
      expect(casa).toHaveAttribute("aria-invalid", "true");
    }
  });
});
