import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const estado = vi.hoisted(() => ({
  chaves: [] as string[],
  tabelas: {} as Record<string, Array<Record<string, unknown>>>,
  inseridos: [] as Array<{ tabela: string; linha: Record<string, unknown> }>,
  marcasRecebidas: null as Map<string, string[]> | null,
}));

vi.mock("@/lib/require-auth", () => {
  const perfil = { id: "u1", name: "Pessoa", username: "pessoa", role: "user" };
  return {
    getProfileForModule: async (k: string) => (estado.chaves.includes(k) ? perfil : null),
    getProfileForAnyModule: async (...ks: string[]) => (ks.some((k) => estado.chaves.includes(k)) ? perfil : null),
    requireModuleKeys: async (k: string) => {
      if (!estado.chaves.includes(k)) throw new Error(`redirect:${k}`);
      return { profile: perfil, keys: estado.chaves };
    },
  };
});

// PostgREST de mentira com `max-rows = 1000` (o `.limit(5000)` não sobe o teto).
vi.mock("@/lib/supabase/server", () => {
  const consulta = (tabela: string) => {
    const filtros: Array<(r: Record<string, unknown>) => boolean> = [];
    let range: [number, number] | null = null;
    let limite: number | null = null;
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => { filtros.push((r) => r[c] === v); return q; },
      gte: (c: string, v: string) => { filtros.push((r) => String(r[c]) >= v); return q; },
      lte: (c: string, v: string) => { filtros.push((r) => String(r[c]) <= v); return q; },
      in: (c: string, vs: unknown[]) => { filtros.push((r) => vs.includes(r[c])); return q; },
      order: () => q,
      limit: (n: number) => { limite = n; return q; },
      range: (de: number, ate: number) => { range = [de, ate]; return q; },
      insert: async (linha: Record<string, unknown>) => { estado.inseridos.push({ tabela, linha }); return { error: null }; },
      then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => {
        const todas = (estado.tabelas[tabela] ?? []).filter((r) => filtros.every((f) => f(r)));
        const de = range?.[0] ?? 0;
        const ate = range?.[1] ?? (limite ?? Number.MAX_SAFE_INTEGER) - 1;
        return Promise.resolve({ data: todas.slice(de, Math.min(ate + 1, de + 1000)), error: null }).then(ok, falha);
      },
    };
    return q;
  };
  return { createSupabaseAdminClient: () => ({ from: (t: string) => consulta(t) }) };
});

vi.mock("@/lib/meta", () => ({ listAccounts: async () => [{ account_id: "123", name: "Conta", token: "tok" }] }));
vi.mock("@/lib/meta-warehouse", () => ({ serieCampanha: async () => null }));
vi.mock("@/lib/meta-preview", () => ({
  ehAdId: () => true,
  previewDoAnuncio: async () => ({ src: "https://www.facebook.com/ads/api/preview_iframe.php?d=1" }),
}));
vi.mock("@/lib/cache", () => ({ cached: async (_k: string, _ttl: number, fn: () => unknown) => fn() }));
vi.mock("@/lib/criativos/biblioteca", () => ({
  arquivosDe: async () => [],
  capasDe: async () => ({}),
  registrarArquivo: async () => ({ ok: true }),
  definirCapa: async () => ({ ok: true }),
  apagarArquivo: async () => ({ ok: true }),
}));
vi.mock("@/lib/creative-intelligence/server", () => ({
  buildCreativeIntelligenceFromRows: (input: { marks: Map<string, string[]> }) => {
    estado.marcasRecebidas = input.marks;
    return { ok: true };
  },
}));

import { GET as marcasGET } from "../../app/api/trafego/criativos/marcas/route";
import { GET as inteligenciaGET } from "../../app/api/trafego/criativos/inteligencia/route";
import { GET as previewGET } from "../../app/api/marketing/preview/route";
import { GET as arquivosGET } from "../../app/api/marketing/criativos/arquivos/route";
import { GET as porCodigoGET, POST as porCodigoPOST } from "../../app/api/marketing/criativos/por-codigo/route";
import { GET as gerenciarGET, POST as gerenciarPOST } from "../../app/api/trafego/campanha/gerenciar/route";
import { POST as statusPOST } from "../../app/api/trafego/campanha/status/route";
import { GET as diarioGET } from "../../app/api/trafego/campanha/diario/route";

const pedir = (caminho: string, corpo?: unknown) => {
  const u = new URL(caminho, "http://gaius.test");
  return { url: u.toString(), nextUrl: u, json: async () => corpo } as unknown as NextRequest;
};

describe("marcas dos criativos (tags) além das 1000", () => {
  beforeEach(() => {
    estado.chaves = ["trafego"];
    estado.tabelas = {
      trafego_criativo_marcas: Array.from({ length: 1_500 }, (_, i) => ({ chave: `k-${String(i).padStart(4, "0")}`, editor: null, tags: ["top"] })),
    };
  });

  it("GET /api/trafego/criativos/marcas devolve todas", async () => {
    const r = await marcasGET();
    expect((await r.json()).marcas).toHaveLength(1_500);
  });

  it("a inteligência do criativo recebe as tags de todos os pares", async () => {
    estado.tabelas.meta_ad_insights_daily = [{
      ad_account_id: "123", date: "2026-09-09", ad_id: "a1", ad_name: "Criativo",
      spend: 1, impressions: 1, clicks: 0, purchases_meta: 0, purchase_value_meta: 0,
    }];
    const r = await inteligenciaGET(pedir("/api/trafego/criativos/inteligencia?key=criativo&since=2026-09-01&until=2026-09-10&ads=a1"));
    expect(r.status).toBe(200);
    expect(estado.marcasRecebidas?.size).toBe(1_500);
  });
});

