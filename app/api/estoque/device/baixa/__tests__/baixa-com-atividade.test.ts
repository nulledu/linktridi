import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * A baixa do leitor do galpão carrega a ATIVIDADE — e continua idempotente.
 *
 * As duas coisas vivem na mesma rota e puxam pra lados opostos:
 *
 *  • o vínculo (`atividadeId`) é o começo do ciclo — a caixa lacrada que a
 *    pessoa acabou de pegar pra trabalhar. Se a rota o descarta calada, a
 *    perda de uma reprovação deixa de ter de onde sair;
 *  • a idempotência por `operationId` é o que impede a fila offline de tirar a
 *    MESMA caixa duas vezes quando a rede volta. Ela é checada antes de tudo, e
 *    campo novo nenhum pode entrar na frente dela.
 *
 * O terceiro caso é o mais fácil de errar: `atividadeId` inválido NÃO pode
 * virar 4xx. Um 4xx marca a operação como falha definitiva e ela some da fila
 * do tablet (FilaReducer.kt) — a caixa aberta continuaria contando como
 * estoque por causa de um campo opcional.
 */

const baixarUnidades = vi.fn(async () => [{ codigo: "CX-000001", situacao: "baixada", item: "Folha", pecas: 50 }]);
vi.mock("@/lib/estoque-baixa", () => ({
  baixarUnidades: (...args: unknown[]) => baixarUnidades(...(args as [])),
  ErroMotivoInvalido: class ErroMotivoInvalido extends Error {},
  ErroLoteBaixaGrande: class ErroLoteBaixaGrande extends Error { max = 200; },
}));

let operacaoGravada: { resultado: unknown } | null = null;
const upserts: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.maybeSingle = async () => ({ data: operacaoGravada });
      b.upsert = async (payload: Record<string, unknown>) => { upserts.push(payload); return { error: null }; };
      return b;
    },
  }),
}));

vi.mock("../../_device", () => ({
  authorizeDevice: async () => ({ ok: true, device: { id: "dev-1", nome: "Leitor", localId: null } }),
  buscarOperadorAtivo: async () => ({ id: "op-1", nome: "Ana" }),
  deviceAuthFailure: () => new Response(null, { status: 401 }),
}));

vi.mock("../../_freio", () => ({
  freioDevice: { consumir: () => ({ permitido: true }) },
  origemDe: () => "1.2.3.4",
  resposta503: () => new Response(null, { status: 503 }),
}));

const { POST } = await import("../route");

const ATIVIDADE = "6f1a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b";

function pedido(corpo: Record<string, unknown>) {
  return {
    headers: new Headers(),
    json: async () => corpo,
  } as unknown as Parameters<typeof POST>[0];
}

const CORPO = {
  operationId: "11111111-2222-4333-8444-555555555555",
  codigos: ["CX-000001"],
  motivo: "consumido",
  operadorId: "op-1",
};

beforeEach(() => {
  baixarUnidades.mockClear();
  upserts.length = 0;
  operacaoGravada = null;
});

describe("POST /api/estoque/device/baixa", () => {
  it("leva a atividade até o núcleo da baixa", async () => {
    const r = await POST(pedido({ ...CORPO, atividadeId: ATIVIDADE }));
    expect(r.status).toBe(200);
    expect(baixarUnidades).toHaveBeenCalledWith(expect.objectContaining({ atividadeId: ATIVIDADE }));
  });

  it("baixa avulsa continua existindo (perda, expedição): sem atividade, `null`", async () => {
    await POST(pedido(CORPO));
    expect(baixarUnidades).toHaveBeenCalledWith(expect.objectContaining({ atividadeId: null }));
  });

  it("atividade inválida não derruba a baixa — vira `null`, nunca 4xx", async () => {
    const r = await POST(pedido({ ...CORPO, atividadeId: "ativ-9" }));
    expect(r.status).toBe(200);
    expect(baixarUnidades).toHaveBeenCalledWith(expect.objectContaining({ atividadeId: null }));
  });

  it("reenvio da fila offline não tira a mesma caixa duas vezes", async () => {
    operacaoGravada = { resultado: { ok: true, resultado: [{ codigo: "CX-000001", situacao: "baixada", item: "Folha", pecas: 50 }] } };
    const r = await POST(pedido({ ...CORPO, atividadeId: ATIVIDADE }));
    expect(r.status).toBe(200);
    expect(baixarUnidades, "a operação já estava gravada e mesmo assim baixou de novo").not.toHaveBeenCalled();
    await expect(r.json()).resolves.toMatchObject({ ok: true });
  });
});
