import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Etiqueta, FolhaDeEtiquetas, esquecerAjustesDeImpressao, type DadosEtiqueta } from "../Etiqueta";

// ── Os dois tipos de etiqueta, no papel ──────────────────────────────────────
//
// O selo com a quantidade era desenhado quando `quantidade > 1`, e só por isso.
// Uma caixa de chancelas com UMA chancela dentro saía pelada — quem a pega
// assume peça avulsa e abre o lacre pra conferir, que é justamente o que o
// lacre existia pra evitar. Agora o tipo é do ITEM, e a etiqueta obedece.

const BASE: DadosEtiqueta = {
  codigo: "CHAN-0001-000042",
  nome: "Chancela",
  local: "GAL-A",
  impressoEm: "2026-08-14T12:00:00.000Z",
  responsavel: "João",
};

describe("Etiqueta — o tipo decide o caso do 1", () => {
  it("caixa com UMA peça dentro escreve '1 un'", () => {
    render(<Etiqueta dados={{ ...BASE, tipo: "caixa", quantidade: 1 }} />);
    expect(screen.getByText("1 un")).toBeTruthy();
  });

  it("peça única com uma peça continua sem escrever nada", () => {
    const { container } = render(<Etiqueta dados={{ ...BASE, tipo: "unica", quantidade: 1 }} />);
    expect(container.textContent).not.toMatch(/1 un/);
  });

  it("peça única NÃO esconde uma quantidade de verdade", () => {
    // "Peça única" quer dizer "não invente um 1 un", não "esconda o número".
    // Uma etiqueta de chapa valendo 4 tem 4 peças na pilha, e o papel precisa
    // dizer isso — senão o inventário fecha errado em cima do papel.
    render(<Etiqueta dados={{ ...BASE, tipo: "unica", quantidade: 4 }} />);
    expect(screen.getByText("4 un")).toBeTruthy();
  });

  it("sem tipo nenhum, a etiqueta se comporta exatamente como antes", () => {
    const semTipo = render(<Etiqueta dados={{ ...BASE, quantidade: 1 }} />);
    expect(semTipo.container.textContent).not.toMatch(/1 un/);
    semTipo.unmount();
    render(<Etiqueta dados={{ ...BASE, quantidade: 50 }} />);
    expect(screen.getByText("50 un")).toBeTruthy();
  });
});

describe("Folha de etiquetas — obedece ao que o escritório configurou", () => {
  const respostas = { config: { alturaMm: 15, copias: 1 }, caixas: [] as string[] };

  beforeEach(() => {
    esquecerAjustesDeImpressao();
    respostas.config = { alturaMm: 15, copias: 1 };
    respostas.caixas = [];
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => respostas })));
  });
  afterEach(() => { vi.unstubAllGlobals(); esquecerAjustesDeImpressao(); });

  it("marca como CAIXA a etiqueta cujo SKU o escritório marcou", async () => {
    // O código de uma unidade é `<SKU>-<sequencial>`, então a tira de papel
    // carrega a identidade do item: dá pra saber o tipo sem uma segunda
    // consulta — a mesma dedução que o tablet faz offline.
    respostas.caixas = ["CHAN-0001"];
    render(<FolhaDeEtiquetas etiquetas={[{ ...BASE, quantidade: 1 }]} />);
    await waitFor(() => expect(screen.getByText("1 un")).toBeTruthy());
  });

  it("a altura configurada vale pro papel, não só pro tablet", async () => {
    respostas.config = { alturaMm: 25, copias: 1 };
    const { container } = render(<FolhaDeEtiquetas etiquetas={[BASE]} />);
    await waitFor(() => {
      const etiqueta = container.querySelector('[style*="25mm"]');
      expect(etiqueta).toBeTruthy();
    });
  });

  it("duas vias saem como duas tiras, e ainda assim é UMA etiqueta e UMA peça", async () => {
    // A cópia é papel a mais, não peça a mais: quem imprime duas vias da mesma
    // caixa não tem duas caixas. Se a contagem seguisse as tiras, o número que
    // a pessoa lê na tela deixaria de ser o que ela vai colar.
    respostas.config = { alturaMm: 15, copias: 2 };
    const { container } = render(<FolhaDeEtiquetas etiquetas={[BASE]} />);
    await waitFor(() => {
      expect(container.querySelectorAll("svg[role], svg").length).toBeGreaterThan(0);
      expect(screen.getByText(/1 etiqueta/)).toBeTruthy();
      expect(screen.getByText(/2 vias de cada/)).toBeTruthy();
    });
  });

  it("sem resposta do servidor, a folha imprime como sempre imprimiu", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(<FolhaDeEtiquetas etiquetas={[{ ...BASE, quantidade: 50 }]} />);
    // Configuração indisponível não pode virar etiqueta que não sai.
    await waitFor(() => expect(screen.getByText("50 un")).toBeTruthy());
  });
});
