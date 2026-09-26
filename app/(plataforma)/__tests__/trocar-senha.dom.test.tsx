import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TrocarSenha } from "../TrocarSenha";

// ── Trocar senha nos Ajustes ─────────────────────────────────────────────────
// Eram três inputs soltos e um botão: Enter não enviava, o gerenciador de
// senhas não reconhecia o formulário (sem <form> nem usuário) e qualquer
// resposta que não fosse JSON — o 429 do freio, um 500 em HTML — estourava no
// `r.json()` sem mensagem nenhuma, com o botão parado em "Salvando…".

const resp = (corpo: unknown, status: number) =>
  typeof corpo === "string"
    ? new Response(corpo, { status, headers: { "Content-Type": "text/html" } })
    : new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => { vi.unstubAllGlobals(); });

function preencher(atual = "velha-123", nova = "nova-12345", conf = nova) {
  fireEvent.change(screen.getByLabelText("Senha atual"), { target: { value: atual } });
  fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: nova } });
  fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: conf } });
}

const enviar = () => fireEvent.submit(screen.getByLabelText("Senha atual").closest("form")!);

describe("Trocar senha", () => {
  it("é um formulário de verdade: Enter envia e o botão é o submit", async () => {
    const f = vi.fn(async () => resp({ ok: true }, 200));
    vi.stubGlobal("fetch", f);
    render(<TrocarSenha username="caio" />);
    expect(screen.getByRole("button", { name: "Salvar senha" }).getAttribute("type")).toBe("submit");
    preencher();
    enviar();
    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/auth/password");
    expect(JSON.parse(String(init.body))).toEqual({ password: "nova-12345", currentPassword: "velha-123" });
    expect(await screen.findByText("Senha alterada.")).toBeTruthy();
    expect((screen.getByLabelText("Senha atual") as HTMLInputElement).value).toBe("");
  });

  it("o gerenciador de senhas acha o usuário e sabe qual campo é qual", () => {
    const { container } = render(<TrocarSenha username="caio" />);
    const usuario = container.querySelector('input[autocomplete="username"]') as HTMLInputElement | null;
    expect(usuario?.value).toBe("caio");
    expect(screen.getByLabelText("Senha atual").getAttribute("autocomplete")).toBe("current-password");
    expect(screen.getByLabelText("Nova senha").getAttribute("autocomplete")).toBe("new-password");
    expect(screen.getByLabelText("Confirmar nova senha").getAttribute("autocomplete")).toBe("new-password");
  });

  it("mostrar senha troca o tipo dos três campos", () => {
    render(<TrocarSenha username="caio" />);
    const botao = screen.getByRole("button", { name: /Mostrar senhas/ });
    fireEvent.click(botao);
    for (const r of ["Senha atual", "Nova senha", "Confirmar nova senha"]) {
      expect(screen.getByLabelText(r).getAttribute("type")).toBe("text");
    }
    expect(screen.getByRole("button", { name: /Ocultar senhas/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("senha atual errada diz exatamente isso", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resp({ error: "senha_atual_incorreta", detail: "Senha atual incorreta." }, 401)));
    render(<TrocarSenha username="caio" />);
    preencher();
    enviar();
    expect(await screen.findByText("Senha atual incorreta.")).toBeTruthy();
  });

  it("sessão vencida pede pra entrar de novo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resp({ error: "unauthorized" }, 401)));
    render(<TrocarSenha username="caio" />);
    preencher();
    enviar();
    expect(await screen.findByText(/sessão expirou/i)).toBeTruthy();
  });

  it("muitas tentativas (429) manda esperar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resp({ error: "bloqueado" }, 429)));
    render(<TrocarSenha username="caio" />);
    preencher();
    enviar();
    expect(await screen.findByText(/espere alguns minutos/i)).toBeTruthy();
  });

  it("resposta que não é JSON não trava o botão nem some calada", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resp("<html>erro</html>", 500)));
    render(<TrocarSenha username="caio" />);
    preencher();
    enviar();
    expect(await screen.findByText(/não deu pra trocar a senha agora/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Salvar senha" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("sem rede diz que é a conexão", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<TrocarSenha username="caio" />);
    preencher();
    enviar();
    expect(await screen.findByText(/sem conexão/i)).toBeTruthy();
  });

  it("erro óbvio não vai ao servidor, e a mensagem some quando a pessoa volta a digitar", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    render(<TrocarSenha username="caio" />);
    preencher("velha-123", "curta");
    enviar();
    expect(await screen.findByText("Mínimo de 8 caracteres.")).toBeTruthy();
    preencher("velha-123", "nova-12345", "outra-1234");
    enviar();
    expect(await screen.findByText("As senhas não conferem.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "nova-12345" } });
    expect(screen.queryByText("As senhas não conferem.")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});
