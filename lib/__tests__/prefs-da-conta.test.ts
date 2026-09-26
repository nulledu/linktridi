import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  _zerarPrefsDaConta, escolherVersao, gravarPrefDaConta, lerPrefsDaConta, marcarUmaVez, salvarVersionado,
} from "../prefs-da-conta";

// ── Preferências da conta, vistas do navegador ──────────────────────────────
// Três defeitos que isto trava:
//  1. o Tour gravava "já vi" na conta a CADA carga de página, pra sempre — uma
//     invocação e um upsert por carga, contra o orçamento de execução;
//  2. cada tela do Tridify baixava TODAS as preferências (layouts de até 20 KB)
//     por conta própria: três GETs iguais pra desenhar uma página;
//  3. remontar antes de o PUT com debounce chegar lia o valor velho do servidor
//     e desfazia a troca que a pessoa tinha acabado de fazer.

function armazenamento() {
  const s: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in s ? s[k] : null),
    setItem: (k: string, v: string) => { s[k] = String(v); },
    removeItem: (k: string) => { delete s[k]; },
    clear: () => { for (const k of Object.keys(s)) delete s[k]; },
  };
}

const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

const metodo = (init: unknown) => (init as RequestInit | undefined)?.method ?? "GET";

beforeEach(() => { _zerarPrefsDaConta(); vi.stubGlobal("localStorage", armazenamento()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("leitura compartilhada", () => {
  it("três telas montando juntas fazem UMA ida ao servidor", async () => {
    const f = vi.fn(async () => resposta({ prefs: { "trafego.layout": [1] } }));
    vi.stubGlobal("fetch", f);
    const [a, b, c] = await Promise.all([lerPrefsDaConta(), lerPrefsDaConta(), lerPrefsDaConta()]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ "trafego.layout": [1] });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it("depois de um minuto lê de novo — troca feita em outro aparelho aparece", async () => {
    const f = vi.fn(async () => resposta({ prefs: {} }));
    vi.stubGlobal("fetch", f);
    await lerPrefsDaConta(1_000);
    await lerPrefsDaConta(31_000);
    expect(f).toHaveBeenCalledTimes(1);
    await lerPrefsDaConta(62_000);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("falha não fica guardada: a próxima tela tenta de novo", async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(resposta({ prefs: { a: 1 } }));
    vi.stubGlobal("fetch", f);
    expect(await lerPrefsDaConta()).toBeNull();
    expect(await lerPrefsDaConta()).toEqual({ a: 1 });
  });

  it("sem sessão (401) vira null, não exceção", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta({ error: "unauthorized" }, 401)));
    expect(await lerPrefsDaConta()).toBeNull();
  });
});

describe("gravação", () => {
  it("remontar logo depois de gravar enxerga o valor novo, sem nova ida", async () => {
    const f = vi.fn(async (_url: unknown, init?: unknown) =>
      metodo(init) === "PUT" ? resposta({ ok: true, em: 123 }) : resposta({ prefs: { "trafego.colunas": ["a"] } }));
    vi.stubGlobal("fetch", f);
    await lerPrefsDaConta();
    const gravando = gravarPrefDaConta("trafego.colunas", ["b"]);
    expect((await lerPrefsDaConta())?.["trafego.colunas"]).toEqual(["b"]);
    expect(await gravando).toEqual({ ok: true, em: 123 });
    expect(f.mock.calls.filter(([, init]) => metodo(init) === "GET")).toHaveLength(1);
  });

  it("o PUT vai com keepalive — recarregar a página não o mata no meio", async () => {
    const f = vi.fn(async () => resposta({ ok: true, em: 1 }));
    vi.stubGlobal("fetch", f);
    await gravarPrefDaConta("ui.rail", true);
    const init = (f.mock.calls[0] as unknown[] | undefined)?.[1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(String(init.body))).toEqual({ key: "ui.rail", value: true });
  });

  it("erro do servidor ou da rede devolve ok:false, sem lançar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta({ error: "failed" }, 500)));
    expect(await gravarPrefDaConta("x", 1)).toEqual({ ok: false });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await gravarPrefDaConta("x", 1)).toEqual({ ok: false });
  });
});

