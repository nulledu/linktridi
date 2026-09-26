import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * As metas de vendedor e de equipe alimentam a parede PÚBLICA da TV
 * (mergeGoals). PUT /api/salespeople e PUT /api/teams só pediam sessão:
 * qualquer colaborador logado reescrevia o número que a empresa inteira vê.
 *
 * O gate agora é o MESMO de /api/metas (`canManage`): papel de gestão OU a
 * área Pessoas (`colaboradores`), que é de onde a aba de Metas abre.
 */

type Perfil = { id: string; name: string; role: string; username: string };
let eu: Perfil | null = null;
let chaves: string[] = [];
const escritas: { tabela: string; valores: unknown; id: unknown }[] = [];

vi.mock("@/lib/require-auth", () => ({ getProfile: async () => eu }));
vi.mock("@/lib/perfis", () => ({ resolveMyModuleKeys: async () => chaves }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({
    from: (tabela: string) => ({
      update: (valores: unknown) => ({
        eq: async (_col: string, id: unknown) => { escritas.push({ tabela, valores, id }); return { error: null }; },
      }),
    }),
  }),
}));

const salespeople = await import("../../app/api/salespeople/route");
const teams = await import("../../app/api/teams/route");

const put = (url: string, corpo: unknown) => new NextRequest(url, {
  method: "PUT", body: JSON.stringify(corpo), headers: { "content-type": "application/json" },
});

const CASOS = [
  { nome: "salespeople", PUT: salespeople.PUT, url: "http://localhost/api/salespeople", corpo: { id: "v-1", monthly_goal: 999999 } },
  { nome: "teams", PUT: teams.PUT, url: "http://localhost/api/teams", corpo: { id: "comercial", goal: 999999 } },
];

describe.each(CASOS)("PUT /api/$nome — só quem gere metas escreve", ({ PUT, url, corpo }) => {
  beforeEach(() => {
    escritas.length = 0;
    chaves = [];
    eu = { id: "u-ana", name: "Ana", role: "colaborador", username: "ana" };
  });

  it("sem sessão: 401 e nada gravado", async () => {
    eu = null;
    expect((await PUT(put(url, corpo))).status).toBe(401);
    expect(escritas).toHaveLength(0);
  });

  it("colaborador sem a área Pessoas: 403 e nada gravado", async () => {
    chaves = ["central", "comercial"];
    expect((await PUT(put(url, corpo))).status).toBe(403);
    expect(escritas).toHaveLength(0);
  });

  it("com a área Pessoas: grava", async () => {
    chaves = ["colaboradores"];
    expect((await PUT(put(url, corpo))).status).toBe(200);
    expect(escritas).toHaveLength(1);
  });

  it("papel de gestão: grava", async () => {
    eu = { id: "u-gv", name: "Gê", role: "gerente_vendas", username: "ge" };
    expect((await PUT(put(url, corpo))).status).toBe(200);
    expect(escritas).toHaveLength(1);
  });
});