describe("leitura de criativo aberta a quem trabalha com criativo", () => {
  beforeEach(() => {
    estado.tabelas = { marketing_criativos: [{ id: "c1", prefixo: "JL", numero: 41, codigo: "JL-041", nome: "Depoimento", status: "no_ar" }] };
  });

  const perfis: string[][] = [
    ["marketing", "marketing:desempenho"],  // aba Desempenho → "Na Meta"
    ["marketing", "marketing:criar"],       // sobe a peça e precisa vê-la
    ["marketing", "marketing:ver"],
    ["trafego", "trafego:analisar"],
  ];
  for (const chaves of perfis) {
    it(`${chaves[1]} lê a prévia, as peças e o elo por código`, async () => {
      estado.chaves = chaves;
      expect((await previewGET(pedir("/api/marketing/preview?adId=120200000000001"))).status).toBe(200);
      expect((await arquivosGET(pedir("/api/marketing/criativos/arquivos?criativo=c1"))).status).toBe(200);
      expect((await porCodigoGET(pedir("/api/marketing/criativos/por-codigo?codigos=JL-041"))).status).toBe(200);
    });
  }

  it("sem nenhuma chave de criativo continua 403", async () => {
    estado.chaves = ["financeiro:ver"];
    expect((await previewGET(pedir("/api/marketing/preview?adId=120200000000001"))).status).toBe(403);
    expect((await arquivosGET(pedir("/api/marketing/criativos/arquivos?criativo=c1"))).status).toBe(403);
    expect((await porCodigoGET(pedir("/api/marketing/criativos/por-codigo?codigos=JL-041"))).status).toBe(403);
  });

  it("por-codigo liga os 300 códigos que aceita, inclusive os últimos em ordem alfabética", async () => {
    estado.chaves = ["marketing", "marketing:ver"];
    const codigos = Array.from({ length: 300 }, (_, i) => `JL-${String(i + 1).padStart(3, "0")}`);
    estado.tabelas = {
      marketing_criativos: codigos.map((codigo, i) => ({ id: `c${i}`, prefixo: "JL", numero: i + 1, codigo, nome: codigo, status: "no_ar" })),
    };
    const j = await (await porCodigoPOST(pedir("/api/marketing/criativos/por-codigo", { codigos }))).json();
    expect(Object.keys(j.criativos)).toHaveLength(300);
    expect(j.criativos["JL-300"]).toMatchObject({ id: "c299" });
  });
});

// A Meta "pendurada": a conexão abre e nunca responde. Só o sinal de prazo
// solta a requisição; sem ele pausar/orçamento fica preso até o maxDuration
// (60 s). O prazo vira um sinal já vencido pra o teste não esperar 10 s.
function metaPendurada(respostasAntes: unknown[] = []) {
  vi.spyOn(AbortSignal, "timeout").mockImplementation(() => AbortSignal.abort(new DOMException("prazo", "TimeoutError")));
  const fila = [...respostasAntes];
  vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
    if (fila.length) return Promise.resolve(new Response(JSON.stringify(fila.shift()), { status: 200 }));
    return new Promise((_, rejeitar) => {
      const s = init?.signal;
      if (!s) return;                      // sem prazo: pendura pra sempre
      if (s.aborted) return rejeitar(s.reason);
      s.addEventListener("abort", () => rejeitar(s.reason));
    });
  }));
}

describe("Graph sem resposta não prende a rota", () => {
  beforeEach(() => {
    estado.chaves = ["trafego", "trafego:gerenciar"];
    estado.inseridos = [];
    estado.tabelas = {};
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("GET gerenciar devolve erro limpo", async () => {
    metaPendurada();
    const r = await gerenciarGET(pedir("/api/trafego/campanha/gerenciar?campaignId=1&accountId=123"));
    expect(r.status).toBe(504);
    expect(await r.json()).toMatchObject({ error: "meta_sem_resposta" });
  }, 2_000);

  it("POST gerenciar: leitura do estado que não volta não chega a mexer na campanha", async () => {
    metaPendurada();
    const r = await gerenciarPOST(pedir("/api/trafego/campanha/gerenciar", { campaignId: "1", accountId: "123", acao: "pausar" }));
    expect(r.status).toBe(504);
    expect(estado.inseridos).toEqual([]);
  }, 2_000);

  it("POST gerenciar: escrita que não volta avisa que o resultado é incerto e fica registrada", async () => {
    metaPendurada([{ name: "Campanha", status: "ACTIVE" }]);
    const r = await gerenciarPOST(pedir("/api/trafego/campanha/gerenciar", { campaignId: "1", accountId: "123", acao: "pausar" }));
    expect(r.status).toBe(504);
    const j = await r.json();
    expect(j.error).toBe("meta_sem_resposta");
    expect(String(j.detalhe)).toMatch(/confira/i);
    expect(estado.inseridos).toEqual([
      expect.objectContaining({ tabela: "meta_acoes_campanha", linha: expect.objectContaining({ acao: "pausar", ok: false }) }),
    ]);
  }, 2_000);

  it("POST status responde sem o estado da conta que travou", async () => {
    metaPendurada();
    const r = await statusPOST(pedir("/api/trafego/campanha/status", { nodes: [{ id: "1", accountId: "123" }] }));
    expect(await r.json()).toEqual({ status: {} });
  }, 2_000);

  it("GET diario cai pro vazio em vez de esperar a Meta", async () => {
    metaPendurada();
    const r = await diarioGET(pedir("/api/trafego/campanha/diario?id=1&accountId=123&from=2026-09-01&to=2026-09-10"));
    expect(await r.json()).toMatchObject({ dias: [] });
  }, 2_000);
});
