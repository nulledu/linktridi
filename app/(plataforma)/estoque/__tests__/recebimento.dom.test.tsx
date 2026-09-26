import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// O que esta tela não pode voltar a fazer:
//
// 1. Dizer "Nenhuma compra neste filtro" quando na verdade a carga FALHOU. Ela
//    não tinha `catch`: um 500 (ou o 401 em JSON que o middleware devolve
//    quando a sessão expira) deixava `d.compras` indefinido e quem abriu a aba
//    pra ver o que está pra chegar concluía que não havia nada pendente.
// 2. Mandar o item como texto livre. Sem `estoque_item_id` a compra não se liga
//    ao catálogo, o custo não gruda no item e o recebimento cria um item
//    paralelo por causa de um caractere de diferença no nome.
// 3. Deixar a compra com divergência presa nos pendentes pra sempre — a única
//    saída era marcá-la como CANCELADA, mentindo sobre uma compra que chegou.
//
// jsdom não tem motor de layout: nada de geometria aqui. Alvo de toque e
// largura se conferem no navegador.
import { RecebimentoPanel } from "../RecebimentoPanel";

const COMPRA_DIVERGENTE = {
  id: "c1", item_nome: "Almofada N.3", categoria: "Almofadas", unidade: "un",
  estoque_item_id: null, quantidade_comprada: 10, quantidade_recebida: 10,
  fornecedor: "Feltros Brasil", preco_unit: 7.5,
  codigo_rastreio: null, codigo_recebimento: null, nota_fiscal: null, pedido_ref: null,
  palavra_chave: null, prioridade: "normal", previsao_entrega: null, status: "divergencia",
  solicitante: null, criado_por: null, observacoes: null, estoque_erro: "o item do catálogo está sem hierarquia",
  comprado_em: null, created_at: "2026-08-01T10:00:00Z", updated_at: "2026-08-01T10:00:00Z",
};

const DASH = { aguardando: 1, recebidosHoje: 0, divergencias: 1, parciais: 0, criticos: 0, abaixoMinimo: 0, comprasPendentes: 1 };

function resposta(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

/** Rede falsa por rota. Guarda tudo que saiu, pra inspecionar o corpo do POST. */
function rede(mapa: Record<string, unknown>, opcoes: { falharLista?: boolean } = {}) {
  const enviados: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn((url: string, init?: RequestInit) => {
    enviados.push({ url, init });
    if (url.startsWith("/api/recebimento/compras") && opcoes.falharLista && !init?.method) {
      return Promise.resolve(resposta({ error: "unauthorized" }, false, 401));
    }
    for (const [rota, body] of Object.entries(mapa)) {
      if (url.startsWith(rota)) return Promise.resolve(resposta(body));
    }
    return Promise.resolve(resposta({ ok: true }));
  });
  return { fn, enviados };
}

const MAPA_PADRAO = {
  "/api/recebimento/compras": { compras: [COMPRA_DIVERGENTE], dashboard: DASH },
  "/api/estoque-itens": { itens: [{ id: "i1", nome: "Almofada N.3", hierarquia: "peca", categoria: "Almofadas", unidade: "un", quantidade: 3, qtd_minima: 0, ativo: true, produzido: false, serializado: false, imagem_url: null }], podeGerir: true, podeCadastrar: true, podeAjustar: true },
  "/api/estoque/fornecedores": { fornecedores: [{ id: "f1", nome: "Feltros Brasil", ativo: true }], podeGerir: true },
  "/api/estoque/locais": { locais: [{ id: "l1", nome: "Prateleira B2", codigo: "B2", ativo: true }], podeGerir: true },
};

afterEach(() => vi.unstubAllGlobals());

describe("carga que falha", () => {
  it("não finge que não há nada pendente", async () => {
    const { fn } = rede(MAPA_PADRAO, { falharLista: true });
    vi.stubGlobal("fetch", fn);
    render(<RecebimentoPanel />);
    await waitFor(() => expect(screen.getByText(/Não foi possível carregar as compras/)).toBeTruthy());
    expect(screen.queryByText(/Nenhuma compra neste filtro/)).toBeNull();
    expect(screen.getByRole("button", { name: /Tentar de novo/ })).toBeTruthy();
  });

  it("fetch que estoura também vira aviso, não lista vazia", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    render(<RecebimentoPanel />);
    await waitFor(() => expect(screen.getByText(/Não foi possível carregar as compras/)).toBeTruthy());
  });
});

