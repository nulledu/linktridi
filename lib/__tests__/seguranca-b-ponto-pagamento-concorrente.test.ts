import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Auditoria B · 4 — pagar a mesma hora duas vezes.
 *
 * A rota confere o saldo e só DEPOIS grava. Dois POSTs juntos (duplo clique,
 * duas abas, dois admins) liam o mesmo crédito cheio, os dois passavam na
 * conferência e os dois gravavam. Agora uma trava por pessoa (PK em
 * `ponto_pagamentos_trava`) deixa um pagamento em andamento de cada vez; o
 * segundo recebe 409 e, se tentar de novo, recalcula com o primeiro já pago.
 */

interface Del {
  eq(c: string, v: string): Del;
  lt(c: string, v: string): Del;
  then<T>(ok: (v: { error: unknown }) => T, err?: (e: unknown) => T): Promise<T>;
}

const h = vi.hoisted(() => {
  const travas = new Map<string, number>();          // pessoa_id → criado_em (ms)
  const estado = { semTabela: false, falharPagamento: false };
  const pagos: number[] = [];
  const erroSemTabela = { code: "42P01", message: 'relation "public.ponto_pagamentos_trava" does not exist' };
  function from(t: string) {
    if (t !== "ponto_pagamentos_trava") throw new Error(`tabela inesperada: ${t}`);
    return {
      // PK de verdade: conferir e gravar no MESMO passo, como o Postgres faz.
      insert: async (linha: { pessoa_id: string }) => {
        if (estado.semTabela) return { error: erroSemTabela };
        if (travas.has(linha.pessoa_id)) return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        travas.set(linha.pessoa_id, Date.now());
        return { error: null };
      },
      delete(): Del {
        let pessoa: string | undefined;
        let antesDe = Infinity;
        const q: Del = {
          eq: (_c, v) => { pessoa = v; return q; },
          lt: (_c, v) => { antesDe = Date.parse(v); return q; },
          then: (ok, err) => {
            if (estado.semTabela) return Promise.resolve({ error: erroSemTabela as unknown }).then(ok, err);
            if (pessoa && (travas.get(pessoa) ?? Infinity) < antesDe) travas.delete(pessoa);
            return Promise.resolve({ error: null as unknown }).then(ok, err);
          },
        };
        return q;
      },
    };
  }
  return { travas, estado, pagos, from };
});

vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => ({ from: h.from }) }));
vi.mock("@/lib/require-auth", () => ({
  getAdminProfile: async () => ({ id: "adm", name: "Admin" }),
  getProfileForAnyModule: async () => ({ id: "adm", name: "Admin" }),
}));
vi.mock("@/lib/ponto", () => ({
  listPessoas: async () => [{ id: "p1", nome: "Ana" }],
  listPagamentos: async () => [],
  removePagamento: async () => {},
  addPagamento: async (inp: { pessoaId: string; dia: string; minutos: number }) => {
    if (h.estado.falharPagamento) return null;
    h.pagos.push(inp.minutos);
    return { id: `pg${h.pagos.length}`, pessoaId: inp.pessoaId, dia: inp.dia, minutos: inp.minutos };
  },
}));
vi.mock("@/lib/banco-horas", () => ({
  INICIO_BANCO: "2026-01-01",
  hojeSp: () => "2026-09-10",
  feriadosDoMes: async () => [],
  // Lê o saldo ANTES de esperar: é exatamente a janela em que o segundo clique
  // enxergava o crédito cheio.
  bancoDaPessoa: async () => {
    const credito = 600 - h.pagos.reduce((s, m) => s + m, 0);
    await new Promise((r) => setTimeout(r, 15));
    return { ledger: { creditos: [{ dia: "2026-09-01", min: credito }], creditoMin: credito } };
  },
}));

async function pagar(minutos = 600) {
  const { POST } = await import("@/app/api/ponto/pagamentos/route");
  return POST(new NextRequest("http://x/api/ponto/pagamentos", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ pessoaId: "p1", minutos, dia: "2026-09-10" }),
  }));
}

beforeEach(() => {
  h.travas.clear();
  h.pagos.length = 0;
  h.estado.semTabela = false;
  h.estado.falharPagamento = false;
});

describe("POST /api/ponto/pagamentos — um pagamento por pessoa de cada vez", () => {
  it("duplo clique: paga UMA vez; o segundo recebe 409 em andamento", async () => {
    const [a, b] = await Promise.all([pagar(), pagar()]);
    expect(h.pagos).toEqual([600]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const perdedor = a.status === 409 ? a : b;
    expect((await perdedor.json()).error).toBe("pagamento_em_andamento");
    expect(h.travas.size).toBe(0);
  });

  it("a trava é solta: o pedido seguinte recalcula e recusa por falta de crédito", async () => {
    expect((await pagar()).status).toBe(200);
    const r = await pagar();
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe("sem_credito");
    expect(h.travas.size).toBe(0);
  });

  it("trava recente de outro pedido → 409 e não paga", async () => {
    h.travas.set("p1", Date.now());
    const r = await pagar();
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe("pagamento_em_andamento");
    expect(h.pagos).toEqual([]);
    expect(h.travas.has("p1")).toBe(true);   // a trava é do outro — não é minha pra soltar
  });

  it("trava órfã (pedido que morreu no meio) não bloqueia a pessoa pra sempre", async () => {
    h.travas.set("p1", Date.now() - 10 * 60_000);
    expect((await pagar()).status).toBe(200);
    expect(h.pagos).toEqual([600]);
  });

  it("sem a tabela da trava (SQL não rodado) segue pagando como antes", async () => {
    h.estado.semTabela = true;
    expect((await pagar()).status).toBe(200);
    expect(h.pagos).toEqual([600]);
  });

  it("falha ao gravar o pagamento também solta a trava", async () => {
    h.estado.falharPagamento = true;
    expect((await pagar()).status).toBe(400);
    expect(h.travas.size).toBe(0);
  });
});
