import { describe, it, expect, vi } from "vitest";

// Durante meses, quem nunca teve a grade salva herdava acesso do CARGO e do
// DEPARTAMENTO: `gerente_*`/`estoquista` viravam nível 3 (Produção, Design,
// Logística, Estoque), departamento Financeiro virava nível 4 (Analytics
// completo), Comercial/Marketing nível 2, e "Tráfego" ganhava Tráfego +
// TridiFlow. Ninguém tinha concedido nada — o acesso vinha de um campo de
// cadastro. O sintoma foi exatamente esse: "tem gente dentro de coisa que eu
// não abri pra ninguém".
//
// A regra agora é a do resto do sistema: sem grade, só o básico.

const emp: { nivel: number | null; departamento: string | null; permissoes: Record<string, boolean> | null } = {
  nivel: null, departamento: null, permissoes: null,
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...emp } }) }) }),
    }),
  }),
}));

vi.mock("@/lib/superusuario", () => ({ ehSuperusuario: () => false }));

import { resolveMyModuleKeys } from "@/lib/perfis";

const BASICO = ["central", "minhas-atividades"];

async function chaves(
  role: string,
  dados: Partial<typeof emp> = {},
  id = Math.random().toString(36).slice(2),
) {
  Object.assign(emp, { nivel: null, departamento: null, permissoes: null }, dados);
  return resolveMyModuleKeys({ id, role } as Parameters<typeof resolveMyModuleKeys>[0]);
}

describe("sem grade configurada = só o básico", () => {
  // Cada caso usa um id novo: `meuNivel` cacheia por usuário (30s).
  it("colaborador comum vê só Central e Minhas atividades", async () => {
    expect(await chaves("colaborador")).toEqual(BASICO);
  });

  it("cargo não abre área: gerente sem grade não entra em Produção nem Estoque", async () => {
    for (const role of ["gerente_vendas", "gerente_producao", "estoquista"]) {
      const k = await chaves(role);
      expect(k, `${role} herdou área do cargo: ${k.join(", ")}`).toEqual(BASICO);
    }
  });

  it("departamento não abre área: Financeiro/Comercial/Marketing/Tráfego sem grade não veem nada extra", async () => {
    for (const dep of ["Financeiro", "Comercial", "Marketing", "Tráfego"]) {
      const k = await chaves("colaborador", { departamento: dep });
      expect(k, `departamento "${dep}" abriu: ${k.join(", ")}`).toEqual(BASICO);
    }
  });

  it("nível gravado à mão no banco também não abre nada", async () => {
    expect(await chaves("colaborador", { nivel: 4, departamento: "Financeiro" })).toEqual(BASICO);
  });

  it("com a grade salva, aí sim manda a grade", async () => {
    const k = await chaves("colaborador", { permissoes: { estoque: true } });
    expect(k).toContain("estoque");
    for (const b of BASICO) expect(k).toContain(b);
  });
});
