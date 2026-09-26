// @vitest-environment jsdom
//
// ── A Zebra que o sistema JÁ VÊ vira impressora em um toque ──────────────────
//
// O buraco que este teste guarda não é de código, é de fluxo: o Browser Print
// respondia com a impressora, a tela mostrava o aparelho na lista, e mesmo
// assim exigia preencher nome, saída, resolução e tamanho antes de sair uma
// etiqueta. Quem chegou aqui porque o botão de imprimir pediu configuração
// encontrava outro formulário — e é aí que a pessoa desiste e vai imprimir em
// outro lugar.
//
// Quem quebra isso de novo não vai apagar o botão: vai mexer no casamento por
// `agenteUid` (e a impressora já cadastrada volta a aparecer como "nova") ou
// nos campos preenchidos sozinhos.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImpressorasPanel } from "../ImpressorasPanel";
import { lerImpressoras } from "../impressoras-guardadas";

/**
 * O agente Zebra e a rota de ajustes, os dois no mesmo `fetch`.
 *
 * `/available` é o Browser Print em `localhost:9100`; `/api/estoque/impressao`
 * é o tamanho da etiqueta do galpão. A ficha criada tem de sair com o segundo,
 * e não com o padrão do desenho.
 */
function rede(aparelhos: { uid: string; name: string }[]) {
  return vi.fn((url: string) => {
    if (String(url).includes("9100")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ printer: aparelhos }) } as Response);
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ config: { larguraMm: 55, alturaMm: 25 }, caixas: [] }),
    } as Response);
  });
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("fetch", rede([{ uid: "ZD220-01", name: "Zebra do galpão" }]));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("a Zebra encontrada", () => {
  it("aparece com um botão que já a cadastra", async () => {
    render(<ImpressorasPanel podeConfigurar />);

    const usar = await screen.findByRole("button", { name: /Usar esta/i });
    await userEvent.click(usar);

    await waitFor(() => expect(lerImpressoras()).toHaveLength(1));
    const p = lerImpressoras()[0];
    // Nome e endereço vêm do próprio agente; a saída é a dele por construção.
    expect(p.nome).toBe("Zebra do galpão");
    expect(p.agenteUid).toBe("ZD220-01");
    expect(p.saida).toBe("zebra_agente");
    // E o tamanho é o DO GALPÃO (55×25), não o padrão do desenho: é o mesmo
    // que a folha de etiquetas usa, senão a mesma peça ganha duas tiras
    // diferentes conforme a tela de onde foi impressa.
    expect(p.larguraMm).toBe(55);
    expect(p.alturaMm).toBe(25);
  });

  it("some da lista de achadas depois de cadastrada — casando pelo endereço", async () => {
    render(<ImpressorasPanel podeConfigurar />);
    await userEvent.click(await screen.findByRole("button", { name: /Usar esta/i }));

    // O casamento é por `agenteUid`, não pelo nome da ficha: quem renomear a
    // impressora depois não pode ver a mesma Zebra reaparecer como novidade.
    await waitFor(() => expect(screen.queryByRole("button", { name: /Usar esta/i })).toBeNull());
  });

  it("quem não pode configurar não vê o atalho", async () => {
    render(<ImpressorasPanel podeConfigurar={false} />);

    // O gate é o mesmo do resto do cadastro (ver `_gate.ts`): cadastrar
    // impressora é configuração, e ela decide o que sai no papel do galpão.
    await screen.findByText(/Nesta máquina/);
    expect(screen.queryByRole("button", { name: /Usar esta/i })).toBeNull();
  });
});
