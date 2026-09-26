import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LocaisPanel } from "../LocaisPanel";

// A aba Localização abre com zero lugares — e ela é a dependência de tudo:
// item sem lugar é item que ninguém acha no galpão, e a etiqueta sai sem
// endereço. Duas coisas não podem acontecer aqui:
//
// 1. Só cadastrar um de cada vez. Um corredor com seis prateleiras custava
//    sete aberturas de painel; é o caminho que ninguém percorre até o fim, e o
//    resultado medido é 0 lugares no banco.
// 2. O vazio não dizer o que a aba é nem qual é o primeiro passo.
//
// jsdom não tem motor de layout: nada de geometria aqui.

function resposta(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

/** Rede falsa. `locais` é o cadastro atual; guarda o que saiu no POST. */
function rede(locais: { id: string; nome: string; codigo: string; pai_id: string | null; ativo: boolean; ordem: number }[] = []) {
  const enviados: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn((url: string, init?: RequestInit) => {
    enviados.push({ url, init });
    if (url.startsWith("/api/estoque/locais") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { locais?: { codigo: string; nome: string }[] };
      return Promise.resolve(resposta({
        criados: (body.locais ?? []).map((l, i) => ({ id: `n${i}`, ...l })), jaExistiam: [], falhas: [],
      }));
    }
    if (url.startsWith("/api/estoque/locais")) return Promise.resolve(resposta({ locais, podeGerir: true }));
    if (url.startsWith("/api/estoque-itens")) return Promise.resolve(resposta({ itens: [] }));
    return Promise.resolve(resposta({ ok: true }));
  });
  return { fn, enviados };
}

afterEach(() => vi.unstubAllGlobals());

/** Abre a aba e o painel de colar, com o texto já digitado. */
async function colar(texto: string, cadastro: Parameters<typeof rede>[0] = []) {
  const { fn, enviados } = rede(cadastro);
  vi.stubGlobal("fetch", fn);
  render(<LocaisPanel />);
  fireEvent.click(await screen.findByRole("button", { name: /Cadastrar vários/ }));
  const area = await screen.findByLabelText(/Um por linha/);
  fireEvent.change(area, { target: { value: texto } });
  return { enviados };
}

const LUGAR = (codigo: string, nome: string, ordem = 0) =>
  ({ id: `id-${codigo}`, codigo, nome, pai_id: null, ativo: true, ordem });

describe("Localização — o vazio ensina em vez de só informar", () => {
  it("diz o que um lugar é e qual é o primeiro passo", async () => {
    vi.stubGlobal("fetch", rede().fn);
    render(<LocaisPanel />);

    expect(await screen.findByText(/Nenhum lugar cadastrado ainda/)).toBeTruthy();
    expect(screen.getByText(/onde a coisa mora de verdade/)).toBeTruthy();
    // O caminho largo primeiro, o estreito depois.
    expect(screen.getByRole("button", { name: /Cadastrar vários/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Um lugar só/ })).toBeTruthy();
  });

  it("sem permissão, não oferece botão que não existe", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) =>
      Promise.resolve(resposta(url.startsWith("/api/estoque/locais") ? { locais: [], podeGerir: false } : { itens: [] }))));
    render(<LocaisPanel />);

    expect(await screen.findByText(/Nenhum lugar cadastrado ainda/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Cadastrar vários/ })).toBeNull();
    expect(screen.getByText(/não cadastrar/)).toBeTruthy();
  });
});

describe("Localização — a estante inteira numa colagem", () => {
  it("uma faixa vira seis prateleiras, num pedido só", async () => {
    const { enviados } = await colar("A1..A6");

    expect(await screen.findByText(/6 vão entrar/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar 6/ }));

    await waitFor(() => {
      const post = enviados.find((e) => e.init?.method === "POST");
      expect(post).toBeTruthy();
      const body = JSON.parse(String(post!.init!.body)) as { locais: { codigo: string }[] };
      expect(body.locais.map((l) => l.codigo)).toEqual(["A1", "A2", "A3", "A4", "A5", "A6"]);
    });
  });

  it("mostra o código que VAI ser gravado antes de gravar", async () => {
    await colar("Prateleira do fundo");
    // O código sai do nome quando ninguém escreveu um: ver isso antes é o que
    // evita descobrir na etiqueta colada na prateleira.
    expect(await screen.findByText("PRATELEIRA-DO-FUNDO")).toBeTruthy();
  });

  it("o que já existe entra desmarcado e não vai no pedido", async () => {
    const { enviados } = await colar("B2 · Prateleira do fundo\nB3 · Prateleira do meio", [LUGAR("B2", "Fundo")]);

    expect(await screen.findByText(/1 vão entrar/)).toBeTruthy();
    // O chip diz a situação e a linha abaixo diz com que nome já existe.
    expect(screen.getAllByText(/já cadastrado/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar 1/ }));

    await waitFor(() => {
      const post = enviados.find((e) => e.init?.method === "POST");
      const body = JSON.parse(String(post!.init!.body)) as { locais: { codigo: string }[] };
      expect(body.locais.map((l) => l.codigo)).toEqual(["B3"]);
    });
  });

  it("desmarcar uma linha tira ela do pedido", async () => {
    const { enviados } = await colar("A1\nA2");

    const caixas = screen.getAllByRole("checkbox");
    fireEvent.click(caixas[0]);
    expect(await screen.findByText(/1 vão entrar/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar 1/ }));

    await waitFor(() => {
      const post = enviados.find((e) => e.init?.method === "POST");
      const body = JSON.parse(String(post!.init!.body)) as { locais: { codigo: string }[] };
      expect(body.locais.map((l) => l.codigo)).toEqual(["A2"]);
    });
  });

  it("o pai vale pra lista inteira, escolhido uma vez", async () => {
    const { enviados } = await colar("A1..A3", [LUGAR("CORREDOR-A", "Corredor A")]);

    // `GlassSelect` é um gatilho + painel, não um <select> nativo: abre e
    // escolhe pela linha, que é o que a pessoa faz.
    fireEvent.click(await screen.findByLabelText(/Todos dentro de/));
    fireEvent.click(await screen.findByText("CORREDOR-A · Corredor A"));
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar 3/ }));

    await waitFor(() => {
      const post = enviados.find((e) => e.init?.method === "POST");
      const body = JSON.parse(String(post!.init!.body)) as { pai_id: string };
      expect(body.pai_id).toBe("id-CORREDOR-A");
    });
  });
});
