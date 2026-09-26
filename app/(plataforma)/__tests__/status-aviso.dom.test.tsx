import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { StatusAviso, StatusAlerta, STATUS_URL, caidosDe, motivoDaQueda, novidadesDeStatus, _zerarStatusAviso, type ItemStatus } from "../StatusAviso";

// ── Selo de "algo caiu" (página de status, Gatus na VPS) ─────────────────────
// Tudo verde não pode desenhar nada: o selo mora ao lado do sino em TODA tela
// do sistema, e um "0 fora do ar" permanente vira ruído que ninguém lê. Caiu:
// o selo diz quantos, tocar mostra O QUE caiu e por quê, "Ver mais" abre a
// página de status completa.

const ok = (key: string, name: string, group = "Terceiros"): ItemStatus => ({
  key, name, group, results: [{ success: true, status: 200, timestamp: new Date().toISOString() }],
});

const LISTA: ItemStatus[] = [
  ok("terceiros_vercel", "Vercel"),
  { key: "terceiros_supabase", name: "Supabase", group: "Terceiros", results: [{
    success: false, status: 200, timestamp: new Date().toISOString(),
    conditionResults: [{ condition: "[STATUS] == 200", success: true }, { condition: "[BODY].status.indicator != major", success: false }],
  }] },
  { key: "funis_chancela", name: "chancela", group: "Funis", results: [{
    success: false, status: 200, timestamp: new Date().toISOString(),
    conditionResults: [{ condition: "[BODY] != pat(*Este link não está disponível*)", success: false }],
  }] },
];

// A rota /api/status devolve `{ publico: false, itens, assinatura }` pra quem
// tem a chave. Array cru (o formato antigo do Gatus) é embrulhado aqui.
function responder(corpo: unknown) {
  const d = Array.isArray(corpo) ? { publico: false, assinatura: "a1", itens: corpo } : corpo;
  return vi.fn(async () => new Response(JSON.stringify(d), { status: 200, headers: { "Content-Type": "application/json" } }));
}

beforeEach(() => { _zerarStatusAviso(); try { localStorage.clear(); } catch { /* */ } });
afterEach(() => { vi.unstubAllGlobals(); });

describe("StatusAviso · regras", () => {
  it("só entra quem está vermelho no último resultado", () => {
    expect(caidosDe(LISTA).map((c) => c.nome)).toEqual(["Supabase", "chancela"]);
  });

  it("a falha vira frase, não condição do Gatus", () => {
    expect(motivoDaQueda(LISTA[1].results![0])).toBe("A página oficial marca instabilidade grave");
    expect(motivoDaQueda(LISTA[2].results![0])).toBe("O funil abriu dizendo que o link não está disponível");
    expect(motivoDaQueda({ success: false, errors: ["Cloud API: Partial outage"] })).toBe("Cloud API: Partial outage");
    expect(motivoDaQueda({ success: false, status: 502, conditionResults: [{ condition: "[STATUS] == 200", success: false }] })).toBe("Respondeu com erro 502");
  });
});

describe("StatusAviso · selo", () => {
  it("tudo verde não desenha nada", async () => {
    const f = responder([ok("a", "Vercel"), ok("b", "Supabase")]);
    vi.stubGlobal("fetch", f);
    const { container } = render(<StatusAviso />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    await act(async () => {});
    expect(container.innerHTML).toBe("");
  });

  it("lê a rota do Gaius, nunca a API do Gatus (que deixou de ser aberta)", async () => {
    const f = responder([]);
    vi.stubGlobal("fetch", f);
    render(<StatusAviso />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    const url = String((f.mock.calls[0] as unknown[])[0]);
    expect(url).toMatch(/^\/api\/status/);
    expect(url).not.toContain(STATUS_URL);
  });

  it("resposta pública (sem a chave) não vira selo", async () => {
    vi.stubGlobal("fetch", responder({ publico: true, plataformas: [{ id: "gedux", nome: "gedux.com.br", estado: "caiu" }] }));
    const { container } = render(<StatusAviso />);
    await act(async () => {});
    expect(container.innerHTML).toBe("");
  });

  it("caiu: mostra quantos, tocar lista o que caiu e Ver mais abre a página", async () => {
    vi.stubGlobal("fetch", responder(LISTA));
    render(<StatusAviso />);
    const selo = await screen.findByRole("button", { name: "2 fora do ar" });
    fireEvent.click(selo);
    const painel = await screen.findByRole("dialog", { name: "Fora do ar agora" });
    expect(painel.textContent).toContain("Supabase");
    expect(painel.textContent).toContain("chancela");
    expect(painel.textContent).toContain("O funil abriu dizendo que o link não está disponível");
    // Ver mais leva pra página de status DENTRO do Gaius, na mesma aba.
    const verMais = screen.getByRole("link", { name: /Ver mais/ });
    expect(verMais.getAttribute("href")).toBe("/status");
    expect(verMais.getAttribute("target")).toBeNull();
    // Portal: a folha não mora dentro do Shell (transform/overflow de ancestral).
    expect(painel.parentElement).toBe(document.body);
  });

  it("página de status fora do ar não vira alarme falso", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const { container } = render(<StatusAviso />);
    await act(async () => {});
    expect(container.innerHTML).toBe("");
  });
});

// ── Aviso na tela (StatusAlerta) ─────────────────────────────────────────────
// Pedido: "quando cair alguma coisa, aparecer notificação em algum lugar da
// tela". O que não pode: avisar a mesma queda de novo a cada ciclo ou a cada
// recarga (vira ruído e a pessoa passa a ignorar), e ficar mostrando o que já
// voltou.
describe("StatusAlerta · aviso na tela", () => {
  it("queda nova avisa; a mesma queda de novo, não; o que voltou sai", () => {
    const c = (key: string, nome: string) => ({ key, nome, grupo: "", motivo: "", quando: null });
    const primeira = novidadesDeStatus([c("a", "Supabase")], []);
    expect(primeira.novos.map((x) => x.nome)).toEqual(["Supabase"]);
    const repetida = novidadesDeStatus([c("a", "Supabase")], primeira.agora);
    expect(repetida.novos).toEqual([]);
    const voltou = novidadesDeStatus([], repetida.agora);
    expect(voltou.voltaram.map((x) => x.nome)).toEqual(["Supabase"]);
    expect(voltou.agora).toEqual([]);
  });

  it("caiu: cartão com o que caiu e o atalho pro /status, até dispensar", async () => {
    vi.stubGlobal("fetch", responder(LISTA));
    render(<StatusAlerta />);
    const cartao = await screen.findByRole("alert");
    expect(cartao.textContent).toContain("2 coisas caíram");
    expect(cartao.textContent).toContain("Supabase");
    expect(screen.getByRole("link", { name: /Ver o status/ }).getAttribute("href")).toBe("/status");
    fireEvent.click(screen.getByRole("button", { name: "Dispensar aviso" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("recarregar a página não repete o aviso da mesma queda", async () => {
    vi.stubGlobal("fetch", responder(LISTA));
    const { unmount } = render(<StatusAlerta />);
    await screen.findByRole("alert");
    unmount();
    _zerarStatusAviso(); // nova carga da página: cache de memória zerado, localStorage não
    render(<StatusAlerta />);
    await act(async () => {});
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
