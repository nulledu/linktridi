import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Tarefa só é editada/apagada por quem ESTÁ nela: quem criou ou o responsável.
 *
 * `atualizarTarefa`/`removerTarefa` casavam só pelo `id` e rodam com o
 * service_role — qualquer pessoa logada editava ou apagava a tarefa de
 * qualquer outra sabendo o id. E `removerTarefa` engolia o erro: a rota dizia
 * `ok: true` mesmo quando nada tinha sido apagado.
 *
 * Histórico e aviso rodavam como `void promessa` depois da resposta; na Vercel
 * a função pode ser congelada ali e o aviso some. Agora vão em `after()`.
 */

type Linha = Record<string, unknown>;
let banco: Record<string, Linha[]> = {};
let falhar = false;

// PostgREST `or=(col.eq.v,col.eq.v)` — só a forma que a lib usa.
function casaOr(expr: string, l: Linha): boolean {
  return expr.split(",").some((parte) => {
    const [col, op, ...resto] = parte.split(".");
    return op === "eq" && String(l[col]) === resto.join(".");
  });
}

type Acao = { tipo: "select" } | { tipo: "update"; valores: Linha } | { tipo: "delete" } | { tipo: "insert"; linha: Linha };

function fakeDb() {
  const from = (tabela: string) => {
    const conds: ((l: Linha) => boolean)[] = [];
    let acao: Acao = { tipo: "select" };
    const builder: Record<string, unknown> = {};
    const passa = () => builder;
    for (const m of ["select", "order", "limit"]) builder[m] = passa;
    builder.eq = (c: string, v: unknown) => { conds.push((l) => l[c] === v); return builder; };
    builder.or = (expr: string) => { conds.push((l) => casaOr(expr, l)); return builder; };
    builder.update = (valores: Linha) => { acao = { tipo: "update", valores }; return builder; };
    builder.delete = () => { acao = { tipo: "delete" }; return builder; };
    builder.insert = (linha: Linha) => { acao = { tipo: "insert", linha }; return builder; };
    const executar = (): { data: Linha[] | null; error: unknown } => {
      if (falhar) return { data: null, error: { message: "banco fora" } };
      const linhas = banco[tabela] ?? (banco[tabela] = []);
      const alvo = linhas.filter((l) => conds.every((c) => c(l)));
      if (acao.tipo === "update") { const v = acao.valores; for (const l of alvo) Object.assign(l, v); return { data: alvo, error: null }; }
      if (acao.tipo === "delete") { banco[tabela] = linhas.filter((l) => !alvo.includes(l)); return { data: alvo, error: null }; }
      if (acao.tipo === "insert") { const nova = { id: `${tabela}-${linhas.length + 1}`, ...acao.linha }; linhas.push(nova); return { data: [nova], error: null }; }
      return { data: alvo, error: null };
    };
    builder.single = () => {
      const r = executar();
      if (r.error) return Promise.resolve(r);
      return Promise.resolve(r.data!.length === 1 ? { data: r.data![0], error: null } : { data: null, error: { code: "PGRST116" } });
    };
    builder.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve(executar()).then(ok, falha);
    return builder;
  };
  return { from };
}

const eu = { id: "u-ana", name: "Ana", role: "colaborador", username: "ana", active: true };
const depois: (() => unknown)[] = [];
const mockNotificar = vi.fn(async (_n: unknown) => {});

vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => fakeDb() }));
vi.mock("@/lib/require-auth", () => ({ getProfile: async () => eu }));
vi.mock("@/lib/notificacoes", () => ({ notificar: (n: unknown) => mockNotificar(n) }));
vi.mock("next/server", async () => {
  const real = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...real, after: (fn: () => unknown) => { depois.push(fn); } };
});

const { atualizarTarefa, removerTarefa } = await import("../tarefas");
const rota = await import("../../app/api/tarefas/route");

const TAREFA = (extra: Linha = {}): Linha => ({
  id: "t-1", titulo: "Pagar boleto", status: "pendente", prioridade: "media",
  criador_id: "u-bia", criador_nome: "Bia", responsavel_id: "u-caio", responsavel_nome: "Caio",
  avisar_conclusao: false, ...extra,
});
const req = (method: string, corpo: unknown) => new NextRequest("http://localhost/api/tarefas", {
  method, body: JSON.stringify(corpo), headers: { "content-type": "application/json" },
});
const rodarDepois = async () => { for (const f of depois.splice(0)) await f(); };

