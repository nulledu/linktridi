import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * COMISSÃO DE UM GESTOR NÃO PODE CHEGAR AO NAVEGADOR DE OUTRO.
 *
 * Comissão é salário: dois gestores de tráfego não sabem quanto o outro
 * recebe, e "não mostrar na tela" não resolve nada — se o valor viaja na
 * resposta da API, basta abrir a aba de rede pra ler. Por isso o recorte é no
 * servidor, e é aqui que ele fica travado.
 *
 * O teste chama o handler de verdade. Se alguém um dia devolver a lista crua
 * (`cfg.comissoes`) em vez da filtrada — que é o erro fácil, porque o código
 * fica a duas linhas de distância —, isto quebra.
 */

const ACORDOS = [
  { id: "a", nome: "Gestor A", pessoaId: "u1", pctFaturamento: 0.77, pctEficiencia: 30, ativa: true },
  { id: "b", nome: "Gestor B", pessoaId: "u2", pctFaturamento: 1.5, pctEficiencia: 40, ativa: true },
];

// Quem está chamando. Trocado a cada caso.
let eu: { id: string; role: string } = { id: "u2", role: "colaborador" };

vi.mock("@/lib/require-auth", () => ({
  getProfileForModule: async () => eu,
  getProfile: async () => eu,
}));

const salvo = vi.fn(async () => {});
vi.mock("@/lib/marketing-config", () => ({
  getMarketingConfig: async () => ({ comissoes: ACORDOS }),
  setComissoes: (...args: unknown[]) => salvo(...(args as [])),
}));

// A lista de pessoas do editor sai daqui. Só o admin pode recebê-la.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit"]) b[m] = () => b;
      b.then = (r: (v: unknown) => unknown) =>
        Promise.resolve({ data: [{ id: "u1", name: "Ana", username: "ana" }], error: null }).then(r);
      return b;
    },
  }),
}));

const { GET, PUT } = await import("../route");
const corpo = async (r: Response) => (await r.json()) as Record<string, never>;

beforeEach(() => { salvo.mockClear(); });

describe("GET — quem vê o quê", () => {
  it("gestor recebe só o acordo dele; o do colega não viaja", async () => {
    eu = { id: "u2", role: "colaborador" };
    const j = await corpo(await GET());
    const nomes = (j.comissoes as unknown as { nome: string }[]).map((c) => c.nome);
    expect(nomes).toEqual(["Gestor B"]);
    // Não basta o nome sumir: o percentual do outro também é informação.
    expect(JSON.stringify(j)).not.toContain("Gestor A");
    expect(JSON.stringify(j)).not.toContain("0.77");
  });

  it("gestor não recebe a lista de pessoas (é material do editor)", async () => {
    eu = { id: "u2", role: "colaborador" };
    const j = await corpo(await GET());
    expect(j.pessoas).toEqual([]);
    expect(j.admin).toBe(false);
  });

  it("quem não tem acordo nenhum não vê valor de ninguém", async () => {
    eu = { id: "u9", role: "colaborador" };
    const j = await corpo(await GET());
    expect(j.comissoes).toEqual([]);
  });

  it("admin vê todos", async () => {
    eu = { id: "u0", role: "admin" };
    const j = await corpo(await GET());
    expect((j.comissoes as unknown as unknown[]).length).toBe(2);
    expect((j.pessoas as unknown as unknown[]).length).toBe(1);
  });
});

describe("PUT — quem pode mexer", () => {
  it("gestor não configura comissão (nem a própria)", async () => {
    eu = { id: "u2", role: "colaborador" };
    const req = new Request("http://x/api/trafego/comissoes", {
      method: "PUT", body: JSON.stringify({ comissoes: [{ ...ACORDOS[1], pctFaturamento: 99 }] }),
    });
    const r = await PUT(req as never);
    expect(r.status).toBe(403);
    expect(salvo).not.toHaveBeenCalled();
  });

  it("admin configura", async () => {
    eu = { id: "u0", role: "admin" };
    const req = new Request("http://x/api/trafego/comissoes", {
      method: "PUT", body: JSON.stringify({ comissoes: ACORDOS }),
    });
    const r = await PUT(req as never);
    expect(r.status).toBe(200);
    expect(salvo).toHaveBeenCalledOnce();
  });
});
