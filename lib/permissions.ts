// Engine de permissões por módulo (Fase 2).
// Resolve o acesso por: Departamento ↓ Perfil ↓ Permissões, com override individual.
// Fallback seguro: sem template configurado, cai no acesso por PAPEL (comportamento atual).
import { MODULES, modulesFor, type Role } from "./rbac";
import { SUB_FULL_KEYS, ehChaveRestrita } from "./areas";

// Módulos que todo mundo sempre tem (entrada do sistema + trabalho pessoal).
export const SEMPRE = ["central", "minhas-atividades"];

export const TODOS_MODULOS = MODULES.map((m) => m.key);

// Permissões de SETOR dentro do Analytics (visão por setor: Marketing só vê
// Marketing, Comercial só Comercial, etc.). Não são itens da sidebar.
export const SETORES_ANALYTICS: { key: string; label: string }[] = [
  { key: "set:comercial", label: "Comercial" },
  { key: "set:marketing", label: "Marketing" },
  { key: "set:marketplace", label: "Marketplace" },
  { key: "set:vendedoras", label: "Vendedoras" },
  { key: "set:financeiro", label: "Financeiro" },
];
export const SETOR_KEYS = SETORES_ANALYTICS.map((s) => s.key);

// Universo de chaves concedíveis = módulos + setores do Analytics + sub-ações
// das áreas. É o vocabulário completo — usado para VALIDAR o que pode ser
// gravado, e o que o superusuário enxerga.
export const TODAS_PERMISSOES = [...TODOS_MODULOS, ...SETOR_KEYS, ...SUB_FULL_KEYS];

// O que "acesso total" realmente concede. As áreas RESTRITAS ficam de fora de
// propósito: nem o papel "admin", nem o card "Administrador — acesso total"
// abrem o TridiMarket. Ele só entra por grant explícito naquela pessoa, ou pra
// quem é superusuário. Sem esta lista, qualquer admin novo ganharia junto o
// acesso à carteira e à dívida de todo mundo, sem ninguém ter decidido isso.
export const PERMISSOES_DE_ADMIN = TODAS_PERMISSOES.filter((k) => !ehChaveRestrita(k));

export function roleModuleKeys(role: Role): string[] {
  return modulesFor(role).map((m) => m.key);
}

// Resolve as chaves de módulo que um colaborador pode ver.
// - admin: tudo.
// - se há template do perfil: o template manda (senão, acesso por papel).
// - override individual adiciona/remove módulos pontualmente.
export function resolveModuleKeys(opts: {
  role: Role;
  template?: string[] | null;
  override?: Record<string, boolean> | null;
}): string[] {
  if (opts.role === "admin") return PERMISSOES_DE_ADMIN;

  const base = opts.template && opts.template.length ? opts.template : roleModuleKeys(opts.role);
  const set = new Set(base);
  for (const k of SEMPRE) set.add(k);
  if (opts.override) {
    for (const [k, v] of Object.entries(opts.override)) {
      if (v) set.add(k); else set.delete(k);
    }
  }
  // Só chaves que realmente existem, na ordem oficial (módulos + setores).
  return TODAS_PERMISSOES.filter((k) => set.has(k));
}
