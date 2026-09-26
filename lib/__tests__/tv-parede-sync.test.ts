import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * POST /api/tv/device/sync — o poll de TODA caixa da frota.
 *
 *  1. **Três idas independentes em série.** Heartbeat, versão da frota e fila
 *     de comandos não dependem uma da outra, mas saíam uma de cada vez: três
 *     round-trips por caixa por ciclo, que é tempo parado cobrado como CPU.
 *  2. **A versão publicada é a MESMA para a frota inteira.** Lê-la a cada
 *     caixa a cada ciclo é pagar N vezes pela mesma linha. Um minuto de cache
 *     por instância basta — e falha de leitura não pode ficar guardada.
 */

type Resposta = { data: unknown; error: unknown };

function fakeDb(respostas: Record<string, Resposta>) {
  const enviados: string[] = [];
  const pendentes: (() => void)[] = [];
  const from = (tabela: string) => {
    let metodo = "select";
    const b: Record<string, unknown> = {};
    for (const k of ["select", "eq", "in", "or", "order", "limit", "maybeSingle"]) b[k] = () => b;
    b.update = () => { metodo = "update"; return b; };
    // O supabase-js só dispara a requisição no `then` — é aqui que ela "sai".
    b.then = (ok?: (v: Resposta) => unknown, falha?: (e: unknown) => unknown) => {
      const chave = `${metodo} ${tabela}`;
      enviados.push(chave);
      return new Promise<Resposta>((r) =>
        pendentes.push(() => r(respostas[chave] ?? { data: null, error: null })),
      ).then(ok, falha);
    };
    return b;
  };
  const soltar = () => pendentes.splice(0).forEach((f) => f());
  return { from, enviados, soltar };
}

const m = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => m.db }));
vi.mock("@/app/api/tv/device/_device", () => ({
  autorizarTv: async () => ({ device: { id: "tv-1", nome: "Galpão" } }),
  respostaAuth: () => null,
}));

const VERSAO: Resposta = {
  data: { version_code: 4, version_name: "1.4", url: "https://x/tv.apk", sha256: "ab", obrigatoria: false },
  error: null,
};
const CMDS: Resposta = { data: [{ id: "c1", tipo: "reiniciar", args: null }], error: null };

const pedido = () =>
  new Request("http://tv.local/api/tv/device/sync", {
    method: "POST",
    body: JSON.stringify({ versionCode: 3, versionName: "1.3" }),
    headers: { "x-forwarded-for": "10.0.0.9" },
  }) as unknown as NextRequest;

const macro = () => new Promise((r) => setTimeout(r, 0));
async function ate<T>(p: Promise<T>, db: ReturnType<typeof fakeDb>): Promise<T> {
  let feito = false;
  p.then(() => { feito = true; }, () => { feito = true; });
  for (let i = 0; i < 50 && !feito; i++) { db.soltar(); await macro(); }
  return p;
}

async function rota() {
  vi.resetModules(); // o cache da versão mora no módulo `lib/cache`
  return (await import("@/app/api/tv/device/sync/route")).POST;
}

let db: ReturnType<typeof fakeDb>;
beforeEach(() => {
  db = fakeDb({ "select tv_versoes": VERSAO, "select tv_comandos": CMDS });
  m.db = db;
});
afterEach(() => { vi.useRealTimers(); });

describe("/api/tv/device/sync", () => {
  it("heartbeat, versão e comandos saem juntos", async () => {
    const POST = await rota();
    const p = POST(pedido());
    for (let i = 0; i < 5; i++) await macro(); // nenhuma resposta do banco ainda

    expect([...db.enviados].sort()).toEqual(["select tv_comandos", "select tv_versoes", "update tv_dispositivos"]);

    const j = await (await ate(p, db)).json();
    expect(j.atualizacao).toMatchObject({ versionCode: 4, versionName: "1.4" });
    expect(j.comandos).toHaveLength(1);
    expect(j.comandos[0].id).toBe("c1");
    // A entrega só é gravada depois de a fila ser lida.
    expect(db.enviados.at(-1)).toBe("update tv_comandos");
  });

  it("a versão da frota é lida uma vez por minuto, não por caixa por ciclo", async () => {
    const POST = await rota();
    await ate(POST(pedido()), db);
    await ate(POST(pedido()), db);

    const n = (k: string) => db.enviados.filter((e) => e === k).length;
    expect(n("select tv_versoes")).toBe(1);
    expect(n("update tv_dispositivos")).toBe(2); // heartbeat é por caixa, sempre
    expect(n("select tv_comandos")).toBe(2);    // fila é por caixa, sempre
  });

  it("passado o minuto, a versão é relida (publicação nova chega à frota)", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 9, 10, 0) });
    const POST = await rota();
    await ate(POST(pedido()), db);
    vi.setSystemTime(new Date(2026, 8, 9, 10, 1, 1));
    await ate(POST(pedido()), db);

    expect(db.enviados.filter((e) => e === "select tv_versoes")).toHaveLength(2);
  });

  it("falha ao ler a versão não fica guardada", async () => {
    db = fakeDb({ "select tv_versoes": { data: null, error: { message: "timeout" } }, "select tv_comandos": CMDS });
    m.db = db;
    const POST = await rota();

    const j1 = await (await ate(POST(pedido()), db)).json();
    expect(j1.atualizacao).toBeNull();
    expect(j1.comandos).toHaveLength(1); // o resto do ciclo segue normal

    const ok = fakeDb({ "select tv_versoes": VERSAO, "select tv_comandos": CMDS });
    m.db = ok;
    const j2 = await (await ate(POST(pedido()), ok)).json();
    expect(ok.enviados).toContain("select tv_versoes");
    expect(j2.atualizacao).toMatchObject({ versionCode: 4 });
  });
});
