import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FolhaDeEtiquetas, esquecerAjustesDeImpressao, type DadosEtiqueta } from "../Etiqueta";

/**
 * A folha com uma Zebra cadastrada NESTA máquina.
 *
 * Antes, cadastrar a Zebra só servia pra tira de teste — a folha continuava
 * abrindo o diálogo do navegador. Este arquivo trava o contrato que faz a
 * impressora valer: com ela escolhida, Imprimir manda ZPL e NÃO abre o diálogo;
 * sem ela, nada muda em relação ao que o galpão já fazia.
 *
 * O envio ao hardware é mocado (não há USB no jsdom); o que se confere é a
 * decisão de POR ONDE sair e o que a tela diz depois.
 */

const enviar = vi.fn();
vi.mock("../impressao/enviar-para-impressora", () => ({
  imprimirEtiqueta: (...args: unknown[]) => enviar(...args),
}));

const ETIQUETAS: DadosEtiqueta[] = [
  { codigo: "PRD-0001-000001", nome: "Almofada", local: "GAL-A", impressoEm: "2026-08-21T10:00:00Z", responsavel: "Caio" },
  { codigo: "PRD-0001-000002", nome: "Almofada", local: "GAL-A", impressoEm: "2026-08-21T10:00:00Z", responsavel: "Caio" },
];

const ZEBRA = { id: "z1", nome: "Zebra do galpão", saida: "zebra_usb", dpi: 203, larguraMm: 72, alturaMm: 18, padrao: true };

beforeEach(() => {
  esquecerAjustesDeImpressao();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response)));
  window.print = vi.fn();
  window.localStorage.clear();
  enviar.mockReset();
  enviar.mockResolvedValue({ ok: true, saiu: "usb" });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("sem Zebra cadastrada, nada muda", () => {
  it("o botão é “Imprimir” e abre o diálogo do navegador", async () => {
    render(<FolhaDeEtiquetas etiquetas={ETIQUETAS} />);
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
    await waitFor(() => expect(window.print).toHaveBeenCalled());
    expect(enviar).not.toHaveBeenCalled();
    // Sem Zebra a pergunta "por onde sai" não existe — e um seletor com uma
    // opção só é ruído.
    expect(screen.queryByLabelText(/Por onde a etiqueta sai/)).toBeNull();
  });
});

describe("com Zebra cadastrada nesta máquina", () => {
  beforeEach(() => { window.localStorage.setItem("estoque.impressoras.v1", JSON.stringify([ZEBRA])); });

  it("o botão diz ONDE vai sair, manda uma etiqueta por vez e NÃO abre o diálogo", async () => {
    render(<FolhaDeEtiquetas etiquetas={ETIQUETAS} />);
    const botao = await screen.findByRole("button", { name: /Imprimir na Zebra do galpão/ });
    fireEvent.click(botao);
    await waitFor(() => expect(enviar).toHaveBeenCalledTimes(2));
    expect(window.print).not.toHaveBeenCalled();
    // A impressora recebe o cadastro dela (é o rolo que está nela) e a etiqueta
    // no formato do gerador, com o código intacto.
    const [impressora, etiqueta] = enviar.mock.calls[0] as [typeof ZEBRA, { codigo: string; nome: string }];
    expect(impressora.id).toBe("z1");
    expect(etiqueta.codigo).toBe("PRD-0001-000001");
    expect(etiqueta.nome).toBe("Almofada");
    expect(await screen.findByRole("status")).toHaveTextContent(/2 etiquetas na Zebra do galpão/);
  });

  it("o registro (onImprimir) roda ANTES da tinta, como no diálogo", async () => {
    const ordem: string[] = [];
    enviar.mockImplementation(async () => { ordem.push("zebra"); return { ok: true, saiu: "usb" }; });
    render(<FolhaDeEtiquetas etiquetas={ETIQUETAS} onImprimir={async () => { ordem.push("registro"); }} />);
    fireEvent.click(await screen.findByRole("button", { name: /Imprimir na/ }));
    await waitFor(() => expect(ordem.length).toBe(3));
    expect(ordem[0]).toBe("registro");
  });

  it("falhou no meio: PARA, e a frase diz quantas saíram e em qual parou", async () => {
    // Mandar as quarenta e descobrir que a décima não saiu deixa a pessoa
    // contando tiras. Parando, as que saíram são exatamente as primeiras N.
    enviar
      .mockResolvedValueOnce({ ok: true, saiu: "usb" })
      .mockResolvedValueOnce({ ok: false, usarNavegador: false, frase: "A impressora não respondeu." });
    render(<FolhaDeEtiquetas etiquetas={ETIQUETAS} />);
    fireEvent.click(await screen.findByRole("button", { name: /Imprimir na/ }));
    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(/Saíram 1 de 2/);
    expect(status).toHaveTextContent(/Parou em PRD-0001-000002/);
    expect(status).toHaveTextContent(/não respondeu/);
  });

  it("dá pra escolher o diálogo mesmo com Zebra — e a escolha fica lembrada", async () => {
    render(<FolhaDeEtiquetas etiquetas={ETIQUETAS} />);
    const seletor = await screen.findByLabelText(/Por onde a etiqueta sai/);
    fireEvent.change(seletor, { target: { value: "navegador" } });
    expect(screen.getByRole("button", { name: "Imprimir" })).toBeTruthy();
    expect(window.localStorage.getItem("estoque.impressora.escolhida")).toBe("navegador");
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
    await waitFor(() => expect(window.print).toHaveBeenCalled());
    expect(enviar).not.toHaveBeenCalled();
  });

  it("código com caractere de comando ZPL é recusado ANTES de gastar papel", async () => {
    const torta: DadosEtiqueta[] = [{ ...ETIQUETAS[0], codigo: "PRD^0001" }];
    render(<FolhaDeEtiquetas etiquetas={torta} />);
    const botao = await screen.findByRole("button", { name: /Imprimir na/ });
    await waitFor(() => expect((botao as HTMLButtonElement).disabled).toBe(true));
    expect(document.body.textContent).toMatch(/comando e não texto/);
  });
});
