import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AjustarNoLugar } from "../AjustarNoLugar";

/**
 * A placa de prateleira aberta no celular — o caminho INTEIRO de escrita.
 *
 * Este arquivo existe porque a página é pública e a metade que escreve só
 * aparece depois de um toque que pergunta a permissão: não dá pra conferir no
 * navegador sem digitar credencial, e credencial não se digita aqui. Então o
 * fluxo se prova aqui, passo a passo, com a rede fingida.
 *
 * O que se trava é a sequência que o dono relatou não funcionar: bipar a placa
 * → mexer → guardar produto → ele aparece guardado.
 */

const ITENS = [
  { id: "i1", nome: "Almofada 11", quantidade: 26, unidade: "un" },
];

/** Responde por ROTA, que é o que distingue os três gates envolvidos. */
function rede(over: Record<string, { ok?: boolean; status?: number; body?: unknown }> = {}) {
  const padrao: Record<string, { ok?: boolean; status?: number; body?: unknown }> = {
    "/api/estoque/ajuste-qr": { body: { logado: true, pode: true, podeMover: true } },
    "/api/estoque/consultar": { body: { ok: true, itens: [{ id: "i9", nome: "Fita crepe", quantidade: 3, unidade: "un" }] } },
    "/api/estoque/locais/itens": { body: { ok: true, movidos: 1 } },
  };
  return vi.fn((url: string) => {
    const chave = Object.keys({ ...padrao, ...over }).find((k) => String(url).startsWith(k));
    const r = { ...padrao, ...over }[chave ?? ""] ?? {};
    return Promise.resolve({
      ok: r.ok ?? (r.status ?? 200) < 400, status: r.status ?? 200,
      json: () => Promise.resolve(r.body ?? {}),
    } as Response);
  });
}

beforeEach(() => { vi.stubGlobal("fetch", rede()); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function montar(props: Partial<React.ComponentProps<typeof AjustarNoLugar>> = {}) {
  return render(<AjustarNoLugar itens={ITENS} local="A" localId="L-A" {...props} />);
}

describe("o convite aparece SEMPRE — inclusive na placa vazia", () => {
  it("com itens, convida a mexer", () => {
    montar();
    expect(screen.getByRole("button", { name: /Mexer no estoque daqui/ })).toBeTruthy();
  });

  it("VAZIA, convida a guardar — é onde se põe a primeira peça", () => {
    // O componente inteiro sumia quando não havia item (`if (!itens.length)
    // return null`). Bipar uma prateleira nova não oferecia nada, justo no
    // caso em que a pessoa está com a caixa na mão pra guardar ali.
    montar({ itens: [] });
    expect(screen.getByRole("button", { name: /Guardar algo aqui/ })).toBeTruthy();
  });
});

describe("guardar produto pela placa — o fluxo que o dono relatou não funcionar", () => {
  it("da placa VAZIA até o produto guardado, sem sair da tela", async () => {
    montar({ itens: [] });

    // 1. toque no convite → pergunta a permissão
    fireEvent.click(screen.getByRole("button", { name: /Guardar algo aqui/ }));
    const guardar = await screen.findByRole("button", { name: /Guardar produto aqui/ });

    // 2. abre a folha de busca
    fireEvent.click(guardar);
    const campo = await screen.findByLabelText(/Buscar produto/);

    // 3. busca (2+ letras, e só no Enter/botão — não a cada tecla)
    fireEvent.change(campo, { target: { value: "fita" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    const achado = await screen.findByRole("button", { name: /Fita crepe/ });

    // 4. marca e grava
    fireEvent.click(achado);
    fireEvent.click(screen.getByRole("button", { name: /Guardar 1 produto/ }));

    await waitFor(() => {
      const chamadas = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls;
      const post = chamadas.find(([u, i]) => String(u).startsWith("/api/estoque/locais/itens") && i?.method === "POST");
      expect(post, "tem de gravar").toBeTruthy();
      const corpo = JSON.parse(String(post![1]!.body));
      expect(corpo.localId).toBe("L-A");     // o UUID da placa, não o código
      expect(corpo.itemIds).toEqual(["i9"]);
    });

    // 5. o produto passa a aparecer guardado, sem recarregar a página
    await waitFor(() => expect(screen.getByText(/agora mora em A/)).toBeTruthy());
  });

  it("busca de UMA letra não vai à rede — seria uma invocação por tecla", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Mexer no estoque daqui/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Guardar produto aqui/ }));
    fireEvent.change(await screen.findByLabelText(/Buscar produto/), { target: { value: "f" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/duas letras/));
    const urls = (globalThis.fetch as unknown as { mock: { calls: [string][] } }).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith("/api/estoque/consultar"))).toBe(false);
  });

  it("se a BUSCA volta 403, a placa diz QUAL permissão falta", async () => {
    // O beco que existia: `podeMover` true (o papel atravessa) e a busca
    // gateada por chave pura. O botão aparecia e a busca morria calada.
    vi.stubGlobal("fetch", rede({
      "/api/estoque/consultar": { status: 403, body: { error: "forbidden", detalhe: "Você não tem a permissão “Ver catálogo / itens” do Estoque." } },
    }));
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Mexer no estoque daqui/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Guardar produto aqui/ }));
    fireEvent.change(await screen.findByLabelText(/Buscar produto/), { target: { value: "fita" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Ver catálogo \/ itens/));
  });
});

