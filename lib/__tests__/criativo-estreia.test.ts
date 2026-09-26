import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const estado = vi.hoisted(() => ({
  tokens: [] as string[],
  chaves: [] as string[],
  chamadas: [] as string[],
  /** O que cada token enxerga na Meta: id do nó → corpo. */
  meta: {} as Record<string, Record<string, Record<string, unknown>>>,
  /** `act_<conta>|<token>` → imagens da conta. */
  imagens: {} as Record<string, Array<Record<string, unknown>>>,
}));

vi.mock("@/lib/meta-tokens", () => ({ getAllTokens: async () => estado.tokens }));
vi.mock("@/lib/require-auth", () => ({
  getProfileForModule: async (k: string) => (estado.chaves.includes(k) ? { id: "u1" } : null),
}));
vi.mock("@/lib/cache", () => ({ cached: async (_k: string, _ttl: number, fn: () => unknown) => fn() }));

import { estreiaDoCriativo } from "../meta-estreia";
import { idadeDaEstreia, isoDaMeta, lerEstreia, maisAntiga, rotuloDaEstreia } from "../criativos-estreia";
import { GET } from "../../app/api/trafego/criativos/estreia/route";

// Ids no formato da Meta (só dígitos, 6+): `ehAdId` descarta o resto antes de
// gastar uma ida ao Graph.
const ORIGINAL = "120210000000001";
const COPIA = "120210000000002";
const IMAGEM = "120210000000003";
const OUTRA_CONTA = "120210000000004";

// Graph de mentira: cada token só enxerga os nós das contas dele, e um `?ids=`
// com UM id que o token não vê é recusado inteiro — como a Meta faz.
function graph(url: string): Record<string, unknown> {
  estado.chamadas.push(url);
  const u = new URL(url);
  const token = u.searchParams.get("access_token") ?? "";
  const nos = estado.meta[token] ?? {};
  const semPermissao = { error: { message: "(#100) Object does not exist or no permission", code: 100 } };
  if (u.pathname.endsWith("/adimages")) {
    const conta = u.pathname.split("/").at(-2);
    const hashes = JSON.parse(u.searchParams.get("hashes") ?? "[]") as string[];
    const todas = estado.imagens[`${conta}|${token}`];
    return todas ? { data: todas.filter((i) => hashes.includes(String(i.hash))) } : semPermissao;
  }
  const ids = u.searchParams.get("ids");
  if (ids) {
    const lista = ids.split(",");
    return lista.every((id) => id in nos) ? Object.fromEntries(lista.map((id) => [id, nos[id]])) : semPermissao;
  }
  return nos[u.pathname.split("/").pop() ?? ""] ?? semPermissao;
}

beforeEach(() => {
  estado.tokens = ["tokA", "tokB"];
  estado.chaves = ["trafego"];
  estado.chamadas = [];
  estado.meta = {};
  estado.imagens = {};
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ json: async () => graph(url) })));
});
afterEach(() => vi.unstubAllGlobals());

describe("estreia do criativo na Meta", () => {
  it("vem do upload do vídeo, não da cópia que está rodando", async () => {
    estado.meta.tokB = {
      [ORIGINAL]: { created_time: "2026-09-01T10:00:00-0300", account_id: "9", creative: { video_id: "5001" } },
      [COPIA]: { created_time: "2026-08-20T09:00:00-0300", account_id: "9", creative: { video_id: "5001" } },
      "5001": { created_time: "2026-03-12T14:22:10-0300" },
    };
    expect(await estreiaDoCriativo([ORIGINAL, COPIA])).toEqual({ em: "2026-03-12T17:22:10.000Z", fonte: "video" });
    // Lote por token: o tokA recusa, o tokB resolve o grupo inteiro, e o vídeo
    // é uma pergunta só. Um a um aqui seria uma ida por anúncio por token.
    expect(estado.chamadas).toHaveLength(3);
  });

  it("sem permissão pra ler o vídeo, fica o anúncio mais antigo — nunca uma data inventada", async () => {
    estado.meta.tokA = {
      [ORIGINAL]: { created_time: "2026-09-01T10:00:00-0300", account_id: "9", creative: { video_id: "5001" } },
      [COPIA]: { created_time: "2026-08-20T09:00:00-0300", account_id: "9", creative: { video_id: "5001" } },
      "5001": { error: { message: "(#10) Application does not have permission for this action", code: 10 } },
    };
    expect(await estreiaDoCriativo([ORIGINAL, COPIA])).toEqual({ em: "2026-08-20T12:00:00.000Z", fonte: "anuncio" });
  });

  it("imagem: pergunta o upload pela conta, só dos hashes do criativo", async () => {
    estado.meta.tokA = { [IMAGEM]: { created_time: "2026-02-01T08:00:00-0300", account_id: "9", creative: { image_hash: "h1" } } };
    estado.imagens["act_9|tokA"] = [
      { hash: "h1", created_time: "2025-11-02T09:00:00+0000" },
      { hash: "h2", created_time: "2020-01-01T00:00:00+0000" },
    ];
    expect(await estreiaDoCriativo([IMAGEM])).toEqual({ em: "2025-11-02T09:00:00.000Z", fonte: "imagem" });
  });

  it("grupo espalhado por contas de tokens diferentes: o lote é recusado e cada anúncio acha o seu token", async () => {
    estado.meta.tokA = { [ORIGINAL]: { created_time: "2026-05-05T10:00:00-0300", account_id: "9", creative: {} } };
    estado.meta.tokB = { [OUTRA_CONTA]: { created_time: "2026-04-04T10:00:00-0300", account_id: "7", creative: {} } };
    expect(await estreiaDoCriativo([ORIGINAL, OUTRA_CONTA])).toEqual({ em: "2026-04-04T13:00:00.000Z", fonte: "anuncio" });
  });

  it("sem token conectado ou sem id de anúncio válido: null, sem chamar a Meta", async () => {
    expect(await estreiaDoCriativo(["ad_0_0", "1001", ""])).toBeNull();
    estado.tokens = [];
    expect(await estreiaDoCriativo([ORIGINAL])).toBeNull();
    expect(estado.chamadas).toHaveLength(0);
  });
});