describe("compra com divergência", () => {
  beforeEach(() => {
    const { fn } = rede(MAPA_PADRAO);
    vi.stubGlobal("fetch", fn);
  });

  it("mostra na lista que a mercadoria chegou sem entrar no estoque", async () => {
    render(<RecebimentoPanel />);
    await waitFor(() => expect(screen.getByText(/não entrou no estoque/)).toBeTruthy());
  });

  it("oferece encerrar sem precisar mentir que foi cancelada", async () => {
    render(<RecebimentoPanel />);
    await waitFor(() => screen.getByText("Almofada N.3"));
    fireEvent.click(screen.getByText("Almofada N.3"));
    await waitFor(() => expect(screen.getByRole("button", { name: /Encerrar com divergência/ })).toBeTruthy());
    expect(screen.getByRole("button", { name: /Cancelar compra/ })).toBeTruthy();
  });
});

describe("registrar compra", () => {
  it("manda o vínculo com o catálogo, não só o nome digitado", async () => {
    const { fn, enviados } = rede(MAPA_PADRAO);
    vi.stubGlobal("fetch", fn);
    render(<RecebimentoPanel />);
    await waitFor(() => screen.getByText("Almofada N.3"));

    fireEvent.click(screen.getByRole("button", { name: /Registrar compra/ }));
    // O seletor de item busca o catálogo — espera ele chegar.
    await waitFor(() => expect(enviados.some((e) => e.url.startsWith("/api/estoque-itens"))).toBe(true));

    // Abre o seletor do catálogo e escolhe o item de verdade.
    fireEvent.click(screen.getByLabelText("Item do catálogo"));
    await waitFor(() => screen.getByText(/Almofada N\.3 · Peça/));
    fireEvent.click(screen.getByText(/Almofada N\.3 · Peça/));

    fireEvent.change(screen.getByLabelText("Quantidade"), { target: { value: "5" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Registrar compra" }).at(-1)!);

    await waitFor(() => expect(enviados.some((e) => e.init?.method === "POST" && e.url === "/api/recebimento/compras")).toBe(true));
    const post = enviados.find((e) => e.init?.method === "POST" && e.url === "/api/recebimento/compras")!;
    const corpo = JSON.parse(String(post.init?.body));
    expect(corpo.estoque_item_id, "sem o vínculo o custo da compra não gruda no item").toBe("i1");
    expect(corpo.item_nome).toBe("Almofada N.3");
    expect(corpo.quantidade_comprada).toBe(5);
  });

  it("item novo só sai com hierarquia — senão nasce fora das 8 abas", async () => {
    const { fn, enviados } = rede(MAPA_PADRAO);
    vi.stubGlobal("fetch", fn);
    render(<RecebimentoPanel />);
    await waitFor(() => screen.getByText("Almofada N.3"));

    fireEvent.click(screen.getByRole("button", { name: /Registrar compra/ }));
    fireEvent.click(screen.getByLabelText("Item do catálogo"));
    await waitFor(() => screen.getByText(/Item que ainda não existe/));
    fireEvent.click(screen.getByText(/Item que ainda não existe/));

    fireEvent.change(screen.getByLabelText("Nome do item novo"), { target: { value: "Cola branca 5kg" } });
    fireEvent.change(screen.getByLabelText("Quantidade"), { target: { value: "2" } });
    // Sem hierarquia: a tela recusa e nada vai pro servidor.
    fireEvent.click(screen.getAllByRole("button", { name: "Registrar compra" }).at(-1)!);
    await waitFor(() => expect(screen.getByLabelText("Hierarquia")).toBeTruthy());
    expect(enviados.some((e) => e.init?.method === "POST")).toBe(false);

    fireEvent.click(screen.getByLabelText("Hierarquia"));
    await waitFor(() => screen.getByText("Insumo Indireto"));
    fireEvent.click(screen.getByText("Insumo Indireto"));
    fireEvent.click(screen.getAllByRole("button", { name: "Registrar compra" }).at(-1)!);

    await waitFor(() => expect(enviados.some((e) => e.init?.method === "POST")).toBe(true));
    const corpo = JSON.parse(String(enviados.find((e) => e.init?.method === "POST")!.init?.body));
    expect(corpo.hierarquia).toBe("insumo_indireto");
    expect(corpo.estoque_item_id).toBeNull();
  });
});
