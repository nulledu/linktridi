import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { LeitorCodigo } from "../LeitorCodigo";

// ── Fechar o leitor no meio da largada do ZXing ──────────────────────────────
// `decodeFromVideoElement` é assíncrono e o `pararRef` só era preenchido DEPOIS
// dele. Quem fechava o leitor nesse intervalo (iPhone: o ZXing é o motor, e a
// largada leva alguns quadros) deixava o laço de leitura rodando sem dono — e
// o próximo código lido chamava `onLer`/`onFechar` de um componente que já não
// existia.

const zx = vi.hoisted(() => ({
  chamado: false,
  soltar: null as ((c: { stop: () => void }) => void) | null,
  ler: null as ((res: { getText: () => string } | undefined) => void) | null,
}));

vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromVideoElement(_v: HTMLVideoElement, cb: (res: { getText: () => string } | undefined) => void) {
      zx.chamado = true;
      zx.ler = cb;
      return new Promise((res) => { zx.soltar = res; });
    }
  },
}));

beforeEach(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(() => Promise.resolve({ getTracks: () => [] })) },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
});
afterEach(() => {
  vi.restoreAllMocks();
  delete (navigator as { mediaDevices?: unknown }).mediaDevices;
});

describe("LeitorCodigo — ZXing", () => {
  it("fechar enquanto o ZXing arma o leitor desliga o laço e não chama ninguém depois", async () => {
    const onLer = vi.fn();
    const onFechar = vi.fn();
    const { unmount } = render(<LeitorCodigo onLer={onLer} onFechar={onFechar} />);

    await waitFor(() => expect(zx.chamado).toBe(true));
    unmount();

    const stop = vi.fn();
    zx.soltar!({ stop });
    await waitFor(() => expect(stop).toHaveBeenCalled());

    zx.ler!({ getText: () => "7891234567895" });
    expect(onLer).not.toHaveBeenCalled();
    expect(onFechar).not.toHaveBeenCalled();
  });
});