beforeEach(() => {
  banco = { tarefas: [TAREFA()], tarefa_historico: [] };
  falhar = false;
  eu.id = "u-ana";
  depois.length = 0;
  mockNotificar.mockClear();
});

describe("lib/tarefas — escrita só de quem está na tarefa", () => {
  it("quem não criou nem é responsável não edita", async () => {
    expect(await atualizarTarefa("t-1", { titulo: "trocado" }, "u-ana")).toBeNull();
    expect(banco.tarefas[0].titulo).toBe("Pagar boleto");
  });

  it("criador e responsável editam", async () => {
    expect((await atualizarTarefa("t-1", { titulo: "A" }, "u-bia"))?.titulo).toBe("A");
    expect((await atualizarTarefa("t-1", { titulo: "B" }, "u-caio"))?.titulo).toBe("B");
  });

  it("quem não está na tarefa não apaga — e isso não vira ok", async () => {
    expect(await removerTarefa("t-1", "u-ana")).toBe("nao_encontrada");
    expect(banco.tarefas).toHaveLength(1);
    expect(await removerTarefa("t-1", "u-bia")).toBe("ok");
    expect(banco.tarefas).toHaveLength(0);
  });

  it("erro do banco ao apagar vira erro, não ok", async () => {
    falhar = true;
    expect(await removerTarefa("t-1", "u-bia")).toBe("erro");
  });
});

describe("/api/tarefas — a rota escreve em nome de QUEM pede", () => {
  it("PATCH na tarefa de outra pessoa é recusado e não avisa ninguém", async () => {
    const res = await rota.PATCH(req("PATCH", { id: "t-1", status: "concluida" }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(banco.tarefas[0].status).toBe("pendente");
    await rodarDepois();
    expect(mockNotificar).not.toHaveBeenCalled();
    expect(banco.tarefa_historico).toHaveLength(0);
  });

  it("DELETE na tarefa de outra pessoa responde 404, não ok:true", async () => {
    const res = await rota.DELETE(new NextRequest("http://localhost/api/tarefas?id=t-1", { method: "DELETE" }));
    expect(res.status).toBe(404);
    expect(banco.tarefas).toHaveLength(1);
  });

  it("DELETE com o banco fora responde erro, não ok:true", async () => {
    eu.id = "u-bia";
    falhar = true;
    const res = await rota.DELETE(new NextRequest("http://localhost/api/tarefas?id=t-1", { method: "DELETE" }));
    expect(res.status).toBe(500);
  });

  it("DELETE do dono apaga", async () => {
    eu.id = "u-bia";
    const res = await rota.DELETE(new NextRequest("http://localhost/api/tarefas?id=t-1", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(banco.tarefas).toHaveLength(0);
  });

  it("concluir: histórico e aviso ao criador rodam em after(), não soltos", async () => {
    banco.tarefas = [TAREFA({ responsavel_id: "u-ana", avisar_conclusao: true })];
    const res = await rota.PATCH(req("PATCH", { id: "t-1", status: "concluida" }));
    expect(res.status).toBe(200);
    expect(mockNotificar).not.toHaveBeenCalled();
    expect(depois.length).toBeGreaterThan(0);
    await rodarDepois();
    expect(mockNotificar).toHaveBeenCalledTimes(1);
    expect(banco.tarefa_historico.map((e) => e.acao)).toEqual(["concluiu"]);
  });

  it("criar delegando: aviso e histórico também em after()", async () => {
    const res = await rota.POST(req("POST", { titulo: "Revisar arte", responsavelId: "u-caio", responsavelNome: "Caio" }));
    expect(res.status).toBe(200);
    expect(mockNotificar).not.toHaveBeenCalled();
    await rodarDepois();
    expect(mockNotificar).toHaveBeenCalledTimes(1);
    expect(banco.tarefa_historico.map((e) => e.acao)).toEqual(["criou"]);
  });
});
