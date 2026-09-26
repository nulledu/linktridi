import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A ROTA de editar contato grava o que recebe — testada por inteiro.
 *
 * Três correções deste bug passaram porque eu testava a camada de baixo
 * (`salvarParte`) e nunca o handler. O que chega no `p_entrada` da função de
 * gravação depois de a rota montar a entrada é o que decide se o campo é
 * salvo, e é isso que nunca tinha sido olhado.
 */

const supa = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
const gate = vi.hoisted(() => ({ apiFinanceiro: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: () => supa }));
vi.mock("@/lib/financeiro/gate", () => ({
  apiFinanceiro: gate.apiFinanceiro,
  chaveSub: (s: string) => `financeiro:${s}`,
}));
vi.mock("@/lib/financeiro/db", () => ({
  auditar: vi.fn(), empresaPermitida: async () => true, registrarCategorias: vi.fn(),
}));
vi.mock("@/lib/financeiro/promover-organizacao", () => ({ promoverAOrganizacao: vi.fn() }));

const EXISTENTE = {
  id: "c1", empresa_id: "e1", nome: "Packit", ativo: true,
  natureza: "pessoa", papeis: ["contato"], telefones: ["11 4538-5909"], categorias: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  gate.apiFinanceiro.mockResolvedValue({ profile: { id: "u1", name: "Caio" }, keys: [], poderes: {} });
  supa.rpc.mockResolvedValue({ data: { contato_id: "c1", fornecedor_id: null }, error: null });
  supa.from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: EXISTENTE, error: null }) }) }),
  });
});

/** O `p_entrada` que a rota entregou à função de gravação. */
const gravado = () => supa.rpc.mock.calls.at(-1)![1].p_entrada as Record<string, unknown>;

async function editar(corpo: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/financeiro/contatos/[id]/route");
  const req = new Request("http://x/api/financeiro/contatos/c1", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo),
  });
  return PATCH(req, { params: Promise.resolve({ id: "c1" }) });
}

const CORPO = {
  nome: "Packit", natureza: "pessoa", papeis: ["contato"], cnpj: null,
  telefones: ["11 98888-7777"], categorias: ["Encanador"],
  organizacao_id: null, organizacao: "Elétrica X", cargo: "Encanador",
  site: "https://x.com", email: "zz@x.com", endereco: "Rua A",
  observacao: "obs", ativo: true,
};

describe("PATCH /contatos/[id]", () => {
  it("responde ok", async () => {
    const r = await editar(CORPO);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true });
  });

  it.each(
    Object.entries(CORPO).filter(([k]) => !["cnpj", "organizacao_id"].includes(k)),
  )("entrega `%s` para a gravação", async (campo, valor) => {
    // Um campo que a rota deixa cair aqui é um campo que a tela vai jurar ter
    // salvo — a resposta é 200 de qualquer jeito.
    await editar(CORPO);
    expect(gravado()[campo]).toEqual(valor);
  });

  it("o id e a empresa vêm da LINHA, nunca do corpo", async () => {
    // Aceitar do cliente deixaria editar contato de empresa alheia.
    await editar({ ...CORPO, id: "OUTRO", empresa_id: "OUTRA" });
    expect(gravado().id).toBe("c1");
    expect(gravado().empresa_id).toBe("e1");
  });

  it("campo não enviado não é apagado", async () => {
    // Edição parcial: o que a tela não mandou tem de continuar como está.
    await editar({ nome: "Packit" });
    expect(gravado().email).toBeUndefined();
    expect(gravado().site).toBeUndefined();
  });

  it("os dados comerciais chegam no sub-objeto", async () => {
    await editar({
      ...CORPO, papeis: ["contato", "fornecedor"],
      fornecedor: { prazo_dias: 30, pix_chave: "123", forma_pagamento: "PIX" },
    });
    expect(gravado().fornecedor).toMatchObject({ prazo_dias: 30, pix_chave: "123" });
  });

  it("sem sessão, 403 — e nada é gravado", async () => {
    gate.apiFinanceiro.mockResolvedValue(null);
    const r = await editar(CORPO);
    expect(r.status).toBe(403);
    expect(supa.rpc).not.toHaveBeenCalled();
  });
});