describe("marcar uma vez por aparelho", () => {
  it("quem já marcou não grava de novo a cada carga de página", async () => {
    const f = vi.fn(async () => resposta({ ok: true, em: 1 }));
    vi.stubGlobal("fetch", f);
    for (let i = 0; i < 3; i++) await marcarUmaVez("gaius:demo:conta", "demo.v1", true);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("se a gravação falhou, tenta de novo na próxima carga", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(resposta({ error: "failed" }, 500))
      .mockResolvedValueOnce(resposta({ ok: true, em: 2 }));
    vi.stubGlobal("fetch", f);
    await marcarUmaVez("k", "demo.v1", true);
    await marcarUmaVez("k", "demo.v1", true);
    await marcarUmaVez("k", "demo.v1", true);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe("versão: conta × cópia do aparelho", () => {
  it("conta mais nova vence", () => {
    expect(escolherVersao({ valor: false, em: "100" }, { valor: true, em: 200 }))
      .toEqual({ valor: true, adotarConta: true, reenviar: false });
  });

  it("cópia mais nova (cache velho do servidor) não é desfeita", () => {
    expect(escolherVersao({ valor: true, em: "300" }, { valor: false, em: 200 }))
      .toEqual({ valor: true, adotarConta: false, reenviar: false });
  });

  it("troca pendente vence e é reenviada", () => {
    expect(escolherVersao({ valor: true, em: "pendente" }, { valor: false, em: 9e12 }))
      .toEqual({ valor: true, adotarConta: false, reenviar: true });
  });

  it("cópia antiga sem versão adota a conta", () => {
    expect(escolherVersao({ valor: true, em: null }, { valor: false, em: 5 }))
      .toEqual({ valor: false, adotarConta: true, reenviar: false });
  });

  it("conta vazia recebe a cópia antiga (migração)", () => {
    expect(escolherVersao({ valor: true, em: null }, null))
      .toEqual({ valor: true, adotarConta: false, reenviar: true });
  });

  it("sem conta aqui (bancada /dev-*) usa a cópia e não envia nada", () => {
    expect(escolherVersao({ valor: true, em: "pendente" }, undefined))
      .toEqual({ valor: true, adotarConta: false, reenviar: false });
  });

  it("nada em lugar nenhum fica em null", () => {
    expect(escolherVersao({ valor: null, em: null }, null))
      .toEqual({ valor: null, adotarConta: false, reenviar: false });
  });
});

describe("salvar versionado", () => {
  it("marca pendente na hora e guarda a versão que o servidor gravou", async () => {
    let soltar = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { soltar = () => r(resposta({ ok: true, em: 777 })); })));
    const salvando = salvarVersionado("ui.rail", "gaius:rail", true);
    expect(localStorage.getItem("gaius:rail")).toBe("true");
    expect(localStorage.getItem("gaius:rail-em")).toBe("pendente");
    soltar();
    await salvando;
    expect(localStorage.getItem("gaius:rail-em")).toBe("777");
  });

  it("falhou → continua pendente (a próxima carga reenvia)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => resposta({ error: "failed" }, 500)));
    await salvarVersionado("ui.rail", "gaius:rail", false);
    expect(localStorage.getItem("gaius:rail-em")).toBe("pendente");
  });

  it("outra troca no meio do caminho continua pendente até ela subir", async () => {
    const soltas: Array<() => void> = [];
    let em = 0;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { const n = ++em; soltas.push(() => r(resposta({ ok: true, em: n }))); })));
    const a = salvarVersionado("ui.rail", "gaius:rail", true);
    const b = salvarVersionado("ui.rail", "gaius:rail", false);
    soltas[0]();
    await a;
    expect(localStorage.getItem("gaius:rail-em"), "a primeira confirmou, mas a tela já mostra a segunda").toBe("pendente");
    soltas[1]();
    await b;
    expect(localStorage.getItem("gaius:rail-em")).toBe("2");
  });
});
