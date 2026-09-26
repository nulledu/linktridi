// ── Níveis de acesso (1–5) — modelo CUMULATIVO. Cada nível tem tudo do nível
// abaixo + o seu. Fonte única do acesso. Substitui a lógica antiga de
// perfil-template/override (que estava confusa).
//
// 5 — Acesso total a tudo (admin).
// 4 — Tudo menos Administração e Pessoas (Financeiro + Analytics completo + …).
// 3 — Gerentes: Analytics parcial (só o setor), Estoque, Operacional total + tudo do 2.
// 2 — Comercial, Operacional sem Estoque, Produtos + tudo do 1.
// 1 — Home, métricas do setor e próprias, ver/gerar atividades, conversar.
import { MODULES } from "./rbac";
import { SETOR_KEYS } from "./permissions";

export const NIVEIS = [1, 2, 3, 4, 5] as const;
export type Nivel = (typeof NIVEIS)[number];

export const NIVEL_LABEL: Record<Nivel, string> = {
  5: "Nível 5 — Acesso total",
  4: "Nível 4 — Financeiro e líderes de setor (tudo menos Admin e Pessoas)",
  3: "Nível 3 — Gerente (Operacional total + Estoque + Analytics do setor)",
  2: "Nível 2 — Vendedoras e Marketing (Comercial/Operacional + Analytics do setor)",
  1: "Nível 1 — Home, atividades e métricas próprias",
};

// Módulos que ENTRAM em cada nível (cumulativo soma os de baixo).
const ENTRA_NO_NIVEL: Record<Nivel, string[]> = {
  1: ["central", "minhas-atividades"],
  // N2 (vendedoras/marketing): Comercial + Analytics do PRÓPRIO setor. SEM operacional.
  2: ["comercial", "analytics"],
  // N3 (gerentes): operacional completo (produção/design/logística/estoque).
  3: ["producao", "design", "logistica", "estoque"],
  4: [], // financeiro/líderes: Analytics completo + custos (tratado no resolver)
  5: ["colaboradores", "administracao"],
};

const TODOS = MODULES.map((m) => m.key);

export function modulosDoNivel(n: number): string[] {
  const set = new Set<string>();
  for (let i = 1; i <= n; i++) for (const k of ENTRA_NO_NIVEL[i as Nivel] ?? []) set.add(k);
  return TODOS.filter((k) => set.has(k));
}

// Fallback: quando a pessoa não tem nível definido, deriva do papel.
export function nivelDoRole(role: string): Nivel {
  switch (role) {
    case "admin": return 5;
    case "gerente_vendas":
    case "gerente_producao": return 3;
    case "estoquista": return 3;
    default: return 1; // colaborador
  }
}

// Fallback melhor: usa também o departamento (vendedoras/marketing→2, financeiro→4).
export function nivelFallback(role: string, departamento: string | null | undefined): Nivel {
  if (role !== "colaborador") return nivelDoRole(role);
  switch (departamento) {
    case "Financeiro": return 4;
    case "Comercial":
    case "Marketing": return 2;
    default: return 1;
  }
}

export const podeVerCustoNivel = (n: number) => n >= 4;          // Financeiro/custos
export const analyticsCompletoNivel = (n: number) => n >= 4;     // todos os setores
export const analyticsSoSetorNivel = (n: number) => n === 2 || n === 3; // só o próprio setor

// Departamento → setor do Analytics (p/ N3 que vê só o seu).
export function setorAnalyticsDoDepartamento(dep: string | null | undefined): string | null {
  switch (dep) {
    case "Comercial": return "set:comercial";
    case "Marketing": return "set:marketing";
    case "Financeiro": return "set:financeiro";
    default: return null;
  }
}

// Chaves de acesso resolvidas a partir do nível + departamento (módulos + setores).
export function chavesDoNivel(nivel: number, departamento: string | null | undefined): string[] {
  const keys = new Set(modulosDoNivel(nivel));
  if (keys.has("analytics")) {
    if (analyticsCompletoNivel(nivel)) for (const s of SETOR_KEYS) keys.add(s);
    else if (analyticsSoSetorNivel(nivel)) { const s = setorAnalyticsDoDepartamento(departamento); if (s) keys.add(s); }
  }
  return [...keys];
}
