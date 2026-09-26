import { readFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { proveitoDe } from "@/lib/tridiflow-tutoriais";

// Leitura sob demanda: se a página de leitura trocar um arquivo de lugar, quebra
// só o teste daquele arquivo — não a suíte inteira no carregamento.
const ler = (caminho: string) => readFileSync(caminho, "utf8");

// ── Banco de mentira no formato do supabase-js ─────────────────────────────
// A consulta é um "thenable" encadeável; cada ida registra as colunas, a janela
// e a página pedidas. As respostas saem de uma fila — é assim que se simula
// "a primeira ida falha com a coluna ausente, a segunda responde".
type Resposta = { data: unknown; error: { code?: string; message: string } | null };
type Ida = { tabela: string; cols: string; gte?: [string, string]; range?: [number, number] };
const fila: Resposta[] = [];
const idas: Ida[] = [];

class Consulta {
  private ida: Ida;
  constructor(tabela: string) { this.ida = { tabela, cols: "" }; }
  select(c: string) { this.ida.cols = c; return this; }
  eq() { return this; }
  gte(coluna: string, valor: string) { this.ida.gte = [coluna, valor]; return this; }
  order() { return this; }
  limit() { return this; }
  range(de: number, ate: number) { this.ida.range = [de, ate]; return this; }
  then<R>(res: (v: Resposta) => R, rej?: (e: unknown) => R) {
    idas.push(this.ida);
    return Promise.resolve(fila.shift() ?? { data: [], error: null }).then(res, rej);
  }
}
const banco = { rpc: vi.fn(), from: (tabela: string) => new Consulta(tabela) };
const remoto = vi.hoisted(() => ({ ligado: false, encaminharPara: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => banco }));
vi.mock("@/lib/player-remoto", () => ({
  modoRemoto: () => remoto.ligado,
  encaminharPara: remoto.encaminharPara,
}));

const { POST } = await import("@/app/api/p/tutorial-metrica/route");
const { CAMPOS_METRICA, metricasDaCentral } = await import("@/lib/tridiflow-tutoriais-metricas");

const pedir = (corpo: unknown) =>
  POST(new NextRequest("http://x/api/p/tutorial-metrica", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo),
  }));

const COLS_NOVAS = "handle,vistas,uteis,inuteis,contatos,motivo_produto,motivo_passo,motivo_resultado,motivo_outro";

beforeEach(() => {
  fila.length = 0;
  idas.length = 0;
  banco.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  remoto.ligado = false;
  remoto.encaminharPara.mockReset();
});

