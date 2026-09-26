import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthApiError, AuthInvalidJwtError, AuthRetryableFetchError } from "@supabase/supabase-js";

// Falha de REDE não é "deslogado". O getClaims() e o supabase-js não lançam:
// devolvem `{ data: null, error }`. Sem distinguir, um refresh de token que
// pegou o Auth lento (~1x/hora) ou um timeout em `profiles` ficava 30s no
// cache da instância — toda página ia pro /login e toda API respondia 401.

let cookie = "";
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [{ name: "sb-proj-auth-token", value: cookie }] }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/preview-bypass", () => ({ previewBypassAtivo: () => false }));

const getClaims = vi.fn();
const respostasProfiles: { data: unknown; error: unknown }[] = [];
let idasProfiles = 0;
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getClaims } }),
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            idasProfiles++;
            return respostasProfiles.shift() ?? { data: null, error: null };
          },
        }),
      }),
    }),
  }),
}));
const acessoBruto = vi.fn(async (_id: string) => null);
vi.mock("@/lib/perfis", () => ({ acessoBruto: (id: string) => acessoBruto(id) }));

const { getAuthedUser, getProfile, getProfileSemAcesso } = await import("@/lib/require-auth");

const PERFIL = { username: "ana", name: "Ana", role: "colaborador", active: true, password_set: true };
const claims = (sub: string) => ({ data: { claims: { sub } }, error: null });

beforeEach(() => {
  getClaims.mockReset();
  acessoBruto.mockClear();
  respostasProfiles.length = 0;
  idasProfiles = 0;
});

describe("getAuthedUser: falha passageira do Auth não fica memorizada", () => {
  it("AuthRetryableFetchError (refresh/JWKS sem resposta) → null só agora; a próxima pergunta de novo", async () => {
    cookie = "sessao-rede";
    getClaims
      .mockResolvedValueOnce({ data: null, error: new AuthRetryableFetchError("fetch failed", 0) })
      .mockResolvedValueOnce(claims("u1"));
    expect(await getAuthedUser()).toBeNull();
    expect(await getAuthedUser()).toEqual({ id: "u1" });
    expect(getClaims).toHaveBeenCalledTimes(2);
  });

  it("5xx do Auth também é passageiro", async () => {
    cookie = "sessao-5xx";
    getClaims
      .mockResolvedValueOnce({ data: null, error: new AuthApiError("internal", 500, "unexpected_failure") })
      .mockResolvedValueOnce(claims("u1"));
    expect(await getAuthedUser()).toBeNull();
    expect(await getAuthedUser()).toEqual({ id: "u1" });
  });

  // Defesa contra cookie adulterado: token inválido é veredito, não acidente.
  it("token inválido/forjado continua memorizado como null", async () => {
    cookie = "sessao-forjada";
    getClaims.mockResolvedValue({ data: null, error: new AuthInvalidJwtError("Invalid JWT signature") });
    expect(await getAuthedUser()).toBeNull();
    expect(await getAuthedUser()).toBeNull();
    expect(getClaims).toHaveBeenCalledTimes(1);
  });
});

describe("getProfile: leitura de profiles que falha não vira 'sem perfil' por 30s", () => {
  it("timeout na 1ª leitura → null só nesta requisição; a próxima lê de novo", async () => {
    cookie = "sessao-perfil";
    getClaims.mockResolvedValue(claims("u-perfil"));
    respostasProfiles.push({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });
    respostasProfiles.push({ data: { ...PERFIL, id: "u-perfil" }, error: null });
    expect(await getProfile()).toBeNull();
    expect(await getProfile()).toMatchObject({ id: "u-perfil", role: "colaborador" });
    expect(idasProfiles).toBe(2);
  });
});

describe("getProfileSemAcesso: quem não resolve chave não paga a leitura de employees", () => {
  it("getProfile dispara acessoBruto junto com profiles; getProfileSemAcesso não", async () => {
    cookie = "sessao-poll";
    getClaims.mockResolvedValue(claims("u-poll"));
    respostasProfiles.push({ data: { ...PERFIL, id: "u-poll" }, error: null });
    expect(await getProfileSemAcesso()).toMatchObject({ id: "u-poll" });
    await new Promise((r) => setTimeout(r, 20));      // o disparo é um import dinâmico
    expect(acessoBruto).not.toHaveBeenCalled();
    expect(await getProfile()).toMatchObject({ id: "u-poll" });
    await vi.waitFor(() => expect(acessoBruto).toHaveBeenCalledWith("u-poll"));
  });
});
