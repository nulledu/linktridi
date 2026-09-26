import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolhaDeEtiquetas, esquecerAjustesDeImpressao, type DadosEtiqueta } from "../Etiqueta";

// ── O tamanho DESTA folha ────────────────────────────────────────────────────
//
// O tamanho da etiqueta virou ajuste do GALPÃO: vale pra web e desce pros dois
// tablets. Isso está certo — a mesma peça não pode ganhar tiras diferentes
// conforme quem imprimiu. Mas sobrou UM caminho pra imprimir num tamanho
// diferente: mudar o padrão do galpão, imprimir, e lembrar de voltar.
//
// Quem não volta não descobre na hora. Descobre semanas depois, quando o rolo
// acaba cedo porque os dois tablets passaram um mês imprimindo 30mm pra peça
// que precisava de 15 — e o caso mais legítimo que existe (ver no PAPEL como um
// tamanho fica antes de adotá-lo) é justamente o que obriga a passar por aí.
//
// Estes testes seguram as duas metades: a escolha vale nesta folha, e o padrão
// do galpão NÃO se mexe.

const BASE: DadosEtiqueta = {
  codigo: "CHAN-0001-000042",
  nome: "Chancela",
  local: "GAL-A",
  impressoEm: "2026-08-14T12:00:00.000Z",
  responsavel: "João",
};

/** As etiquetas de verdade, sem os controles de tela (`.nao-imprime`). */
function tirasDesenhadas(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("div[style]"))
    .filter((d) => /width:\s*\d+mm/.test(d.getAttribute("style") ?? ""));
}

function larguraDaPrimeiraTira(container: HTMLElement): string | undefined {
  return tirasDesenhadas(container)[0]?.style.width;
}

describe("a folha imprime no tamanho DESTA impressão", () => {
  const respostas = { config: { alturaMm: 15, larguraMm: 72, copias: 1 }, caixas: [] as string[] };
  let salvou: unknown[] = [];

  beforeEach(() => {
    esquecerAjustesDeImpressao();
    salvou = [];
    respostas.config = { alturaMm: 15, larguraMm: 72, copias: 1 };
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      // Qualquer escrita é anotada: o ponto do recurso é NÃO gravar nada.
      if (init?.method && init.method !== "GET") salvou.push([url, init.method]);
      return { ok: true, json: async () => respostas };
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); esquecerAjustesDeImpressao(); });

  it("começa no padrão do galpão — quem só quer imprimir não vê diferença", async () => {
    const { container } = render(<FolhaDeEtiquetas etiquetas={[BASE]} />);
    await waitFor(() => expect(larguraDaPrimeiraTira(container)).toBe("72mm"));

    // O painel nasce FECHADO. Um bloco de dois campos aberto por cima do botão
    // de imprimir cobraria de todo mundo o preço de um recurso que quase
    // ninguém usa numa folha qualquer.
    expect(screen.queryByLabelText("Largura da etiqueta")).toBeNull();
    expect(screen.getByRole("button", { name: /72×15mm/ })).toBeTruthy();
  });

  it("escolher um tamanho comum redesenha a folha e NÃO grava nada", async () => {
    const u = userEvent.setup();
    const { container } = render(<FolhaDeEtiquetas etiquetas={[BASE]} />);
    await waitFor(() => expect(larguraDaPrimeiraTira(container)).toBe("72mm"));

    await u.click(screen.getByRole("button", { name: /72×15mm/ }));
    await u.click(screen.getByRole("button", { name: /Produto · rolo 58/ }));

    // A tira encolheu de verdade — é o desenho, não um rótulo.
    expect(larguraDaPrimeiraTira(container)).toBe("48mm");

    // E o padrão do galpão continua onde estava. Esta é a metade que importa:
    // um PATCH aqui empurraria 48mm pros dois tablets sem ninguém pedir.
    expect(salvou, "escolher o tamanho da folha não pode escrever no banco").toEqual([]);
    expect(screen.getByText(/O padrão do galpão continua 72×15mm/)).toBeTruthy();
  });

  it("o número se digita, e a folha acompanha", async () => {
    const u = userEvent.setup();
    const { container } = render(<FolhaDeEtiquetas etiquetas={[BASE]} />);
    await waitFor(() => expect(larguraDaPrimeiraTira(container)).toBe("72mm"));

    await u.click(screen.getByRole("button", { name: /72×15mm/ }));
    const campo = screen.getByLabelText("Altura da etiqueta");
    await u.clear(campo);
    await u.type(campo, "30");

    expect(tirasDesenhadas(container)[0]?.style.height).toBe("30mm");
  });

  it("voltar ao padrão do galpão desfaz com um toque", async () => {
    const u = userEvent.setup();
    const { container } = render(<FolhaDeEtiquetas etiquetas={[BASE]} />);
    await waitFor(() => expect(larguraDaPrimeiraTira(container)).toBe("72mm"));

    await u.click(screen.getByRole("button", { name: /72×15mm/ }));
    await u.click(screen.getByRole("button", { name: /Estreita/ }));
    expect(larguraDaPrimeiraTira(container)).toBe("40mm");

    // Sem este caminho, desfazer exige lembrar os dois números do galpão — e é
    // aí que alguém "conserta" indo mudar o padrão de verdade.
    await u.click(screen.getByRole("button", { name: "Voltar ao padrão do galpão" }));
    expect(larguraDaPrimeiraTira(container)).toBe("72mm");
  });
});

