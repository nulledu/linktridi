import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * A trava de 8 tentativas por 15 min do login do totem NUNCA disparou.
 *
 * A trilha gravava `market_codigo_negado:<tablet>` e a trava contava
 * `codigo_negado:<tablet>` — grafia que ninguém grava. O contador ficava em
 * zero pra sempre: com o token de um tablet dava pra varrer os 10^6 códigos
 * de 6 dígitos e comprar na conta de outra pessoa.
 *
 * O banco falso tem a tabela `suspeitas` de verdade (em memória): o que a
 * trilha grava é o que a trava conta — não um número inventado pelo teste.
 */

type Linha = Record<string, unknown>;
const banco = {
  suspeitas: [] as Linha[],
  funcionarios: [] as Linha[],
  creditos: null as Linha | null,
  unidades: null as Linha | null,
};

function fakeDb() {
  const from = (tabela: string) => {
    const filtros: Record<string, unknown> = {};
    let inseriu = false;
    const builder: Record<string, unknown> = {};
    const passa = () => builder;
    for (const m of ["select", "gte", "in", "order", "limit", "update"]) builder[m] = passa;
    builder.eq = (col: string, v: unknown) => { filtros[col] = v; return builder; };
    builder.insert = (linha: Linha) => {
      inseriu = true;
      if (tabela === "suspeitas") banco.suspeitas.push({ ...linha });
      return builder;
    };
    const resposta = (): Linha => {
      if (inseriu) return { data: null, error: null };
      if (tabela === "suspeitas") return { count: banco.suspeitas.filter((s) => s.tipo === filtros.tipo).length, error: null };
      if (tabela === "funcionarios") return { data: banco.funcionarios.filter((f) => f.codigo_acesso === filtros.codigo_acesso), error: null };
      if (tabela === "creditos") return { data: banco.creditos, error: null };
      if (tabela === "unidades") return { data: banco.unidades, error: null };
      return { data: null, error: null };
    };
    builder.maybeSingle = () => Promise.resolve(resposta());
    builder.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) => Promise.resolve(resposta()).then(ok, falha);
    return builder;
  };
  return { from };
}

vi.mock("../tridimarket/client", () => ({ createTridiMarketAdminClient: () => fakeDb() }));
const mockEmployees = vi.fn(async (_unidades?: string[]) => [] as Linha[]);
vi.mock("../tridimarket/repository", () => ({
  isMissingMarketSchema: () => false,
  TridiMarketRepository: class { employees(unidades?: string[]) { return mockEmployees(unidades); } },
}));
vi.mock("../../app/api/tridimarket/device/_device", async () => {
  const real = await vi.importActual<typeof import("../../app/api/tridimarket/device/_device")>("../../app/api/tridimarket/device/_device");
  return { ...real, authorizeDevice: async () => ({ ok: true, device: { id: "tab-1", profileId: "unid-1", name: "Totem" } }) };
});
vi.mock("../../app/api/tridimarket/device/_sessao", async () => {
  const real = await vi.importActual<typeof import("../../app/api/tridimarket/device/_sessao")>("../../app/api/tridimarket/device/_sessao");
  return { ...real, criarTokenSessao: () => "token-assinado" };
});

const { POST } = await import("../../app/api/tridimarket/device/session/route");

const pedir = (pin: string) => POST(new NextRequest("http://localhost/api/tridimarket/device/session", {
  method: "POST", body: JSON.stringify({ pin }), headers: { "content-type": "application/json" },
}));

beforeEach(() => {
  banco.suspeitas = [];
  banco.funcionarios = [];
  banco.creditos = null;
  banco.unidades = null;
  mockEmployees.mockReset();
  mockEmployees.mockResolvedValue([]);
});

describe("totem — trava de tentativas do código de acesso", () => {
  it("depois de 8 códigos errados no mesmo tablet, a próxima tentativa é barrada", async () => {
    for (let i = 0; i < 8; i++) expect((await pedir(String(100000 + i))).status).toBe(401);
    expect(banco.suspeitas).toHaveLength(8);
    const res = await pedir("999999");
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe("pin_temporarily_locked");
  });

  it("travado, nem o código CERTO entra — a varredura para ali", async () => {
    banco.funcionarios = [{ id: 7, unidade_id: "unid-1", nome: "Ana", ativo: true, codigo_acesso: "246810" }];
    for (let i = 0; i < 8; i++) await pedir(String(100000 + i));
    expect((await pedir("246810")).status).toBe(429);
  });
});

describe("totem — login certo continua igual", () => {
  it("lê crédito, pessoa e empresa e devolve o token", async () => {
    banco.funcionarios = [{ id: 7, unidade_id: "unid-1", nome: "Ana", ativo: true, codigo_acesso: "246810" }];
    banco.creditos = { bloqueado: false };
    banco.unidades = { nome: "Escritório" };
    mockEmployees.mockResolvedValue([{ id: 7, name: "Ana", cycleOpen: 10, open: 30, previousOpen: 20 }]);
    const res = await pedir("246810");
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.data).toMatchObject({ token: "token-assinado", visitante: false, empresa: "Escritório" });
    expect(j.data.employee.open).toBe(10);
    expect(mockEmployees).toHaveBeenCalledWith(["unid-1"]);
  });

  it("conta bloqueada é recusada antes de qualquer outra coisa", async () => {
    banco.funcionarios = [{ id: 7, unidade_id: "unid-1", nome: "Ana", ativo: true, codigo_acesso: "246810" }];
    banco.creditos = { bloqueado: true };
    const res = await pedir("246810");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("employee_blocked");
  });

  it("pessoa fora do diretório do totem: 409", async () => {
    banco.funcionarios = [{ id: 7, unidade_id: "unid-1", nome: "Ana", ativo: true, codigo_acesso: "246810" }];
    banco.creditos = { bloqueado: false };
    const res = await pedir("246810");
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("employee_not_available");
  });
});
