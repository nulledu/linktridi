// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

/**
 * A parede de TV: o que ela busca, quando, e o que aparece primeiro.
 *
 * Dois defeitos que só a fatura (e a paciência de quem olha a TV) mostravam:
 *
 *  1. **Vendas esperavam as rotas opcionais.** O painel buscava vendas+config,
 *     depois produção, estoque e expedição UMA DEPOIS DA OUTRA, e só então
 *     punha as vendas na tela — até três idas a mais antes do primeiro número,
 *     em todo ciclo.
 *  2. **Toda parede carregava tudo duas vezes ao ligar.** O efeito do poll
 *     dependia de `config.refreshIntervalMs`, que o próprio `load()` grava: se
 *     a parede tem intervalo diferente do padrão (30 s), o efeito rearmava na
 *     hora e buscava tudo de novo. O intervalo novo tem que valer para o
 *     PRÓXIMO ciclo, sem busca extra — e o `ritmoAtual` continua mandando.
 */

const h = vi.hoisted(() => ({ grade: vi.fn() }));

vi.mock("../KioskShell", () => ({ KioskShell: ({ children }: { children?: ReactNode }) => children }));
vi.mock("../slides/Lottie", () => ({ LottieAnim: () => null }));
vi.mock("../slides/RankingSlide", () => ({ RankingSlide: () => null }));
vi.mock("../slides/RocketSlide", () => ({ RocketSlide: () => null }));
vi.mock("../slides/ProductsSlide", () => ({ ProductsSlide: () => null }));
vi.mock("../slides/MetricsSlide", () => ({ MetricsSlide: () => null }));
vi.mock("../slides/TrafficSlide", () => ({ TrafficSlide: () => null }));
vi.mock("../slides/Celebration", () => ({ Celebration: () => null }));
vi.mock("../ImagemDoPainel", () => ({ ImagemDoPainel: () => null }));
vi.mock("../useSinalDaParede", () => ({ useSinalDaParede: () => {} }));
vi.mock("../widgets/Widgets", () => ({
  GradeSlide: (p: { dados: unknown }) => { h.grade(p.dados); return "grade no ar"; },
}));
vi.mock("../setor/pecas", () => {
  const nada = () => null;
  return {
    BlocoQueAlterna: nada, CabecalhoPainel: nada, CartaoNumero: nada, ChamadaAceite: nada,
    FotoPessoa: nada, GraficoEnvios: nada, LegendaEnvios: nada, ResumoCelula: nada, Secao: nada,
    FilaParede: nada, KpiPastilha: nada, PessoaCard: nada,
    fmt: (n: number) => String(n), useAgoraMs: () => 0, useDingEmChamadaNova: () => {},
  };
});

import { Panel } from "../Panel";
import { LogisticaPanel } from "../setor/LogisticaPanel";
import { ProducaoPanel } from "../setor/ProducaoPanel";

// ── servidor de mentira ─────────────────────────────────────────────────────
type Resp = { ok: boolean; status: number; json: () => Promise<unknown> };
type Rota = () => Promise<Resp>;
const ok = (dados: unknown): Rota => () => Promise.resolve({ ok: true, status: 200, json: async () => dados });
const falha: Rota = () => Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
const nunca: Rota = () => new Promise<Resp>(() => {});

let pedidos: string[] = [];
const casa = (url: string, rota: string) => url === rota || url.startsWith(rota + "?");
function servidor(rotas: Record<string, Rota>) {
  vi.stubGlobal("fetch", vi.fn((entrada: unknown) => {
    const url = String(entrada);
    pedidos.push(url);
    const rota = Object.keys(rotas).find((r) => casa(url, r));
    return rota ? rotas[rota]() : falha();
  }));
}
const vezes = (rota: string) => pedidos.filter((u) => casa(u, rota)).length;

async function assentar() {
  for (let i = 0; i < 25; i++) await act(async () => { await Promise.resolve(); });
}
async function passar(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  await assentar();
}

const VENDAS = { salespeople: [], teams: [], updatedAt: "2026-09-09T13:00:00.000Z" };
const widget = (id: string, tipo: string) => ({ id, tipo, x: 0, y: 0, w: 4, h: 4, opcoes: {} });
const GALPAO = {
  layout: {
    slides: [{
      id: "s1", nome: "Galpão", ativo: true, duracaoMs: null,
      widgets: [widget("a", "producao"), widget("b", "estoque"), widget("c", "expedicao")],
    }],
  },
};
const QUARTA_10H = new Date(2026, 8, 9, 10, 0);   // expediente
const DOMINGO_10H = new Date(2026, 8, 13, 10, 0); // fábrica fechada