describe("métricas da central de tutoriais", () => {
  // 0 de 0 não é 0%: mostrar 0% queimaria um guia que ninguém avaliou ainda.
  it("proveito só existe com voto", () => {
    expect(proveitoDe(undefined)).toBeNull();
    expect(proveitoDe({ uteis: 0, inuteis: 0 })).toBeNull();
    expect(proveitoDe({ uteis: 9, inuteis: 1 })).toBe(90);
    expect(proveitoDe({ uteis: 1, inuteis: 2 })).toBe(33);
  });

  // Um pixel no cliente custaria outra invocação por leitura — a conta que já
  // pausou o projeto na Vercel.
  it("a vista é contada na invocação que já existe, depois da resposta", () => {
    const pagina = ler("app/p/[slug]/[tutorial]/page.tsx");
    expect(pagina).toContain('import { after } from "next/server"');
    expect(pagina).toMatch(/after\(\(\) => registrarMetricaRemota\([^)]*"vistas"\)\)/);
  });

  it("um voto por navegador, e o clique não some se o armazenamento estiver bloqueado", () => {
    const voto = ler("app/p/[slug]/[tutorial]/IssoAjudou.tsx");
    expect(voto).toContain("localStorage.getItem");
    expect(voto).toContain("localStorage.setItem");
    // Toda leitura/escrita de storage protegida — janela anônima estoura.
    expect(voto.match(/try \{/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  // Uma linha por (central, tutorial, dia): sem isso a tabela cresce por evento
  // e a soma atômica evita perder contagem em acessos simultâneos.
  it("o SQL agrega por dia e soma no banco", () => {
    const sql = ler("supabase/tutorial_metricas.sql");
    expect(sql).toContain("primary key (bot_id, handle, dia)");
    expect(sql).toContain("on conflict (bot_id, handle, dia) do update");
    expect(sql).toContain("enable row level security");
  });

  // Local (direto ao banco) ou remoto (pela rota), a página conta com o mesmo
  // tipo — senão o "contatos" da leitura não passa pelo servidor dedicado.
  it("a contagem da página usa o mesmo tipo de campo da rota", () => {
    expect(ler("lib/player-remoto.ts")).toMatch(/registrarMetricaRemota\(botId: string, handle: string, campo: .*CampoMetrica\)/);
  });
});

describe("rota pública /api/p/tutorial-metrica", () => {
  // A rota só conta guia PUBLICADO de uma central no ar (id uuid). Cada teste
  // entrega o snapshot publicado na fila, antes da soma.
  const BOT = "00000000-0000-4000-8000-000000000001";
  const noAr = (...handles: string[]) => fila.push({ data: [{ config: { template: "central_tutoriais", centralTutoriais: {
    tutoriais: handles.map((handle, ordem) => ({ id: handle, titulo: handle, handle, status: "publicado", ordem })),
  } } }], error: null });

  // A página de leitura manda estes oito; um que falte aqui vira 400 e o
  // contador fica no zero sem ninguém perceber.
  it("aceita os campos da página de leitura", () => {
    expect([...CAMPOS_METRICA].sort()).toEqual([
      "contatos", "inuteis", "motivo_outro", "motivo_passo", "motivo_produto", "motivo_resultado", "uteis", "vistas",
    ]);
  });

  it.each([...CAMPOS_METRICA])("%s vira uma soma no banco e responde 200", async (campo) => {
    noAr("trocar-borracha");
    const r = await pedir({ botId: BOT, handle: "trocar-borracha", campo });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(banco.rpc).toHaveBeenCalledWith("incrementar_metrica_tutorial", {
      p_bot: BOT, p_handle: "trocar-borracha", p_campo: campo,
    });
  });

  it.each([
    ["campo inventado", { botId: BOT, handle: "h", campo: "admin" }],
    ["campo que parece coluna", { botId: BOT, handle: "h", campo: "vistas = 999" }],
    ["sem central", { handle: "h", campo: "vistas" }],
    ["sem tutorial", { botId: BOT, campo: "vistas" }],
    ["central que não é texto", { botId: 42, handle: "h", campo: "vistas" }],
    ["corpo null", null],
  ])("%s é 400 e nem chega ao banco", async (_nome, corpo) => {
    const r = await pedir(corpo);
    expect(r.status).toBe(400);
    expect(banco.rpc).not.toHaveBeenCalled();
  });

  // O SQL dos motivos roda à mão. Até lá a função antiga recusa o campo novo —
  // e quem tocou em "Ainda não" não pode receber um erro por isso.
  it("banco sem a migração dos motivos: a função recusa o campo e a resposta continua 200", async () => {
    banco.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "campo invalido: motivo_passo" } });
    noAr("h");
    const r = await pedir({ botId: BOT, handle: "h", campo: "motivo_passo" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it("banco fora do ar também não vira erro na tela", async () => {
    banco.rpc.mockRejectedValue(new TypeError("fetch failed"));
    noAr("h");
    const r = await pedir({ botId: BOT, handle: "h", campo: "contatos" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  // O gedux não tem credencial: escrever ali seria só um erro engolido e uma
  // contagem perdida.
  it("o servidor sem banco encaminha o corpo pro Gaius em vez de escrever", async () => {
    remoto.ligado = true;
    remoto.encaminharPara.mockResolvedValue(NextResponse.json({ ok: true }));
    const corpo = { botId: "bot-1", handle: "h", campo: "motivo_outro" };
    const r = await pedir(corpo);
    expect(r.status).toBe(200);
    expect(remoto.encaminharPara).toHaveBeenCalledWith(expect.anything(), "/api/p/tutorial-metrica");
    // O corpo tem que chegar sem ter sido lido: o encaminhamento de verdade faz
    // `req.text()` fora do try, então uma rota que valide o JSON antes de
    // encaminhar estoura "Body is unusable" num 500 — e toda contagem do gedux
    // some calada no `.catch` da página. Com o mock, só isto percebe.
    const req = remoto.encaminharPara.mock.calls[0][0] as NextRequest;
    expect(await req.text()).toBe(JSON.stringify(corpo));
    expect(banco.rpc).not.toHaveBeenCalled();
  });
});

describe("números da central no editor (metricasDaCentral)", () => {
  const linha = (handle: string, n: Record<string, number> = {}) => ({
    handle, vistas: 0, uteis: 0, inuteis: 0, contatos: 0,
    motivo_produto: 0, motivo_passo: 0, motivo_resultado: 0, motivo_outro: 0, ...n,
  });

  it("soma vistas, votos, contatos e cada motivo por tutorial, somando os dias", async () => {
    fila.push({ data: [
      linha("carimbo", { vistas: 10, uteis: 4, inuteis: 2, contatos: 1, motivo_passo: 1, motivo_produto: 1 }),
      linha("carimbo", { vistas: 5, inuteis: 1, contatos: 2, motivo_resultado: 1 }),
      linha("tinta", { vistas: 3, uteis: 1 }),
    ], error: null });
    expect(await metricasDaCentral("bot-1")).toStrictEqual([
      { handle: "carimbo", vistas: 15, uteis: 4, inuteis: 3, contatos: 3, motivos: { produto: 1, passo: 1, resultado: 1, outro: 0 } },
      { handle: "tinta", vistas: 3, uteis: 1, inuteis: 0, contatos: 0, motivos: { produto: 0, passo: 0, resultado: 0, outro: 0 } },
    ]);
    expect(idas[0].tabela).toBe("tutorial_metricas");
    expect(idas[0].cols).toBe(COLS_NOVAS);
  });

  // Sem a migração o banco não tem as colunas. Ausente ≠ zero: a tela não pode
  // dizer "ninguém chamou no WhatsApp" quando isso só não está sendo medido.
  it("banco sem as colunas novas: cai no select antigo e devolve sem contatos nem motivos", async () => {
    fila.push(
      { data: null, error: { code: "42703", message: "column tutorial_metricas.contatos does not exist" } },
      { data: [{ handle: "carimbo", vistas: 7, uteis: 2, inuteis: 1 }, { handle: "carimbo", vistas: 3, uteis: 0, inuteis: 1 }], error: null },
    );
    expect(await metricasDaCentral("bot-1")).toStrictEqual([{ handle: "carimbo", vistas: 10, uteis: 2, inuteis: 2 }]);
    expect(idas.map((i) => i.cols)).toEqual([COLS_NOVAS, "handle,vistas,uteis,inuteis"]);
  });

  // A mensagem do cache de esquema do PostgREST também casaria o "tabela
  // ausente" — e aí vistas e votos que existem sumiriam da tela.
  it("reconhece a coluna ausente pela mensagem, mesmo sem o código", async () => {
    fila.push(
      { data: null, error: { message: "Could not find the 'motivo_passo' column of 'tutorial_metricas' in the schema cache" } },
      { data: [{ handle: "h", vistas: 1, uteis: 0, inuteis: 0 }], error: null },
    );
    expect(await metricasDaCentral("bot-1")).toStrictEqual([{ handle: "h", vistas: 1, uteis: 0, inuteis: 0 }]);
  });

  // O PostgREST corta cada ida em 1000 linhas sem avisar. Uma linha por
  // tutorial por dia enche isso em meses — e as leituras paravam de subir.
  it("mais de mil linhas entram inteiras na soma", async () => {
    fila.push(
      { data: Array.from({ length: 1000 }, () => linha("carimbo", { vistas: 1 })), error: null },
      { data: Array.from({ length: 5 }, () => linha("carimbo", { vistas: 1 })), error: null },
    );
    const [m] = await metricasDaCentral("bot-1");
    expect(m.vistas).toBe(1005);
    expect(idas.map((i) => i.range)).toEqual([[0, 999], [1000, 1999]]);
  });

  // O `dia` da tabela é o de São Paulo: pelo UTC, depois das 21h a janela
  // começava um dia depois.
  it("janela em dias vira filtro pelo dia de São Paulo; 0 é desde sempre", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-09-10T23:30:00-03:00"));
      await metricasDaCentral("bot-1", 7);
      await metricasDaCentral("bot-1");
    } finally { vi.useRealTimers(); }
    expect(idas[0].gte).toEqual(["dia", "2026-09-03"]);
    expect(idas[1].gte).toBeUndefined();
  });

  it("tabela que não existe (SQL da central nunca rodou) é lista vazia, sem nova tentativa", async () => {
    fila.push({ data: null, error: { code: "42P01", message: 'relation "public.tutorial_metricas" does not exist' } });
    expect(await metricasDaCentral("bot-1")).toEqual([]);
    expect(idas).toHaveLength(1);
  });

  it("erro inesperado some da tela, mas não do log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      fila.push({ data: null, error: { message: "TypeError: fetch failed" } });
      expect(await metricasDaCentral("bot-1")).toEqual([]);
      expect(log).toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});

describe("SQL dos contatos e motivos", () => {
  const sql = () => ler("supabase/tutorial_metricas_motivos.sql");

  it("é re-rodável e as colunas novas nascem zeradas", () => {
    for (const c of ["contatos", "motivo_produto", "motivo_passo", "motivo_resultado", "motivo_outro"]) {
      expect(sql()).toMatch(new RegExp(`add column if not exists ${c}\\s+integer not null default 0;`));
    }
    expect(sql()).toContain("create or replace function incrementar_metrica_tutorial(");
  });

  // Uma lista fechada no banco e outra na rota: se divergem, ou a rota aceita
  // um campo que o banco recusa (contagem perdida calada), ou o contrário.
  it("a função aceita exatamente os campos que a rota aceita", () => {
    const lista = sql().match(/p_campo not in \(([^)]*)\)/)?.[1] ?? "";
    const campos = [...lista.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(campos.sort()).toEqual([...CAMPOS_METRICA].sort());
    expect(sql()).toContain("raise exception 'campo invalido: %', p_campo");
  });

  it("mantém a assinatura, a soma atômica por dia, o security definer e o search_path", () => {
    const s = sql();
    // `create or replace` não aceita trocar parâmetro: assinatura igual à original.
    const assinatura = "p_bot uuid, p_handle text, p_campo text, p_quanto integer default 1";
    expect(s).toContain(assinatura);
    expect(ler("supabase/tutorial_metricas.sql")).toContain(assinatura);
    expect(s).toContain("on conflict (bot_id, handle, dia) do update");
    expect(s).toContain("security definer");
    expect(s).toContain("set search_path = public");
    expect(s).toContain("(now() at time zone 'America/Sao_Paulo')::date");
    // Cada coluna soma o que tentou entrar — nenhuma fica de fora do update.
    for (const c of CAMPOS_METRICA) {
      expect(s).toMatch(new RegExp(`${c}\\s+= tutorial_metricas\\.${c}\\s+\\+ excluded\\.${c}`));
    }
  });

  // Com EXECUTE para anon, a chave pública chamaria a função direto, com
  // qualquer p_quanto — inclusive negativo.
  it("só o servidor executa a função", () => {
    expect(sql()).toContain("revoke execute on function incrementar_metrica_tutorial(uuid, text, text, integer) from public, anon, authenticated");
    expect(sql()).toContain("grant execute on function incrementar_metrica_tutorial(uuid, text, text, integer) to service_role");
  });
});