describe("GET /api/trafego/criativos/estreia", () => {
  const pedir = (q: string) => {
    const u = new URL(`/api/trafego/criativos/estreia${q}`, "http://gaius.test");
    return { url: u.toString(), nextUrl: u } as unknown as NextRequest;
  };

  it("exige a área de tráfego", async () => {
    estado.chaves = [];
    expect((await GET(pedir(`?ads=${ORIGINAL}`))).status).toBe(403);
  });

  it("recusa pedido sem id de anúncio", async () => {
    expect((await GET(pedir("?ads=abc,,"))).status).toBe(400);
  });

  it("devolve a data e, sem resposta da Meta, diz que não sabe sem guardar", async () => {
    estado.meta.tokA = { [ORIGINAL]: { created_time: "2026-05-05T10:00:00-0300", account_id: "9", creative: {} } };
    const ok = await GET(pedir(`?ads=${ORIGINAL}`));
    expect(await ok.json()).toEqual({ em: "2026-05-05T13:00:00.000Z", fonte: "anuncio" });

    const semMeta = await GET(pedir("?ads=9999999"));
    expect(await semMeta.json()).toEqual({ em: null });
    expect(semMeta.headers.get("cache-control")).toBe("no-store");
  });
});

describe("data da estreia na tela", () => {
  it("lê o fuso da Meta sem dois-pontos", () => {
    expect(isoDaMeta("2026-03-12T14:22:10-0300")).toBe("2026-03-12T17:22:10.000Z");
    expect(isoDaMeta("2025-11-02T09:00:00+0000")).toBe("2025-11-02T09:00:00.000Z");
    expect(isoDaMeta("")).toBeNull();
    expect(isoDaMeta("ontem")).toBeNull();
    expect(isoDaMeta(null)).toBeNull();
  });

  it("fica a mais antiga; no empate a peça vence o anúncio", () => {
    expect(maisAntiga([])).toBeNull();
    expect(maisAntiga([
      { em: "2026-05-01T00:00:00.000Z", fonte: "anuncio" },
      { em: "2026-03-01T00:00:00.000Z", fonte: "anuncio" },
      { em: "2026-03-01T00:00:00.000Z", fonte: "video" },
    ])).toEqual({ em: "2026-03-01T00:00:00.000Z", fonte: "video" });
  });

  it("o dia é o de São Paulo: 22h30 de 12/03 em SP já é dia 13 em UTC", () => {
    const r = rotuloDaEstreia({ em: "2026-03-13T01:30:00.000Z", fonte: "video" }, new Date("2026-09-08T15:00:00-03:00"));
    expect(r.data).toBe("12/03/2026");
    expect(r.idade).toBe("há 5 meses");
    expect(r.explicacao).toMatch(/upload do vídeo/i);
  });

  it("idade em palavras, com mês de calendário", () => {
    const agora = new Date("2026-09-30T12:00:00-03:00");
    const em = (dia: string) => new Date(`${dia}T12:00:00-03:00`);
    expect(idadeDaEstreia(em("2026-09-30"), agora)).toBe("hoje");
    expect(idadeDaEstreia(em("2026-09-29"), agora)).toBe("ontem");
    expect(idadeDaEstreia(em("2026-09-18"), agora)).toBe("há 12 dias");
    // Um mês de calendário e 30 dias: ainda conta em dias ("há 1 meses" não existe).
    expect(idadeDaEstreia(em("2026-07-31"), agora)).toBe("há 61 dias");
    expect(idadeDaEstreia(em("2026-03-12"), agora)).toBe("há 6 meses");
    expect(idadeDaEstreia(em("2024-01-10"), agora)).toBe("há 2 anos");
  });

  it("da rota só aceita o formato certo", () => {
    expect(lerEstreia({ em: "2026-03-12T17:22:10.000Z", fonte: "video" })).toEqual({ em: "2026-03-12T17:22:10.000Z", fonte: "video" });
    expect(lerEstreia({ em: null })).toBeNull();
    expect(lerEstreia({ em: "2026-03-12T17:22:10.000Z", fonte: "outra" })).toBeNull();
    expect(lerEstreia(null)).toBeNull();
  });
});
