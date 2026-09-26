// @vitest-environment jsdom
//
// ── Cadastrar sem teclado: a foto e o código vêm da câmera ───────────────────
//
// Duas coisas que o cadastro de item ganhou e que se perdem calado:
//
// 1. O código lido pela câmera precisa GRUDAR no campo. O SKU tem um automático
//    que se reescreve sozinho a cada render enquanto o modo for "auto" — se o
//    código lido não desligar esse automático, ele aparece no campo e some um
//    quadro depois, parecendo leitura que não pegou.
//
// 2. A foto do item existe em DOIS caminhos (câmera e arquivo), e os dois têm de
//    subir pela mesma rota. Foi por isso que o envio virou uma função só.
//
// jsdom não tem câmera nem layout: o que se mede aqui é o estado, não o vídeo.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItemEditor } from "../ItemEditor";
import { esquecerAjustesDeImpressao } from "../Etiqueta";

// O leitor de código de verdade abre a câmera; aqui ele vira um botão que
// devolve um código, que é a única parte que o editor precisa saber.
vi.mock("../../ui/LeitorCodigo", () => ({
  LeitorCodigo: ({ onLer }: { onLer: (c: string) => void }) => (
    <button type="button" onClick={() => onLer("crb-77")}>simular leitura</button>
  ),
}));

// A câmera idem: devolve um arquivo, como faria a captura de um quadro.
vi.mock("../../ui/CameraFoto", () => ({
  CameraFoto: ({ onFoto }: { onFoto: (f: File) => void }) => (
    <button type="button" onClick={() => onFoto(new File(["x"], "item.jpg", { type: "image/jpeg" }))}>
      simular foto
    </button>
  ),
}));

beforeEach(() => {
  esquecerAjustesDeImpressao();
  vi.stubGlobal("fetch", vi.fn((url: string) => {
    if (String(url).includes("/api/upload")) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ url: "https://exemplo/foto.jpg" }) } as Response);
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) } as Response);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function abrir() {
  render(
    <ItemEditor
      hierarquiaInit="materia_prima"
      podeVerCusto={false}
      itens={[]}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  );
}

describe("cadastrar pelo que a câmera vê", () => {
  it("o código lido vira o SKU e NÃO é reescrito pelo automático", async () => {
    abrir();
    // Pelo rótulo, não pelo placeholder: o placeholder é o SKU sugerido, que
    // muda com a hierarquia — amarrar o teste a ele o quebraria na próxima vez
    // que alguém mexesse nos prefixos.
    const campo = screen.getByLabelText(/SKU/i) as HTMLInputElement;
    const antes = campo.value;

    await userEvent.click(screen.getByRole("button", { name: /Ler o código/i }));
    await userEvent.click(screen.getByRole("button", { name: "simular leitura" }));

    // Normalizado (maiúsculas) e — o que importa — ainda lá depois do render
    // seguinte, que é quando o SKU sugerido tentaria voltar.
    await waitFor(() => expect(campo.value).toBe("CRB-77"));
    expect(campo.value).not.toBe(antes);
  });

  it("a foto tirada na hora sobe pela mesma rota do arquivo", async () => {
    abrir();
    await userEvent.click(screen.getByRole("button", { name: /tirar foto/i }));
    await userEvent.click(screen.getByRole("button", { name: "simular foto" }));

    await waitFor(() => {
      const chamadas = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
      expect(chamadas.some((c) => String(c[0]).includes("/api/upload"))).toBe(true);
    });
    // E o botão passa a oferecer TROCAR: é como a tela diz que a foto entrou,
    // já que o quadrado da imagem não tem tamanho no jsdom.
    await waitFor(() => expect(screen.getByRole("button", { name: /tirar outra foto/i })).toBeTruthy());
  });
});