beforeEach(() => {
  pedidos = [];
  localStorage.clear();
  h.grade.mockClear();
  // A TV nunca está "escondida"; o jsdom não precisa ter opinião sobre isso.
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Panel (parede de vendas)", () => {
  const ultimosDados = () =>
    h.grade.mock.calls.at(-1)?.[0] as { producao: unknown; estoque: unknown; expedicao: unknown } | undefined;

  it("põe as vendas na tela sem esperar produção, estoque e expedição", async () => {
    servidor({
      "/api/sales": ok(VENDAS),
      "/api/config": ok(GALPAO),
      "/api/producao/painel": nunca, // pendurada: não pode segurar nada
      "/api/estoque/painel": ok({ disponivel: true, itens: 3 }),
      "/api/logistica/painel": ok({ fila: [] }),
    });
    render(<Panel />);
    await assentar();

    expect(screen.getByText("grade no ar")).toBeTruthy();
    // As três opcionais saem juntas: a produção pendurada não segura as outras.
    expect(vezes("/api/producao/painel")).toBe(1);
    expect(vezes("/api/estoque/painel")).toBe(1);
    expect(vezes("/api/logistica/painel")).toBe(1);
    const dados = ultimosDados();
    expect(dados?.estoque).toEqual({ disponivel: true, itens: 3 });
    expect(dados?.expedicao).toEqual({ fila: [] });
    expect(dados?.producao).toBeUndefined(); // ainda "carregando", não "fora"
  });

  it("uma rota opcional que cai não derruba as outras", async () => {
    servidor({
      "/api/sales": ok(VENDAS),
      "/api/config": ok(GALPAO),
      "/api/producao/painel": () => Promise.reject(new Error("rede")),
      "/api/estoque/painel": ok({ disponivel: true, itens: 3 }),
      "/api/logistica/painel": ok({ error: "fora" }),
    });
    render(<Panel />);
    await assentar();

    const dados = ultimosDados();
    expect(dados?.producao).toBeNull();
    expect(dados?.estoque).toEqual({ disponivel: true, itens: 3 });
    expect(dados?.expedicao).toBeNull();
  });

  it("liga com UMA carga, mesmo com intervalo diferente do padrão", async () => {
    servidor({ "/api/sales": ok(VENDAS), "/api/config": ok({ refreshIntervalMs: 60_000 }) });
    render(<Panel />);
    await assentar();

    expect(vezes("/api/sales")).toBe(1);
    expect(vezes("/api/config")).toBe(1);
  });

  it("o próximo ciclo segue o intervalo da parede, não o padrão de 30 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: QUARTA_10H });
    servidor({ "/api/sales": ok(VENDAS), "/api/config": ok({ refreshIntervalMs: 60_000 }) });
    render(<Panel />);
    await assentar();
    expect(vezes("/api/sales")).toBe(1);

    await passar(31_000);
    expect(vezes("/api/sales")).toBe(1);
    await passar(30_000);
    expect(vezes("/api/sales")).toBe(2);
  });

  it("fora do expediente o ciclo é o lento do ritmoAtual", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: DOMINGO_10H });
    servidor({ "/api/sales": ok(VENDAS), "/api/config": ok({ refreshIntervalMs: 60_000 }) });
    render(<Panel />);
    await assentar();

    await passar(5 * 60_000);
    expect(vezes("/api/sales")).toBe(1);
    await passar(5 * 60_000 + 1_000);
    expect(vezes("/api/sales")).toBe(2);
  });
});

describe.each([
  {
    nome: "LogisticaPanel",
    montar: () => <LogisticaPanel />,
    principal: "/api/logistica/painel",
    rotas: {
      "/api/logistica/painel": falha,
      "/api/atividades/painel": ok({ disponivel: true, chamadas: [] }),
    } as Record<string, Rota>,
  },
  {
    nome: "ProducaoPanel",
    montar: () => <ProducaoPanel />,
    principal: "/api/producao/painel",
    rotas: {
      "/api/producao/painel": falha,
      "/api/atividades/painel": ok({ disponivel: true, chamadas: [] }),
      "/api/logistica/painel": ok({ faltaProducao: [] }),
    } as Record<string, Rota>,
  },
])("$nome (parede de setor)", ({ montar, principal, rotas }) => {
  const comConfig = () => servidor({ ...rotas, "/api/config": ok({ refreshIntervalMs: 60_000 }) });

  it("liga com UMA carga, mesmo com intervalo diferente do padrão", async () => {
    comConfig();
    render(montar());
    await assentar();

    expect(vezes("/api/config")).toBe(1);
    expect(vezes(principal)).toBe(1);
  });

  it("o próximo ciclo segue o intervalo da parede, não o padrão de 30 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], now: QUARTA_10H });
    comConfig();
    render(montar());
    await assentar();

    await passar(31_000);
    expect(vezes("/api/config")).toBe(1);
    await passar(30_000);
    expect(vezes("/api/config")).toBe(2);
  });
});