describe("a folha recusa a largura em que o código não vira barras", () => {
  const respostas = { config: { alturaMm: 15, larguraMm: 72, copias: 1 }, caixas: [] as string[] };

  beforeEach(() => {
    esquecerAjustesDeImpressao();
    respostas.config = { alturaMm: 15, larguraMm: 72, copias: 1 };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => respostas })));
  });
  afterEach(() => { vi.unstubAllGlobals(); esquecerAjustesDeImpressao(); });

  it("basta UM código não caber pra folha inteira parar — com a frase", async () => {
    const u = userEvent.setup();
    // Quem imprime 40 tiras não confere as 40 antes de colar. Barra espremida
    // não sai ilegível: sai LENDO OUTRA COISA, e o defeito só aparece semanas
    // depois, quando o leitor devolve um número que não existe no ERP.
    const lote: DadosEtiqueta[] = [
      { ...BASE, codigo: "CH-1" },
      { ...BASE, codigo: "MDF6MM-BRANCO-2750X1840-000042" },
    ];
    render(<FolhaDeEtiquetas etiquetas={lote} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /72×15mm/ })).toBeTruthy());

    await u.click(screen.getByRole("button", { name: /72×15mm/ }));
    await u.click(screen.getByRole("button", { name: /Estreita/ }));

    const imprimir = screen.getByRole("button", { name: "Imprimir" }) as HTMLButtonElement;
    expect(imprimir.disabled, "folha que sai com barra cortada é papel jogado fora").toBe(true);
    expect(screen.getByText(/Aumente a largura ou encurte o código/)).toBeTruthy();
  });

  it("a frase aparece mesmo com o painel fechado", async () => {
    const u = userEvent.setup();
    render(<FolhaDeEtiquetas etiquetas={[{ ...BASE, codigo: "MDF6MM-BRANCO-2750X1840-000042" }]} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /72×15mm/ })).toBeTruthy());

    await u.click(screen.getByRole("button", { name: /72×15mm/ }));
    await u.click(screen.getByRole("button", { name: /Estreita/ }));
    // Fecha o painel: o botão continua desligado, e um botão desligado sem
    // frase é indistinguível de app quebrado.
    await u.click(screen.getByRole("button", { name: /40×18mm/ }));

    expect(screen.queryByLabelText("Largura da etiqueta")).toBeNull();
    expect((screen.getByRole("button", { name: "Imprimir" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Aumente a largura ou encurte o código/)).toBeTruthy();
  });

  it("largura que cabe volta a liberar a impressão", async () => {
    const u = userEvent.setup();
    render(<FolhaDeEtiquetas etiquetas={[{ ...BASE, codigo: "MDF6MM-BRANCO-2750X1840-000042" }]} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /72×15mm/ })).toBeTruthy());

    await u.click(screen.getByRole("button", { name: /72×15mm/ }));
    await u.click(screen.getByRole("button", { name: /Estreita/ }));
    expect((screen.getByRole("button", { name: "Imprimir" }) as HTMLButtonElement).disabled).toBe(true);

    await u.click(screen.getByRole("button", { name: /Produto · rolo 80/ }));
    expect((screen.getByRole("button", { name: "Imprimir" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("o alvo de toque do celular", () => {
  const respostas = { config: { alturaMm: 15, larguraMm: 72, copias: 1 }, caixas: [] as string[] };

  beforeEach(() => {
    esquecerAjustesDeImpressao();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => respostas })));
  });
  afterEach(() => { vi.unstubAllGlobals(); esquecerAjustesDeImpressao(); });

  it("todo botão do painel pede os 44px da fundação", async () => {
    // jsdom não tem layout: `offsetHeight` é sempre 0 aqui, então medir o
    // tamanho renderizado é impossível e fingir que dá seria pior que não
    // testar. O que dá pra travar é a INTENÇÃO — que o alvo peça `var(--tap)`
    // em vez de nascer com a altura do texto. O tamanho de verdade é conferido
    // no navegador, a 320px.
    const u = userEvent.setup();
    const { container } = render(<FolhaDeEtiquetas etiquetas={[BASE]} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /72×15mm/ })).toBeTruthy());
    await u.click(screen.getByRole("button", { name: /72×15mm/ }));

    const painel = container.querySelector<HTMLElement>(".nao-imprime + .nao-imprime");
    expect(painel, "o painel de tamanho é um bloco `.nao-imprime` — some no papel").toBeTruthy();

    const botoes = within(painel!).getAllByRole("button");
    expect(botoes.length).toBeGreaterThan(0);
    for (const b of botoes) {
      // Botão do kit (`.ui-btn`) ganha os 44px da fundação no celular
      // (`button { min-height: var(--tap) }` em pointer grosso) — não precisa
      // repetir inline. O resto precisa pedir o token.
      if (b.classList.contains("ui-btn")) continue;
      expect(b.style.minHeight || b.style.height, `alvo pequeno demais: ${b.textContent}`)
        .toMatch(/var\(--tap\)/);
    }
  });
});