describe("quem é você decide o que aparece", () => {
  it("deslogado manda ENTRAR e VOLTAR pra esta placa", async () => {
    // O caso mais comum do mundo real: a câmera abre o QR no navegador padrão,
    // que não é aquele onde a pessoa está logada no ERP. Sem o `?next=`, entrar
    // jogava a pessoa no início do sistema e ela perdia a prateleira que estava
    // bipando — que é onde se desiste.
    window.history.replaceState(null, "", "/g/a");
    vi.stubGlobal("fetch", rede({ "/api/estoque/ajuste-qr": { body: { logado: false, pode: false, podeMover: false } } }));
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Mexer no estoque daqui/ }));
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/navegador que a\s+câmera abriu/);
      expect(screen.getByRole("link", { name: /Entrar e voltar pra A/ }).getAttribute("href"))
        .toBe("/login?next=%2Fg%2Fa");
    });
  });

  it("sem podeMover, NÃO oferece guardar — botão que voltaria 403 não existe", async () => {
    vi.stubGlobal("fetch", rede({ "/api/estoque/ajuste-qr": { body: { logado: true, pode: true, podeMover: false } } }));
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Mexer no estoque daqui/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Ajustar/ })).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Guardar produto aqui/ })).toBeNull();
  });

  it("sem permissão nenhuma, diz as DUAS que resolvem", async () => {
    vi.stubGlobal("fetch", rede({ "/api/estoque/ajuste-qr": { body: { logado: true, pode: false, podeMover: false } } }));
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Mexer no estoque daqui/ }));
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/Ajustar quantidade/);
      expect(document.body.textContent).toMatch(/Cadastrar e apagar item/);
    });
  });
});

describe("tirar daqui", () => {
  it("item de SUBLUGAR não ganha o × — o endereço se muda onde está escrito", async () => {
    // Numa RUA todo item vem de um nível abaixo. Oferecer "tirar" ali mexeria
    // num endereço que a pessoa não está olhando.
    montar({ itens: [{ ...ITENS[0], deSublugar: true }] });
    fireEvent.click(screen.getByRole("button", { name: /Mexer no estoque daqui/ }));
    await waitFor(() => expect(screen.getByText(/num sublugar/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Tirar Almofada 11 de A/ })).toBeNull();
  });

  it("item DESTA placa ganha o ×, e ele manda `deOnde`", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /Mexer no estoque daqui/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Tirar Almofada 11 de A/ }));
    await waitFor(() => {
      const chamadas = (globalThis.fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls;
      const post = chamadas.find(([u, i]) => String(u).startsWith("/api/estoque/locais/itens") && i?.method === "POST");
      const corpo = JSON.parse(String(post![1]!.body));
      expect(corpo.localId).toBeNull();
      expect(corpo.deOnde).toBe("L-A");
    });
  });
});
