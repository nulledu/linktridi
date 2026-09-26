import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({ rpc }),
}));

const { salvarParte } = await import("@/lib/financeiro/salvar-parte");

const USER = "00000000-0000-0000-0000-000000000001";
const CONTATO = "00000000-0000-0000-0000-000000000010";
const FORNECEDOR = "00000000-0000-0000-0000-000000000020";
const entrada = {
  empresa_id: "00000000-0000-0000-0000-000000000002",
  nome: "Atlas Aços",
  natureza: "empresa",
  papeis: ["contato", "fornecedor"],
  cnpj: "12.345.678/0001-99",
  fornecedor: { prazo_dias: 30 },
};

describe("salvarParte", () => {
  beforeEach(() => rpc.mockReset());

  it("usa uma única RPC e devolve os dois ids", async () => {
    rpc.mockResolvedValue({ data: { contato_id: CONTATO, fornecedor_id: FORNECEDOR }, error: null });

    await expect(salvarParte({ entrada, userId: USER })).resolves.toEqual({
      contatoId: CONTATO,
      fornecedorId: FORNECEDOR,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("fin_salvar_parte", {
      p_entrada: { ...entrada, cnpj: "12345678000199" },
      p_user_id: USER,
    });
  });

  it("não chama a RPC para CNPJ ou papel inválido", async () => {
    await expect(salvarParte({
      entrada: { ...entrada, cnpj: "123" }, userId: USER,
    })).rejects.toThrow("CNPJ");
    await expect(salvarParte({
      entrada: { ...entrada, papeis: ["fornecedor", "inexistente"] }, userId: USER,
    })).rejects.toThrow("papéis");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("traduz duplicidade de CNPJ para conflito", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "unique" } });

    await expect(salvarParte({ entrada, userId: USER })).rejects.toMatchObject({ status: 409 });
  });
});
